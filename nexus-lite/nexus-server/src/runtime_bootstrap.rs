use chrono::Utc;
use nexus_core::EngineConfig;
use nexus_core::{EventBus, SystemControlEvent, SystemEvent};
use nexus_engine::anti_crawl::{
    CfBypassStrategy, CloudScraperStrategy, DirectHttpStrategy, FallbackChain, JinaReaderStrategy,
};
use nexus_engine::extraction_metrics;
use nexus_engine::fetcher::HttpFetcher;
use nexus_engine::skill_telemetry;
use nexus_storage::{ChapterCache, SledStore, SourceStore};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::info;

use crate::app_state::{SnapshotEventBaseline, SnapshotStatus};
use crate::content_rules::ContentRuleResolver;
use crate::engine_registry::EngineRegistry;
use crate::orchestrator::SearchOrchestrator;

pub struct RuntimeServices {
    pub engine_registry: Arc<EngineRegistry>,
    pub store: Arc<SledStore>,
    pub content_rules: Arc<ContentRuleResolver>,
    pub chapter_cache: Arc<ChapterCache>,
    pub fetcher: Arc<HttpFetcher>,
    pub anti_crawl: Arc<FallbackChain>,
    pub orchestrator: Arc<SearchOrchestrator>,
    pub event_bus: Arc<EventBus>,
}

pub async fn build_runtime_services(
    config: &EngineConfig,
    snapshot_status: Arc<SnapshotStatus>,
) -> anyhow::Result<RuntimeServices> {
    extraction_metrics::configure_max_tracked_sources(config.limits.max_extraction_metrics_sources);

    let source_store = Arc::new(SourceStore::new(&config.storage.sources_dir));
    source_store.load_all().await?;
    info!("Loaded {} book sources", source_store.count());

    let store = Arc::new(SledStore::new(&config.storage.db_path)?);
    restore_runtime_state(store.clone(), snapshot_status.clone()).await?;
    configure_skill_telemetry(config, store.clone());

    let content_rules =
        Arc::new(ContentRuleResolver::new(store.clone(), config.features.enable_ai_content_rules));
    content_rules.refresh().await?;

    let chapter_cache =
        Arc::new(ChapterCache::new(&config.storage.cache_dir, config.limits.chapter_cache_mb));
    spawn_cache_cleanup(chapter_cache.clone());

    let fetcher = Arc::new(HttpFetcher::new(config.limits.http_timeout_seconds)?);
    let anti_crawl = Arc::new(build_anti_crawl_chain(config)?);

    let engine_registry = Arc::new(EngineRegistry::new(source_store, anti_crawl.clone()));
    let orchestrator = Arc::new(SearchOrchestrator::new(
        engine_registry.clone(),
        store.health_tracker().clone(),
        config.limits.max_concurrent_searches,
    ));

    spawn_snapshot_persist_loop(store.clone(), snapshot_status);

    let event_bus = Arc::new(EventBus::new(1024));
    event_bus.publish(SystemEvent::System(SystemControlEvent::Startup));

    Ok(RuntimeServices {
        engine_registry,
        store,
        content_rules,
        chapter_cache,
        fetcher,
        anti_crawl,
        orchestrator,
        event_bus,
    })
}

async fn restore_runtime_state(
    store: Arc<SledStore>,
    snapshot_status: Arc<SnapshotStatus>,
) -> anyhow::Result<()> {
    let persisted_health = store.load_health_snapshot().await?;
    let persisted_extraction_metrics = store.load_extraction_metrics_snapshot().await?;

    if !persisted_health.is_empty() {
        store
            .health_tracker()
            .restore_from_snapshot(persisted_health.clone());
        let updated_at_ms = store.load_health_snapshot_updated_at_ms().await?;
        snapshot_status.mark_restored(
            updated_at_ms,
            build_snapshot_baselines(&persisted_health, &persisted_extraction_metrics),
        );
        info!("Restored persisted source health snapshot");
    }

    if !persisted_extraction_metrics.is_empty() {
        extraction_metrics::restore_from_snapshot(persisted_extraction_metrics);
        info!("Restored persisted extraction metrics snapshot");
    }

    Ok(())
}

fn configure_skill_telemetry(config: &EngineConfig, store: Arc<SledStore>) {
    skill_telemetry::configure(
        config
            .limits
            .max_extraction_metrics_sources
            .saturating_mul(3),
    );

    skill_telemetry::set_persist_hook(Some(Arc::new(move |event| {
        let store = store.clone();
        tokio::spawn(async move {
            let _ = store.save_skill_decision(event.to_log_entry()).await;
        });
    })));
}

fn spawn_cache_cleanup(chapter_cache: Arc<ChapterCache>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            interval.tick().await;
            if let Err(error) = chapter_cache.cleanup().await {
                tracing::error!("Cache cleanup failed: {}", error);
            }
        }
    });
}

fn build_anti_crawl_chain(config: &EngineConfig) -> anyhow::Result<FallbackChain> {
    let cf_strategy = Arc::new(CfBypassStrategy::new(config.cf_bypass.clone())?);
    let mut fallback_strategies: Vec<Arc<dyn nexus_core::AntiCrawlStrategy>> = Vec::new();

    if let Ok(cloudscraper) = CloudScraperStrategy::new() {
        fallback_strategies.push(Arc::new(cloudscraper));
    }
    if let Ok(jina) = JinaReaderStrategy::new(config.limits.http_timeout_seconds) {
        fallback_strategies.push(Arc::new(jina));
    }
    if let Ok(direct) = DirectHttpStrategy::new(config.limits.http_timeout_seconds) {
        fallback_strategies.push(Arc::new(direct));
    }

    Ok(FallbackChain::with_fallbacks(cf_strategy, fallback_strategies))
}

fn spawn_snapshot_persist_loop(store: Arc<SledStore>, snapshot_status: Arc<SnapshotStatus>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            let health_snapshot = store.health_tracker().snapshot_persisted();
            let extraction_snapshot = extraction_metrics::snapshot_persisted();

            if let Err(error) = store.save_health_snapshot(health_snapshot.clone()).await {
                tracing::warn!("Failed to persist source health snapshot: {}", error);
            } else {
                snapshot_status.mark_saved(
                    Utc::now().timestamp_millis(),
                    build_snapshot_baselines(&health_snapshot, &extraction_snapshot),
                );
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

fn build_snapshot_baselines(
    persisted_health: &[nexus_core::PersistedSourceHealth],
    persisted_extraction_metrics: &[nexus_core::types::PersistedExtractionMetrics],
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
