//! Runtime governance state endpoints
//!
//! These endpoints provide visibility into and control over the
//! runtime state of the source governance system, including
//! health snapshots, extraction metrics, and circuit breaker state.

use axum::{
    extract::{Path, State},
    Json,
};
use nexus_engine::extraction_metrics;
use serde::{Deserialize, Serialize};

use crate::app_state::{AppState, SnapshotEventBaseline};
use crate::error::{internal_error, not_found, ApiErrorResponse};

// ---- Response types ----

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
    pub health: Vec<serde_json::Value>,
    pub extraction: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshotImportPayload {
    pub health: Vec<serde_json::Value>,
    pub extraction: Vec<serde_json::Value>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuntimeProfileResponse {
    pub source_id: String,
    pub profile: SourceRuntimeProfile,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuntimeProfile {
    pub strategy_chain: Vec<String>,
    pub timeout_ms: u64,
    pub retry_budget: u32,
    pub concurrency_limit: u32,
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
pub struct SourceRuntimeResetPayload {
    pub mode: Option<String>,
}

// ---- Handlers ----

/// POST /api/sources/runtime-state/snapshot — persist current runtime state
pub async fn save_runtime_snapshot(
    State(state): State<AppState>,
) -> Result<Json<RuntimeSnapshotSaveResponse>, ApiErrorResponse> {
    let health_snapshot = state.store.health_tracker().snapshot_persisted();
    let extraction_snapshot = extraction_metrics::snapshot_persisted();
    let extraction_len = extraction_snapshot.len();

    // Compute event counts before moving values
    let _health_events_total: u64 = health_snapshot
        .iter()
        .map(|h| h.success_count + h.failure_count)
        .sum();
    let _extraction_events_total: u64 = extraction_snapshot
        .iter()
        .map(|e| {
            e.success
                + e.validation_failures
                + e.rule_mismatch_failures
                + e.empty_content_failures
                + e.low_quality_failures
        })
        .sum();

    state
        .store
        .save_health_snapshot(health_snapshot.clone())
        .await
        .map_err(|e| internal_error(e.to_string()))?;
    state
        .store
        .save_extraction_metrics_snapshot(extraction_snapshot)
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let now_ms = chrono::Utc::now().timestamp_millis();

    let mut baselines = std::collections::HashMap::new();
    // Rebuild baselines from the health snapshot (still owned after clone)
    for h in &health_snapshot {
        baselines
            .entry(h.source_id.clone())
            .or_insert_with(SnapshotEventBaseline::default)
            .health_total_events = h.success_count + h.failure_count;
    }

    state.snapshot_status.mark_saved(now_ms, baselines);
    state
        .store
        .flush()
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    Ok(Json(RuntimeSnapshotSaveResponse {
        saved: true,
        updated_at_ms: now_ms,
        health_sources: health_snapshot.len(),
        extraction_sources: extraction_len,
    }))
}

/// GET /api/sources/runtime-state/export — export current runtime state
pub async fn export_runtime_snapshot(
    State(state): State<AppState>,
) -> Result<Json<RuntimeSnapshotExportResponse>, ApiErrorResponse> {
    let health_snapshot = state.store.health_tracker().snapshot_persisted();
    let extraction_snapshot = extraction_metrics::snapshot_persisted();

    let health: Vec<serde_json::Value> = health_snapshot
        .iter()
        .map(|h| serde_json::to_value(h).unwrap_or_default())
        .collect();
    let extraction: Vec<serde_json::Value> = extraction_snapshot
        .iter()
        .map(|e| serde_json::to_value(e).unwrap_or_default())
        .collect();

    Ok(Json(RuntimeSnapshotExportResponse {
        exported_at_ms: chrono::Utc::now().timestamp_millis(),
        restored_from_snapshot: state.snapshot_status.is_restored(),
        snapshot_updated_at_ms: {
            let v = state.snapshot_status.updated_at_ms();
            if v > 0 {
                Some(v)
            } else {
                None
            }
        },
        health_sources: health_snapshot.len(),
        extraction_sources: extraction_snapshot.len(),
        health,
        extraction,
    }))
}

/// POST /api/sources/runtime-state/import — import and replace runtime state
pub async fn import_runtime_snapshot(
    State(state): State<AppState>,
    Json(payload): Json<RuntimeSnapshotImportPayload>,
) -> Result<Json<RuntimeSnapshotImportResponse>, ApiErrorResponse> {
    use nexus_core::types::PersistedExtractionMetrics;
    use nexus_core::PersistedSourceHealth;

    let imported_health: Vec<PersistedSourceHealth> = payload
        .health
        .iter()
        .filter_map(|v| serde_json::from_value(v.clone()).ok())
        .collect();
    let imported_extraction: Vec<PersistedExtractionMetrics> = payload
        .extraction
        .iter()
        .filter_map(|v| serde_json::from_value(v.clone()).ok())
        .collect();

    // Restore health into tracker
    state
        .store
        .health_tracker()
        .restore_from_snapshot(imported_health.clone());

    // Restore extraction metrics
    extraction_metrics::restore_from_snapshot(imported_extraction.clone());

    let now_ms = chrono::Utc::now().timestamp_millis();

    Ok(Json(RuntimeSnapshotImportResponse {
        imported: true,
        imported_at_ms: now_ms,
        health_sources: imported_health.len(),
        extraction_sources: imported_extraction.len(),
    }))
}

/// GET /api/sources/runtime-state/overview — runtime governance overview
pub async fn get_runtime_state_overview(
    State(state): State<AppState>,
) -> Json<RuntimeStateOverviewResponse> {
    let all_health = state.store.health_tracker().get_all();
    let tracked_sources = all_health.len();
    let unhealthy_sources = all_health
        .iter()
        .filter(|h| h.health_points < 50 || h.score() < 0.3)
        .count();
    let open_circuit_sources = all_health
        .iter()
        .filter(|h| h.circuit_open_failures > 0)
        .count();
    let low_confidence_sources = all_health
        .iter()
        .filter(|h| h.success_count + h.failure_count < 5)
        .count();

    let (health_baseline, extraction_baseline) = state.snapshot_status.total_baseline_events();

    // Compute total events from current health tracker
    let health_total: u64 = all_health
        .iter()
        .map(|h| h.success_count + h.failure_count)
        .sum();
    let extraction_total: u64 = extraction_metrics::snapshot_persisted()
        .iter()
        .map(|e| {
            e.success
                + e.validation_failures
                + e.rule_mismatch_failures
                + e.empty_content_failures
                + e.low_quality_failures
        })
        .sum();

    Json(RuntimeStateOverviewResponse {
        restored_from_snapshot: state.snapshot_status.is_restored(),
        snapshot_updated_at_ms: {
            let v = state.snapshot_status.updated_at_ms();
            if v > 0 {
                Some(v)
            } else {
                None
            }
        },
        tracked_sources,
        unhealthy_sources,
        open_circuit_sources,
        low_confidence_sources,
        health_events_since_snapshot: health_total.saturating_sub(health_baseline),
        extraction_events_since_snapshot: extraction_total.saturating_sub(extraction_baseline),
    })
}

/// GET /api/sources/{id}/runtime-profile — runtime configuration profile for a source
pub async fn get_source_runtime_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceRuntimeProfileResponse>, ApiErrorResponse> {
    let exists = state.engine_registry.legado_store.get(&id).is_some()
        || state.engine_registry.nxs_store.get(&id).is_some();
    if !exists {
        return Err(not_found("Source"));
    }

    // Default runtime profile — in a full implementation this would
    // come from per-source tuning data
    Ok(Json(SourceRuntimeProfileResponse {
        source_id: id.clone(),
        profile: SourceRuntimeProfile {
            strategy_chain: vec![
                "primp_http".to_string(),
                "cf_bypass".to_string(),
                "direct_http".to_string(),
                "browser_probe".to_string(),
            ],
            timeout_ms: (state.config.limits.http_timeout_seconds as u64) * 1000,
            retry_budget: 2,
            concurrency_limit: 1,
        },
    }))
}

/// GET /api/sources/{id}/circuit-state — get circuit breaker state for a source
pub async fn get_source_circuit_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceCircuitStateResponse>, ApiErrorResponse> {
    let exists = state.engine_registry.legado_store.get(&id).is_some()
        || state.engine_registry.nxs_store.get(&id).is_some();
    if !exists {
        return Err(not_found("Source"));
    }

    let health = state.store.health_tracker().get(&id);
    let state_str = match health {
        Some(h) if h.circuit_open_failures > 0 || h.health_points <= 0 => "open",
        Some(h) if h.consecutive_failures >= 3 => "half_open",
        _ => "closed",
    };

    Ok(Json(SourceCircuitStateResponse {
        source_id: id.clone(),
        state: state_str.to_string(),
    }))
}

/// POST /api/sources/{id}/runtime-state/reset — reset runtime state for a source
pub async fn reset_source_runtime_state(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<SourceRuntimeResetPayload>,
) -> Result<Json<SourceRuntimeResetResponse>, ApiErrorResponse> {
    let exists = state.engine_registry.legado_store.get(&id).is_some()
        || state.engine_registry.nxs_store.get(&id).is_some();
    if !exists {
        return Err(not_found("Source"));
    }

    let mode = payload.mode.as_deref().unwrap_or("full");
    match mode {
        "circuit_only" => {
            // Reset only circuit breaker state by removing the health entry.
            // The next fetch will create a fresh entry with default circuit state.
            state.store.health_tracker().reset_source(&id);
        },
        _ => {
            // Full reset
            state.store.health_tracker().reset_source(&id);
            extraction_metrics::reset_source(&id);
        },
    }

    Ok(Json(SourceRuntimeResetResponse {
        source_id: id.clone(),
        reset: true,
        mode: mode.to_string(),
    }))
}
