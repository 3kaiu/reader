use axum::extract::FromRef;
use nexus_core::EngineConfig;
use nexus_core::EventBus;
use nexus_engine::anti_crawl::FallbackChain;
use nexus_engine::fetcher::HttpFetcher;
use nexus_storage::{ChapterCache, SledStore};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use std::sync::RwLock;

use crate::{
    content_rules::ContentRuleResolver, engine_registry::EngineRegistry,
    orchestrator::SearchOrchestrator, runtime_bootstrap,
    runtime_state_service::RuntimeStateService, source_builder_state::SourceBuilderState,
};

#[derive(Clone)]
pub struct AppState {
    pub engine_registry: Arc<EngineRegistry>,
    pub store: Arc<SledStore>,
    pub content_rules: Arc<ContentRuleResolver>,
    pub _chapter_cache: Arc<ChapterCache>,
    pub _fetcher: Arc<HttpFetcher>,
    pub _anti_crawl: Arc<FallbackChain>,
    pub orchestrator: Arc<SearchOrchestrator>,
    pub runtime_state_service: Arc<RuntimeStateService>,
    pub config: Arc<EngineConfig>,
    pub _event_bus: Arc<EventBus>,
}

pub struct SnapshotStatus {
    restored_from_snapshot: AtomicBool,
    updated_at_ms: AtomicI64,
    baselines: RwLock<HashMap<String, SnapshotEventBaseline>>,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SnapshotEventBaseline {
    pub health_total_events: u64,
    pub extraction_total_events: u64,
}

impl SnapshotStatus {
    pub fn new() -> Self {
        Self {
            restored_from_snapshot: AtomicBool::new(false),
            updated_at_ms: AtomicI64::new(0),
            baselines: RwLock::new(HashMap::new()),
        }
    }

    pub fn mark_restored(
        &self,
        updated_at_ms: Option<i64>,
        baselines: HashMap<String, SnapshotEventBaseline>,
    ) {
        self.restored_from_snapshot.store(true, Ordering::Relaxed);
        if let Some(value) = updated_at_ms {
            self.updated_at_ms.store(value, Ordering::Relaxed);
        }
        if let Ok(mut current) = self.baselines.write() {
            *current = baselines;
        }
    }

    pub fn mark_saved(
        &self,
        updated_at_ms: i64,
        baselines: HashMap<String, SnapshotEventBaseline>,
    ) {
        self.updated_at_ms.store(updated_at_ms, Ordering::Relaxed);
        if let Ok(mut current) = self.baselines.write() {
            *current = baselines;
        }
    }

    pub fn restored_from_snapshot(&self) -> bool {
        self.restored_from_snapshot.load(Ordering::Relaxed)
    }

    pub fn updated_at_ms(&self) -> Option<i64> {
        let value = self.updated_at_ms.load(Ordering::Relaxed);
        (value > 0).then_some(value)
    }

    pub fn replace_snapshot_state(
        &self,
        restored_from_snapshot: bool,
        updated_at_ms: i64,
        baselines: HashMap<String, SnapshotEventBaseline>,
    ) {
        self.restored_from_snapshot
            .store(restored_from_snapshot, Ordering::Relaxed);
        self.updated_at_ms.store(updated_at_ms, Ordering::Relaxed);
        if let Ok(mut current) = self.baselines.write() {
            *current = baselines;
        }
    }

    pub fn events_since_snapshot(
        &self,
        source_id: &str,
        health_total_events: u64,
        extraction_total_events: u64,
    ) -> (u64, u64) {
        let baseline = self
            .baselines
            .read()
            .ok()
            .and_then(|items| items.get(source_id).copied())
            .unwrap_or_default();

        (
            health_total_events.saturating_sub(baseline.health_total_events),
            extraction_total_events.saturating_sub(baseline.extraction_total_events),
        )
    }
}

impl FromRef<AppState> for SourceBuilderState {
    fn from_ref(input: &AppState) -> Self {
        Self {
            store: input.store.clone(),
        }
    }
}

pub async fn build_app_state(config: &EngineConfig) -> anyhow::Result<AppState> {
    let snapshot_status = Arc::new(SnapshotStatus::new());
    let services =
        runtime_bootstrap::build_runtime_services(config, snapshot_status.clone()).await?;
    let runtime_state_service = Arc::new(RuntimeStateService::new(
        services.engine_registry.clone(),
        services.orchestrator.clone(),
        services.store.clone(),
        snapshot_status.clone(),
    ));

    Ok(AppState {
        engine_registry: services.engine_registry,
        store: services.store,
        content_rules: services.content_rules,
        _chapter_cache: services.chapter_cache,
        _fetcher: services.fetcher,
        _anti_crawl: services.anti_crawl,
        orchestrator: services.orchestrator,
        runtime_state_service,
        config: Arc::new(config.clone()),
        _event_bus: services.event_bus,
    })
}
