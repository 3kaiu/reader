//! Group routes

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_core::BookGroup;
use uuid::Uuid;

use crate::app::AppState;
use crate::error::{internal_error, ApiErrorResponse};

/// List all book groups
pub async fn list_groups(
    State(state): State<AppState>,
) -> Result<Json<Vec<BookGroup>>, ApiErrorResponse> {
    state
        .store
        .get_groups()
        .await
        .map(Json)
        .map_err(|e| internal_error(e.to_string()))
}

/// Save (Add/Update) a book group
pub async fn save_group(
    State(state): State<AppState>,
    Json(mut group): Json<BookGroup>,
) -> Result<Json<BookGroup>, ApiErrorResponse> {
    if group.id.is_empty() {
        group.id = Uuid::new_v4().to_string();
    }

    state
        .store
        .save_group(group.clone())
        .await
        .map(|_| Json(group))
        .map_err(|e| internal_error(e.to_string()))
}

/// Delete a book group
pub async fn delete_group(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiErrorResponse> {
    state
        .store
        .delete_group(id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| internal_error(e.to_string()))
}
