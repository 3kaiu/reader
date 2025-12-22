use axum::{
    extract::State,
    response::Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::models::ApiResponse;
use crate::services::AppState;

#[derive(Debug, Deserialize)]
pub struct MigrationRequest {
    /// 旧版存储目录路径
    pub path: String,
}

/// POST /migrate - 从旧版 Kotlin 后端迁移数据
pub async fn migrate(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<MigrationRequest>,
) -> Json<ApiResponse<MigrationSummary>> {
    use crate::services::Migration;
    
    let migration = Migration::new();
    
    match migration.migrate_from_legacy(&req.path).await {
        Ok(result) => {
            let summary = MigrationSummary {
                sources: result.sources_migrated,
                books: result.books_migrated,
                rules: result.rules_migrated,
                groups: result.groups_migrated,
                total: result.total(),
            };
            Json(ApiResponse::success(summary))
        }
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

#[derive(Debug, serde::Serialize)]
pub struct MigrationSummary {
    pub sources: usize,
    pub books: usize,
    pub rules: usize,
    pub groups: usize,
    pub total: usize,
}
