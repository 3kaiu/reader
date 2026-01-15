use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_core::NxsSource;
use serde::{Deserialize, Serialize};

use crate::app::AppState;

/// Source with enabled status
#[derive(Serialize)]
pub struct SourceWithStatus {
    #[serde(flatten)]
    pub source: NxsSource,
    pub enabled: bool,
}

/// List all sources
pub async fn list_sources(State(state): State<AppState>) -> Json<Vec<SourceWithStatus>> {
    let sources = state.engine_registry.source_store().get_all();
    let sources_with_status: Vec<SourceWithStatus> = sources
        .into_iter()
        .map(|source| {
            let enabled = state
                .store
                .get_source_status(&source.id)
                .unwrap_or(true);
            SourceWithStatus { source, enabled }
        })
        .collect();
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
    
    let enabled = state
        .store
        .get_source_status(&id)
        .unwrap_or(true);
    
    Ok(Json(SourceWithStatus { source, enabled }))
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

/// Request body for updating source status
#[derive(Deserialize)]
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
        .set_source_status(&id, body.enabled)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    Ok(Json(SourceWithStatus {
        source,
        enabled: body.enabled,
    }))
}
