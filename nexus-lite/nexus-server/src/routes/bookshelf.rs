//! Bookshelf routes

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use nexus_core::BookshelfItem;
use serde::Deserialize;
use uuid::Uuid;

use crate::app::AppState;
use crate::error::{conflict, internal_error, ApiErrorResponse};

/// List bookshelf items
pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<BookshelfItem>>, ApiErrorResponse> {
    state
        .store
        .get_all()
        .await
        .map(Json)
        .map_err(|e| internal_error(e.to_string()))
}

#[derive(Deserialize)]
pub struct AddBookRequest {
    pub source_id: String,
    pub book_url: String,
    pub name: String,
    pub author: Option<String>,
    pub cover_url: Option<String>,
    pub group_id: Option<String>,
}

/// Add to bookshelf
pub async fn add(
    State(state): State<AppState>,
    Json(req): Json<AddBookRequest>,
) -> Result<Json<BookshelfItem>, ApiErrorResponse> {
    // Check if already exists
    if state
        .store
        .exists(req.source_id.clone(), req.book_url.clone())
        .await
        .map_err(|e| internal_error(e.to_string()))?
    {
        return Err(conflict("Book already in bookshelf"));
    }

    // Try to fetch complete book info from source
    let mut item = BookshelfItem {
        id: Uuid::new_v4().to_string(),
        source_id: req.source_id.clone(),
        book_url: req.book_url.clone(),
        name: req.name.clone(),
        author: req.author.clone(),
        cover_url: req.cover_url.clone(),
        last_chapter_index: 0,
        last_read_position: 0.0,
        last_read_time: None,
        created_at: Utc::now().timestamp(),
        group_id: req.group_id,
    };

    if let Some(engine) = state.engine_registry.get_engine(&req.source_id) {
        // Log info
        tracing::info!(
            "Fetching book info for: {} (source: {})",
            req.book_url,
            req.source_id
        );

        match engine.book_info(&req.book_url).await {
            Ok(info) => {
                item.name = info.name;
                item.author = Some(info.author);
                if let Some(cover) = info.cover_url {
                    item.cover_url = Some(cover);
                }
                // We could also store intro/update_time if BookshelfItem supported it
            }
            Err(e) => {
                tracing::warn!("Failed to fetch book info during add: {}", e);
                // Continue with partial info
            }
        }
    }

    state
        .store
        .add(item.clone())
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    Ok(Json(item))
}

#[derive(Deserialize)]
pub struct UpdateProgressRequest {
    pub chapter_index: u32,
    pub position: f64,
}

/// Update reading progress
pub async fn update_progress(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateProgressRequest>,
) -> Result<StatusCode, ApiErrorResponse> {
    state
        .store
        .update_progress(id, req.chapter_index, req.position)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| internal_error(e.to_string()))
}

pub async fn remove(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiErrorResponse> {
    state
        .store
        .remove(id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| internal_error(e.to_string()))
}

#[derive(Deserialize)]
pub struct MoveToGroupRequest {
    pub group_id: Option<String>,
}

/// Change book group
pub async fn move_to_group(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<MoveToGroupRequest>,
) -> Result<StatusCode, ApiErrorResponse> {
    state
        .store
        .move_to_group(id, req.group_id)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| internal_error(e.to_string()))
}
