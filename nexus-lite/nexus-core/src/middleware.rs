//! Middleware Architecture for Nexus Components
//!
//! Provides a composable middleware system for:
//! - Request/response processing
//! - Authentication and authorization
//! - Logging and monitoring
//! - Caching and performance optimization
//! - Error handling and recovery

use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::error::EngineError;
use crate::types::{BookItem, Chapter, TocItem, FetchResponse};

/// Middleware context for passing data between middleware components
#[derive(Debug, Clone)]
pub struct MiddlewareContext {
    pub request_id: String,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub user_context: Option<UserContext>,
}

/// User context for authentication and authorization
#[derive(Debug, Clone)]
pub struct UserContext {
    pub user_id: String,
    pub roles: Vec<String>,
    pub permissions: Vec<String>,
    pub session_id: Option<String>,
}

/// Middleware result type
pub type MiddlewareResult<T> = Result<T, EngineError>;

/// Core middleware trait
#[async_trait]
pub trait Middleware<TInput, TOutput>: Send + Sync {
    /// Process the input and return the output
    async fn process(&self, input: TInput, context: &mut MiddlewareContext) -> MiddlewareResult<TOutput>;

    /// Get middleware name
    fn name(&self) -> &str;

    /// Get middleware priority (lower numbers execute first)
    fn priority(&self) -> i32 { 100 }

    /// Check if middleware is enabled
    fn is_enabled(&self) -> bool { true }
}

/// Middleware chain for composing multiple middleware
pub struct MiddlewareChain<TInput, TOutput> {
    middlewares: Vec<Arc<dyn Middleware<TInput, TOutput>>>,
}

impl<TInput, TOutput> MiddlewareChain<TInput, TOutput> {
    pub fn new() -> Self {
        Self {
            middlewares: Vec::new(),
        }
    }

    /// Add middleware to the chain
    pub fn add_middleware<M: Middleware<TInput, TOutput> + 'static>(mut self, middleware: M) -> Self {
        self.middlewares.push(Arc::new(middleware));
        self.middlewares.sort_by_key(|m| m.priority());
        self
    }

    /// Execute the middleware chain
    pub async fn execute(&self, input: TInput, mut context: MiddlewareContext) -> MiddlewareResult<TOutput> {
        let mut current_input = input;

        for middleware in &self.middlewares {
            if middleware.is_enabled() {
                current_input = middleware.process(current_input, &mut context).await?;
            }
        }

        // This is a simplification - in practice, you'd need to handle the final transformation
        // For now, we'll assume TInput and TOutput are the same type
        // In a real implementation, you'd have a final processor
        Ok(current_input as TOutput)
    }
}

impl<TInput, TOutput> Default for MiddlewareChain<TInput, TOutput> {
    fn default() -> Self {
        Self::new()
    }
}

// ===== Specific Middleware Types =====

/// Authentication middleware
#[async_trait]
pub trait AuthMiddleware: Middleware<(), ()> {
    async fn authenticate(&self, context: &mut MiddlewareContext) -> MiddlewareResult<UserContext>;
}

/// Logging middleware
#[async_trait]
pub trait LoggingMiddleware<T>: Middleware<T, T> {
    async fn log_request(&self, input: &T, context: &MiddlewareContext) -> MiddlewareResult<()>;
    async fn log_response(&self, output: &T, context: &MiddlewareContext) -> MiddlewareResult<()>;
}

/// Caching middleware
#[async_trait]
pub trait CacheMiddleware<T>: Middleware<T, T> {
    async fn get_cached(&self, key: &str) -> MiddlewareResult<Option<T>>;
    async fn set_cached(&self, key: String, value: &T, ttl: u64) -> MiddlewareResult<()>;
    fn generate_cache_key(&self, input: &T) -> String;
}

/// Rate limiting middleware
#[async_trait]
pub trait RateLimitMiddleware<T>: Middleware<T, T> {
    async fn check_rate_limit(&self, context: &MiddlewareContext) -> MiddlewareResult<bool>;
    async fn record_request(&self, context: &MiddlewareContext) -> MiddlewareResult<()>;
}

