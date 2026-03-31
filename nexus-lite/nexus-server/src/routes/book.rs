use axum::{
    extract::{Query, State},
    Json,
};
use futures::stream::{self, StreamExt};
use nexus_core::{types::Chapter, BookInfo, ChapterContent};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::app::AppState;
use crate::error::{bad_request, internal_error, not_found, ApiErrorResponse};
use crate::source_access::ensure_source_public_access;
use crate::validation::validate_url;

#[derive(Deserialize)]
pub struct BookQuery {
    pub source: String,
    pub url: String,
    pub chunk_size: Option<usize>,
    pub book_id: Option<String>,
    pub index: Option<usize>,
}

/// Get book information
pub async fn book_info(
    State(state): State<AppState>,
    Query(query): Query<BookQuery>,
) -> Result<Json<BookInfo>, ApiErrorResponse> {
    // Validate URL to prevent SSRF
    validate_url(&query.url).map_err(|e| bad_request(e.to_string()))?;
    ensure_source_public_access(&state, &query.source).await?;

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
    ensure_source_public_access(&state, &query.source).await?;

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
    ensure_source_public_access(&state, &query.source).await?;

    // 1. Try Cache if book_id and index provided
    if let (Some(book_id), Some(index)) = (&query.book_id, query.index) {
        if let Some(cached_content) = state
            ._chapter_cache
            .get(&query.source, book_id, &query.url, index)
            .await
        {
            let chunks = query
                .chunk_size
                .map(|sz| nexus_engine::content::chunk_content(&cached_content, sz));
            return Ok(Json(ChapterContent {
                content: cached_content,
                chunks,
            }));
        }
    }

    let engine = state
        .engine_registry
        .get_engine(&query.source)
        .ok_or_else(|| not_found("Source"))?;

    let rules = state
        .content_rules
        .current()
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let content = engine
        .content(&query.url, rules.as_ref())
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let content_arc: Arc<str> = Arc::from(content.as_str());

    // 2. Store in cache if possible
    if let (Some(book_id), Some(index)) = (&query.book_id, query.index) {
        let _ = state
            ._chapter_cache
            .set(&query.source, book_id, &query.url, index, content_arc.clone())
            .await;
    }

    let chunks = query
        .chunk_size
        .map(|sz| nexus_engine::content::chunk_content(&content_arc, sz));

    Ok(Json(ChapterContent {
        content: content_arc,
        chunks,
    }))
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
    let max_batch_urls = state.config.limits.max_batch_content_urls.max(1);
    if query.urls.len() > max_batch_urls {
        return Err(bad_request(format!(
            "Too many urls in one request: {} (max {})",
            query.urls.len(),
            max_batch_urls
        )));
    }

    ensure_source_public_access(&state, &query.source).await?;

    let engine = state
        .engine_registry
        .get_engine(&query.source)
        .ok_or_else(|| not_found("Source"))?;

    let rules = state
        .content_rules
        .current()
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let concurrency = state
        .config
        .limits
        .max_concurrent_fetches_per_source
        .max(1);

    let mut indexed_results = stream::iter(query.urls.into_iter().enumerate().map(|(idx, url)| {
        let engine = engine.clone();
        let rules = rules.clone();
        let url_clone = url.clone();

        async move {
            // Validate URL
            if let Err(e) = validate_url(&url_clone) {
                return (idx, BatchContentResult {
                    url: url_clone,
                    content: None,
                    error: Some(e.to_string()),
                });
            }

            let result = match engine.content(&url_clone, rules.as_ref()).await {
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
            };
            (idx, result)
        }
    }))
    .buffer_unordered(concurrency)
    .collect::<Vec<(usize, BatchContentResult)>>()
    .await;
    indexed_results.sort_by_key(|(idx, _)| *idx);
    let results = indexed_results
        .into_iter()
        .map(|(_, result)| result)
        .collect::<Vec<_>>();

    Ok(Json(BatchContentResponse { results }))
}
