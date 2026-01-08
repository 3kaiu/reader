//! NexusLite HTTP API Server

mod app;
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

    // Environment overrides (convenient for Docker)
    if let Ok(url) = std::env::var("CF_SERVICE_URL") {
        config.cf_bypass.service_url = url;
        info!("Overriding CF_SERVICE_URL from environment");
    }

    Ok(config)
}
