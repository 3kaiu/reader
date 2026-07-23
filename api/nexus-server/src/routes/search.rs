//! Search routes

#[path = "search_discovery_min.rs"]
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
use nexus_core::types::PipelineStageReport;
use nexus_core::BookItem;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::convert::Infallible;
use tokio_stream::wrappers::ReceiverStream;
use tracing::{error, info};

use crate::app::AppState;
use crate::error::{bad_request, ApiErrorResponse};
use discovery::{direct_detail_results, searchable_source_ids};
use packages::{build_package_ranks, runtime_search_packages};
use ranking::{annotate_result_rankings, sort_packages_for_search, sort_results_for_keyword};
use streaming::{event_done, event_error, event_meta, event_result};

#[derive(Deserialize)]
pub struct SearchRequest {
    pub keyword: String,
    #[serde(default)]
    pub sources: Vec<String>, // Empty = all enabled sources, max 50 entries
    #[serde(default = "default_page")]
    pub _page: u32, // Reserved for future pagination. Stored with underscore prefix to suppress unused warning.
    #[serde(default = "default_light_mode")]
    pub light_mode: bool,
}

impl SearchRequest {
    /// Validate request constraints, returning an error response if violated.
    pub fn validate(&self) -> Result<(), ApiErrorResponse> {
        if self.keyword.len() > 256 {
            return Err(bad_request("keyword too long (max 256 chars)"));
        }
        if self.sources.len() > 50 {
            return Err(bad_request("too many sources (max 50)"));
        }
        for src in &self.sources {
            if src.len() > 256 {
                return Err(bad_request("source ID too long (max 256 chars)"));
            }
        }
        Ok(())
    }
}

fn default_page() -> u32 {
    1
}

fn default_light_mode() -> bool {
    true
}

#[derive(Serialize)]
pub struct SearchResponse {
    pub results: Vec<BookItem>,
    pub total: usize,
    pub errors: Vec<SearchError>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stage_reports: Vec<PipelineStageReport>,
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
    Result {
        data: BookItem,
    },
    Error {
        source_id: String,
        error: String,
    },
    Meta {
        stage_reports: Vec<PipelineStageReport>,
    },
    Done {
        total: usize,
    },
}

struct PreparedSearchContext {
    package_ids: HashMap<String, String>,
    package_ranks: HashMap<String, i64>,
    search_source_ids: Vec<String>,
    direct_items: Vec<BookItem>,
}

fn keyword_looks_like_url(keyword: &str) -> bool {
    keyword.starts_with("http://") || keyword.starts_with("https://")
}

async fn prepare_search_context(
    state: &AppState,
    req: &SearchRequest,
) -> Result<PreparedSearchContext, ApiErrorResponse> {
    let packages = runtime_search_packages(state, &req.sources, req.light_mode).await?;
    let package_ids: HashMap<String, String> = packages
        .iter()
        .map(|p| (p.source.id.clone(), p.package_id.clone()))
        .collect();
    let package_ranks = build_package_ranks(&packages);
    let search_source_ids = searchable_source_ids(&packages);
    let direct_items = direct_detail_results(state, &packages, &req.keyword).await;

    Ok(PreparedSearchContext {
        package_ids,
        package_ranks,
        search_source_ids,
        direct_items,
    })
}

/// Search across multiple sources (returns all results at once)
pub async fn search(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, ApiErrorResponse> {
    req.validate()?;
    info!("Searching for '{}' in {:?}", req.keyword, req.sources);
    let started_at = std::time::Instant::now();

    let mut context = prepare_search_context(&state, &req).await?;
    let mut all_results = std::mem::take(&mut context.direct_items);

    if context.search_source_ids.is_empty() && all_results.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
            errors: vec![],
            stage_reports: vec![],
        }));
    }

    let mut errors = vec![];

    if !context.search_source_ids.is_empty() {
        let mut rx = state
            .orchestrator
            .search(context.search_source_ids, req.keyword.clone());

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
    annotate_result_rankings(&mut all_results, &req.keyword, &context.package_ranks);
    sort_results_for_keyword(&mut all_results, &req.keyword, &context.package_ranks);

    for item in all_results.iter_mut() {
        let sid = item.source_id.as_ref();
        if let Some(pid) = context.package_ids.get(sid) {
            item.package_id = Some(pid.as_str().into());
        }
    }

    let mut stage = PipelineStageReport {
        stage: "search".to_string(),
        ok: true,
        strategy: Some("orchestrator".to_string()),
        failure_code: None,
        warnings: Vec::new(),
        metrics: std::collections::HashMap::new(),
    };
    stage
        .metrics
        .insert("elapsedMs".to_string(), started_at.elapsed().as_millis().to_string());
    stage.metrics.insert("total".to_string(), total.to_string());
    stage
        .metrics
        .insert("sourcesRequested".to_string(), req.sources.len().to_string());

    Ok(Json(SearchResponse {
        results: all_results,
        total,
        errors,
        stage_reports: vec![stage],
    }))
}

/// SSE 流式搜索 - 实时推送搜索结果
pub async fn search_stream(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, ApiErrorResponse> {
    req.validate()?;
    info!("SSE Search for '{}' in {:?}", req.keyword, req.sources);

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(100);
    let started_at = std::time::Instant::now();

    let mut context = prepare_search_context(&state, &req).await?;
    let mut direct_items = std::mem::take(&mut context.direct_items);
    annotate_result_rankings(&mut direct_items, &req.keyword, &context.package_ranks);
    sort_results_for_keyword(&mut direct_items, &req.keyword, &context.package_ranks);

    for item in direct_items.iter_mut() {
        let sid = item.source_id.as_ref();
        if let Some(pid) = context.package_ids.get(sid) {
            item.package_id = Some(pid.as_str().into());
        }
    }

    let package_ids = context.package_ids;
    let package_ranks = context.package_ranks;
    let search_source_ids = context.search_source_ids;

    // Spawn search task
    tokio::spawn(async move {
        if search_source_ids.is_empty() && direct_items.is_empty() {
            let mut stage = PipelineStageReport {
                stage: "search_stream".to_string(),
                ok: true,
                strategy: Some("orchestrator".to_string()),
                failure_code: None,
                warnings: Vec::new(),
                metrics: std::collections::HashMap::new(),
            };
            stage
                .metrics
                .insert("elapsedMs".to_string(), started_at.elapsed().as_millis().to_string());
            stage.metrics.insert("total".to_string(), "0".to_string());
            stage
                .metrics
                .insert("sourcesRequested".to_string(), req.sources.len().to_string());
            let _ = tx.send(Ok(event_meta(vec![stage]))).await;
            let _ = tx.send(Ok(event_done(0))).await;
            return;
        }

        let mut total = 0usize;
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
                    let sid = item.source_id.as_ref();
                    if let Some(pid) = package_ids.get(sid) {
                        item.package_id = Some(pid.as_str().into());
                    }
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

        let mut stage = PipelineStageReport {
            stage: "search_stream".to_string(),
            ok: true,
            strategy: Some("orchestrator".to_string()),
            failure_code: None,
            warnings: Vec::new(),
            metrics: std::collections::HashMap::new(),
        };
        stage
            .metrics
            .insert("elapsedMs".to_string(), started_at.elapsed().as_millis().to_string());
        stage.metrics.insert("total".to_string(), total.to_string());
        stage
            .metrics
            .insert("sourcesRequested".to_string(), req.sources.len().to_string());
        let _ = tx.send(Ok(event_meta(vec![stage]))).await;
    });

    Ok(Sse::new(ReceiverStream::new(rx)).keep_alive(KeepAlive::default()))
}
