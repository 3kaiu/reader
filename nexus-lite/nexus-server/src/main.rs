//! NexusLite HTTP API Server

mod app;
mod content_rules;
mod engine_registry;
mod error;
mod metrics;
mod middleware;
mod orchestrator;
mod routes;
mod validation;
mod ws;

use nexus_core::EngineConfig;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

fn is_true_flag(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

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

    info!("Starting NexusLite Server...");

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

    // Keep platform optimizer opt-in to avoid over-platformization of the main reading flow.
    let enable_platform_optimizer = std::env::var("ENABLE_PLATFORM_OPTIMIZER")
        .map(|v| is_true_flag(&v))
        .unwrap_or(false);
    if enable_platform_optimizer {
        let _ =
            nexus_core::optimizer::init_optimizer_manager(nexus_core::optimizer::OptimizerConfig {
                enable_memory_optimization: true,
                enable_cpu_optimization: true,
                enable_io_optimization: true,
                enable_network_optimization: true,
                enable_cache_optimization: true,
                enable_algorithm_optimization: true,
                monitoring_interval_ms: 30000,
                optimization_interval_ms: 300000,
                max_concurrent_optimizations: 5,
            });
        info!("Platform optimizer enabled by ENABLE_PLATFORM_OPTIMIZER");
    } else {
        info!("Platform optimizer skipped (set ENABLE_PLATFORM_OPTIMIZER=true to enable)");
    }

    // Initialize Prometheus metrics (port 9090)
    if let Err(e) = metrics::init_metrics(9090) {
        tracing::warn!("Failed to initialize metrics: {}", e);
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

    // Environment overrides (convenient for Docker/HuggingFace)
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

    if let Ok(enabled) = std::env::var("ENABLE_AI_CONTENT_RULES") {
        config.features.enable_ai_content_rules = is_true_flag(&enabled);
        info!("Overriding ENABLE_AI_CONTENT_RULES from environment");
    }

    Ok(config)
}
