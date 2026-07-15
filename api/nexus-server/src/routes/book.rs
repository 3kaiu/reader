use axum::{
    extract::{Query, State},
    http::{HeaderMap, HeaderValue},
    Json,
};
use futures::stream::{self, StreamExt};
use nexus_core::{
    types::{Chapter, PipelineStageReport},
    BookEngineRuntime, BookInfo, BookInfoMeta, ChapterContent, ChapterContentMeta, EngineError,
};
use nexus_engine::evaluate_content_quality;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Instant;

use crate::app::AppState;
use crate::error::{bad_request, internal_error, not_found, ApiErrorResponse};
use crate::source_access::ensure_source_public_access;
use crate::validation::validate_url_with_options;

#[derive(Deserialize)]
pub struct BookQuery {
    pub source: String,
    pub url: String,
    pub chunk_size: Option<usize>,
    pub book_id: Option<String>,
    pub index: Option<usize>,
}

async fn resolve_engine_for_url(
    state: &AppState,
    source_id: &str,
    url: &str,
) -> Result<Arc<dyn BookEngineRuntime>, ApiErrorResponse> {
    validate_url_with_options(url, true).map_err(|e| bad_request(e.to_string()))?;
    resolve_engine_for_source(state, source_id).await
}

async fn resolve_engine_for_source(
    state: &AppState,
    source_id: &str,
) -> Result<Arc<dyn BookEngineRuntime>, ApiErrorResponse> {
    ensure_source_public_access(state, source_id).await?;
    state
        .engine_registry
        .get_runtime_engine(source_id)
        .ok_or_else(|| not_found("Source"))
}

async fn active_package_id(state: &AppState, source_id: &str) -> Option<String> {
    state
        .store
        .get_source_package(source_id.to_string())
        .await
        .ok()
        .flatten()
        .map(|pkg| pkg.package_id)
}

fn attach_active_package_headers(headers: &mut HeaderMap, package_id: Option<&str>) {
    if let Some(id) = package_id {
        if let Ok(v) = HeaderValue::from_str(id) {
            headers.insert("x-active-package-id", v);
        }
    }
}

fn attach_stage_reports_header(headers: &mut HeaderMap, reports: &[PipelineStageReport]) {
    if reports.is_empty() {
        return;
    }
    if let Ok(json) = serde_json::to_string(reports) {
        if let Ok(v) = HeaderValue::from_str(&json) {
            headers.insert("x-stage-reports", v);
        }
    }
}

fn build_chapter_content(
    content: Arc<str>,
    chunk_size: Option<usize>,
    strategy: &'static str,
    stage_reports: Vec<PipelineStageReport>,
    source_id: &str,
    book_identity: Option<&str>,
    fallback_used: bool,
    package_id: Option<&str>,
) -> ChapterContent {
    let chunks = chunk_size.map(|sz| nexus_engine::content::chunk_content(&content, sz));
    let mut meta = ChapterContentMeta::new(
        evaluate_content_quality(content.as_ref()),
        vec![strategy.to_string()],
    );
    meta.stage_reports = stage_reports;
    meta.fallback_used = fallback_used;
    meta.effective_source_id = Some(source_id.to_string());
    meta.book_identity = book_identity.map(ToString::to_string);
    meta.package_id = package_id.map(ToString::to_string);
    ChapterContent {
        content: content.clone(),
        chunks,
        meta: Some(meta),
    }
}

fn build_content_failure_report(error: &EngineError) -> PipelineStageReport {
    let mut report = PipelineStageReport {
        stage: "unknown".to_string(),
        ok: false,
        strategy: None,
        failure_code: Some(error.legacy_error_code().to_string()),
        warnings: Vec::new(),
        metrics: std::collections::HashMap::new(),
    };

    match error {
        EngineError::Timeout
        | EngineError::Network { .. }
        | EngineError::DnsError { .. }
        | EngineError::ConnectionRefused { .. }
        | EngineError::TlsHandshakeFailed { .. }
        | EngineError::CloudflareChallenge
        | EngineError::CloudflareChallengeFailed
        | EngineError::RateLimited { .. }
        | EngineError::IpBanned
        | EngineError::AllStrategiesFailed
        | EngineError::CircuitOpen { .. } => {
            report.stage = "fetch".to_string();
            report.strategy = Some("anti_crawl_chain".to_string());
        },
        EngineError::RuleMismatch { rule } => {
            report.stage = match rule.as_str() {
                "content.body" => "rule_extract",
                "content.quality_gate" => "quality_gate",
                "content.validation" | "content.pagination" => "validation",
                _ => "rule_extract",
            }
            .to_string();
            report.metrics.insert("rule".to_string(), rule.clone());
        },
        EngineError::ScriptError { .. }
        | EngineError::ScriptTimeout
        | EngineError::ScriptMemoryExceeded => {
            report.stage = "script".to_string();
        },
        EngineError::EmptyContent => {
            report.stage = "validation".to_string();
        },
        _ => {},
    }

    report
}

fn content_error_response(error: EngineError) -> ApiErrorResponse {
    let stage_report = build_content_failure_report(&error);
    let details = serde_json::json!({
        "failureCode": error.legacy_error_code(),
        "stageReports": [stage_report],
    });

    internal_error(error.to_string()).with_details(details.to_string())
}

