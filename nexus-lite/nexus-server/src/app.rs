//! Application builder

use axum::{
    routing::{delete, get, patch, post, put},
    Router,
};
use nexus_core::EngineConfig;
use tower_governor::GovernorLayer;
use tower_governor::{governor::GovernorConfigBuilder, key_extractor::PeerIpKeyExtractor};
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing::info;

use crate::{app_state::build_app_state, routes, ws};

pub use crate::app_state::AppState;

/// Create the main application router.
pub async fn create_app(config: &EngineConfig) -> anyhow::Result<Router> {
    let state = build_app_state(config).await?;

    let api_router = Router::new()
        .route("/api/health", get(routes::health))
        .route("/api/sources", get(routes::source::list_sources))
        .route("/api/sources", post(routes::source::add_source))
        .route("/api/source-packages", get(routes::source::list_source_packages))
        .route("/api/source-packages/import", post(routes::source::import_source_package))
        .route("/api/source-packages/{id}", get(routes::source::get_source_package))
        .route("/api/source-packages/{id}", delete(routes::source::delete_source_package))
        .route("/api/sources/{id}", get(routes::source::get_source))
        .route("/api/sources/{id}", delete(routes::source::delete_source))
        .route(
            "/api/sources/{id}/runtime-profile",
            get(routes::source_runtime::source_runtime_profile),
        )
        .route(
            "/api/sources/runtime-state/snapshot",
            post(routes::source_runtime::save_runtime_snapshot),
        )
        .route(
            "/api/sources/runtime-state/export",
            get(routes::source_runtime::export_runtime_snapshot),
        )
        .route(
            "/api/sources/runtime-state/import",
            post(routes::source_runtime::import_runtime_snapshot),
        )
        .route(
            "/api/sources/{id}/circuit-state",
            get(routes::source_runtime::source_circuit_state),
        )
        .route(
            "/api/sources/{id}/runtime-state/reset",
            post(routes::source_runtime::reset_source_runtime_state),
        )
        .route("/api/sources/{id}/status", put(routes::source::update_source_status))
        .route("/api/sources/{id}/policy", put(routes::source::update_source_policy))
        .route("/api/sources/health", get(routes::source_runtime::source_health))
        .route(
            "/api/sources/runtime-state/overview",
            get(routes::source_runtime::runtime_state_overview),
        )
        .route(
            "/api/sources/extraction",
            get(routes::source_diagnosis::source_extraction_metrics),
        )
        .route(
            "/api/sources/extraction/summary",
            get(routes::source_diagnosis::source_extraction_summary),
        )
        .route(
            "/api/sources/diagnosis",
            get(routes::source_diagnosis::source_diagnosis_overview),
        )
        .route(
            "/api/sources/skills/decisions",
            get(routes::source_diagnosis::source_skill_decisions),
        )
        .route(
            "/api/sources/skills/decisions/history",
            get(routes::source_diagnosis::source_skill_decisions_history),
        )
        .route("/api/sources/{id}/diagnosis", get(routes::source_diagnosis::source_diagnosis))
        .merge(routes::source_builder::router())
        .route("/api/search", post(routes::search::search))
        .route("/api/search/stream", post(routes::search::search_stream))
        .route("/ws/search", get(ws::ws_handler))
        .route("/api/book", get(routes::book::book_info))
        .route("/api/chapters", get(routes::book::chapters))
        .route("/api/content", get(routes::book::content))
        .route("/api/batch/content", post(routes::book::batch_content))
        .route("/api/bookshelf", get(routes::bookshelf::list))
        .route("/api/bookshelf", post(routes::bookshelf::add))
        .route("/api/bookshelf/{id}", patch(routes::bookshelf::update_progress))
        .route("/api/bookshelf/{id}", put(routes::bookshelf::move_to_group))
        .route("/api/bookshelf/{id}", delete(routes::bookshelf::remove))
        .route("/api/groups", get(routes::group::list_groups))
        .route("/api/groups", post(routes::group::save_group))
        .route("/api/groups/{id}", delete(routes::group::delete_group))
        .route("/api/replace_rules", get(routes::replace_rules::list_rules))
        .route("/api/replace_rules", post(routes::replace_rules::save_rule))
        .route("/api/replace_rules/{id}", delete(routes::replace_rules::delete_rule))
        .route("/api/discovery", get(routes::discovery::list_discovery))
        .route("/api/ai/mappings", get(routes::ai::list_mapping_rules))
        .route("/api/ai/mappings", post(routes::ai::save_mapping_rule))
        .route("/api/ai/mappings/{id}", delete(routes::ai::delete_mapping_rule))
        .route("/api/ai/history", get(routes::ai::list_analysis_history))
        .route("/api/ai/history", post(routes::ai::save_analysis_history))
        .route("/api/ai/history", delete(routes::ai::clear_analysis_history))
        .route("/api/voice/metadata", get(routes::voice::list_voice_metadata))
        .route("/api/voice/metadata", post(routes::voice::save_voice_metadata))
        .route("/api/voice/metadata/{id}", delete(routes::voice::delete_voice_metadata))
        .route("/api/voice/config/{key}", get(routes::voice::get_voice_config))
        .route("/api/voice/config/{key}", post(routes::voice::save_voice_config))
        .with_state(state.clone());

    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "./static".to_string());
    let static_path = std::path::Path::new(&static_dir);

    let app = if static_path.exists() && static_path.is_dir() {
        info!("Serving static files from: {}", static_dir);
        let index_path = static_path.join("index.html");

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

    let app = app.layer(TraceLayer::new_for_http());

    let governor_conf = GovernorConfigBuilder::default()
        .per_second(20)
        .burst_size(50)
        .key_extractor(PeerIpKeyExtractor)
        .finish()
        .expect("valid governor config");

    let app = app.layer(GovernorLayer::new(governor_conf));

    let app = if config.server.enable_cors {
        if config.server.allowed_origins.is_empty() {
            info!("CORS: permissive mode (dev)");
            app.layer(CorsLayer::permissive())
        } else {
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

    let app = if config.server.api_key.is_some() {
        use axum::middleware;
        info!("API Key authentication: enabled");
        app.layer(middleware::from_fn_with_state(state.clone(), crate::middleware::api_key_auth))
    } else {
        info!("API Key authentication: disabled");
        app
    };

    Ok(app)
}
