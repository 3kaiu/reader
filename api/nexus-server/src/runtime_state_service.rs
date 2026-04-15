use chrono::Utc;
use nexus_core::types::{PersistedExtractionMetrics, SourceRuntimeProfile};
use nexus_core::PersistedSourceHealth;
use nexus_engine::extraction_metrics;
use nexus_storage::SledStore;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;

use crate::app_state::{SnapshotEventBaseline, SnapshotStatus};
use crate::engine_registry::EngineRegistry;
use crate::orchestrator::SearchOrchestrator;

const LOW_CONFIDENCE_EVENT_THRESHOLD: u64 = 5;

#[derive(Serialize)]
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

pub struct RuntimeStateService {
    engine_registry: Arc<EngineRegistry>,
    orchestrator: Arc<SearchOrchestrator>,
    store: Arc<SledStore>,
    snapshot_status: Arc<SnapshotStatus>,
}

impl RuntimeStateService {
    pub fn new(
        engine_registry: Arc<EngineRegistry>,
        orchestrator: Arc<SearchOrchestrator>,
        store: Arc<SledStore>,
        snapshot_status: Arc<SnapshotStatus>,
    ) -> Self {
        Self {
            engine_registry,
            orchestrator,
            store,
            snapshot_status,
        }
    }

    pub fn source_health(&self) -> Vec<SourceHealthInfo> {
        let health_stats = self.orchestrator.health_tracker().get_all();
        let extraction_stats = extraction_metrics::snapshot()
            .into_iter()
            .map(|item| (item.source_id.clone(), item))
            .collect::<HashMap<_, _>>();

        health_stats
            .into_iter()
            .map(|item| {
                let engine = self.engine_registry.get_runtime_engine(&item.source_id);
                let extraction = extraction_stats.get(&item.source_id);
                let health_total_events = item.success_count + item.failure_count;
                let extraction_total_events = extraction
                    .map(|stats| stats.success + stats.total_failures)
                    .unwrap_or(0);
                let (health_events_since_snapshot, extraction_events_since_snapshot) =
                    self.snapshot_status.events_since_snapshot(
                        &item.source_id,
                        health_total_events,
                        extraction_total_events,
                    );

                SourceHealthInfo {
                    source_id: item.source_id.clone(),
                    success_count: item.success_count,
                    failure_count: item.failure_count,
                    avg_latency_ms: item.avg_latency_ms(),
                    score: item.score(),
                    health_points: item.health_points,
                    consecutive_successes: item.consecutive_successes,
                    consecutive_failures: item.consecutive_failures,
                    circuit_state: engine
                        .as_ref()
                        .map(|engine| engine.circuit_state_label())
                        .unwrap_or_else(|| "closed".to_string()),
                    primary_failure: item.primary_failure().to_string(),
                    fallback_hit_rate: extraction
                        .map(|stats| stats.fallback_hit_rate)
                        .unwrap_or(0.0),
                    avg_quality_score: extraction
                        .map(|stats| stats.avg_quality_score)
                        .unwrap_or(0.0),
                    strategy_chain: engine
                        .map(|engine| engine.runtime_profile().strategy_chain)
                        .unwrap_or_default(),
                    restored_from_snapshot: self.snapshot_status.restored_from_snapshot(),
                    snapshot_updated_at_ms: self.snapshot_status.updated_at_ms(),
                    health_events_since_snapshot,
                    extraction_events_since_snapshot,
                    low_confidence: health_events_since_snapshot + extraction_events_since_snapshot
                        < LOW_CONFIDENCE_EVENT_THRESHOLD,
                }
            })
            .collect()
    }

    pub fn runtime_state_overview(&self) -> RuntimeStateOverviewResponse {
        let source_health = self.source_health();
        let tracked_sources = source_health.len();
        let unhealthy_sources = source_health
            .iter()
            .filter(|item| {
                item.health_points < 60
                    || item.consecutive_failures >= 3
                    || item.circuit_state == "open"
            })
            .count();
        let open_circuit_sources = source_health
            .iter()
            .filter(|item| item.circuit_state == "open")
            .count();
        let low_confidence_sources = source_health
            .iter()
            .filter(|item| item.low_confidence)
            .count();
        let health_events_since_snapshot = source_health
            .iter()
            .map(|item| item.health_events_since_snapshot)
            .sum();
        let extraction_events_since_snapshot = source_health
            .iter()
            .map(|item| item.extraction_events_since_snapshot)
            .sum();

        RuntimeStateOverviewResponse {
            restored_from_snapshot: self.snapshot_status.restored_from_snapshot(),
            snapshot_updated_at_ms: self.snapshot_status.updated_at_ms(),
            tracked_sources,
            unhealthy_sources,
            open_circuit_sources,
            low_confidence_sources,
            health_events_since_snapshot,
            extraction_events_since_snapshot,
        }
    }

