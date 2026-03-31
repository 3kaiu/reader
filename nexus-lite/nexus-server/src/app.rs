//! Application builder

use axum::{
    routing::{delete, get, patch, post, put},
    Router,
};
use nexus_core::EngineConfig;
use nexus_core::{EventBus, SystemControlEvent, SystemEvent};
use nexus_engine::anti_crawl::{CfBypassStrategy, CloudScraperStrategy, DirectHttpStrategy, FallbackChain};
use nexus_engine::extraction_metrics;
use nexus_engine::fetcher::HttpFetcher;
use nexus_storage::{ChapterCache, SledStore, SourceStore};
use std::sync::Arc;
use tower_governor::GovernorLayer;
use tower_governor::{governor::GovernorConfigBuilder, key_extractor::PeerIpKeyExtractor};
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing::info;

use crate::{
    content_rules::ContentRuleResolver, engine_registry::EngineRegistry,
    orchestrator::SearchOrchestrator, routes, ws,
};

/// Application state shared across handlers
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

/// Create the application router
pub async fn create_app(config: &EngineConfig) -> anyhow::Result<Router> {
    extraction_metrics::configure_max_tracked_sources(config.limits.max_extraction_metrics_sources);

    // Initialize stores
    let source_store = Arc::new(SourceStore::new(&config.storage.sources_dir));
    source_store.load_all().await?;
    info!("Loaded {} book sources", source_store.count());

    let store = Arc::new(SledStore::new(&config.storage.db_path)?);
    let content_rules = Arc::new(ContentRuleResolver::new(
        store.clone(),
        config.features.enable_ai_content_rules,
    ));
    content_rules.refresh().await?;
    let chapter_cache = Arc::new(ChapterCache::new(
        &config.storage.cache_dir,
        config.limits.chapter_cache_mb,
    ));

    // Spawn cache cleanup task (every hour)
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

    // Initialize engine components
    let fetcher = Arc::new(HttpFetcher::new(config.limits.http_timeout_seconds)?);

    // CF Bypass Strategy (direct Cloudflare bypass via cf-bypass-service)
    let cf_strategy = Arc::new(CfBypassStrategy::new(config.cf_bypass.clone())?);
    let mut fallback_strategies: Vec<Arc<dyn nexus_core::AntiCrawlStrategy>> = Vec::new();
    if let Ok(cloudscraper) = CloudScraperStrategy::new() {
        fallback_strategies.push(Arc::new(cloudscraper));
    }
    if let Ok(direct) = DirectHttpStrategy::new(config.limits.http_timeout_seconds) {
        fallback_strategies.push(Arc::new(direct));
    }
    let anti_crawl = Arc::new(FallbackChain::with_fallbacks(cf_strategy, fallback_strategies));

    // Initialize Engine Registry
    let engine_registry = Arc::new(EngineRegistry::new(
        source_store.clone(),
        anti_crawl.clone(),
    ));

    let orchestrator = Arc::new(SearchOrchestrator::new(
        engine_registry.clone(),
        store.health_tracker().clone(),
        config.limits.max_concurrent_searches,
    ));

    // Initialize Event Bus
    let event_bus = Arc::new(EventBus::new(1024));
    event_bus.publish(SystemEvent::System(SystemControlEvent::Startup));

    let state = AppState {
        engine_registry,
        store,
        content_rules,
        _chapter_cache: chapter_cache,
        _fetcher: fetcher,
        _anti_crawl: anti_crawl,
        orchestrator,
        config: Arc::new(config.clone()),
        event_bus,
    };

    // Build API router
    let api_router = Router::new()
        // Health check
        .route("/api/health", get(routes::health))
        // Sources
        .route("/api/sources", get(routes::source::list_sources))
        .route("/api/sources", post(routes::source::add_source))
        .route("/api/sources/{id}", get(routes::source::get_source))
        .route("/api/sources/{id}", delete(routes::source::delete_source))
        .route(
            "/api/sources/{id}/status",
            put(routes::source::update_source_status),
        )
        .route(
            "/api/sources/{id}/policy",
            put(routes::source::update_source_policy),
        )
        .route("/api/sources/health", get(routes::source::source_health))
        .route(
            "/api/sources/extraction",
            get(routes::source::source_extraction_metrics),
        )
        // Search
        .route("/api/search", post(routes::search::search))
        .route("/api/search/stream", post(routes::search::search_stream))
        .route("/ws/search", get(ws::ws_handler))
        // Books
        .route("/api/book", get(routes::book::book_info))
        .route("/api/chapters", get(routes::book::chapters))
        .route("/api/content", get(routes::book::content))
        .route("/api/batch/content", post(routes::book::batch_content))
        // Bookshelf
        .route("/api/bookshelf", get(routes::bookshelf::list))
        .route("/api/bookshelf", post(routes::bookshelf::add))
        .route(
            "/api/bookshelf/{id}",
            patch(routes::bookshelf::update_progress),
        )
        .route("/api/bookshelf/{id}", put(routes::bookshelf::move_to_group))
        .route("/api/bookshelf/{id}", delete(routes::bookshelf::remove))
        // Groups
        .route("/api/groups", get(routes::group::list_groups))
        .route("/api/groups", post(routes::group::save_group))
        .route("/api/groups/{id}", delete(routes::group::delete_group))
        // Replace Rules
        .route("/api/replace_rules", get(routes::replace_rules::list_rules))
        .route("/api/replace_rules", post(routes::replace_rules::save_rule))
        .route(
            "/api/replace_rules/{id}",
            delete(routes::replace_rules::delete_rule),
        )
        // Discovery
        .route("/api/discovery", get(routes::discovery::list_discovery))
        // AI Analysis
        .route("/api/ai/mappings", get(routes::ai::list_mapping_rules))
        .route("/api/ai/mappings", post(routes::ai::save_mapping_rule))
        .route(
            "/api/ai/mappings/{id}",
            delete(routes::ai::delete_mapping_rule),
        )
        .route("/api/ai/history", get(routes::ai::list_analysis_history))
        .route("/api/ai/history", post(routes::ai::save_analysis_history))
        .route(
            "/api/ai/history",
            delete(routes::ai::clear_analysis_history),
        )
        // Voice Sync
        .route(
            "/api/voice/metadata",
            get(routes::voice::list_voice_metadata),
        )
        .route(
            "/api/voice/metadata",
            post(routes::voice::save_voice_metadata),
        )
        .route(
            "/api/voice/metadata/{id}",
            delete(routes::voice::delete_voice_metadata),
        )
        .route(
            "/api/voice/config/{key}",
            get(routes::voice::get_voice_config),
        )
        .route(
            "/api/voice/config/{key}",
            post(routes::voice::save_voice_config),
        )
        .with_state(state.clone());

    // Static file serving for embedded frontend
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "./static".to_string());
    let static_path = std::path::Path::new(&static_dir);

    let app = if static_path.exists() && static_path.is_dir() {
        info!("Serving static files from: {}", static_dir);
        let index_path = static_path.join("index.html");

        // Merge API routes with static file serving
        // API routes take priority, then static files, fallback to index.html for SPA
        Router::new().merge(api_router).fallback_service(
            ServeDir::new(&static_dir)
                .precompressed_br()
                .precompressed_gzip()
                .not_found_service(ServeFile::new(index_path)),
        )
    } else {
        info!("Static directory not found, API-only mode");
        api_router
    };

    // Add middleware
    let app = app.layer(TraceLayer::new_for_http());

    // Rate limiting
    let governor_conf = GovernorConfigBuilder::default()
        .per_second(20)
        .burst_size(50)
        .key_extractor(PeerIpKeyExtractor)
        .finish()
        .unwrap();

    let app = app.layer(GovernorLayer::new(governor_conf));

    // Configure CORS based on config
    let app = if config.server.enable_cors {
        if config.server.allowed_origins.is_empty() {
            // Dev mode: permissive CORS
            info!("CORS: permissive mode (dev)");
            app.layer(CorsLayer::permissive())
        } else {
            // Production mode: restrict to allowed origins
            use http::HeaderValue;
            use tower_http::cors::{AllowOrigin, Any};

            let origins: Vec<HeaderValue> = config
                .server
                .allowed_origins
                .iter()
                .filter_map(|s| s.parse().ok())
                .collect();

            info!("CORS: restricted to {} origin(s)", origins.len());

            app.layer(
                CorsLayer::new()
                    .allow_origin(AllowOrigin::list(origins))
                    .allow_methods(Any)
                    .allow_headers(Any),
            )
        }
    } else {
        info!("CORS: disabled");
        app
    };

    // Apply API Key authentication middleware if configured
    let app = if config.server.api_key.is_some() {
        use axum::middleware;
        info!("API Key authentication: enabled");
        app.layer(middleware::from_fn_with_state(
            state.clone(),
            crate::middleware::api_key_auth,
        ))
    } else {
        info!("API Key authentication: disabled");
        app
    };

    Ok(app)
}
