use axum::extract::FromRef;
use chrono::Utc;
use nexus_core::EngineConfig;
use nexus_core::{EventBus, SystemControlEvent, SystemEvent};
use nexus_engine::anti_crawl::{
    CfBypassStrategy, CloudScraperStrategy, DirectHttpStrategy, FallbackChain,
};
use nexus_engine::extraction_metrics;
use nexus_engine::fetcher::HttpFetcher;
use nexus_engine::skill_telemetry;
use nexus_storage::{ChapterCache, SledStore, SourceStore};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use std::sync::RwLock;
use tracing::info;

use crate::{
    content_rules::ContentRuleResolver, engine_registry::EngineRegistry,
    orchestrator::SearchOrchestrator, source_builder_state::SourceBuilderState,
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
    pub _event_bus: Arc<EventBus>,
    pub snapshot_status: Arc<SnapshotStatus>,
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
    extraction_metrics::configure_max_tracked_sources(config.limits.max_extraction_metrics_sources);

    let source_store = Arc::new(SourceStore::new(&config.storage.sources_dir));
    source_store.load_all().await?;
    info!("Loaded {} book sources", source_store.count());

    let snapshot_status = Arc::new(SnapshotStatus::new());
    let store = Arc::new(SledStore::new(&config.storage.db_path)?);
    let persisted_health = store.load_health_snapshot().await?;
    let persisted_extraction_metrics = store.load_extraction_metrics_snapshot().await?;
    if !persisted_health.is_empty() {
        store
            .health_tracker()
            .restore_from_snapshot(persisted_health.clone());
        if !persisted_extraction_metrics.is_empty() {
            extraction_metrics::restore_from_snapshot(persisted_extraction_metrics.clone());
        }
        let updated_at_ms = store.load_health_snapshot_updated_at_ms().await?;
        let mut baselines = HashMap::new();
        for item in &persisted_health {
            baselines
                .entry(item.source_id.clone())
                .or_insert_with(SnapshotEventBaseline::default)
                .health_total_events = item.success_count + item.failure_count;
        }
        for item in &persisted_extraction_metrics {
            baselines
                .entry(item.source_id.clone())
                .or_insert_with(SnapshotEventBaseline::default)
                .extraction_total_events = item.success
                + item.validation_failures
                + item.rule_mismatch_failures
                + item.empty_content_failures
                + item.low_quality_failures;
        }
        snapshot_status.mark_restored(updated_at_ms, baselines);
        info!("Restored persisted source health snapshot");
    }
    if !persisted_extraction_metrics.is_empty() {
        extraction_metrics::restore_from_snapshot(persisted_extraction_metrics);
        info!("Restored persisted extraction metrics snapshot");
    }
    skill_telemetry::configure(
        config
            .limits
            .max_extraction_metrics_sources
            .saturating_mul(3),
    );
    {
        let store_for_hook = store.clone();
        skill_telemetry::set_persist_hook(Some(Arc::new(move |event| {
            let store = store_for_hook.clone();
            tokio::spawn(async move {
                let _ = store.save_skill_decision(event.to_log_entry()).await;
            });
        })));
    }

    let content_rules =
        Arc::new(ContentRuleResolver::new(store.clone(), config.features.enable_ai_content_rules));
    content_rules.refresh().await?;

    let chapter_cache =
        Arc::new(ChapterCache::new(&config.storage.cache_dir, config.limits.chapter_cache_mb));

    let cache_clone = chapter_cache.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            interval.tick().await;
            if let Err(e) = cache_clone.cleanup().await {
                tracing::error!("Cache cleanup failed: {}", e);
            }
        }
    });

    let fetcher = Arc::new(HttpFetcher::new(config.limits.http_timeout_seconds)?);

    let cf_strategy = Arc::new(CfBypassStrategy::new(config.cf_bypass.clone())?);
    let mut fallback_strategies: Vec<Arc<dyn nexus_core::AntiCrawlStrategy>> = Vec::new();
    if let Ok(cloudscraper) = CloudScraperStrategy::new() {
        fallback_strategies.push(Arc::new(cloudscraper));
    }
    if let Ok(direct) = DirectHttpStrategy::new(config.limits.http_timeout_seconds) {
        fallback_strategies.push(Arc::new(direct));
    }
    let anti_crawl = Arc::new(FallbackChain::with_fallbacks(cf_strategy, fallback_strategies));

    let engine_registry = Arc::new(EngineRegistry::new(source_store.clone(), anti_crawl.clone()));

    let orchestrator = Arc::new(SearchOrchestrator::new(
        engine_registry.clone(),
        store.health_tracker().clone(),
        config.limits.max_concurrent_searches,
    ));

    {
        let store = store.clone();
        let snapshot_status = snapshot_status.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
            loop {
                interval.tick().await;
                let health_snapshot = store.health_tracker().snapshot_persisted();
                let extraction_snapshot = extraction_metrics::snapshot_persisted();
                if let Err(error) = store.save_health_snapshot(health_snapshot).await {
                    tracing::warn!("Failed to persist source health snapshot: {}", error);
                } else {
                    let mut baselines = HashMap::new();
                    for item in store.health_tracker().snapshot_persisted() {
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
                    snapshot_status.mark_saved(Utc::now().timestamp_millis(), baselines);
                }
                if let Err(error) = store
                    .save_extraction_metrics_snapshot(extraction_snapshot)
                    .await
                {
                    tracing::warn!("Failed to persist extraction metrics snapshot: {}", error);
                }
            }
        });
    }

    let event_bus = Arc::new(EventBus::new(1024));
    event_bus.publish(SystemEvent::System(SystemControlEvent::Startup));

    Ok(AppState {
        engine_registry,
        store,
        content_rules,
        _chapter_cache: chapter_cache,
        _fetcher: fetcher,
        _anti_crawl: anti_crawl,
        orchestrator,
        config: Arc::new(config.clone()),
        _event_bus: event_bus,
        snapshot_status,
    })
}
