use chrono::Utc;
use nexus_core::EngineConfig;
use nexus_engine::anti_crawl::{
    BrowserProbeStrategy, CfBypassStrategy, DirectHttpStrategy, FallbackChain, PrimpHttpStrategy,
};
use nexus_engine::extraction_metrics;
use nexus_engine::fetcher::cookie_cache::CookieCache;
use nexus_engine::fetcher::HttpFetcher;
use nexus_storage::{ChapterCache, LegadoSourceStore, SledStore};
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
}

pub async fn build_runtime_services(
    config: &EngineConfig,
    snapshot_status: Arc<SnapshotStatus>,
) -> anyhow::Result<RuntimeServices> {
    extraction_metrics::configure_max_tracked_sources(config.limits.max_extraction_metrics_sources);

    let legado_sources_dir = config.storage.sources_dir.join("legado");
    if !legado_sources_dir.exists() {
        tokio::fs::create_dir_all(&legado_sources_dir)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to create legado sources dir: {}", e))?;
    }
    let legado_store = Arc::new(LegadoSourceStore::new(&legado_sources_dir));
    let legado_count = legado_store.load_all();
    info!("Loaded {} Legado book sources", legado_count);

    let store = Arc::new(SledStore::new(&config.storage.db_path)?);
    restore_runtime_state(store.clone(), snapshot_status.clone()).await?;

    let content_rules = Arc::new(ContentRuleResolver::new(store.clone()));
    content_rules.refresh().await?;

    let chapter_cache =
        Arc::new(ChapterCache::new(&config.storage.cache_dir, config.limits.chapter_cache_mb));
    spawn_cache_cleanup(chapter_cache.clone());

    let fetcher = Arc::new(HttpFetcher::from_config(&config.limits)?);
    let anti_crawl = Arc::new(build_anti_crawl_chain(config)?);

    let engine_registry = Arc::new(EngineRegistry::new(legado_store, anti_crawl.clone()));
    let orchestrator = Arc::new(SearchOrchestrator::new(
        engine_registry.clone(),
        store.health_tracker().clone(),
        config.limits.max_concurrent_searches,
    ));

    spawn_snapshot_persist_loop(store.clone(), snapshot_status);

    Ok(RuntimeServices {
        engine_registry,
        store,
        content_rules,
        chapter_cache,
        fetcher,
        anti_crawl,
        orchestrator,
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
    let cookie_cache = Arc::new(CookieCache::new());

    // PrimpHttpStrategy: TLS-fingerprinted HTTP (tried FIRST)
    // Uses primp to mimic browser TLS fingerprint — bypasses CF edge detection
    // for sites that only check JA3/JA4 without full JS challenges.
    let primp_strategy = Arc::new(PrimpHttpStrategy::new(config.limits.http_timeout_seconds)?
        .with_cookie_cache(cookie_cache.clone()));

    let cf_strategy = Arc::new(CfBypassStrategy::new(
        config.cf_bypass.clone(),
        cookie_cache.clone(),
    )?);
    let mut fallback_strategies: Vec<Arc<dyn nexus_core::AntiCrawlStrategy>> = Vec::new();

    // CfBypassStrategy: external bypass service (tried SECOND)
    fallback_strategies.push(cf_strategy);

    // DirectHttpStrategy: plain reqwest fallback
    if let Ok(direct) = DirectHttpStrategy::new(config.limits.http_timeout_seconds) {
        fallback_strategies.push(Arc::new(direct.with_cookie_cache(cookie_cache.clone())));
    }

    // BrowserProbeStrategy: headless browser as final fallback
    if let Ok(browser) = BrowserProbeStrategy::new(
        config.cf_bypass.clone(),
        cookie_cache.clone(),
    ) {
        fallback_strategies.push(Arc::new(browser));
    }

    Ok(FallbackChain::with_fallbacks(primp_strategy, fallback_strategies))
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

            // Flush sled to disk to prevent data loss on crash
            if let Err(error) = store.flush().await {
                tracing::error!("Failed to flush sled database: {}", error);
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
