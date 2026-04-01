//! NexusLite Source Builder API Server

mod app;
mod api_response;
mod content_rules;
mod engine_registry;
mod error;
mod metrics;
mod middleware;
mod orchestrator;
mod routes;
mod source_access;
mod validation;
mod ws;

use axum::{routing::get, Json, Router};
use nexus_core::EngineConfig;
use serde::Serialize;
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
    let state = app::build_app_state(&config).await?;

    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("SOURCE_BUILDER_PORT")
        .ok()
        .and_then(|it| it.parse::<u16>().ok())
        .unwrap_or(9091);
    let addr = format!("{host}:{port}");

    let app = Router::new()
        .route("/api/health", get(health))
        .merge(routes::source_builder::router())
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive());

    info!("Source builder service listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
