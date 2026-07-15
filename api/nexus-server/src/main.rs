//! Nexus API Server

mod app;
mod app_state;
mod content_rules;
mod engine_registry;
mod error;
mod middleware;
mod orchestrator;
mod request_id;
mod routes;
mod runtime_bootstrap;
mod source_access;
mod validation;

use nexus_core::EngineConfig;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "nexus_server=info,nexus_engine=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting Nexus API Server...");

    // Load configuration
    let config = load_config().await?;

    // Initialize storage
    nexus_storage::init_storage(&config).await?;

    // Initialize unified cache system (deprecated - no-op)
    tracing::info!("Cache system: no-op (legacy MultiLevelCache removed)");

    // Build and run app
    let app = app::create_app(&config).await?;

    let addr = format!("{}:{}", config.server.host, config.server.port);
    info!("Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>())
        .await?;

    Ok(())
}

async fn load_config() -> anyhow::Result<EngineConfig> {
    // Try to load from config file, or use defaults
    let config_path = std::path::Path::new("config.json");

    let mut config = if config_path.exists() {
        let content = tokio::fs::read_to_string(config_path).await?;
        let config: EngineConfig = serde_json::from_str(&content)?;
        info!("Loaded configuration from config.json");
        config
    } else {
        info!("Using default configuration");
        EngineConfig::default()
    };

    // Environment overrides (convenient for Docker / NAS)
    if let Ok(host) = std::env::var("HOST") {
        config.server.host = host;
        info!("Overriding HOST from environment");
    }

    if let Ok(port) = std::env::var("PORT") {
        if let Ok(p) = port.parse::<u16>() {
            config.server.port = p;
            info!("Overriding PORT from environment: {}", p);
        }
    }

    if let Ok(url) = std::env::var("CF_SERVICE_URL") {
        config.cf_bypass.service_url = url;
        info!("Overriding CF_SERVICE_URL from environment");
    }

    if let Ok(proxy) = std::env::var("CF_PROXY") {
        config.cf_bypass.proxy = Some(proxy);
        info!("Overriding CF_PROXY from environment");
    }

    if let Ok(origins) = std::env::var("ALLOWED_ORIGINS") {
        config.server.allowed_origins = origins.split(',').map(|s| s.trim().to_string()).collect();
        info!("Overriding ALLOWED_ORIGINS from environment");
    }

    if let Ok(api_key) = std::env::var("API_KEY") {
        config.server.api_key = Some(api_key);
        info!("Overriding API_KEY from environment");
    }

    // Rate limit env overrides (convenient for Docker / NAS tuning)
    if let Ok(val) = std::env::var("RATE_LIMIT_PER_SECOND") {
        if let Ok(v) = val.parse::<u64>() {
            config.server.rate_limit.per_second = v;
            info!("Overriding RATE_LIMIT_PER_SECOND from environment: {}", v);
        }
    }
    if let Ok(val) = std::env::var("RATE_LIMIT_BURST") {
        if let Ok(v) = val.parse::<u32>() {
            config.server.rate_limit.burst_size = v;
            info!("Overriding RATE_LIMIT_BURST from environment: {}", v);
        }
    }

    // HTTP connection pool env overrides
    if let Ok(val) = std::env::var("HTTP_TIMEOUT_SECONDS") {
        if let Ok(v) = val.parse::<u64>() {
            config.limits.http_timeout_seconds = v;
            info!("Overriding HTTP_TIMEOUT_SECONDS from environment: {}", v);
        }
    }
    if let Ok(val) = std::env::var("HTTP_MAX_CONCURRENT") {
        if let Ok(v) = val.parse::<usize>() {
            config.limits.http_max_concurrent = v;
            info!("Overriding HTTP_MAX_CONCURRENT from environment: {}", v);
        }
    }
    if let Ok(val) = std::env::var("POOL_MAX_IDLE_PER_HOST") {
        if let Ok(v) = val.parse::<usize>() {
            config.limits.pool_max_idle_per_host = v;
            info!("Overriding POOL_MAX_IDLE_PER_HOST from environment: {}", v);
        }
    }

    Ok(config)
}
