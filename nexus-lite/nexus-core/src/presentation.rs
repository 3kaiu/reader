//! 展示层 (Presentation Layer)
//!
//! 这是DDD架构中的展示层，负责处理用户界面和API接口。
//! 展示层将用户输入转换为应用命令，将应用结果转换为用户界面显示。
//!
//! 展示层设计原则：
//! - 薄层：只负责数据转换和界面展示
//! - 适配器模式：适配用户接口到应用接口
//! - 关注点分离：分离界面逻辑和业务逻辑
//! - 用户体验：提供良好的用户交互体验

/// 展示层通用接口和类型
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use warp::Filter;
use chrono::{DateTime, Utc};

use crate::application::*;
use crate::error::EngineError;

/// HTTP API处理器
#[async_trait]
pub trait HttpApiHandler: Send + Sync {
    /// 处理HTTP请求
    async fn handle_request(
        &self,
        method: &str,
        path: &str,
        query_params: HashMap<String, String>,
        headers: HashMap<String, String>,
        body: Option<serde_json::Value>,
        context: PresentationContext,
    ) -> Result<HttpApiResponse, PresentationError>;
}

/// Web界面处理器
#[async_trait]
pub trait WebInterfaceHandler: Send + Sync {
    /// 渲染页面
    async fn render_page(
        &self,
        page: &str,
        params: HashMap<String, String>,
        context: PresentationContext,
    ) -> Result<WebPageResponse, PresentationError>;

    /// 处理WebSocket消息
    async fn handle_websocket(
        &self,
        message: WebSocketMessage,
        context: PresentationContext,
    ) -> Result<WebSocketResponse, PresentationError>;
}

/// CLI命令处理器
#[async_trait]
pub trait CliCommandHandler: Send + Sync {
    /// 处理CLI命令
    async fn handle_command(
        &self,
        command: Vec<String>,
        options: HashMap<String, String>,
        context: PresentationContext,
    ) -> Result<CliResponse, PresentationError>;
}

/// 展示上下文
#[derive(Debug, Clone)]
pub struct PresentationContext {
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub request_id: String,
    pub user_agent: Option<String>,
    pub ip_address: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub locale: String,
    pub timezone: String,
}

/// HTTP API响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpApiResponse {
    pub status_code: u16,
    pub headers: HashMap<String, String>,
    pub body: Option<serde_json::Value>,
    pub execution_time_ms: u64,
}

/// Web页面响应
#[derive(Debug, Clone)]
pub struct WebPageResponse {
    pub content_type: String,
    pub content: String,
    pub status_code: u16,
    pub headers: HashMap<String, String>,
}

/// WebSocket消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSocketMessage {
    pub message_type: String,
    pub payload: serde_json::Value,
    pub timestamp: DateTime<Utc>,
}

/// WebSocket响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSocketResponse {
    pub message_type: String,
    pub payload: serde_json::Value,
    pub timestamp: DateTime<Utc>,
}

/// CLI响应
#[derive(Debug, Clone)]
pub struct CliResponse {
    pub output: String,
    pub exit_code: i32,
    pub execution_time_ms: u64,
}

/// 展示层错误
#[derive(Debug, Clone)]
pub enum PresentationError {
    Validation(String),
    Authentication(String),
    Authorization(String),
    NotFound(String),
    BadRequest(String),
    InternalServer(String),
}

/// 请求验证器
#[async_trait]
pub trait RequestValidator: Send + Sync {
    /// 验证请求
    async fn validate(
        &self,
        method: &str,
        path: &str,
        headers: &HashMap<String, String>,
        body: &Option<serde_json::Value>,
    ) -> Result<(), PresentationError>;
}

/// 响应格式化器
#[async_trait]
pub trait ResponseFormatter: Send + Sync {
    /// 格式化成功响应
    async fn format_success(
        &self,
        data: Option<serde_json::Value>,
        metadata: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, PresentationError>;

    /// 格式化错误响应
    async fn format_error(
        &self,
        error: &PresentationError,
        request_id: &str,
    ) -> Result<serde_json::Value, PresentationError>;
}

/// 数据传输对象映射器
#[async_trait]
pub trait DtoMapper: Send + Sync {
    /// 将请求DTO映射为应用命令
    async fn map_to_command(
        &self,
        request: &serde_json::Value,
        context: &PresentationContext,
    ) -> Result<ApplicationCommand, PresentationError>;

    /// 将请求DTO映射为应用查询
    async fn map_to_query(
        &self,
        request: &serde_json::Value,
        context: &PresentationContext,
    ) -> Result<ApplicationQuery, PresentationError>;

