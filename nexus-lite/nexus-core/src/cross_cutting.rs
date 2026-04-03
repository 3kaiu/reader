//! 跨切关注点 (Cross-Cutting Concerns)
//!
//! 这是架构中的跨切关注点层，负责处理跨越多个模块的通用功能。
//! 跨切关注点包括日志、缓存、安全、配置、监控、异常处理等。
//!
//! 跨切关注点设计原则：
//! - 关注点分离：将通用功能从业务逻辑中分离
//! - 可重用性：提供可重用的组件和服务
//! - 非侵入性：不影响核心业务逻辑
//! - 可配置性：支持灵活的配置和扩展

/// 跨切关注点通用接口和类型
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{Level, Span};

/// 拦截器接口 - 用于AOP风格的横切处理
#[async_trait]
pub trait Interceptor: Send + Sync {
    /// 方法执行前拦截
    async fn before(&self, context: &mut InterceptorContext) -> Result<(), InterceptorError>;

    /// 方法执行后拦截
    async fn after(
        &self,
        context: &mut InterceptorContext,
        result: &mut InterceptorResult,
    ) -> Result<(), InterceptorError>;

    /// 异常发生时拦截
    async fn on_error(
        &self,
        context: &mut InterceptorContext,
        error: &mut InterceptorError,
    ) -> Result<(), InterceptorError>;
}

/// 拦截器上下文
#[derive(Debug, Clone)]
pub struct InterceptorContext {
    pub target_type: String,
    pub method_name: String,
    pub parameters: HashMap<String, serde_json::Value>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub start_time: DateTime<Utc>,
    pub span: Option<Span>,
}

/// 拦截器结果
#[derive(Debug, Clone)]
pub struct InterceptorResult {
    pub return_value: Option<serde_json::Value>,
    pub execution_time_ms: u64,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// 拦截器错误
#[derive(Debug, Clone)]
pub enum InterceptorError {
    ValidationFailed(String),
    SecurityViolation(String),
    RateLimitExceeded(String),
    CircuitBreakerOpen(String),
    Custom(String),
}

/// 切面织入器 - 负责将拦截器织入到目标方法
pub struct AspectWeaver {
    interceptors: Vec<Box<dyn Interceptor>>,
}

impl AspectWeaver {
    pub fn new() -> Self {
        Self {
            interceptors: Vec::new(),
        }
    }

    /// 添加拦截器
    pub fn add_interceptor(&mut self, interceptor: Box<dyn Interceptor>) {
        self.interceptors.push(interceptor);
    }

    /// 执行带拦截器的操作
    pub async fn execute_with_interceptors<F, Fut, T>(
        &self,
        target_type: &str,
        method_name: &str,
        parameters: HashMap<String, serde_json::Value>,
        operation: F,
    ) -> Result<T, InterceptorError>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<T, InterceptorError>>,
    {
        let mut context = InterceptorContext {
            target_type: target_type.to_string(),
            method_name: method_name.to_string(),
            parameters,
            metadata: HashMap::new(),
            start_time: Utc::now(),
            span: None,
        };

        // 执行前拦截
        for interceptor in &self.interceptors {
            interceptor.before(&mut context).await?;
        }

        // 执行目标操作
        let result = operation().await;

        let mut interceptor_result = match &result {
            Ok(_) => InterceptorResult {
                return_value: None,
                execution_time_ms: (Utc::now() - context.start_time).num_milliseconds() as u64,
                metadata: HashMap::new(),
            },
            Err(_) => InterceptorResult {
                return_value: None,
                execution_time_ms: (Utc::now() - context.start_time).num_milliseconds() as u64,
                metadata: HashMap::new(),
            },
        };

        match result {
            Ok(value) => {
                // 执行后拦截
                for interceptor in &self.interceptors {
                    interceptor
                        .after(&mut context, &mut interceptor_result)
                        .await?;
                }
                Ok(value)
            },
            Err(mut error) => {
                // 异常拦截
                for interceptor in &self.interceptors {
                    interceptor.on_error(&mut context, &mut error).await?;
                }
                Err(error)
            },
        }
    }
}

/// 性能监控拦截器
pub struct PerformanceMonitoringInterceptor {
    metrics_collector: Arc<dyn crate::infrastructure::MetricsCollector>,
}

impl PerformanceMonitoringInterceptor {
    pub fn new(metrics_collector: Arc<dyn crate::infrastructure::MetricsCollector>) -> Self {
        Self { metrics_collector }
    }
}

#[async_trait]
impl Interceptor for PerformanceMonitoringInterceptor {
    async fn before(&self, context: &mut InterceptorContext) -> Result<(), InterceptorError> {
        context
            .metadata
            .insert("start_time".to_string(), serde_json::json!(Utc::now().timestamp_millis()));
        Ok(())
    }

