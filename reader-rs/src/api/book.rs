use axum::{
    extract::{Query, State},
    response::{Json, sse::{Event, Sse}},
};
use futures::stream::Stream;
use serde::Deserialize;
use std::sync::Arc;
use std::convert::Infallible;

use crate::models::{Book, Chapter, SearchResult, ApiResponse};
use crate::services::AppState;

#[derive(Debug, Deserialize)]
pub struct BookshelfQuery {
    pub refresh: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ChapterListQuery {
    pub url: String,
    pub origin: Option<String>,
    pub refresh: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct BookContentQuery {
    pub url: String,
    pub index: i32,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub key: String,
}

#[derive(Debug, Deserialize)]
pub struct BookInfoQuery {
    pub url: String,
    pub origin: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CoverQuery {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct ProgressRequest {
    pub url: String,
    pub index: i32,
}

#[derive(Debug, Deserialize)]
pub struct DeleteBookRequest {
    pub url: String,
}

/// GET /getBookshelf - 获取书架列表
pub async fn get_bookshelf(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BookshelfQuery>,
) -> Json<ApiResponse<Vec<Book>>> {
    let refresh = query.refresh.unwrap_or(0) == 1;
    match state.book_service.get_bookshelf(refresh).await {
        Ok(books) => Json(ApiResponse::success(books)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// GET /getChapterList - 获取章节列表
pub async fn get_chapter_list(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ChapterListQuery>,
) -> Json<ApiResponse<Vec<Chapter>>> {
    let refresh = query.refresh.unwrap_or(0) == 1;
    match state.book_service.get_chapter_list(&query.url, query.origin.as_deref(), refresh).await {
        Ok(chapters) => Json(ApiResponse::success(chapters)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// GET /getBookContent - 获取章节内容
pub async fn get_book_content(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BookContentQuery>,
) -> Json<ApiResponse<String>> {
    match state.book_service.get_book_content(&query.url, query.index).await {
        Ok(content) => Json(ApiResponse::success(content)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// GET /getBookInfo - 获取书籍详情
pub async fn get_book_info(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BookInfoQuery>,
) -> Json<ApiResponse<Book>> {
    match state.book_service.get_book_info(&query.url, query.origin.as_deref()).await {
        Ok(book) => Json(ApiResponse::success(book)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// GET /search - 搜索书籍
pub async fn search(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Json<ApiResponse<Vec<SearchResult>>> {
    match state.book_service.search(&query.key).await {
        Ok(results) => Json(ApiResponse::success(results)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}


/// GET /searchBookMultiSSE - 多书源搜索 (SSE)
pub async fn search_book_multi_sse(
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = state.book_service.search_multi_sse(query.key, false, None, 50);
    Sse::new(stream)
}

/// POST /saveBook - 保存书籍到书架
pub async fn save_book(
    State(state): State<Arc<AppState>>,
    Json(book): Json<Book>,
) -> Json<ApiResponse<Book>> {
    match state.book_service.save_book(book).await {
        Ok(saved) => Json(ApiResponse::success(saved)),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /deleteBook - 删除书籍
pub async fn delete_book(
    State(state): State<Arc<AppState>>,
    Json(req): Json<DeleteBookRequest>,
) -> Json<ApiResponse<()>> {
    match state.book_service.delete_book(&req.url).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// POST /saveBookProgress - 保存阅读进度
pub async fn save_book_progress(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ProgressRequest>,
) -> Json<ApiResponse<()>> {
    match state.book_service.save_progress(&req.url, req.index).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(&e.to_string())),
    }
}

/// GET /cover - 封面图片代理
pub async fn get_cover(
    Query(query): Query<CoverQuery>,
) -> impl axum::response::IntoResponse {
    use axum::http::{header, StatusCode};
    use axum::response::Response;
    use axum::body::Body;
    
    // 如果是远程 URL，代理获取
    if query.path.starts_with("http://") || query.path.starts_with("https://") {
        match reqwest::get(&query.path).await {
            Ok(resp) => {
                let content_type = resp.headers()
                    .get(header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("image/jpeg")
                    .to_string();
                
                match resp.bytes().await {
                    Ok(bytes) => {
                        Response::builder()
                            .header(header::CONTENT_TYPE, content_type)
                            .header(header::CACHE_CONTROL, "public, max-age=86400")
                            .body(Body::from(bytes.to_vec()))
                            .unwrap()
                    }
                    Err(_) => Response::builder()
                        .status(StatusCode::BAD_GATEWAY)
                        .body(Body::empty())
                        .unwrap()
                }
            }
            Err(_) => Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::empty())
                .unwrap()
        }
    } else {
        // 本地文件
        Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::empty())
            .unwrap()
    }
}