    /// 将应用结果映射为响应DTO
    async fn map_from_result(
        &self,
        result: &ApplicationResult,
    ) -> Result<serde_json::Value, PresentationError>;
}

/// API路由构建器
pub struct ApiRouter {
    service_bus: Arc<ApplicationServiceBus>,
    routes: Vec<Box<dyn HttpApiHandler>>,
    middleware: Vec<Box<dyn RequestMiddleware>>,
}

impl ApiRouter {
    pub fn new(service_bus: Arc<ApplicationServiceBus>) -> Self {
        Self {
            service_bus,
            routes: Vec::new(),
            middleware: Vec::new(),
        }
    }

    /// 添加路由
    pub fn add_route(&mut self, handler: Box<dyn HttpApiHandler>) {
        self.routes.push(handler);
    }

    /// 添加中间件
    pub fn add_middleware(&mut self, middleware: Box<dyn RequestMiddleware>) {
        self.middleware.push(middleware);
    }

    /// 获取 ServiceBus 引用（用于中间件等）
    pub fn service_bus(&self) -> std::sync::Arc<ApplicationServiceBus> {
        self.service_bus.clone()
    }

    /// 构建Warp过滤器
    pub fn build_warp_filter(self) -> warp::filters::BoxedFilter<(impl warp::Reply,)> {
        let service_bus = self.service_bus.clone();

        // 创建路由过滤器
        let routes_filter = warp::path::full()
            .and(warp::method())
            .and(warp::query::<HashMap<String, String>>())
            .and(warp::header::headers_cloned())
            .and(warp::body::json().or(warp::any().map(|| None)).unify())
            .and_then(move |path, method: warp::http::Method, query: HashMap<String, String>, headers: warp::http::HeaderMap, body: Option<serde_json::Value>| {
                let service_bus = service_bus.clone();

                async move {
                    // 创建展示上下文
                    let context = PresentationContext {
                        user_id: None, // 从认证中间件获取
                        session_id: None, // 从会话中间件获取
                        request_id: uuid::Uuid::new_v4().to_string(),
                        user_agent: headers.get("user-agent").and_then(|h| h.to_str().ok()).map(|s| s.to_string()),
                        ip_address: None, // 从请求中获取
                        timestamp: Utc::now(),
                        locale: "zh-CN".to_string(),
                        timezone: "Asia/Shanghai".to_string(),
                    };

                    // 查找匹配的路由处理器
                    // 这里简化为返回一个默认响应，实际实现需要匹配具体路由
                    let response = HttpApiResponse {
                        status_code: 200,
                        headers: HashMap::new(),
                        body: Some(serde_json::json!({"message": "API endpoint"})),
                        execution_time_ms: 10,
                    };

                    Ok::<_, warp::Rejection>(warp::reply::json(&response.body))
                }
            });

        routes_filter.boxed()
    }
}

/// 请求中间件
#[async_trait]
pub trait RequestMiddleware: Send + Sync {
    /// 处理请求
    async fn process(
        &self,
        request: &mut HttpApiRequest,
        context: &mut PresentationContext,
    ) -> Result<(), PresentationError>;
}

/// HTTP API请求
#[derive(Debug, Clone)]
pub struct HttpApiRequest {
    pub method: String,
    pub path: String,
    pub query_params: HashMap<String, String>,
    pub headers: HashMap<String, String>,
    pub body: Option<serde_json::Value>,
}

/// 认证中间件
pub struct AuthenticationMiddleware {
    service_bus: Arc<ApplicationServiceBus>,
}

impl AuthenticationMiddleware {
    pub fn new(service_bus: Arc<ApplicationServiceBus>) -> Self {
        Self { service_bus }
    }
}

#[async_trait]
impl RequestMiddleware for AuthenticationMiddleware {
    async fn process(
        &self,
        request: &mut HttpApiRequest,
        context: &mut PresentationContext,
    ) -> Result<(), PresentationError> {
        // 从Authorization头提取token
        if let Some(token) = request.headers.get("authorization") {
            if token.starts_with("Bearer ") {
                let token = &token[7..];
                // 验证token并设置user_id
                // 这里是简化的实现
                context.user_id = Some("user123".to_string());
            }
        }
        Ok(())
    }
}

/// 速率限制中间件
pub struct RateLimitMiddleware {
    requests_per_minute: u32,
}

impl RateLimitMiddleware {
    pub fn new(requests_per_minute: u32) -> Self {
        Self { requests_per_minute }
    }
}

#[async_trait]
impl RequestMiddleware for RateLimitMiddleware {
    async fn process(
        &self,
        _request: &mut HttpApiRequest,
        _context: &mut PresentationContext,
    ) -> Result<(), PresentationError> {
        // 实现速率限制逻辑
        // 这里是简化的实现
        Ok(())
    }
}

/// 日志中间件
pub struct LoggingMiddleware;

impl LoggingMiddleware {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl RequestMiddleware for LoggingMiddleware {
    async fn process(
        &self,
        request: &mut HttpApiRequest,
        context: &mut PresentationContext,
    ) -> Result<(), PresentationError> {
        tracing::info!(
            "Request: {} {} from user {:?} at {}",
            request.method,
            request.path,
            context.user_id,
            context.timestamp
        );
        Ok(())
    }
}

/// 默认请求验证器
pub struct DefaultRequestValidator;

impl DefaultRequestValidator {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl RequestValidator for DefaultRequestValidator {
    async fn validate(
        &self,
        method: &str,
        path: &str,
        headers: &HashMap<String, String>,
        body: &Option<serde_json::Value>,
    ) -> Result<(), PresentationError> {
        // 基本的请求验证
        if method.is_empty() || path.is_empty() {
            return Err(PresentationError::BadRequest("Invalid request method or path".to_string()));
        }

        // 检查必需的头
        if !headers.contains_key("content-type") && body.is_some() {
            return Err(PresentationError::BadRequest("Content-Type header required for requests with body".to_string()));
        }

        Ok(())
    }
}

/// JSON响应格式化器
pub struct JsonResponseFormatter;

impl JsonResponseFormatter {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl ResponseFormatter for JsonResponseFormatter {
    async fn format_success(
        &self,
        data: Option<serde_json::Value>,
        metadata: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, PresentationError> {
        let mut response = serde_json::json!({
            "success": true,
            "timestamp": Utc::now().to_rfc3339(),
            "metadata": metadata,
        });

        if let Some(data) = data {
            response["data"] = data;
        }

        Ok(response)
    }

    async fn format_error(
        &self,
        error: &PresentationError,
        request_id: &str,
    ) -> Result<serde_json::Value, PresentationError> {
        let (status_code, error_message) = match error {
            PresentationError::Validation(msg) => (400, msg.clone()),
            PresentationError::Authentication(msg) => (401, msg.clone()),
            PresentationError::Authorization(msg) => (403, msg.clone()),
            PresentationError::NotFound(msg) => (404, msg.clone()),
            PresentationError::BadRequest(msg) => (400, msg.clone()),
            PresentationError::InternalServer(msg) => (500, msg.clone()),
        };

        Ok(serde_json::json!({
            "success": false,
            "error": {
                "code": status_code,
                "message": error_message,
                "request_id": request_id,
            },
            "timestamp": Utc::now().to_rfc3339(),
        }))
    }
}

/// 阅读相关DTO映射器
pub struct ReadingDtoMapper;

impl ReadingDtoMapper {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl DtoMapper for ReadingDtoMapper {
    async fn map_to_command(
        &self,
        request: &serde_json::Value,
        context: &PresentationContext,
    ) -> Result<ApplicationCommand, PresentationError> {
        // 将请求DTO映射为阅读领域命令
        // 这里是简化的实现
        if let Some(book_id) = request.get("book_id").and_then(|v| v.as_str()) {
            Ok(ApplicationCommand::Reading(crate::domain::ReadingCommand::CreateBook {
                book_id: book_id.to_string(),
                title: "Default Title".to_string(),
                author: "Default Author".to_string(),
                source_url: "http://example.com".to_string(),
                source_engine: "default".to_string(),
            }))
        } else {
            Err(PresentationError::BadRequest("Missing book_id".to_string()))
        }
    }

