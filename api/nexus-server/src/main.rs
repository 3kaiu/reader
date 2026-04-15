//! Nexus API Server

mod api_response;
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
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "nexus_server=debug,nexus_engine=debug,tower_http=debug".into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    info!("Starting Nexus API Server...");

    // Load configuration
    let config = load_config().await?;

    // Initialize storage
    nexus_storage::init_storage(&config).await?;

    // Initialize unified cache system
    if let Err(e) =
        nexus_core::parse_cache::init_cache_manager(nexus_core::parse_cache::CacheConfig {
            memory_capacity: 64 * 1024 * 1024, // 64MB
            disk_capacity: 512 * 1024 * 1024,  // 512MB
            redis_url: None,
            ttl_default: std::time::Duration::from_secs(3600),
            enable_compression: true,
            enable_encryption: false,
        })
        .await
    {
        tracing::warn!("Failed to initialize cache manager: {}", e);
    }

    // Build and run app
    let app = app::create_app(&config).await?;

    let addr = format!("{}:{}", config.server.host, config.server.port);
    info!("Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

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

    Ok(config)
}