    async fn after(
        &self,
        context: &mut InterceptorContext,
        result: &mut InterceptorResult,
    ) -> Result<(), InterceptorError> {
        let labels = HashMap::from([
            ("target_type".to_string(), context.target_type.clone()),
            ("method_name".to_string(), context.method_name.clone()),
        ]);

        // 记录执行时间
        self.metrics_collector
            .record_histogram(
                "method_execution_time",
                result.execution_time_ms as f64,
                labels.clone(),
            )
            .await
            .map_err(|e| InterceptorError::Custom(e.to_string()))?;

        // 记录调用计数
        self.metrics_collector
            .increment_counter("method_calls_total", 1, labels)
            .await
            .map_err(|e| InterceptorError::Custom(e.to_string()))?;

        Ok(())
    }

    async fn on_error(
        &self,
        context: &mut InterceptorContext,
        error: &mut InterceptorError,
    ) -> Result<(), InterceptorError> {
        let labels = HashMap::from([
            ("target_type".to_string(), context.target_type.clone()),
            ("method_name".to_string(), context.method_name.clone()),
            ("error_type".to_string(), format!("{:?}", error)),
        ]);

        // 记录错误计数
        self.metrics_collector
            .increment_counter("method_errors_total", 1, labels.clone())
            .await
            .map_err(|e| InterceptorError::Custom(e.to_string()))?;

        Ok(())
    }
}

/// 安全拦截器
pub struct SecurityInterceptor {
    security_service: Arc<dyn crate::application::SecurityService>,
}

impl SecurityInterceptor {
    pub fn new(security_service: Arc<dyn crate::application::SecurityService>) -> Self {
        Self { security_service }
    }
}

#[async_trait]
impl Interceptor for SecurityInterceptor {
    async fn before(&self, context: &mut InterceptorContext) -> Result<(), InterceptorError> {
        // 验证权限
        if let Some(user_id) = context.metadata.get("user_id").and_then(|v| v.as_str()) {
            let permission = format!("{}.{}", context.target_type, context.method_name);
            match self
                .security_service
                .validate_permission(user_id, &permission)
                .await
            {
                Ok(true) => Ok(()),
                Ok(false) => Err(InterceptorError::SecurityViolation(format!(
                    "Permission denied: {}",
                    permission
                ))),
                Err(e) => Err(InterceptorError::Custom(format!("Security check failed: {:?}", e))),
            }
        } else {
            Err(InterceptorError::SecurityViolation("User not authenticated".to_string()))
        }
    }

    async fn after(
        &self,
        _context: &mut InterceptorContext,
        _result: &mut InterceptorResult,
    ) -> Result<(), InterceptorError> {
        Ok(())
    }

    async fn on_error(
        &self,
        _context: &mut InterceptorContext,
        _error: &mut InterceptorError,
    ) -> Result<(), InterceptorError> {
        Ok(())
    }
}

/// 缓存拦截器
pub struct CachingInterceptor {
    cache_manager: Arc<dyn crate::application::CacheManager>,
    cache_key_prefix: String,
}

impl CachingInterceptor {
    pub fn new(
        cache_manager: Arc<dyn crate::application::CacheManager>,
        cache_key_prefix: String,
    ) -> Self {
        Self {
            cache_manager,
            cache_key_prefix,
        }
    }

    fn generate_cache_key(&self, context: &InterceptorContext) -> String {
        let params_hash = serde_json::to_string(&context.parameters).unwrap_or_default();
        format!("{}:{}:{}", self.cache_key_prefix, context.method_name, params_hash)
    }
}

#[async_trait]
impl Interceptor for CachingInterceptor {
    async fn before(&self, context: &mut InterceptorContext) -> Result<(), InterceptorError> {
        // 对于查询方法，尝试从缓存获取结果
        if context.method_name.contains("query") || context.method_name.contains("get") {
            let cache_key = self.generate_cache_key(context);
            if let Ok(Some(cached_result)) = self.cache_manager.get(&cache_key).await {
                context
                    .metadata
                    .insert("cached_result".to_string(), cached_result);
            }
        }
        Ok(())
    }

