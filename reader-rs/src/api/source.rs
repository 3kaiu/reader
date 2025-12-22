use axum::{
    extract::{Query, State},
    response::{Json, sse::{Event, Sse}},
};
use futures::stream::Stream;
use serde::Deserialize;
use std::sync::Arc;
use std::convert::Infallible;

use crate::models::{BookSource, ApiResponse};
use crate::services::AppState;

#[derive(Debug, Deserialize)]
pub struct AvailableSourceRequest {
    pub url: String,
    pub refresh: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct SetSourceRequest {
    #[serde(rename = "bookUrl")]
    pub book_url: String,
    #[serde(rename = "newUrl")]
    pub new_url: String,
    #[serde(rename = "bookSourceUrl")]
    pub book_source_url: String,
}

#[derive(Debug, Deserialize)]
pub struct SearchSourceSSEQuery {
    pub url: String,
    #[serde(rename = "bookSourceGroup")]
    pub book_source_group: Option<String>,
    #[serde(rename = "concurrentCount")]
    pub concurrent_count: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct SaveSourceRequest {
    pub source: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteSourceRequest {
    #[serde(rename = "bookSourceUrl")]
    pub book_source_url: String,
}

#[derive(Debug, Deserialize)]
pub struct ImportSourceRequest {
    pub source: String,
}

/// GET /getBookSources - 获取所有书源
pub async fn get_book_sources(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<Vec<BookSource>>> {
    match state.source_service.get_all_sources().await {
        Ok(sources) => Json(ApiResponse::success(sources)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /getAvailableBookSource - 获取可用书源
pub async fn get_available_book_source(
    State(state): State<Arc<AppState>>,
    Json(req): Json<AvailableSourceRequest>,
) -> Json<ApiResponse<Vec<BookSource>>> {
    let refresh = req.refresh.unwrap_or(0) == 1;
    match state.source_service.get_available_sources(&req.url, refresh).await {
        Ok(sources) => Json(ApiResponse::success(sources)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /setBookSource - 切换书源
pub async fn set_book_source(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SetSourceRequest>,
) -> Json<ApiResponse<()>> {
    match state.source_service.set_book_source(&req.book_url, &req.new_url, &req.book_source_url).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// GET /searchBookSourceSSE - 搜索书源 (SSE)
pub async fn search_book_source_sse(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchSourceSSEQuery>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = state.source_service.search_source_sse(
        query.url,
        query.book_source_group,
        query.concurrent_count.unwrap_or(20),
    );
    Sse::new(stream)
}

/// POST /saveBookSource - 保存书源
pub async fn save_book_source(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SaveSourceRequest>,
) -> Json<ApiResponse<()>> {
    match state.source_service.save_source(&req.source).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /deleteBookSource - 删除书源
pub async fn delete_book_source(
    State(state): State<Arc<AppState>>,
    Json(req): Json<DeleteSourceRequest>,
) -> Json<ApiResponse<()>> {
    match state.source_service.delete_source(&req.book_source_url).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /importBookSource - 批量导入书源
pub async fn import_book_source(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ImportSourceRequest>,
) -> Json<ApiResponse<i32>> {
    match state.source_service.import_sources(&req.source).await {
        Ok(count) => Json(ApiResponse::success(count)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}
