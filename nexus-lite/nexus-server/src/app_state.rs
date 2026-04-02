use axum::extract::FromRef;
use nexus_core::EngineConfig;
use nexus_core::{EventBus, SystemControlEvent, SystemEvent};
use nexus_engine::anti_crawl::{
    CfBypassStrategy, CloudScraperStrategy, DirectHttpStrategy, FallbackChain,
};
use nexus_engine::extraction_metrics;
use nexus_engine::fetcher::HttpFetcher;
use nexus_engine::skill_telemetry;
use nexus_storage::{ChapterCache, SledStore, SourceStore};
use std::sync::Arc;
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
    pub event_bus: Arc<EventBus>,
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

    let store = Arc::new(SledStore::new(&config.storage.db_path)?);
    skill_telemetry::configure(config.limits.max_extraction_metrics_sources.saturating_mul(3));
    {
        let store_for_hook = store.clone();
        skill_telemetry::set_persist_hook(Some(Arc::new(move |event| {
            let store = store_for_hook.clone();
            tokio::spawn(async move {
                let _ = store.save_skill_decision(event.to_log_entry()).await;
            });
        })));
    }

    let content_rules = Arc::new(ContentRuleResolver::new(
        store.clone(),
        config.features.enable_ai_content_rules,
    ));
    content_rules.refresh().await?;

    let chapter_cache = Arc::new(ChapterCache::new(
        &config.storage.cache_dir,
        config.limits.chapter_cache_mb,
    ));

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

    let engine_registry = Arc::new(EngineRegistry::new(
        source_store.clone(),
        anti_crawl.clone(),
    ));

    let orchestrator = Arc::new(SearchOrchestrator::new(
        engine_registry.clone(),
        store.health_tracker().clone(),
        config.limits.max_concurrent_searches,
    ));

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
        event_bus,
    })
}
