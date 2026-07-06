use nexus_core::EngineConfig;
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
    pub config: Arc<EngineConfig>,
    pub snapshot_status: Arc<SnapshotStatus>,
}

/// Tracks snapshot restore/save metadata for the runtime governance system.
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

    pub fn is_restored(&self) -> bool {
        self.restored_from_snapshot.load(Ordering::Relaxed)
    }

    pub fn updated_at_ms(&self) -> i64 {
        self.updated_at_ms.load(Ordering::Relaxed)
    }

    pub fn total_baseline_events(&self) -> (u64, u64) {
        let guard = self.baselines.read().ok();
        let mut health = 0u64;
        let mut extraction = 0u64;
        if let Some(b) = guard.as_ref() {
            for v in b.values() {
                health = health.saturating_add(v.health_total_events);
                extraction = extraction.saturating_add(v.extraction_total_events);
            }
        }
        (health, extraction)
    }
}

pub async fn build_app_state(config: &EngineConfig) -> anyhow::Result<AppState> {
    let snapshot_status = Arc::new(SnapshotStatus::new());
    let services =
        runtime_bootstrap::build_runtime_services(config, snapshot_status.clone()).await?;

    Ok(AppState {
        engine_registry: services.engine_registry,
        store: services.store,
        content_rules: services.content_rules,
        _chapter_cache: services.chapter_cache,
        _fetcher: services.fetcher,
        _anti_crawl: services.anti_crawl,
        orchestrator: services.orchestrator,
        config: Arc::new(config.clone()),
        snapshot_status: services.snapshot_status,
    })
}
