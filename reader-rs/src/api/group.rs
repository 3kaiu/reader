use axum::{
    extract::State,
    response::Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::models::{BookGroup, ApiResponse};
use crate::services::AppState;

#[derive(Debug, Deserialize)]
pub struct DeleteGroupRequest {
    #[serde(rename = "groupId")]
    pub group_id: i64,
}

#[derive(Debug, Deserialize)]
pub struct GroupOrderItem {
    #[serde(rename = "groupId")]
    pub group_id: i64,
    pub order: i32,
}

#[derive(Debug, Deserialize)]
pub struct SaveGroupOrderRequest {
    pub order: Vec<GroupOrderItem>,
}

/// GET /getBookGroups - 获取分组列表
pub async fn get_book_groups(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<Vec<BookGroup>>> {
    match state.group_service.get_all_groups().await {
        Ok(groups) => Json(ApiResponse::success(groups)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /saveBookGroup - 保存分组
pub async fn save_book_group(
    State(state): State<Arc<AppState>>,
    Json(group): Json<BookGroup>,
) -> Json<ApiResponse<BookGroup>> {
    match state.group_service.save_group(group).await {
        Ok(saved) => Json(ApiResponse::success(saved)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /deleteBookGroup - 删除分组
pub async fn delete_book_group(
    State(state): State<Arc<AppState>>,
    Json(req): Json<DeleteGroupRequest>,
) -> Json<ApiResponse<()>> {
    match state.group_service.delete_group(req.group_id).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /saveBookGroupOrder - 保存分组顺序
pub async fn save_book_group_order(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SaveGroupOrderRequest>,
) -> Json<ApiResponse<()>> {
    match state.group_service.save_group_order(req.order).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}
