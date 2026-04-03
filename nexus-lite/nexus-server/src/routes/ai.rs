use crate::app::AppState;
use crate::routes::ApiResponse;
use axum::{
    extract::{Path, Query, State},
    Json,
};
use nexus_core::{AiAnalysisHistory, AiMappingRule};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub limit: Option<u32>,
}

/// GET /api/ai/mappings
pub async fn list_mapping_rules(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<AiMappingRule>>> {
    match state.store.get_ai_mapping_rules().await {
        Ok(rules) => Json(ApiResponse::success(rules)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /api/ai/mappings
pub async fn save_mapping_rule(
    State(state): State<AppState>,
    Json(rule): Json<AiMappingRule>,
) -> Json<ApiResponse<()>> {
    match state.store.save_ai_mapping_rule(rule).await {
        Ok(_) => {
            state.content_rules.invalidate().await;
            Json(ApiResponse::success(()))
        },
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// DELETE /api/ai/mappings/:id
pub async fn delete_mapping_rule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<()>> {
    match state.store.delete_ai_mapping_rule(id).await {
        Ok(_) => {
            state.content_rules.invalidate().await;
            Json(ApiResponse::success(()))
        },
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// GET /api/ai/history
pub async fn list_analysis_history(
    State(state): State<AppState>,
    Query(query): Query<HistoryQuery>,
) -> Json<ApiResponse<Vec<AiAnalysisHistory>>> {
    let limit = query.limit.unwrap_or(50);
    match state.store.get_ai_analysis_history(limit).await {
        Ok(history) => Json(ApiResponse::success(history)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /api/ai/history
pub async fn save_analysis_history(
    State(state): State<AppState>,
    Json(history): Json<AiAnalysisHistory>,
) -> Json<ApiResponse<()>> {
    match state.store.save_ai_analysis_history(history).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// DELETE /api/ai/history
pub async fn clear_analysis_history(State(state): State<AppState>) -> Json<ApiResponse<()>> {
    match state.store.clear_ai_analysis_history().await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}