    async fn after(
        &self,
        context: &mut InterceptorContext,
        result: &mut InterceptorResult,
    ) -> Result<(), InterceptorError> {
        // 对于查询方法，将结果存入缓存
        if context.method_name.contains("query") || context.method_name.contains("get") {
            if let Some(return_value) = &result.return_value {
                let cache_key = self.generate_cache_key(context);
                let ttl_seconds = Some(300u64); // 5分钟TTL
                self.cache_manager
                    .set(&cache_key, return_value.clone(), ttl_seconds)
                    .await
                    .map_err(|e| {
                        InterceptorError::Custom(format!("Cache write failed: {:?}", e))
                    })?;
            }
        }
        Ok(())
    }

    async fn on_error(
        &self,
        _context: &mut InterceptorContext,
        _error: &mut InterceptorError,
    ) -> Result<(), InterceptorError> {
        Ok(())
    }
}

/// 日志拦截器
pub struct LoggingInterceptor {
    log_level: Level,
}

impl LoggingInterceptor {
    pub fn new(log_level: Level) -> Self {
        Self { log_level }
    }
}

#[async_trait]
impl Interceptor for LoggingInterceptor {
    async fn before(&self, context: &mut InterceptorContext) -> Result<(), InterceptorError> {
        match self.log_level {
            Level::TRACE => {
                tracing::trace!(target = %context.target_type, method = %context.method_name, parameters = ?context.parameters, "Method execution started")
            },
            Level::DEBUG => {
                tracing::debug!(target = %context.target_type, method = %context.method_name, parameters = ?context.parameters, "Method execution started")
            },
            Level::INFO => {
                tracing::info!(target = %context.target_type, method = %context.method_name, parameters = ?context.parameters, "Method execution started")
            },
            Level::WARN => {
                tracing::warn!(target = %context.target_type, method = %context.method_name, parameters = ?context.parameters, "Method execution started")
            },
            Level::ERROR => {
                tracing::error!(target = %context.target_type, method = %context.method_name, parameters = ?context.parameters, "Method execution started")
            },
        }
        Ok(())
    }

    async fn after(
        &self,
        context: &mut InterceptorContext,
        result: &mut InterceptorResult,
    ) -> Result<(), InterceptorError> {
        match self.log_level {
            Level::TRACE => {
                tracing::trace!(target = %context.target_type, method = %context.method_name, execution_time_ms = result.execution_time_ms, "Method execution completed")
            },
            Level::DEBUG => {
                tracing::debug!(target = %context.target_type, method = %context.method_name, execution_time_ms = result.execution_time_ms, "Method execution completed")
            },
            Level::INFO => {
                tracing::info!(target = %context.target_type, method = %context.method_name, execution_time_ms = result.execution_time_ms, "Method execution completed")
            },
            Level::WARN => {
                tracing::warn!(target = %context.target_type, method = %context.method_name, execution_time_ms = result.execution_time_ms, "Method execution completed")
            },
            Level::ERROR => {
                tracing::error!(target = %context.target_type, method = %context.method_name, execution_time_ms = result.execution_time_ms, "Method execution completed")
            },
        }
        Ok(())
    }

    async fn on_error(
        &self,
        context: &mut InterceptorContext,
        error: &mut InterceptorError,
    ) -> Result<(), InterceptorError> {
        tracing::event!(
            Level::ERROR,
            target = &context.target_type,
            method = &context.method_name,
            error = ?error,
            "Method execution failed"
        );
        Ok(())
    }
}

/// 验证拦截器
pub struct ValidationInterceptor {
    _validator: Arc<dyn RequestValidator>,
}

impl ValidationInterceptor {
    pub fn new(validator: Arc<dyn RequestValidator>) -> Self {
        Self {
            _validator: validator,
        }
    }
}

#[async_trait]
impl Interceptor for ValidationInterceptor {
    async fn before(&self, context: &mut InterceptorContext) -> Result<(), InterceptorError> {
        // 验证输入参数
        if let Some(_params) = context.parameters.get("request_body") {
            // 这里可以添加具体的验证逻辑
            // 例如：JSON Schema验证、业务规则验证等
        }
        Ok(())
    }

    async fn after(
        &self,
        _context: &mut InterceptorContext,
        _result: &mut InterceptorResult,
    ) -> Result<(), InterceptorError> {
        Ok(())
    }

