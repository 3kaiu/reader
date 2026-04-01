//! Search routes

use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use futures::stream::Stream;
use nexus_core::{BookInfo, BookItem, SourceRulePackage};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use tokio_stream::wrappers::ReceiverStream;
use tracing::{error, info};
use url::Url;

use crate::app::AppState;
use crate::error::ApiErrorResponse;

#[derive(Deserialize)]
pub struct SearchRequest {
    pub keyword: String,
    #[serde(default)]
    pub sources: Vec<String>, // Empty = all enabled sources
    #[serde(default = "default_page")]
    pub _page: u32,
}

fn default_page() -> u32 {
    1
}

#[derive(Serialize)]
pub struct SearchResponse {
    pub results: Vec<BookItem>,
    pub total: usize,
    pub errors: Vec<SearchError>,
}

#[derive(Serialize)]
pub struct SearchError {
    pub source_id: String,
    pub error: String,
}

/// SSE 搜索事件
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SearchEvent {
    Result { data: BookItem },
    Error { source_id: String, error: String },
    Done { total: usize },
}

fn keyword_looks_like_url(keyword: &str) -> bool {
    keyword.starts_with("http://") || keyword.starts_with("https://")
}

async fn runtime_search_packages(
    state: &AppState,
    requested_sources: &[String],
) -> Result<Vec<SourceRulePackage>, ApiErrorResponse> {
    let mut packages = state
        .store
        .list_source_packages()
        .await
        .map_err(|e| crate::error::internal_error(e.to_string()))?;

    if !requested_sources.is_empty() {
        packages.retain(|pkg| requested_sources.iter().any(|id| id == &pkg.source.id));
    }

    let mut filtered = Vec::new();
    for package in packages {
        let enabled = state
            .store
            .get_source_status(package.source.id.clone())
            .await
            .unwrap_or(true);
        let allow_search = package
            .import_policy
            .as_ref()
            .map(|it| it.allow_search)
            .unwrap_or(true);
        let profile_enabled = package
            .search_profile
            .as_ref()
            .map(|it| it.enabled)
            .unwrap_or_else(|| package.capabilities.as_ref().map(|it| it.search_supported).unwrap_or(true));
        if enabled && allow_search && profile_enabled {
            filtered.push(package);
        }
    }

    Ok(filtered)
}

async fn direct_detail_results(
    state: &AppState,
    packages: &[SourceRulePackage],
    keyword: &str,
) -> Vec<BookItem> {
    if !keyword_looks_like_url(keyword) {
        return Vec::new();
    }
    let parsed = match Url::parse(keyword) {
        Ok(url) => url,
        Err(_) => return Vec::new(),
    };

    let mut items = Vec::new();
    for package in packages {
        let Some(profile) = package.search_profile.as_ref() else { continue };
        let direct_enabled = profile.strategies.iter().any(|strategy| {
            strategy.enabled
                && strategy.mode == nexus_core::SourceSearchMode::DirectDetail
                && strategy
                    .book_url_matchers
                    .iter()
                    .any(|matcher| parsed.as_str().contains(matcher))
        });
        if !direct_enabled {
            continue;
        }

        let Some(engine) = state.engine_registry.get_engine(&package.source.id) else {
            continue;
        };
        let info: BookInfo = match engine.book_info(parsed.as_str()).await {
            Ok(info) => info,
            Err(_) => continue,
        };
        items.push(BookItem {
            name: info.name,
            author: Some(info.author),
            cover_url: info.cover_url,
            book_url: parsed.as_str().to_string().into(),
            intro: info.intro,
            source_id: package.source.id.clone().into(),
            source_name: package.source.name.clone().into(),
            latest_chapter: info.last_chapter,
        });
    }

    items
}