/// Metrics middleware
#[async_trait]
pub trait MetricsMiddleware<T>: Middleware<T, T> {
    async fn record_metrics(&self, operation: &str, duration: u64, success: bool, context: &MiddlewareContext) -> MiddlewareResult<()>;
}

// ===== Concrete Middleware Implementations =====

/// Authentication middleware implementation
pub struct JwtAuthMiddleware {
    jwt_secret: String,
    enabled: bool,
}

impl JwtAuthMiddleware {
    pub fn new(jwt_secret: String) -> Self {
        Self {
            jwt_secret,
            enabled: true,
        }
    }
}

#[async_trait]
impl AuthMiddleware for JwtAuthMiddleware {
    async fn authenticate(&self, context: &mut MiddlewareContext) -> MiddlewareResult<UserContext> {
        // Extract JWT token from context metadata
        let token = context.metadata.get("authorization")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::Unauthorized)?;

        // TODO: Implement JWT validation
        // For now, return a mock user context
        let user_context = UserContext {
            user_id: "user123".to_string(),
            roles: vec!["user".to_string()],
            permissions: vec!["read".to_string()],
            session_id: Some("session123".to_string()),
        };

        context.user_context = Some(user_context.clone());
        Ok(user_context)
    }
}

#[async_trait]
impl Middleware<(), ()> for JwtAuthMiddleware {
    async fn process(&self, _input: (), context: &mut MiddlewareContext) -> MiddlewareResult<()> {
        if self.is_enabled() {
            self.authenticate(context).await?;
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "jwt_auth"
    }

    fn priority(&self) -> i32 {
        10 // High priority - run authentication early
    }

    fn is_enabled(&self) -> bool {
        self.enabled
    }
}

/// Logging middleware implementation
pub struct StructuredLoggingMiddleware;

impl StructuredLoggingMiddleware {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl<T> LoggingMiddleware<T> for StructuredLoggingMiddleware {
    async fn log_request(&self, input: &T, context: &MiddlewareContext) -> MiddlewareResult<()> {
        tracing::info!(
            request_id = %context.request_id,
            operation = "request",
            input_type = std::any::type_name::<T>(),
            metadata = ?context.metadata
        );
        Ok(())
    }

    async fn log_response(&self, output: &T, context: &MiddlewareContext) -> MiddlewareResult<()> {
        let duration = (chrono::Utc::now() - context.start_time).num_milliseconds();
        tracing::info!(
            request_id = %context.request_id,
            operation = "response",
            duration_ms = duration,
            output_type = std::any::type_name::<T>()
        );
        Ok(())
    }
}

#[async_trait]
impl<T> Middleware<T, T> for StructuredLoggingMiddleware {
    async fn process(&self, input: T, context: &mut MiddlewareContext) -> MiddlewareResult<T> {
        self.log_request(&input, context).await?;
        // In a real implementation, you'd process the input here
        let output = input; // For now, just pass through
        self.log_response(&output, context).await?;
        Ok(output)
    }

    fn name(&self) -> &str {
        "structured_logging"
    }