    async fn on_error(
        &self,
        _context: &mut InterceptorContext,
        _error: &mut InterceptorError,
    ) -> Result<(), InterceptorError> {
        Ok(())
    }
}

/// 审计拦截器
pub struct AuditInterceptor {
    audit_service: Arc<dyn AuditService>,
}

impl AuditInterceptor {
    pub fn new(audit_service: Arc<dyn AuditService>) -> Self {
        Self { audit_service }
    }
}

#[async_trait]
impl Interceptor for AuditInterceptor {
    async fn before(&self, context: &mut InterceptorContext) -> Result<(), InterceptorError> {
        // 记录审计信息
        let audit_entry = AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            user_id: context
                .metadata
                .get("user_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            action: format!("{}.{}", context.target_type, context.method_name),
            resource: context
                .parameters
                .get("resource_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            details: context.parameters.clone(),
            ip_address: context
                .metadata
                .get("ip_address")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            user_agent: context
                .metadata
                .get("user_agent")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            success: None, // 会在after中设置
        };

        context
            .metadata
            .insert("audit_id".to_string(), serde_json::json!(audit_entry.id.clone()));
        self.audit_service
            .record_audit_entry(audit_entry)
            .await
            .map_err(|e| InterceptorError::Custom(format!("Audit recording failed: {:?}", e)))?;

        Ok(())
    }

    async fn after(
        &self,
        context: &mut InterceptorContext,
        _result: &mut InterceptorResult,
    ) -> Result<(), InterceptorError> {
        // 更新审计记录的状态
        if let Some(audit_id) = context.metadata.get("audit_id").and_then(|v| v.as_str()) {
            self.audit_service
                .update_audit_entry_success(audit_id, true)
                .await
                .map_err(|e| InterceptorError::Custom(format!("Audit update failed: {:?}", e)))?;
        }
        Ok(())
    }

    async fn on_error(
        &self,
        context: &mut InterceptorContext,
        _error: &mut InterceptorError,
    ) -> Result<(), InterceptorError> {
        // 更新审计记录为失败状态
        if let Some(audit_id) = context.metadata.get("audit_id").and_then(|v| v.as_str()) {
            self.audit_service
                .update_audit_entry_success(audit_id, false)
                .await
                .map_err(|e| InterceptorError::Custom(format!("Audit update failed: {:?}", e)))?;
        }
        Ok(())
    }
}

/// 跨切关注点初始化函数
pub async fn init_cross_cutting_concerns() -> Result<AspectWeaver, CrossCuttingError> {
    let mut weaver = AspectWeaver::new();

    // 初始化各个拦截器
    // 注意：这里需要实际的基础设施组件，在实际项目中需要注入

    // 添加日志拦截器
    weaver.add_interceptor(Box::new(LoggingInterceptor::new(Level::INFO)));

    // 这里可以继续添加其他拦截器：
    // - PerformanceMonitoringInterceptor
    // - SecurityInterceptor
    // - CachingInterceptor
    // - ValidationInterceptor
    // - AuditInterceptor

    Ok(weaver)
}

/// 请求验证器接口（已在presentation.rs中定义，这里引用）
pub use crate::presentation::RequestValidator;

/// 审计服务接口
#[async_trait]
pub trait AuditService: Send + Sync {
    /// 记录审计条目
    async fn record_audit_entry(&self, entry: AuditEntry) -> Result<(), CrossCuttingError>;

    /// 更新审计条目成功状态
    async fn update_audit_entry_success(
        &self,
        audit_id: &str,
        success: bool,
    ) -> Result<(), CrossCuttingError>;

    /// 查询审计日志
    async fn query_audit_log(
        &self,
        query: AuditQuery,
    ) -> Result<Vec<AuditEntry>, CrossCuttingError>;
}

/// 审计条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub user_id: Option<String>,
    pub action: String,
    pub resource: Option<String>,
    pub details: HashMap<String, serde_json::Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub success: Option<bool>,
}

/// 审计查询
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditQuery {
    pub user_id: Option<String>,
    pub action: Option<String>,
    pub resource: Option<String>,
    pub start_time: Option<DateTime<Utc>>,
    pub end_time: Option<DateTime<Utc>>,
    pub success: Option<bool>,
    pub limit: Option<u32>,
}

/// 跨切关注点错误
#[derive(Debug, Clone)]
pub enum CrossCuttingError {
    Logging(String),
    Caching(String),
    Security(String),
    Configuration(String),
    Monitoring(String),
    Validation(String),
    Audit(String),
    Interceptor(String),
}
