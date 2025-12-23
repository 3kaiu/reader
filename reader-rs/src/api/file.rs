use axum::{
    extract::Query,
    response::Json,
};
use serde::Deserialize;

use crate::models::ApiResponse;
use crate::storage::FileStorage;

#[derive(Debug, Deserialize)]
pub struct FileGetQuery {
    pub path: String,
    #[serde(default)]
    pub home: String,
}

#[derive(Debug, Deserialize)]
pub struct FileSaveRequest {
    pub path: String,
    pub content: String,
    #[serde(default)]
    pub home: String,
}

/// GET /file/get - 获取文件内容
pub async fn file_get(
    Query(query): Query<FileGetQuery>,
) -> Json<ApiResponse<String>> {
    let storage = FileStorage::default();
    
    match storage.read_file(&query.path).await {
        Ok(content) => Json(ApiResponse::success(content)),
        Err(_) => Json(ApiResponse::success(String::new())), // 文件不存在返回空
    }
}

/// POST /file/save - 保存文件内容
pub async fn file_save(
    Json(req): Json<FileSaveRequest>,
) -> Json<ApiResponse<bool>> {
    let storage = FileStorage::default();
    
    match storage.write_file(&req.path, &req.content).await {
        Ok(_) => Json(ApiResponse::success(true)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}