/// Get book information
pub async fn book_info(
    State(state): State<AppState>,
    Query(query): Query<BookQuery>,
) -> Result<(HeaderMap, Json<BookInfo>), ApiErrorResponse> {
    let engine = resolve_engine_for_url(&state, &query.source, &query.url).await?;
    let started_at = Instant::now();
    let package_id = active_package_id(&state, &query.source).await;

    let mut info = engine
        .book_info(&query.url)
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let mut stage = PipelineStageReport {
        stage: "book_info".to_string(),
        ok: true,
        strategy: Some("engine".to_string()),
        failure_code: None,
        warnings: Vec::new(),
        metrics: std::collections::HashMap::new(),
    };
    stage
        .metrics
        .insert("elapsedMs".to_string(), started_at.elapsed().as_millis().to_string());

    info.meta = Some(BookInfoMeta {
        package_id: package_id.as_deref().map(Into::into),
        stage_reports: vec![stage.clone()],
    });

    let mut headers = HeaderMap::new();
    attach_active_package_headers(&mut headers, package_id.as_deref());
    attach_stage_reports_header(&mut headers, &[stage]);
    Ok((headers, Json(info)))
}

/// Get chapter list
pub async fn chapters(
    State(state): State<AppState>,
    Query(query): Query<BookQuery>,
) -> Result<(HeaderMap, Json<Vec<Chapter>>), ApiErrorResponse> {
    let engine = resolve_engine_for_url(&state, &query.source, &query.url).await?;
    let started_at = Instant::now();
    let package_id = active_package_id(&state, &query.source).await;

    let chapters = engine
        .chapters(&query.url)
        .await
        .map(Json)
        .map_err(|e| internal_error(e.to_string()))?;

    let mut stage = PipelineStageReport {
        stage: "chapters".to_string(),
        ok: true,
        strategy: Some("engine".to_string()),
        failure_code: None,
        warnings: Vec::new(),
        metrics: std::collections::HashMap::new(),
    };
    stage
        .metrics
        .insert("elapsedMs".to_string(), started_at.elapsed().as_millis().to_string());
    stage
        .metrics
        .insert("count".to_string(), chapters.0.len().to_string());

    let mut headers = HeaderMap::new();
    attach_active_package_headers(&mut headers, package_id.as_deref());
    attach_stage_reports_header(&mut headers, &[stage]);

    Ok((headers, chapters))
}

/// Get chapter content
pub async fn content(
    State(state): State<AppState>,
    Query(query): Query<BookQuery>,
) -> Result<Json<ChapterContent>, ApiErrorResponse> {
    let engine = resolve_engine_for_url(&state, &query.source, &query.url).await?;
    let request_started_at = Instant::now();
    let package_id = active_package_id(&state, &query.source).await;

    // 1. Try Cache if book_id and index provided
    if let (Some(book_id), Some(index)) = (&query.book_id, query.index) {
        if let Some(cached_content) = state
            ._chapter_cache
            .get(&query.source, book_id, &query.url, index)
            .await
        {
            return Ok(Json(build_chapter_content(
                cached_content.clone(),
                query.chunk_size,
                "cache",
                Vec::new(),
                &query.source,
                query.book_id.as_deref(),
                true,
                package_id.as_deref(),
            )));
        }
    }

    let rules = state
        .content_rules
        .current()
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let content_run = engine
        .content_with_report(&query.url, rules.as_ref())
        .await
        .map_err(|error| {
            state
                .orchestrator
                .health_tracker()
                .record_failure_kind(&query.source, error.health_failure_kind());
            content_error_response(error)
        })?;

    state
        .orchestrator
        .health_tracker()
        .record_success(&query.source, request_started_at.elapsed());

    // Enforce maximum chapter content size (5 MB default)
    const MAX_CHAPTER_BYTES: usize = 5_000_000;
    let content = if content_run.content.len() > MAX_CHAPTER_BYTES {
        tracing::warn!(
            "Chapter content too large ({} bytes), truncating to {} bytes",
            content_run.content.len(),
            MAX_CHAPTER_BYTES
        );
        let end = content_run.content.floor_char_boundary(MAX_CHAPTER_BYTES);
        content_run.content[..end].to_string()
    } else {
        content_run.content
    };
    let content_arc: Arc<str> = Arc::from(content.as_str());

    // 2. Store in cache if possible
    if let (Some(book_id), Some(index)) = (&query.book_id, query.index) {
        let _ = state
            ._chapter_cache
            .set(&query.source, book_id, &query.url, index, content_arc.clone())
            .await;
    }

    Ok(Json(build_chapter_content(
        content_arc,
        query.chunk_size,
        "engine",
        content_run.stage_reports,
        &query.source,
        query.book_id.as_deref(),
        false,
        package_id.as_deref(),
    )))
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

    let engine = resolve_engine_for_source(&state, &query.source).await?;

    let rules = state
        .content_rules
        .current()
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let concurrency = state.config.limits.max_concurrent_fetches_per_source.max(1);

    let mut indexed_results = stream::iter(query.urls.into_iter().enumerate().map(|(idx, url)| {
        let engine = engine.clone();
        let rules = rules.clone();
        let url_clone = url.clone();

        async move {
            // Validate URL
            if let Err(e) = validate_url_with_options(&url_clone, true) {
                return (
                    idx,
                    BatchContentResult {
                        url: url_clone,
                        content: None,
                        error: Some(e.to_string()),
                    },
                );
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