    async fn map_to_query(
        &self,
        request: &serde_json::Value,
        _context: &PresentationContext,
    ) -> Result<ApplicationQuery, PresentationError> {
        // 将请求DTO映射为阅读领域查询
        if let Some(book_id) = request.get("book_id").and_then(|v| v.as_str()) {
            Ok(ApplicationQuery::Reading(crate::domain::ReadingQuery::GetBook {
                book_id: book_id.to_string(),
            }))
        } else {
            Err(PresentationError::BadRequest("Missing book_id".to_string()))
        }
    }

    async fn map_from_result(
        &self,
        result: &ApplicationResult,
    ) -> Result<serde_json::Value, PresentationError> {
        // 将应用结果映射为响应DTO
        Ok(result.data.clone().unwrap_or(serde_json::Value::Null))
    }
}

/// 展示层初始化函数
pub async fn init_presentation_layer(service_bus: Arc<ApplicationServiceBus>) -> Result<ApiRouter, PresentationError> {
    let mut router = ApiRouter::new(service_bus);

    // 添加中间件
    router.add_middleware(Box::new(LoggingMiddleware::new()));
    router.add_middleware(Box::new(AuthenticationMiddleware::new(router.service_bus())));
    router.add_middleware(Box::new(RateLimitMiddleware::new(1000))); // 每分钟1000个请求

    // 添加路由处理器
    // 这里可以添加具体的API路由处理器

    Ok(router)
}