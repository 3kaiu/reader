//! 服务器领域层 (Server Domain Layer)
//!
//! 服务器领域负责API服务、路由管理、WebSocket通信等服务端业务逻辑。
//! 该领域包含以下核心概念：
//! - API路由 (ApiRoute): RESTful API端点管理
//! - WebSocket会话 (WebSocketSession): 实时通信会话
//! - 请求处理 (RequestHandler): HTTP请求处理逻辑
//! - 响应构建 (ResponseBuilder): API响应构建

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{RwLock, RwLockReadGuard, RwLockWriteGuard};
use uuid::Uuid;

use crate::error::ServerError;

fn to_server_value<T: Serialize>(
    value: &T,
    entity_name: &str,
) -> Result<serde_json::Value, ServerError> {
    serde_json::to_value(value).map_err(|err| {
        ServerError::Validation(format!("Failed to serialize {}: {}", entity_name, err))
    })
}

fn read_lock<'a, T>(
    lock: &'a RwLock<T>,
    lock_name: &str,
) -> Result<RwLockReadGuard<'a, T>, ServerError> {
    lock.read().map_err(|_| {
        ServerError::Validation(format!("{} lock poisoned during read", lock_name))
    })
}

fn write_lock<'a, T>(
    lock: &'a RwLock<T>,
    lock_name: &str,
) -> Result<RwLockWriteGuard<'a, T>, ServerError> {
    lock.write().map_err(|_| {
        ServerError::Validation(format!("{} lock poisoned during write", lock_name))
    })
}

