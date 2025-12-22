use axum::{
    extract::State,
    response::Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::models::{Book, ApiResponse};
use crate::services::AppState;

#[derive(Debug, Deserialize)]
pub struct GroupMultiRequest {
    #[serde(rename = "groupId")]
    pub group_id: i64,
    #[serde(rename = "bookList")]
    pub book_list: Vec<Book>,
}

/// POST /deleteBooks - 批量删除书籍
pub async fn delete_books(
    State(state): State<Arc<AppState>>,
    Json(books): Json<Vec<Book>>,
) -> Json<ApiResponse<()>> {
    match state.book_service.delete_books(books).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /addBookGroupMulti - 批量加入分组
pub async fn add_book_group_multi(
    State(state): State<Arc<AppState>>,
    Json(req): Json<GroupMultiRequest>,
) -> Json<ApiResponse<()>> {
    match state.book_service.add_books_to_group(req.group_id, req.book_list).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /removeBookGroupMulti - 批量移出分组
pub async fn remove_book_group_multi(
    State(state): State<Arc<AppState>>,
    Json(req): Json<GroupMultiRequest>,
) -> Json<ApiResponse<()>> {
    match state.book_service.remove_books_from_group(req.group_id, req.book_list).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}
