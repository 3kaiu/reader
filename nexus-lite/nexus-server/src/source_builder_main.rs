//! NexusLite Source Builder API Server

mod api_response;
mod source_builder_state;
mod validation;

#[path = "routes/source_builder.rs"]
mod source_builder_routes;

use axum::{routing::get, Json, Router};
use nexus_core::EngineConfig;
use nexus_storage::SledStore;
use serde::Serialize;
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceBuilderHealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

async fn health() -> Json<SourceBuilderHealthResponse> {
    Json(SourceBuilderHealthResponse {
        status: "ok",
        service: "nexus-source-builder",
        version: env!("CARGO_PKG_VERSION"),
    })
}

fn is_true_flag(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

async fn load_config() -> anyhow::Result<EngineConfig> {
    let config_path = std::path::Path::new("config.json");

    let mut config = if config_path.exists() {
        let content = tokio::fs::read_to_string(config_path).await?;
        serde_json::from_str::<EngineConfig>(&content)?
    } else {
        EngineConfig::default()
    };

    if let Ok(host) = std::env::var("HOST") {
        config.server.host = host;
    }

    if let Ok(port) = std::env::var("PORT") {
        if let Ok(p) = port.parse::<u16>() {
            config.server.port = p;
        }
    }

    if let Ok(url) = std::env::var("CF_SERVICE_URL") {
        config.cf_bypass.service_url = url;
    }

    if let Ok(proxy) = std::env::var("CF_PROXY") {
        config.cf_bypass.proxy = Some(proxy);
    }

    if let Ok(origins) = std::env::var("ALLOWED_ORIGINS") {
        config.server.allowed_origins = origins.split(',').map(|s| s.trim().to_string()).collect();
    }

    if let Ok(enabled) = std::env::var("ENABLE_AI_CONTENT_RULES") {
        config.features.enable_ai_content_rules = is_true_flag(&enabled);
    }

    Ok(config)
}

async fn build_source_builder_state(
    config: &EngineConfig,
) -> anyhow::Result<source_builder_state::SourceBuilderState> {
    let store = Arc::new(SledStore::new(&config.storage.db_path)?);
    Ok(source_builder_state::SourceBuilderState { store })
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "nexus_source_builder=debug,nexus_engine=debug,tower_http=debug".into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = load_config().await?;
    nexus_storage::init_storage(&config).await?;
    let state = build_source_builder_state(&config).await?;

    let host = config.server.host.clone();
    let port = std::env::var("SOURCE_BUILDER_PORT")
        .ok()
        .and_then(|it| it.parse::<u16>().ok())
        .unwrap_or(config.server.port);
    let addr = format!("{host}:{port}");

    let app = Router::new()
        .route("/api/health", get(health))
        .merge(source_builder_routes::router())
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive());

    info!("Source builder service listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