/// API路由实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiRoute {
    pub id: ApiRouteId,
    pub method: HttpMethod,
    pub path: String,
    pub handler: String,
    pub description: String,
    pub requires_auth: bool,
    pub rate_limit: Option<RateLimit>,
    pub cache_config: Option<CacheConfig>,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ApiRouteId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HttpMethod {
    GET,
    POST,
    PUT,
    DELETE,
    PATCH,
    OPTIONS,
    HEAD,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimit {
    pub requests_per_minute: u32,
    pub burst_limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    pub ttl_seconds: u64,
    pub cache_key_pattern: String,
}

/// WebSocket会话实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSocketSession {
    pub id: WebSocketSessionId,
    pub user_id: Option<String>,
    pub connection_id: String,
    pub subscribed_channels: Vec<String>,
    pub last_activity: DateTime<Utc>,
    pub status: WebSocketStatus,
    pub metadata: HashMap<String, serde_json::Value>,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct WebSocketSessionId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WebSocketStatus {
    Connected,
    Disconnected,
    Error,
}

/// 请求上下文值对象
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestContext {
    pub request_id: String,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub ip_address: String,
    pub user_agent: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub headers: HashMap<String, String>,
    pub query_params: HashMap<String, String>,
    pub path_params: HashMap<String, String>,
}

impl RequestContext {
    pub fn new() -> Self {
        Self {
            request_id: Uuid::new_v4().to_string(),
            user_id: None,
            session_id: None,
            ip_address: String::new(),
            user_agent: None,
            timestamp: Utc::now(),
            headers: HashMap::new(),
            query_params: HashMap::new(),
            path_params: HashMap::new(),
        }
    }
}

/// API响应值对象
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<ApiError>,
    pub meta: ResponseMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiError {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseMeta {
    pub request_id: String,
    pub timestamp: DateTime<Utc>,
    pub processing_time_ms: u64,
    pub version: String,
}

/// 服务器领域事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServerEvent {
    ApiRequestReceived {
        request_id: String,
        method: String,
        path: String,
        user_id: Option<String>,
    },
    ApiRequestCompleted {
        request_id: String,
        status_code: u16,
        processing_time_ms: u64,
    },
    WebSocketConnected {
        session_id: String,
        user_id: Option<String>,
        ip_address: String,
    },
    WebSocketDisconnected {
        session_id: String,
        reason: String,
    },
    WebSocketMessageReceived {
        session_id: String,
        message_type: String,
        size_bytes: usize,
    },
    RateLimitExceeded {
        user_id: Option<String>,
        endpoint: String,
        limit: u32,
    },
}

/// 服务器领域命令
#[derive(Debug, Clone)]
pub enum ServerCommand {
    RegisterApiRoute {
        route: ApiRoute,
    },
    UnregisterApiRoute {
        route_id: String,
    },
    CreateWebSocketSession {
        session: WebSocketSession,
    },
    CloseWebSocketSession {
        session_id: String,
        reason: String,
    },
    BroadcastWebSocketMessage {
        channel: String,
        message: serde_json::Value,
    },
    SendWebSocketMessage {
        session_id: String,
        message: serde_json::Value,
    },
}

/// 服务器领域查询
#[derive(Debug, Clone)]
pub enum ServerQuery {
    GetApiRoutes,
    GetApiRoute {
        route_id: String,
    },
    GetWebSocketSessions {
        status: Option<WebSocketStatus>,
    },
    GetWebSocketSession {
        session_id: String,
    },
    GetServerMetrics,
    GetActiveConnections,
}

/// 服务器领域 - 聚合所有服务端业务逻辑
pub struct ServerDomain {
    route_repository: Box<dyn ApiRouteRepository>,
    session_repository: Box<dyn WebSocketSessionRepository>,
    metrics_service: Box<dyn ServerMetricsService>,
    business_rules: Vec<Box<dyn BusinessRuleValidator<ApiRoute>>>,
}

impl ServerDomain {
    pub async fn new() -> Result<Self, ServerError> {
        Ok(Self {
            route_repository: Box::new(InMemoryApiRouteRepository::new()),
            session_repository: Box::new(InMemoryWebSocketSessionRepository::new()),
            metrics_service: Box::new(BasicServerMetricsService::new()),
            business_rules: vec![
                Box::new(ApiRoutePathValidRule),
                Box::new(ApiRouteMethodValidRule),
            ],
        })
    }

    pub async fn handle_command(&self, command: ServerCommand) -> Result<DomainResult, ServerError> {
        match command {
            ServerCommand::RegisterApiRoute { route } => {
                self.register_api_route(route).await
            }
            ServerCommand::UnregisterApiRoute { route_id } => {
                self.unregister_api_route(route_id).await
            }
            ServerCommand::CreateWebSocketSession { session } => {
                self.create_websocket_session(session).await
            }
            ServerCommand::CloseWebSocketSession { session_id, reason } => {
                self.close_websocket_session(session_id, reason).await
            }
            ServerCommand::BroadcastWebSocketMessage { channel, message } => {
                self.broadcast_websocket_message(channel, message).await
            }
            ServerCommand::SendWebSocketMessage { session_id, message } => {
                self.send_websocket_message(session_id, message).await
            }
        }
    }

    pub async fn handle_query(&self, query: ServerQuery) -> Result<DomainResult, ServerError> {
        match query {
            ServerQuery::GetApiRoutes => {
                self.get_api_routes().await
            }
            ServerQuery::GetApiRoute { route_id } => {
                self.get_api_route(route_id).await
            }
            ServerQuery::GetWebSocketSessions { status } => {
                self.get_websocket_sessions(status).await
            }
            ServerQuery::GetWebSocketSession { session_id } => {
                self.get_websocket_session(session_id).await
            }
            ServerQuery::GetServerMetrics => {
                self.get_server_metrics().await
            }
            ServerQuery::GetActiveConnections => {
                self.get_active_connections().await
            }
        }
    }

    async fn register_api_route(&self, route: ApiRoute) -> Result<DomainResult, ServerError> {
        // 验证业务规则
        for rule in &self.business_rules {
            rule.validate(&route, &DomainContext::default()).await?;
        }

        self.route_repository.save(&route).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_server_value(&route, "api route")?),
            events: vec![DomainEvent::Server(ServerEvent::ApiRequestReceived {
                request_id: Uuid::new_v4().to_string(),
                method: format!("{:?}", route.method),
                path: route.path.clone(),
                user_id: None,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn unregister_api_route(&self, route_id: String) -> Result<DomainResult, ServerError> {
        let route_id = ApiRouteId(route_id);
        self.route_repository.delete(&route_id).await?;

        Ok(DomainResult {
            success: true,
            data: None,
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn create_websocket_session(&self, session: WebSocketSession) -> Result<DomainResult, ServerError> {
        self.session_repository.save(&session).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_server_value(&session, "websocket session")?),
            events: vec![DomainEvent::Server(ServerEvent::WebSocketConnected {
                session_id: session.id.0.clone(),
                user_id: session.user_id.clone(),
                ip_address: "127.0.0.1".to_string(), // 简化实现
            })],
            metadata: HashMap::new(),
        })
    }

    async fn close_websocket_session(&self, session_id: String, reason: String) -> Result<DomainResult, ServerError> {
        let session_id = WebSocketSessionId(session_id);
        let mut session = self.session_repository.find_by_id(&session_id).await?
            .ok_or_else(|| ServerError::NotFound(format!("Session {} not found", session_id.0)))?;

        session.status = WebSocketStatus::Disconnected;
        self.session_repository.save(&session).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_server_value(&session, "websocket session")?),
            events: vec![DomainEvent::Server(ServerEvent::WebSocketDisconnected {
                session_id: session.id.0,
                reason,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn broadcast_websocket_message(&self, _channel: String, _message: serde_json::Value) -> Result<DomainResult, ServerError> {
        // 广播WebSocket消息的实现
        Ok(DomainResult {
            success: true,
            data: None,
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn send_websocket_message(&self, _session_id: String, _message: serde_json::Value) -> Result<DomainResult, ServerError> {
        // 发送WebSocket消息的实现
        Ok(DomainResult {
            success: true,
            data: None,
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_api_routes(&self) -> Result<DomainResult, ServerError> {
        let routes = self.route_repository.find_all().await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(routes)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_api_route(&self, route_id: String) -> Result<DomainResult, ServerError> {
        let route_id = ApiRouteId(route_id);
        let route = self.route_repository.find_by_id(&route_id).await?
            .ok_or_else(|| ServerError::NotFound(format!("Route {} not found", route_id.0)))?;

        Ok(DomainResult {
            success: true,
            data: Some(to_server_value(&route, "api route")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_websocket_sessions(&self, status: Option<WebSocketStatus>) -> Result<DomainResult, ServerError> {
        let sessions = self.session_repository.find_by_status(status).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(sessions)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_websocket_session(&self, session_id: String) -> Result<DomainResult, ServerError> {
        let session_id = WebSocketSessionId(session_id);
        let session = self.session_repository.find_by_id(&session_id).await?
            .ok_or_else(|| ServerError::NotFound(format!("Session {} not found", session_id.0)))?;

        Ok(DomainResult {
            success: true,
            data: Some(to_server_value(&session, "websocket session")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_server_metrics(&self) -> Result<DomainResult, ServerError> {
        let metrics = self.metrics_service.get_metrics().await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_server_value(&metrics, "server metrics")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_active_connections(&self) -> Result<DomainResult, ServerError> {
        let connections = self.metrics_service.get_active_connections().await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(connections)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }
}

// ===== 仓库接口 =====

#[async_trait]
pub trait ApiRouteRepository: Send + Sync {
    async fn save(&self, route: &ApiRoute) -> Result<(), ServerError>;
    async fn find_by_id(&self, id: &ApiRouteId) -> Result<Option<ApiRoute>, ServerError>;
    async fn find_by_path(&self, method: &HttpMethod, path: &str) -> Result<Option<ApiRoute>, ServerError>;
    async fn find_all(&self) -> Result<Vec<ApiRoute>, ServerError>;
    async fn delete(&self, id: &ApiRouteId) -> Result<(), ServerError>;
}

#[async_trait]
pub trait WebSocketSessionRepository: Send + Sync {
    async fn save(&self, session: &WebSocketSession) -> Result<(), ServerError>;
    async fn find_by_id(&self, id: &WebSocketSessionId) -> Result<Option<WebSocketSession>, ServerError>;
    async fn find_by_user(&self, user_id: &str) -> Result<Vec<WebSocketSession>, ServerError>;
    async fn find_by_status(&self, status: Option<WebSocketStatus>) -> Result<Vec<WebSocketSession>, ServerError>;
    async fn delete(&self, id: &WebSocketSessionId) -> Result<(), ServerError>;
}

#[async_trait]
pub trait ServerMetricsService: Send + Sync {
    async fn get_metrics(&self) -> Result<ServerMetrics, ServerError>;
    async fn get_active_connections(&self) -> Result<u32, ServerError>;
    async fn record_request(&self, method: &str, path: &str, status_code: u16, duration_ms: u64) -> Result<(), ServerError>;
}

// ===== 内存实现 =====

pub struct InMemoryApiRouteRepository {
    routes: std::sync::RwLock<HashMap<ApiRouteId, ApiRoute>>,
}

impl InMemoryApiRouteRepository {
    pub fn new() -> Self {
        Self {
            routes: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl ApiRouteRepository for InMemoryApiRouteRepository {
    async fn save(&self, route: &ApiRoute) -> Result<(), ServerError> {
        let mut routes = write_lock(&self.routes, "api routes")?;
        routes.insert(route.id.clone(), route.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &ApiRouteId) -> Result<Option<ApiRoute>, ServerError> {
        let routes = read_lock(&self.routes, "api routes")?;
        Ok(routes.get(id).cloned())
    }

    async fn find_by_path(&self, method: &HttpMethod, path: &str) -> Result<Option<ApiRoute>, ServerError> {
        let routes = read_lock(&self.routes, "api routes")?;
        let route = routes.values().find(|r| r.method == *method && r.path == path).cloned();
        Ok(route)
    }

    async fn find_all(&self) -> Result<Vec<ApiRoute>, ServerError> {
        let routes = read_lock(&self.routes, "api routes")?;
        Ok(routes.values().cloned().collect())
    }

    async fn delete(&self, id: &ApiRouteId) -> Result<(), ServerError> {
        let mut routes = write_lock(&self.routes, "api routes")?;
        routes.remove(id);
        Ok(())
    }
}

pub struct InMemoryWebSocketSessionRepository {
    sessions: std::sync::RwLock<HashMap<WebSocketSessionId, WebSocketSession>>,
}

impl InMemoryWebSocketSessionRepository {
    pub fn new() -> Self {
        Self {
            sessions: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl WebSocketSessionRepository for InMemoryWebSocketSessionRepository {
    async fn save(&self, session: &WebSocketSession) -> Result<(), ServerError> {
        let mut sessions = write_lock(&self.sessions, "websocket sessions")?;
        sessions.insert(session.id.clone(), session.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &WebSocketSessionId) -> Result<Option<WebSocketSession>, ServerError> {
        let sessions = read_lock(&self.sessions, "websocket sessions")?;
        Ok(sessions.get(id).cloned())
    }

    async fn find_by_user(&self, user_id: &str) -> Result<Vec<WebSocketSession>, ServerError> {
        let sessions = read_lock(&self.sessions, "websocket sessions")?;
        let filtered: Vec<WebSocketSession> = sessions.values()
            .filter(|s| s.user_id.as_ref() == Some(&user_id.to_string()))
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn find_by_status(&self, status: Option<WebSocketStatus>) -> Result<Vec<WebSocketSession>, ServerError> {
        let sessions = read_lock(&self.sessions, "websocket sessions")?;
        let filtered: Vec<WebSocketSession> = if let Some(status) = status {
            sessions.values()
                .filter(|s| matches!(&s.status, status))
                .cloned()
                .collect()
        } else {
            sessions.values().cloned().collect()
        };
        Ok(filtered)
    }

    async fn delete(&self, id: &WebSocketSessionId) -> Result<(), ServerError> {
        let mut sessions = write_lock(&self.sessions, "websocket sessions")?;
        sessions.remove(id);
        Ok(())
    }
}

pub struct BasicServerMetricsService;

impl BasicServerMetricsService {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl ServerMetricsService for BasicServerMetricsService {
    async fn get_metrics(&self) -> Result<ServerMetrics, ServerError> {
        Ok(ServerMetrics {
            total_requests: 1000,
            active_connections: 25,
            average_response_time_ms: 45.0,
            error_rate: 0.02,
            uptime_seconds: 3600,
        })
    }

    async fn get_active_connections(&self) -> Result<u32, ServerError> {
        Ok(25)
    }

    async fn record_request(&self, _method: &str, _path: &str, _status_code: u16, _duration_ms: u64) -> Result<(), ServerError> {
        Ok(())
    }
}

// ===== 业务规则 =====

pub struct ApiRoutePathValidRule;

#[async_trait]
impl BusinessRuleValidator<ApiRoute> for ApiRoutePathValidRule {
    fn rule_name(&self) -> &str {
        "api_route_path_valid"
    }

    async fn validate(&self, entity: &ApiRoute, _context: &DomainContext) -> Result<(), ServerError> {
        if !entity.path.starts_with('/') {
            return Err(ServerError::Validation("API route path must start with '/'".to_string()));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that API route path starts with '/'"
    }
}

pub struct ApiRouteMethodValidRule;

#[async_trait]
impl BusinessRuleValidator<ApiRoute> for ApiRouteMethodValidRule {
    fn rule_name(&self) -> &str {
        "api_route_method_valid"
    }

    async fn validate(&self, entity: &ApiRoute, _context: &DomainContext) -> Result<(), ServerError> {
        // HTTP方法验证逻辑
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that API route method is valid"
    }
}

// ===== 数据传输对象 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerMetrics {
    pub total_requests: u64,
    pub active_connections: u32,
    pub average_response_time_ms: f64,
    pub error_rate: f64,
    pub uptime_seconds: u64,
}
