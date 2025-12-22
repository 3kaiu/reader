use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod api;
mod engine;
mod models;
mod services;
mod storage;

#[tokio::main]
async fn main() {
    // 初始化日志
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "reader_rs=info,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 静态文件服务 (web-v3 前端)
    // 优先尝试 /web 目录 (Docker)，然后尝试 ../web-v3/dist (开发环境)
    let web_dir = if std::path::Path::new("/web").exists() {
        "/web"
    } else if std::path::Path::new("../web-v3/dist").exists() {
        "../web-v3/dist"
    } else {
        "./web"
    };
    
    tracing::info!("Serving static files from: {}", web_dir);
    
    // SPA 回退到 index.html
    let serve_dir = ServeDir::new(web_dir)
        .not_found_service(ServeFile::new(format!("{}/index.html", web_dir)));

    // 构建应用路由
    let app = Router::new()
        // API 路由
        .nest("/reader3", api::routes())
        // 静态文件 (前端)
        .fallback_service(serve_dir)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    // 启动服务器
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!("🚀 Reader-RS server running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
