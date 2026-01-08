use axum::{
    extract::{Query, State},
    Json,
};
use nexus_core::{BookInfo, Chapter, ChapterContent};
use serde::Deserialize;

use crate::app::AppState;
use crate::error::{bad_request, internal_error, not_found, ApiErrorResponse};
use crate::validation::validate_url;

#[derive(Deserialize)]
pub struct BookQuery {
    pub source: String,
    pub url: String,
}

/// Get book information
pub async fn book_info(
    State(state): State<AppState>,
    Query(query): Query<BookQuery>,
) -> Result<Json<BookInfo>, ApiErrorResponse> {
    // Validate URL to prevent SSRF
    validate_url(&query.url).map_err(|e| bad_request(e.to_string()))?;

    let engine = state
        .engine_registry
        .get_engine(&query.source)
        .ok_or_else(|| not_found("Source"))?;

    engine
        .book_info(&query.url)
        .await
        .map(Json)
        .map_err(|e| internal_error(e.to_string()))
}

/// Get chapter list
pub async fn chapters(
    State(state): State<AppState>,
    Query(query): Query<BookQuery>,
) -> Result<Json<Vec<Chapter>>, ApiErrorResponse> {
    // Validate URL to prevent SSRF
    validate_url(&query.url).map_err(|e| bad_request(e.to_string()))?;

    let engine = state
        .engine_registry
        .get_engine(&query.source)
        .ok_or_else(|| not_found("Source"))?;

    engine
        .chapters(&query.url)
        .await
        .map(Json)
        .map_err(|e| internal_error(e.to_string()))
}

/// Get chapter content
pub async fn content(
    State(state): State<AppState>,
    Query(query): Query<BookQuery>,
) -> Result<Json<ChapterContent>, ApiErrorResponse> {
    // Validate URL to prevent SSRF
    validate_url(&query.url).map_err(|e| bad_request(e.to_string()))?;

    let engine = state
        .engine_registry
        .get_engine(&query.source)
        .ok_or_else(|| not_found("Source"))?;

    // Load replacement rules from storage
    let rules = state
        .store
        .get_replace_rules()
        .map_err(|e| internal_error(e.to_string()))?;

    let content = engine
        .content(&query.url, &rules)
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    Ok(Json(ChapterContent { content }))
}
