use axum::{
    extract::State,
    response::Json,
};
use serde::Deserialize;
use std::sync::Arc;

use crate::models::{ReplaceRule, ApiResponse};
use crate::services::AppState;

/// GET /getReplaceRules - 获取所有替换规则
pub async fn get_replace_rules(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<Vec<ReplaceRule>>> {
    match state.replace_service.get_all_rules().await {
        Ok(rules) => Json(ApiResponse::success(rules)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /saveReplaceRule - 保存单条规则
pub async fn save_replace_rule(
    State(state): State<Arc<AppState>>,
    Json(rule): Json<ReplaceRule>,
) -> Json<ApiResponse<ReplaceRule>> {
    match state.replace_service.save_rule(rule).await {
        Ok(saved) => Json(ApiResponse::success(saved)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /saveReplaceRules - 批量保存规则
pub async fn save_replace_rules(
    State(state): State<Arc<AppState>>,
    Json(rules): Json<Vec<ReplaceRule>>,
) -> Json<ApiResponse<()>> {
    match state.replace_service.save_rules(rules).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /deleteReplaceRules - 删除规则
pub async fn delete_replace_rules(
    State(state): State<Arc<AppState>>,
    Json(rules): Json<Vec<ReplaceRule>>,
) -> Json<ApiResponse<()>> {
    match state.replace_service.delete_rules(rules).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}
