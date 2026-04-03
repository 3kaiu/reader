use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use nexus_core::types::{PersistedExtractionMetrics, SourceRuntimeProfile};
use nexus_core::PersistedSourceHealth;
use nexus_engine::extraction_metrics;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::app::AppState;
use crate::app_state::SnapshotEventBaseline;

const LOW_CONFIDENCE_EVENT_THRESHOLD: u64 = 5;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceHealthInfo {
    pub source_id: String,
    pub success_count: u64,
    pub failure_count: u64,
    pub avg_latency_ms: u64,
    pub score: f64,
    pub health_points: i32,
    pub consecutive_successes: u32,
    pub consecutive_failures: u32,
    pub circuit_state: String,
    pub primary_failure: String,
    pub fallback_hit_rate: f64,
    pub avg_quality_score: f64,
    pub strategy_chain: Vec<String>,
    pub restored_from_snapshot: bool,
    pub snapshot_updated_at_ms: Option<i64>,
    pub health_events_since_snapshot: u64,
    pub extraction_events_since_snapshot: u64,
    pub low_confidence: bool,
}

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshotSaveResponse {
    pub saved: bool,
    pub updated_at_ms: i64,
    pub health_sources: usize,
    pub extraction_sources: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshotExportResponse {
    pub exported_at_ms: i64,
    pub restored_from_snapshot: bool,
    pub snapshot_updated_at_ms: Option<i64>,
    pub health_sources: usize,
    pub extraction_sources: usize,
    pub health: Vec<PersistedSourceHealth>,
    pub extraction: Vec<PersistedExtractionMetrics>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshotImportRequest {
    pub health: Vec<PersistedSourceHealth>,
    pub extraction: Vec<PersistedExtractionMetrics>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshotImportResponse {
    pub imported: bool,
    pub imported_at_ms: i64,
    pub health_sources: usize,
    pub extraction_sources: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStateOverviewResponse {
    pub restored_from_snapshot: bool,
    pub snapshot_updated_at_ms: Option<i64>,
    pub tracked_sources: usize,
    pub unhealthy_sources: usize,
    pub open_circuit_sources: usize,
    pub low_confidence_sources: usize,
    pub health_events_since_snapshot: u64,
    pub extraction_events_since_snapshot: u64,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResetSourceRuntimeStateRequest {
    pub mode: Option<String>,
}

pub async fn source_health(State(state): State<AppState>) -> Json<Vec<SourceHealthInfo>> {
    let health_stats = state.orchestrator.health_tracker().get_all();
    let extraction_stats = extraction_metrics::snapshot()
        .into_iter()
        .map(|item| (item.source_id.clone(), item))
        .collect::<HashMap<_, _>>();

    let info: Vec<SourceHealthInfo> = health_stats
        .into_iter()
        .map(|h| {
            let engine = state.engine_registry.get_engine(&h.source_id);
            let extraction = extraction_stats.get(&h.source_id);
            let health_total_events = h.success_count + h.failure_count;
            let extraction_total_events = extraction
                .map(|item| item.success + item.total_failures)
                .unwrap_or(0);
            let (health_events_since_snapshot, extraction_events_since_snapshot) = state
                .snapshot_status
                .events_since_snapshot(&h.source_id, health_total_events, extraction_total_events);
            let low_confidence = health_events_since_snapshot + extraction_events_since_snapshot
                < LOW_CONFIDENCE_EVENT_THRESHOLD;

            SourceHealthInfo {
                source_id: h.source_id.clone(),
                success_count: h.success_count,
                failure_count: h.failure_count,
                avg_latency_ms: h.avg_latency_ms(),
                score: h.score(),
                health_points: h.health_points,
                consecutive_successes: h.consecutive_successes,
                consecutive_failures: h.consecutive_failures,
                circuit_state: engine
                    .as_ref()
                    .and_then(|engine| engine.circuit_state())
                    .map(|state| format!("{state:?}").to_ascii_lowercase())
                    .unwrap_or_else(|| "closed".to_string()),
                primary_failure: h.primary_failure().to_string(),
                fallback_hit_rate: extraction.map(|item| item.fallback_hit_rate).unwrap_or(0.0),
                avg_quality_score: extraction.map(|item| item.avg_quality_score).unwrap_or(0.0),
                strategy_chain: engine
                    .map(|engine| engine.runtime_profile().strategy_chain)
                    .unwrap_or_default(),
                restored_from_snapshot: state.snapshot_status.restored_from_snapshot(),
                snapshot_updated_at_ms: state.snapshot_status.updated_at_ms(),
                health_events_since_snapshot,
                extraction_events_since_snapshot,
                low_confidence,
            }
        })
        .collect();

    Json(info)
}

pub async fn runtime_state_overview(
    State(state): State<AppState>,
) -> Json<RuntimeStateOverviewResponse> {
    let health_stats = state.orchestrator.health_tracker().get_all();
    let extraction_stats = extraction_metrics::snapshot()
        .into_iter()
        .map(|item| (item.source_id.clone(), item))
        .collect::<HashMap<_, _>>();

    let mut unhealthy_sources = 0usize;
    let mut open_circuit_sources = 0usize;
    let mut low_confidence_sources = 0usize;
    let mut health_events_since_snapshot = 0u64;
    let mut extraction_events_since_snapshot = 0u64;

    for item in &health_stats {
        let engine = state.engine_registry.get_engine(&item.source_id);
        let extraction = extraction_stats.get(&item.source_id);
        let health_total_events = item.success_count + item.failure_count;
        let extraction_total_events = extraction
            .map(|stats| stats.success + stats.total_failures)
            .unwrap_or(0);
        let (health_delta, extraction_delta) = state.snapshot_status.events_since_snapshot(
            &item.source_id,
            health_total_events,
            extraction_total_events,
        );

        health_events_since_snapshot += health_delta;
        extraction_events_since_snapshot += extraction_delta;

        let circuit_state = engine
            .as_ref()
            .and_then(|engine| engine.circuit_state())
            .map(|state| format!("{state:?}").to_ascii_lowercase())
            .unwrap_or_else(|| "closed".to_string());

        if circuit_state == "open" {
            open_circuit_sources += 1;
        }
        if item.health_points < 60 || item.consecutive_failures >= 3 || circuit_state == "open" {
            unhealthy_sources += 1;
        }
        if health_delta + extraction_delta < LOW_CONFIDENCE_EVENT_THRESHOLD {
            low_confidence_sources += 1;
        }
    }

    Json(RuntimeStateOverviewResponse {
        restored_from_snapshot: state.snapshot_status.restored_from_snapshot(),
        snapshot_updated_at_ms: state.snapshot_status.updated_at_ms(),
        tracked_sources: health_stats.len(),
        unhealthy_sources,
        open_circuit_sources,
        low_confidence_sources,
        health_events_since_snapshot,
        extraction_events_since_snapshot,
    })
}

pub async fn source_runtime_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceRuntimeProfileResponse>, StatusCode> {
    let engine = state
        .engine_registry
        .get_engine(&id)
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(SourceRuntimeProfileResponse {
        source_id: id,
        profile: engine.runtime_profile(),
    }))
}

pub async fn source_circuit_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceCircuitStateResponse>, StatusCode> {
    let engine = state
        .engine_registry
        .get_engine(&id)
        .ok_or(StatusCode::NOT_FOUND)?;

    let state_label = engine
        .circuit_state()
        .map(|state| format!("{state:?}").to_ascii_lowercase())
        .unwrap_or_else(|| "closed".to_string());

    Ok(Json(SourceCircuitStateResponse {
        source_id: id,
        state: state_label,
    }))
}

pub async fn save_runtime_snapshot(
    State(state): State<AppState>,
) -> Result<Json<RuntimeSnapshotSaveResponse>, StatusCode> {
    let health_snapshot = state.orchestrator.health_tracker().snapshot_persisted();
    let extraction_snapshot = extraction_metrics::snapshot_persisted();
    let updated_at_ms = Utc::now().timestamp_millis();

    state
        .store
        .save_health_snapshot(health_snapshot.clone())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    state
        .store
        .save_extraction_metrics_snapshot(extraction_snapshot.clone())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut baselines = HashMap::new();
    for item in &health_snapshot {
        baselines
            .entry(item.source_id.clone())
            .or_insert_with(SnapshotEventBaseline::default)
            .health_total_events = item.success_count + item.failure_count;
    }
    for item in &extraction_snapshot {
        baselines
            .entry(item.source_id.clone())
            .or_insert_with(SnapshotEventBaseline::default)
            .extraction_total_events = item.success
            + item.validation_failures
            + item.rule_mismatch_failures
            + item.empty_content_failures
            + item.low_quality_failures;
    }
    state.snapshot_status.mark_saved(updated_at_ms, baselines);

    Ok(Json(RuntimeSnapshotSaveResponse {
        saved: true,
        updated_at_ms,
        health_sources: health_snapshot.len(),
        extraction_sources: extraction_snapshot.len(),
    }))
}

pub async fn export_runtime_snapshot(
    State(state): State<AppState>,
) -> Result<Json<RuntimeSnapshotExportResponse>, StatusCode> {
    let health = state.orchestrator.health_tracker().snapshot_persisted();
    let extraction = extraction_metrics::snapshot_persisted();

    Ok(Json(RuntimeSnapshotExportResponse {
        exported_at_ms: Utc::now().timestamp_millis(),
        restored_from_snapshot: state.snapshot_status.restored_from_snapshot(),
        snapshot_updated_at_ms: state.snapshot_status.updated_at_ms(),
        health_sources: health.len(),
        extraction_sources: extraction.len(),
        health,
        extraction,
    }))
}

pub async fn import_runtime_snapshot(
    State(state): State<AppState>,
    Json(body): Json<RuntimeSnapshotImportRequest>,
) -> Result<Json<RuntimeSnapshotImportResponse>, StatusCode> {
    let imported_at_ms = Utc::now().timestamp_millis();

    state
        .orchestrator
        .health_tracker()
        .restore_from_snapshot(body.health.clone());
    extraction_metrics::restore_from_snapshot(body.extraction.clone());

    state
        .store
        .save_health_snapshot(body.health.clone())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    state
        .store
        .save_extraction_metrics_snapshot(body.extraction.clone())
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut baselines = HashMap::new();
    for item in &body.health {
        baselines
            .entry(item.source_id.clone())
            .or_insert_with(SnapshotEventBaseline::default)
            .health_total_events = item.success_count + item.failure_count;
    }
    for item in &body.extraction {
        baselines
            .entry(item.source_id.clone())
            .or_insert_with(SnapshotEventBaseline::default)
            .extraction_total_events = item.success
            + item.validation_failures
            + item.rule_mismatch_failures
            + item.empty_content_failures
            + item.low_quality_failures;
    }
    state
        .snapshot_status
        .replace_snapshot_state(true, imported_at_ms, baselines);

    Ok(Json(RuntimeSnapshotImportResponse {
        imported: true,
        imported_at_ms,
        health_sources: body.health.len(),
        extraction_sources: body.extraction.len(),
    }))
}

pub async fn reset_source_runtime_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
    payload: Option<Json<ResetSourceRuntimeStateRequest>>,
) -> Result<Json<SourceRuntimeResetResponse>, StatusCode> {
    let engine = state
        .engine_registry
        .get_engine(&id)
        .ok_or(StatusCode::NOT_FOUND)?;

    let mode = payload
        .as_ref()
        .and_then(|Json(body)| body.mode.as_deref())
        .unwrap_or("full");

    engine.reset_circuit();
    if mode != "circuit_only" {
        state.orchestrator.health_tracker().reset_source(&id);
        extraction_metrics::reset_source(&id);
    }

    Ok(Json(SourceRuntimeResetResponse {
        source_id: id,
        reset: true,
        mode: mode.to_string(),
    }))
}
