use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_engine::extraction_metrics;
use nexus_core::{NxsSource, SourcePolicy};
use serde::Serialize;

use crate::app::AppState;
use crate::source_access::{is_source_publicly_available, load_source_availability};

/// Source with enabled status
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceWithStatus {
    #[serde(flatten)]
    pub source: NxsSource,
    pub enabled: bool,
    pub policy: SourcePolicy,
    pub public_access_enabled: bool,
}

/// List all sources
pub async fn list_sources(State(state): State<AppState>) -> Json<Vec<SourceWithStatus>> {
    let sources = state.engine_registry.source_store().get_all();
    let mut sources_with_status = Vec::new();

    for source in sources {
        let availability = load_source_availability(&state, &source.id)
            .await
            .ok();
        let enabled = availability
            .as_ref()
            .map(|it| it.enabled)
            .unwrap_or(true);
        let policy = availability
            .map(|it| it.policy)
            .unwrap_or_default();
        sources_with_status.push(SourceWithStatus {
            public_access_enabled: is_source_publicly_available(enabled, &policy),
            source,
            enabled,
            policy,
        });
    }

    Json(sources_with_status)
}

/// Get a single source
pub async fn get_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceWithStatus>, StatusCode> {
    let source = state
        .engine_registry
        .source_store()
        .get(&id)
        .ok_or(StatusCode::NOT_FOUND)?;

    let availability = load_source_availability(&state, &id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SourceWithStatus {
        public_access_enabled: is_source_publicly_available(
            availability.enabled,
            &availability.policy,
        ),
        source,
        enabled: availability.enabled,
        policy: availability.policy,
    }))
}

/// Add a new source
pub async fn add_source(
    State(state): State<AppState>,
    Json(source): Json<NxsSource>,
) -> Result<StatusCode, (StatusCode, String)> {
    let id = source.id.clone();
    state
        .engine_registry
        .source_store()
        .save(&source)
        .await
        .map(|_| {
            state.engine_registry.invalidate(&id);
            StatusCode::CREATED
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// Delete a source
pub async fn delete_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    state
        .engine_registry
        .source_store()
        .delete(&id)
        .await
        .map(|_| {
            state.engine_registry.invalidate(&id);
            StatusCode::NO_CONTENT
        })
        .map_err(|_| StatusCode::NOT_FOUND)
}

/// Source health info for API response
#[derive(serde::Serialize)]
pub struct SourceHealthInfo {
    pub source_id: String,
    pub success_count: u64,
    pub failure_count: u64,
    pub avg_latency_ms: u64,
    pub score: f64,
}

/// Get health stats for all sources
pub async fn source_health(State(state): State<AppState>) -> Json<Vec<SourceHealthInfo>> {
    let health_stats = state.orchestrator.health_tracker().get_all();

    let info: Vec<SourceHealthInfo> = health_stats
        .into_iter()
        .map(|h| SourceHealthInfo {
            source_id: h.source_id.clone(),
            success_count: h.success_count,
            failure_count: h.failure_count,
            avg_latency_ms: h.avg_latency_ms(),
            score: h.score(),
        })
        .collect();

    Json(info)
}

/// Extraction quality stats for all sources
pub async fn source_extraction_metrics() -> Json<Vec<extraction_metrics::SourceExtractionStats>> {
    Json(extraction_metrics::snapshot())
}

/// Request body for updating source status
#[derive(serde::Deserialize)]
pub struct UpdateStatusRequest {
    pub enabled: bool,
}

/// Update source enabled status
pub async fn update_source_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStatusRequest>,
) -> Result<Json<SourceWithStatus>, (StatusCode, String)> {
    // Check if source exists
    let source = state
        .engine_registry
        .source_store()
        .get(&id)
        .ok_or((StatusCode::NOT_FOUND, format!("Source not found: {}", id)))?;

    // Update status in database
    state
        .store
        .set_source_status(id.clone(), body.enabled)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let policy = state
        .store
        .get_source_policy(id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(SourceWithStatus {
        public_access_enabled: is_source_publicly_available(body.enabled, &policy),
        source,
        enabled: body.enabled,
        policy,
    }))
}

/// Update source governance policy
pub async fn update_source_policy(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(policy): Json<SourcePolicy>,
) -> Result<Json<SourceWithStatus>, (StatusCode, String)> {
    let source = state
        .engine_registry
        .source_store()
        .get(&id)
        .ok_or((StatusCode::NOT_FOUND, format!("Source not found: {}", id)))?;

    state
        .store
        .set_source_policy(id.clone(), policy.clone())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let enabled = state.store.get_source_status(id).await.unwrap_or(true);

    Ok(Json(SourceWithStatus {
        public_access_enabled: is_source_publicly_available(enabled, &policy),
        source,
        enabled,
        policy,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
        routing::get,
        Router,
    };
    use tower::ServiceExt;

    #[tokio::test]
    async fn source_extraction_route_returns_json_array() {
        extraction_metrics::record_success("route_test_source", false);

        let app = Router::new().route("/api/sources/extraction", get(source_extraction_metrics));
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/sources/extraction")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("route should respond");

        assert_eq!(response.status(), StatusCode::OK);

        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should be readable");
        let payload: serde_json::Value =
            serde_json::from_slice(&bytes).expect("response must be valid json");
        assert!(payload.is_array());
    }
}