    fn priority(&self) -> i32 {
        1 // Very high priority - log everything
    }
}

/// Metrics middleware implementation
pub struct PrometheusMetricsMiddleware {
    registry: Arc<RwLock<HashMap<String, u64>>>,
}

impl PrometheusMetricsMiddleware {
    pub fn new() -> Self {
        Self {
            registry: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[async_trait]
impl<T> MetricsMiddleware<T> for PrometheusMetricsMiddleware {
    async fn record_metrics(&self, operation: &str, duration: u64, success: bool, context: &MiddlewareContext) -> MiddlewareResult<()> {
        let mut registry = self.registry.write().await;

        let success_key = format!("{}_success", operation);
        let failure_key = format!("{}_failure", operation);
        let duration_key = format!("{}_duration", operation);

        if success {
            *registry.entry(success_key).or_insert(0) += 1;
        } else {
            *registry.entry(failure_key).or_insert(0) += 1;
        }

        *registry.entry(duration_key).or_insert(0) += duration;

        tracing::debug!(
            operation = operation,
            duration_ms = duration,
            success = success,
            request_id = %context.request_id
        );

        Ok(())
    }
}

#[async_trait]
impl<T> Middleware<T, T> for PrometheusMetricsMiddleware {
    async fn process(&self, input: T, context: &mut MiddlewareContext) -> MiddlewareResult<T> {
        let start_time = chrono::Utc::now();

        // Process the input (in real implementation, this would be the actual operation)
        let output = input;

        let duration = (chrono::Utc::now() - start_time).num_milliseconds() as u64;
        let success = true; // In real implementation, check for errors

        self.record_metrics("middleware_operation", duration, success, context).await?;

        Ok(output)
    }

    fn name(&self) -> &str {
        "prometheus_metrics"
    }

    fn priority(&self) -> i32 {
        5 // High priority for metrics collection
    }
}

// ===== Middleware Pipeline Builder =====

/// Builder for creating middleware pipelines
pub struct MiddlewarePipelineBuilder<TInput, TOutput> {
    chain: MiddlewareChain<TInput, TOutput>,
}

impl<TInput, TOutput> MiddlewarePipelineBuilder<TInput, TOutput> {
    pub fn new() -> Self {
        Self {
            chain: MiddlewareChain::new(),
        }
    }

    /// Add authentication middleware
    pub fn with_auth(mut self, jwt_secret: String) -> Self {
        self.chain = self.chain.add_middleware(JwtAuthMiddleware::new(jwt_secret));
        self
    }

    /// Add logging middleware
    pub fn with_logging(mut self) -> Self {
        self.chain = self.chain.add_middleware(StructuredLoggingMiddleware);
        self
    }

    /// Add metrics middleware
    pub fn with_metrics(mut self) -> Self {
        self.chain = self.chain.add_middleware(PrometheusMetricsMiddleware::new());
        self
    }

    /// Add custom middleware
    pub fn with_custom<M: Middleware<TInput, TOutput> + 'static>(mut self, middleware: M) -> Self {
        self.chain = self.chain.add_middleware(middleware);
        self
    }

    /// Build the middleware pipeline
    pub fn build(self) -> MiddlewareChain<TInput, TOutput> {
        self.chain
    }
}

impl<TInput, TOutput> Default for MiddlewarePipelineBuilder<TInput, TOutput> {
    fn default() -> Self {
        Self::new()
    }
}

// ===== Usage Example =====

/// Example: Book search pipeline with authentication, logging, and metrics
pub fn create_book_search_pipeline(jwt_secret: String) -> MiddlewareChain<String, Vec<BookItem>> {
    MiddlewarePipelineBuilder::new()
        .with_auth(jwt_secret)
        .with_logging()
        .with_metrics()
        .build()
}

/// Example: Content fetch pipeline with caching and rate limiting
pub fn create_content_fetch_pipeline() -> MiddlewareChain<String, FetchResponse> {
    // Note: In a real implementation, you'd add caching and rate limiting middleware
    MiddlewarePipelineBuilder::new()
        .with_logging()
        .with_metrics()
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::runtime::Runtime;

    #[test]
    fn test_middleware_chain() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let pipeline = MiddlewarePipelineBuilder::<String, String>::new()
                .with_logging()
                .build();

            let mut context = MiddlewareContext {
                request_id: "test-123".to_string(),
                start_time: chrono::Utc::now(),
                metadata: HashMap::new(),
                user_context: None,
            };

            let result = pipeline.execute("test input".to_string(), context).await;
            assert!(result.is_ok());
        });
    }

    #[test]
    fn test_auth_middleware() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let auth = JwtAuthMiddleware::new("secret".to_string());
            assert_eq!(auth.name(), "jwt_auth");
            assert_eq!(auth.priority(), 10);
            assert!(auth.is_enabled());
        });
    }
}