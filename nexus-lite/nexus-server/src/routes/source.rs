use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_core::NxsSource;

use crate::app::AppState;

/// List all sources
pub async fn list_sources(State(state): State<AppState>) -> Json<Vec<NxsSource>> {
    Json(state.engine_registry.source_store().get_all())
}

/// Get a single source
pub async fn get_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<NxsSource>, StatusCode> {
    state
        .engine_registry
        .source_store()
        .get(&id)
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
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
