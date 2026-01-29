use axum::{
    extract::{Query, State},
    Json,
};
use futures::future::join_all;
use nexus_core::{BookInfo, Chapter, ChapterContent};
use serde::{Deserialize, Serialize};

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
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let content = engine
        .content(&query.url, &rules)
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    Ok(Json(ChapterContent { content }))
}

#[derive(Deserialize)]
pub struct BatchBookQuery {
    pub source: String,
    pub urls: Vec<String>,
}

#[derive(Serialize)]
pub struct BatchContentResponse {
    pub results: Vec<BatchContentResult>,
}

#[derive(Serialize)]
pub struct BatchContentResult {
    pub url: String,
    pub content: Option<String>,
    pub error: Option<String>,
}

/// Get multiple chapter contents in batch
pub async fn batch_content(
    State(state): State<AppState>,
    Json(query): Json<BatchBookQuery>,
) -> Result<Json<BatchContentResponse>, ApiErrorResponse> {
    let engine = state
        .engine_registry
        .get_engine(&query.source)
        .ok_or_else(|| not_found("Source"))?;

    let rules = state
        .store
        .get_replace_rules()
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let mut futures = Vec::new();

    for url in query.urls {
        let engine = engine.clone();
        let rules = rules.clone();
        let url_clone = url.clone();

        futures.push(async move {
            // Validate URL
            if let Err(e) = validate_url(&url_clone) {
                return BatchContentResult {
                    url: url_clone,
                    content: None,
                    error: Some(e.to_string()),
                };
            }

            match engine.content(&url_clone, &rules).await {
                Ok(content) => BatchContentResult {
                    url: url_clone,
                    content: Some(content),
                    error: None,
                },
                Err(e) => BatchContentResult {
                    url: url_clone,
                    content: None,
                    error: Some(e.to_string()),
                },
            }
        });
    }

    let results = join_all(futures).await;

    Ok(Json(BatchContentResponse { results }))
}
