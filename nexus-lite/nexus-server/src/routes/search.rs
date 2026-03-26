//! Search routes

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
use crate::source_access::filter_public_sources;

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

/// Search across multiple sources (returns all results at once)
pub async fn search(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, ApiErrorResponse> {
    info!("Searching for '{}' in {:?}", req.keyword, req.sources);

    // Get sources to search
    let sources = if req.sources.is_empty() {
        state.engine_registry.source_store().get_all()
    } else {
        req.sources
            .iter()
            .filter_map(|id| state.engine_registry.source_store().get(id))
            .collect()
    };
    let sources = filter_public_sources(&state, sources).await?;

    if sources.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
            errors: vec![],
        }));
    }

    // Use orchestrator for concurrent search with timeouts and health tracking
    let mut rx = state.orchestrator.search(
        sources.iter().map(|s| s.id.clone()).collect(),
        req.keyword.clone(),
    );

    let mut all_results = vec![];
    let mut errors = vec![];

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

    // Get sources to search
    let sources = if req.sources.is_empty() {
        state.engine_registry.source_store().get_all()
    } else {
        req.sources
            .iter()
            .filter_map(|id| state.engine_registry.source_store().get(id))
            .collect()
    };
    let sources = filter_public_sources(&state, sources).await?;

    // Spawn search task
    tokio::spawn(async move {
        if sources.is_empty() {
            let event = SearchEvent::Done { total: 0 };
            let _ = tx
                .send(Ok(Event::default()
                    .event("done")
                    .data(serde_json::to_string(&event).unwrap_or_default())))
                .await;
            return;
        }

        let mut search_rx = state.orchestrator.search(
            sources.iter().map(|s| s.id.clone()).collect(),
            req.keyword.clone(),
        );

        let mut total = 0usize;

        while let Some(result) = search_rx.recv().await {
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
