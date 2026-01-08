//! API route handlers

pub mod ai;
pub mod book;
pub mod bookshelf;
pub mod discovery;
pub mod group;
pub mod replace_rules;
pub mod search;
pub mod source;
pub mod voice;

use axum::{extract::State, Json};
use serde::Serialize;

use crate::app::AppState;

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
}

/// Generic API response wrapper
#[derive(Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: &str) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.to_string()),
        }
    }
}

/// Enhanced health check handler with dependency status
pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let source_count = state.engine_registry.source_count();
    let database = state.store.get_all().is_ok();
    let cf_bypass_configured = state.config.cf_bypass.enabled;

    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        dependencies: DependencyStatus {
            source_count,
            database,
            cf_bypass_configured,
        },
    })
}