fn searchable_source_ids(packages: &[SourceRulePackage]) -> Vec<String> {
    packages
        .iter()
        .filter(|package| {
            package
                .search_profile
                .as_ref()
                .map(|profile| {
                    profile.strategies.iter().any(|strategy| {
                        strategy.enabled
                            && matches!(
                                strategy.mode,
                                nexus_core::SourceSearchMode::NativeSearch
                                    | nexus_core::SourceSearchMode::ExternalDiscovery
                            )
                    })
                })
                .unwrap_or(true)
        })
        .map(|package| package.source.id.clone())
        .collect()
}

/// Search across multiple sources (returns all results at once)
pub async fn search(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, ApiErrorResponse> {
    info!("Searching for '{}' in {:?}", req.keyword, req.sources);

    let packages = runtime_search_packages(&state, &req.sources).await?;
    let search_source_ids = searchable_source_ids(&packages);
    let mut all_results = direct_detail_results(&state, &packages, &req.keyword).await;

    if search_source_ids.is_empty() && all_results.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
            errors: vec![],
        }));
    }

    let mut errors = vec![];

    if !search_source_ids.is_empty() {
        let mut rx = state
            .orchestrator
            .search(search_source_ids, req.keyword.clone());

        while let Some(result) = rx.recv().await {
            match result {
                crate::orchestrator::SearchResult::Item(item) => {
                    all_results.push(item);
                }
                crate::orchestrator::SearchResult::Error { source_id, error } => {
                    error!("Search failed for {}: {}", source_id, error);
                    errors.push(SearchError { source_id, error });
                }
                crate::orchestrator::SearchResult::Done => {
                    break;
                }
            }
        }
    }

    let total = all_results.len();

    Ok(Json(SearchResponse {
        results: all_results,
        total,
        errors,
    }))
}

/// SSE 流式搜索 - 实时推送搜索结果
pub async fn search_stream(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, ApiErrorResponse> {
    info!("SSE Search for '{}' in {:?}", req.keyword, req.sources);

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(100);

    let packages = runtime_search_packages(&state, &req.sources).await?;
    let search_source_ids = searchable_source_ids(&packages);
    let direct_items = direct_detail_results(&state, &packages, &req.keyword).await;

    // Spawn search task
    tokio::spawn(async move {
        if search_source_ids.is_empty() && direct_items.is_empty() {
            let event = SearchEvent::Done { total: 0 };
            let _ = tx
                .send(Ok(Event::default()
                    .event("done")
                    .data(serde_json::to_string(&event).unwrap_or_default())))
                .await;
            return;
        }

        let mut total = 0usize;
        for item in direct_items {
            total += 1;
            let event = SearchEvent::Result { data: item };
            if tx
                .send(Ok(Event::default().event("result").data(
                    serde_json::to_string(&event).unwrap_or_default(),
                )))
                .await
                .is_err()
            {
                return;
            }
        }

        let mut search_rx = if search_source_ids.is_empty() {
            None
        } else {
            Some(state.orchestrator.search(search_source_ids, req.keyword.clone()))
        };

        while let Some(result) = match search_rx.as_mut() {
            Some(rx) => rx.recv().await,
            None => None,
        } {
            let event = match result {
                crate::orchestrator::SearchResult::Item(item) => {
                    total += 1;
                    let event = SearchEvent::Result { data: item };
                    Event::default()
                        .event("result")
                        .data(serde_json::to_string(&event).unwrap_or_default())
                }
                crate::orchestrator::SearchResult::Error { source_id, error } => {
                    let event = SearchEvent::Error { source_id, error };
                    Event::default()
                        .event("error")
                        .data(serde_json::to_string(&event).unwrap_or_default())
                }
                crate::orchestrator::SearchResult::Done => {
                    let event = SearchEvent::Done { total };
                    Event::default()
                        .event("done")
                        .data(serde_json::to_string(&event).unwrap_or_default())
                }
            };

            if tx.send(Ok(event)).await.is_err() {
                // Client disconnected
                break;
            }
        }
    });

    Ok(Sse::new(ReceiverStream::new(rx)).keep_alive(KeepAlive::default()))
}
