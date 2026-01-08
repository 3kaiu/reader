//! Search routes

use axum::{extract::State, http::StatusCode, Json};
use nexus_core::BookItem;
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use crate::app::AppState;

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

/// Search across multiple sources
pub async fn search(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, (StatusCode, String)> {
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
