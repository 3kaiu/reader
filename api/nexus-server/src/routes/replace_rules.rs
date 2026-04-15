//! Replace Rule routes

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_core::ReplaceRule;
use uuid::Uuid;

use crate::app::AppState;
use crate::error::{internal_error, ApiErrorResponse};

/// List all replace rules
pub async fn list_rules(
    State(state): State<AppState>,
) -> Result<Json<Vec<ReplaceRule>>, ApiErrorResponse> {
    state
        .store
        .get_replace_rules()
        .await
        .map(Json)
        .map_err(|e| internal_error(e.to_string()))
}

/// Save (Add/Update) a replace rule
pub async fn save_rule(
    State(state): State<AppState>,
    Json(mut rule): Json<ReplaceRule>,
) -> Result<Json<ReplaceRule>, ApiErrorResponse> {
    if rule.id.is_empty() {
        rule.id = Uuid::new_v4().to_string();
    }

    state
        .store
        .save_replace_rule(rule.clone())
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    state.content_rules.invalidate().await;

    Ok(Json(rule))
}

/// Delete a replace rule
pub async fn delete_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiErrorResponse> {
    state
        .store
        .delete_replace_rule(id)
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    state.content_rules.invalidate().await;

    Ok(StatusCode::NO_CONTENT)
}
