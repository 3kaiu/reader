use axum::{
    extract::{Query, State},
    response::{Json, sse::{Event, Sse}},
};
use futures::stream::Stream;
use futures::StreamExt;
use serde::Deserialize;
use std::sync::Arc;
use std::convert::Infallible;

use crate::models::{BookSource, BookSourceFull, ApiResponse};
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

/// GET /getBookSources - 获取所有书源 (完整版)
pub async fn get_book_sources(
    State(state): State<Arc<AppState>>,
) -> Json<ApiResponse<Vec<BookSourceFull>>> {
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
    // 1. 获取书籍信息以得到书名
    // 注意：这里需要 async 块来处理 await，由于 Sse::new 需要流，我们使用 async_stream
    let book_service = state.book_service.clone();
    let url = query.url.clone();
    let concurrent = query.concurrent_count.unwrap_or(20) as usize;

    let stream = async_stream::stream! {
        // 尝试获取书籍信息
        let book_name = match book_service.get_book_info(&url).await {
            Ok(book) => book.name,
            Err(_) => {
                // 书籍未找到，可能是 ID 错误
                tracing::warn!("Book not found for source search: {}", url);
                yield Ok(Event::default().data(r#"{"type":"end"}"#));
                return;
            }
        };

        tracing::info!("Starting source search for book: {}", book_name);

    let mut search_stream = Box::pin(book_service.search_multi_sse(book_name, concurrent));

        while let Some(event) = search_stream.next().await {
            yield event;
        }
        
        // 发送结束事件 (虽然 search_multi_sse 可能已经发了，但多发无害，或者依靠 frontend 的处理)
        // yield Ok(Event::default().data(r#"{"type":"end"}"#));
    };

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

#[derive(Debug, Deserialize)]
pub struct ReadRemoteRequest {
    pub url: String,
}

/// POST /readRemoteSourceFile - 读取远程书源文件
pub async fn read_remote_source_file(
    Json(req): Json<ReadRemoteRequest>,
) -> Json<ApiResponse<Vec<String>>> {
    // 从远程 URL 获取书源内容
    match reqwest::get(&req.url).await {
        Ok(resp) => {
            match resp.text().await {
                Ok(text) => {
                    // 尝试解析为 JSON 数组
                    if let Ok(sources) = serde_json::from_str::<Vec<serde_json::Value>>(&text) {
                        // 返回每个书源的 JSON 字符串
                        let result: Vec<String> = sources.iter()
                            .filter_map(|s| serde_json::to_string(s).ok())
                            .collect();
                        Json(ApiResponse::success(result))
                    } else {
                        // 可能是单个书源或纯文本
                        Json(ApiResponse::success(vec![text]))
                    }
                }
                Err(e) => Json(ApiResponse::error(&format!("Failed to read response: {}", e))),
            }
        }
        Err(e) => Json(ApiResponse::error(&format!("Failed to fetch: {}", e))),
    }
}

/// POST /saveBookSources - 批量保存书源
pub async fn save_book_sources(
    State(state): State<Arc<AppState>>,
    Json(sources): Json<Vec<serde_json::Value>>,
) -> Json<ApiResponse<i32>> {
    let json_str = serde_json::to_string(&sources).unwrap_or_default();
    match state.source_service.import_sources(&json_str).await {
        Ok(count) => Json(ApiResponse::success(count)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

#[derive(Debug, Deserialize)]
pub struct TestSourceRequest {
    #[serde(rename = "bookSourceUrl")]
    pub book_source_url: String,
}

/// POST /testBookSource - 测试书源
pub async fn test_book_source(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<TestSourceRequest>,
) -> Json<ApiResponse<String>> {
    // TODO: 实现书源测试逻辑
    // 需要：1. 获取书源配置 2. 执行搜索规则 3. 返回测试结果
    Json(ApiResponse::success(format!("Testing source: {}", req.book_source_url)))
}

/// POST /deleteBookSources - 批量删除书源
pub async fn delete_book_sources(
    State(state): State<Arc<AppState>>,
    Json(sources): Json<Vec<serde_json::Value>>,
) -> Json<ApiResponse<i32>> {
    let mut deleted_count = 0;
    for source in sources {
        if let Some(url) = source.get("bookSourceUrl").and_then(|v| v.as_str()) {
            if state.source_service.delete_source(url).await.is_ok() {
                deleted_count += 1;
            }
        }
    }
    Json(ApiResponse::success(deleted_count))
}

#[derive(Debug, Deserialize)]
pub struct SyncRemoteRequest {
    pub url: String,
}

/// POST /saveFromRemoteSource - 从远程URL同步书源
pub async fn save_from_remote_source(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SyncRemoteRequest>,
) -> Json<ApiResponse<SyncResult>> {
    match state.source_service.save_from_remote_source(&req.url).await {
        Ok(count) => Json(ApiResponse::success(SyncResult { count })),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

#[derive(Debug, serde::Serialize)]
pub struct SyncResult {
    pub count: i32,
}
