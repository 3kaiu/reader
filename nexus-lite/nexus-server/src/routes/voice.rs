use axum::{
    extract::{Path, State},
    Json,
};
use nexus_core::VoiceModelMetadata;
use crate::app::AppState;
use crate::routes::ApiResponse;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct VoiceConfigRequest {
    pub value: String,
}

/// GET /api/voice/metadata
pub async fn list_voice_metadata(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<VoiceModelMetadata>>> {
    match state.store.get_voice_metadata() {
        Ok(models) => Json(ApiResponse::success(models)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /api/voice/metadata
pub async fn save_voice_metadata(
    State(state): State<AppState>,
    Json(model): Json<VoiceModelMetadata>,
) -> Json<ApiResponse<()>> {
    match state.store.save_voice_metadata(&model) {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// DELETE /api/voice/metadata/:id
pub async fn delete_voice_metadata(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<()>> {
    match state.store.delete_voice_metadata(&id) {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// GET /api/voice/config/:key
pub async fn get_voice_config(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Json<ApiResponse<Option<String>>> {
    match state.store.get_voice_config(&key) {
        Ok(val) => Json(ApiResponse::success(val)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /api/voice/config/:key
pub async fn save_voice_config(
    State(state): State<AppState>,
    Path(key): Path<String>,
    Json(payload): Json<VoiceConfigRequest>,
) -> Json<ApiResponse<()>> {
    match state.store.save_voice_config(&key, &payload.value) {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}
