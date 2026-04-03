//! Search routes

#[path = "search_discovery.rs"]
mod discovery;
#[path = "search_packages.rs"]
mod packages;
#[path = "search_ranking.rs"]
mod ranking;
#[path = "search_streaming.rs"]
mod streaming;
#[cfg(test)]
#[path = "search_tests.rs"]
mod tests;

use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use futures::stream::Stream;
use nexus_core::BookItem;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use tokio_stream::wrappers::ReceiverStream;
use tracing::{error, info};

use crate::app::AppState;
use crate::error::ApiErrorResponse;
use discovery::{direct_detail_results, external_discovery_results, searchable_source_ids};
use packages::{build_package_ranks, runtime_search_packages};
use ranking::{annotate_result_rankings, sort_packages_for_search, sort_results_for_keyword};
use streaming::{event_done, event_error, event_result};

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

/// Search across multiple sources (returns all results at once)
pub async fn search(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, ApiErrorResponse> {
    info!("Searching for '{}' in {:?}", req.keyword, req.sources);

    let packages = runtime_search_packages(&state, &req.sources).await?;
    let package_ranks = build_package_ranks(&packages);
    let search_source_ids = searchable_source_ids(&packages);
    let mut all_results = direct_detail_results(&state, &packages, &req.keyword).await;
    let (external_results, mut external_errors) =
        external_discovery_results(&state, &packages, &req.keyword).await;
    all_results.extend(external_results);

    if search_source_ids.is_empty() && all_results.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
            errors: vec![],
        }));
    }

    let mut errors = vec![];
    errors.append(&mut external_errors);

    if !search_source_ids.is_empty() {
        let mut rx = state
            .orchestrator
            .search(search_source_ids, req.keyword.clone());

        while let Some(result) = rx.recv().await {
            match result {
                crate::orchestrator::SearchResult::Item(item) => {
                    all_results.push(item);
                },
                crate::orchestrator::SearchResult::Error { source_id, error } => {
                    error!("Search failed for {}: {}", source_id, error);
                    errors.push(SearchError { source_id, error });
                },
                crate::orchestrator::SearchResult::Done => {
                    break;
                },
            }
        }
    }

    let total = all_results.len();
    annotate_result_rankings(&mut all_results, &req.keyword, &package_ranks);
    sort_results_for_keyword(&mut all_results, &req.keyword, &package_ranks);

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
    let package_ranks = build_package_ranks(&packages);
    let search_source_ids = searchable_source_ids(&packages);
    let mut direct_items = direct_detail_results(&state, &packages, &req.keyword).await;
    let (external_items, external_errors) =
        external_discovery_results(&state, &packages, &req.keyword).await;
    direct_items.extend(external_items);
    annotate_result_rankings(&mut direct_items, &req.keyword, &package_ranks);
    sort_results_for_keyword(&mut direct_items, &req.keyword, &package_ranks);

    // Spawn search task
    tokio::spawn(async move {
        if search_source_ids.is_empty() && direct_items.is_empty() {
            let _ = tx.send(Ok(event_done(0))).await;
            return;
        }

        let mut total = 0usize;
        for error in external_errors {
            if tx
                .send(Ok(event_error(error.source_id, error.error)))
                .await
                .is_err()
            {
                return;
            }
        }
        for item in direct_items {
            total += 1;
            if tx.send(Ok(event_result(item))).await.is_err() {
                return;
            }
        }

        let mut search_rx = if search_source_ids.is_empty() {
            None
        } else {
            Some(
                state
                    .orchestrator
                    .search(search_source_ids, req.keyword.clone()),
            )
        };

        while let Some(result) = match search_rx.as_mut() {
            Some(rx) => rx.recv().await,
            None => None,
        } {
            let event = match result {
                crate::orchestrator::SearchResult::Item(item) => {
                    let mut item = item;
                    annotate_result_rankings(
                        std::slice::from_mut(&mut item),
                        &req.keyword,
                        &package_ranks,
                    );
                    total += 1;
                    event_result(item)
                },
                crate::orchestrator::SearchResult::Error { source_id, error } => {
                    event_error(source_id, error)
                },
                crate::orchestrator::SearchResult::Done => event_done(total),
            };

            if tx.send(Ok(event)).await.is_err() {
                // Client disconnected
                break;
            }
        }
    });

    Ok(Sse::new(ReceiverStream::new(rx)).keep_alive(KeepAlive::default()))
}
