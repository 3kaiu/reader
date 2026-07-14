//! API route handlers

pub mod book;
pub mod bookshelf;
pub mod explore;

pub mod replace_rules;
pub mod runtime_state;
pub mod search;
pub mod source;

use axum::{extract::State, Json};
use nexus_engine::extraction_metrics;
use serde::Serialize;
use crate::app_state::AppState;

/// Health check response with dependency status
#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub dependencies: DependencyStatus,
}

/// Status of service dependencies
#[derive(Serialize)]
pub struct DependencyStatus {
    pub source_count: usize,
    pub database: bool,
    pub cf_bypass_configured: bool,
    pub extraction: extraction_metrics::ExtractionSummary,
}

/// Enhanced health check handler with dependency status
pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let (nxs_count, legado_count) = state.engine_registry.source_count();
    let source_count = nxs_count + legado_count;
    let database = state.store.get_all().await.is_ok();
    let cf_bypass_configured = state.config.cf_bypass.enabled;
    let extraction = extraction_metrics::summary(5);

    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        dependencies: DependencyStatus {
            source_count,
            database,
            cf_bypass_configured,
            extraction,
        },
    })
}