    pub async fn save_runtime_snapshot(
        &self,
    ) -> Result<RuntimeSnapshotSaveResponse, nexus_core::EngineError> {
        let health_snapshot = self.orchestrator.health_tracker().snapshot_persisted();
        let extraction_snapshot = extraction_metrics::snapshot_persisted();
        let updated_at_ms = Utc::now().timestamp_millis();

        self.store
            .save_health_snapshot(health_snapshot.clone())
            .await?;
        self.store
            .save_extraction_metrics_snapshot(extraction_snapshot.clone())
            .await?;

        self.snapshot_status.mark_saved(
            updated_at_ms,
            build_snapshot_baselines(&health_snapshot, &extraction_snapshot),
        );

        Ok(RuntimeSnapshotSaveResponse {
            saved: true,
            updated_at_ms,
            health_sources: health_snapshot.len(),
            extraction_sources: extraction_snapshot.len(),
        })
    }

    pub fn export_runtime_snapshot(&self) -> RuntimeSnapshotExportResponse {
        let health = self.orchestrator.health_tracker().snapshot_persisted();
        let extraction = extraction_metrics::snapshot_persisted();

        RuntimeSnapshotExportResponse {
            exported_at_ms: Utc::now().timestamp_millis(),
            restored_from_snapshot: self.snapshot_status.restored_from_snapshot(),
            snapshot_updated_at_ms: self.snapshot_status.updated_at_ms(),
            health_sources: health.len(),
            extraction_sources: extraction.len(),
            health,
            extraction,
        }
    }

    pub async fn import_runtime_snapshot(
        &self,
        health: Vec<PersistedSourceHealth>,
        extraction: Vec<PersistedExtractionMetrics>,
    ) -> Result<RuntimeSnapshotImportResponse, nexus_core::EngineError> {
        let imported_at_ms = Utc::now().timestamp_millis();

        self.orchestrator
            .health_tracker()
            .restore_from_snapshot(health.clone());
        extraction_metrics::restore_from_snapshot(extraction.clone());

        self.store.save_health_snapshot(health.clone()).await?;
        self.store
            .save_extraction_metrics_snapshot(extraction.clone())
            .await?;

        self.snapshot_status.replace_snapshot_state(
            true,
            imported_at_ms,
            build_snapshot_baselines(&health, &extraction),
        );

        Ok(RuntimeSnapshotImportResponse {
            imported: true,
            imported_at_ms,
            health_sources: health.len(),
            extraction_sources: extraction.len(),
        })
    }

    pub fn runtime_profile(&self, source_id: &str) -> Option<SourceRuntimeProfile> {
        self.engine_registry
            .get_runtime_engine(source_id)
            .map(|engine| engine.runtime_profile())
    }

    pub fn circuit_state_label(&self, source_id: &str) -> Option<String> {
        self.engine_registry
            .get_runtime_engine(source_id)
            .map(|engine| engine.circuit_state_label())
    }

    pub fn reset_source_runtime_state(&self, source_id: &str, mode: &str) -> Option<()> {
        let engine = self.engine_registry.get_runtime_engine(source_id)?;

        engine.reset_runtime_state();
        if mode != "circuit_only" {
            self.orchestrator.health_tracker().reset_source(source_id);
            extraction_metrics::reset_source(source_id);
        }

        Some(())
    }
}

fn build_snapshot_baselines(
    persisted_health: &[PersistedSourceHealth],
    persisted_extraction_metrics: &[PersistedExtractionMetrics],
) -> HashMap<String, SnapshotEventBaseline> {
    let mut baselines = HashMap::new();

    for item in persisted_health {
        baselines
            .entry(item.source_id.clone())
            .or_insert_with(SnapshotEventBaseline::default)
            .health_total_events = item.success_count + item.failure_count;
    }

    for item in persisted_extraction_metrics {
        baselines
            .entry(item.source_id.clone())
            .or_insert_with(SnapshotEventBaseline::default)
            .extraction_total_events = item.success
            + item.validation_failures
            + item.rule_mismatch_failures
            + item.empty_content_failures
            + item.low_quality_failures;
    }

    baselines
}
