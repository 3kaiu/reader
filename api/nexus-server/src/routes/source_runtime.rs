use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_core::types::{PersistedExtractionMetrics, SourceRuntimeProfile};
use nexus_core::PersistedSourceHealth;
use serde::{Deserialize, Serialize};

use crate::app::AppState;
use crate::runtime_state_service::{
    RuntimeSnapshotExportResponse, RuntimeSnapshotImportResponse, RuntimeSnapshotSaveResponse,
    RuntimeStateOverviewResponse, SourceHealthInfo,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuntimeProfileResponse {
    pub source_id: String,
    pub profile: SourceRuntimeProfile,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCircuitStateResponse {
    pub source_id: String,
    pub state: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuntimeResetResponse {
    pub source_id: String,
    pub reset: bool,
    pub mode: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshotImportRequest {
    pub health: Vec<PersistedSourceHealth>,
    pub extraction: Vec<PersistedExtractionMetrics>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResetSourceRuntimeStateRequest {
    pub mode: Option<String>,
}

pub async fn source_health(State(state): State<AppState>) -> Json<Vec<SourceHealthInfo>> {
    Json(state.runtime_state_service.source_health())
}

pub async fn runtime_state_overview(
    State(state): State<AppState>,
) -> Json<RuntimeStateOverviewResponse> {
    Json(state.runtime_state_service.runtime_state_overview())
}

pub async fn source_runtime_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceRuntimeProfileResponse>, StatusCode> {
    let profile = state
        .runtime_state_service
        .runtime_profile(&id)
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(SourceRuntimeProfileResponse {
        source_id: id,
        profile,
    }))
}

pub async fn source_circuit_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceCircuitStateResponse>, StatusCode> {
    let state_label = state
        .runtime_state_service
        .circuit_state_label(&id)
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(SourceCircuitStateResponse {
        source_id: id,
        state: state_label,
    }))
}

pub async fn save_runtime_snapshot(
    State(state): State<AppState>,
) -> Result<Json<RuntimeSnapshotSaveResponse>, StatusCode> {
    state
        .runtime_state_service
        .save_runtime_snapshot()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn export_runtime_snapshot(
    State(state): State<AppState>,
) -> Result<Json<RuntimeSnapshotExportResponse>, StatusCode> {
    Ok(Json(state.runtime_state_service.export_runtime_snapshot()))
}

pub async fn import_runtime_snapshot(
    State(state): State<AppState>,
    Json(body): Json<RuntimeSnapshotImportRequest>,
) -> Result<Json<RuntimeSnapshotImportResponse>, StatusCode> {
    state
        .runtime_state_service
        .import_runtime_snapshot(body.health, body.extraction)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn reset_source_runtime_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
    payload: Option<Json<ResetSourceRuntimeStateRequest>>,
) -> Result<Json<SourceRuntimeResetResponse>, StatusCode> {
    let mode = payload
        .as_ref()
        .and_then(|Json(body)| body.mode.as_deref())
        .unwrap_or("full");

    state
        .runtime_state_service
        .reset_source_runtime_state(&id, mode)
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(SourceRuntimeResetResponse {
        source_id: id,
        reset: true,
        mode: mode.to_string(),
    }))
}
