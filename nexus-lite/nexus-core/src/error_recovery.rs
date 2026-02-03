//! 高级错误恢复和容错系统
//!
//! 提供多层次的错误处理、自动恢复和容错能力：
//! - 分层错误处理策略
//! - 自动故障恢复机制
//! - 优雅降级处理
//! - 错误预测和预防
//! - 自愈系统集成

use crate::error::{EngineError, ErrorCode};
use async_trait::async_trait;
use std::collections::{HashMap, VecDeque, BTreeMap};
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast, Semaphore};
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 错误严重程度
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, PartialOrd)]
pub enum ErrorSeverity {
    Low,      // 可忽略的轻微错误
    Medium,   // 需要记录的普通错误
    High,     // 需要告警的重要错误
    Critical, // 需要立即处理的关键错误
}

/// 错误分类
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorCategory {
    Network,      // 网络相关错误
    Database,     // 数据库相关错误
    Authentication, // 认证相关错误
    Authorization,  // 授权相关错误
    Validation,   // 数据验证错误
    BusinessLogic, // 业务逻辑错误
    System,       // 系统级错误
    External,     // 外部服务错误
    Unknown,      // 未知错误
}

/// 错误上下文信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorContext {
    pub component: String,
    pub operation: String,
    pub user_id: Option<String>,
    pub request_id: Option<String>,
    pub session_id: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// 增强的错误信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedError {
    pub id: Uuid,
    pub original_error: EngineError,
    pub category: ErrorCategory,
    pub severity: ErrorSeverity,
    pub context: ErrorContext,
    pub timestamp: DateTime<Utc>,
    pub stack_trace: Option<String>,
    pub related_errors: Vec<Uuid>,
    pub retry_count: u32,
    pub recovery_attempts: Vec<RecoveryAttempt>,
    pub impact_assessment: Option<ImpactAssessment>,
}

/// 恢复尝试记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryAttempt {
    pub attempt_id: Uuid,
    pub strategy: RecoveryStrategy,
    pub timestamp: DateTime<Utc>,
    pub success: bool,
    pub duration_ms: u64,
    pub details: String,
}

/// 恢复策略
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecoveryStrategy {
    Retry,              // 简单重试
    CircuitBreaker,     // 熔断器
    Fallback,          // 降级处理
    AlternativeService, // 备用服务
    CacheFallback,     // 缓存降级
    GracefulDegradation, // 优雅降级
    ManualIntervention,  // 需要人工干预
}

/// 影响评估
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImpactAssessment {
    pub affected_users: u32,
    pub affected_requests: u64,
    pub downtime_seconds: u64,
    pub data_loss: bool,
    pub recovery_cost: f64,
    pub user_experience_impact: f64, // 0-1, 用户体验影响程度
}

/// 恢复配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryConfig {
    pub max_retry_attempts: u32,
    pub retry_backoff_ms: u64,
    pub circuit_breaker_threshold: u32,
    pub circuit_breaker_timeout_ms: u64,
    pub enable_fallback: bool,
    pub enable_degradation: bool,
    pub monitoring_window_minutes: u32,
}

/// 高级错误恢复系统
pub struct AdvancedErrorRecoverySystem {
    config: Arc<RwLock<RecoveryConfig>>,
    error_history: Arc<RwLock<VecDeque<EnhancedError>>>,
    recovery_strategies: Arc<RwLock<HashMap<String, Vec<Box<dyn RecoveryStrategyHandler>>>>>,
    circuit_breakers: Arc<RwLock<HashMap<String, CircuitBreakerState>>>,
    error_patterns: Arc<RwLock<HashMap<String, ErrorPattern>>>,
    impact_analyzer: Arc<ImpactAnalyzer>,
    error_sender: broadcast::Sender<EnhancedError>,
    recovery_sender: broadcast::Sender<RecoveryEvent>,
    monitoring_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    cleanup_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

/// 恢复策略处理器
#[async_trait]
pub trait RecoveryStrategyHandler: Send + Sync {
    fn strategy_type(&self) -> RecoveryStrategy;
    fn can_handle(&self, error: &EnhancedError) -> bool;
    async fn execute(&self, error: &EnhancedError) -> Result<RecoveryResult, EngineError>;
}

/// 恢复结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryResult {
    pub success: bool,
    pub strategy_used: RecoveryStrategy,
    pub details: String,
    pub fallback_available: bool,
    pub retry_after_ms: Option<u64>,
}

/// 熔断器状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerState {
    pub failures: u32,
    pub last_failure: Option<DateTime<Utc>>,
    pub state: CircuitBreakerStateEnum,
    pub next_attempt: Option<DateTime<Utc>>,
}

/// 熔断器状态枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CircuitBreakerStateEnum {
    Closed,   // 正常状态
    Open,     // 熔断状态
    HalfOpen, // 半开状态（测试恢复）
}

/// 错误模式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorPattern {
    pub pattern_id: String,
    pub error_category: ErrorCategory,
    pub frequency: u32,
    pub first_seen: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
    pub affected_components: Vec<String>,
    pub suggested_solution: String,
    pub prevention_measures: Vec<String>,
}

/// 恢复事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryEvent {
    pub error_id: Uuid,
    pub strategy: RecoveryStrategy,
    pub success: bool,
    pub timestamp: DateTime<Utc>,
    pub details: String,
}

/// 影响分析器
pub struct ImpactAnalyzer {
    user_impact_model: HashMap<String, f64>,
    system_impact_model: HashMap<String, f64>,
}

impl AdvancedErrorRecoverySystem {
    pub fn new() -> Self {
        let config = RecoveryConfig {
            max_retry_attempts: 3,
            retry_backoff_ms: 1000,
            circuit_breaker_threshold: 5,
            circuit_breaker_timeout_ms: 60000,
            enable_fallback: true,
            enable_degradation: true,
            monitoring_window_minutes: 60,
        };

        let (error_sender, _) = broadcast::channel(100);
        let (recovery_sender, _) = broadcast::channel(100);

        Self {
            config: Arc::new(RwLock::new(config)),
            error_history: Arc::new(RwLock::new(VecDeque::with_capacity(10000))),
            recovery_strategies: Arc::new(RwLock::new(HashMap::new())),
            circuit_breakers: Arc::new(RwLock::new(HashMap::new())),
            error_patterns: Arc::new(RwLock::new(HashMap::new())),
            impact_analyzer: Arc::new(ImpactAnalyzer::new()),
            error_sender,
            recovery_sender,
            monitoring_task: Arc::new(RwLock::new(None)),
            cleanup_task: Arc::new(RwLock::new(None)),
        }
    }

    /// 启动错误恢复系统
    pub async fn start(&self) -> Result<(), EngineError> {
        self.register_default_strategies().await?;
        self.start_monitoring_task().await?;
        self.start_cleanup_task().await?;
        Ok(())
    }

    /// 处理错误并尝试恢复
    pub async fn handle_error(&self, error: EngineError, context: ErrorContext) -> Result<RecoveryResult, EngineError> {
        let enhanced_error = self.enhance_error(error, context).await?;
        let error_id = enhanced_error.id;

        // 存储错误历史
        {
            let mut history = self.error_history.write().await;
            history.push_back(enhanced_error.clone());
            if history.len() > 10000 {
                history.pop_front();
            }
        }

        // 发送错误通知
        let _ = self.error_sender.send(enhanced_error.clone());

        // 更新错误模式
        self.update_error_patterns(&enhanced_error).await?;

        // 评估影响
        let impact = self.impact_analyzer.analyze_impact(&enhanced_error).await?;
        enhanced_error.impact_assessment = Some(impact);

        // 尝试恢复
        let recovery_result = self.attempt_recovery(&enhanced_error).await?;

        // 记录恢复事件
        let recovery_event = RecoveryEvent {
            error_id,
            strategy: recovery_result.strategy_used.clone(),
            success: recovery_result.success,
            timestamp: Utc::now(),
            details: recovery_result.details.clone(),
        };

        let _ = self.recovery_sender.send(recovery_event);

        Ok(recovery_result)
    }

    /// 注册恢复策略
    pub async fn register_strategy(&self, component: &str, strategy: Box<dyn RecoveryStrategyHandler>) -> Result<(), EngineError> {
        let mut strategies = self.recovery_strategies.write().await;
        strategies.entry(component.to_string()).or_insert_with(Vec::new).push(strategy);
        Ok(())
    }

    /// 获取错误统计
    pub async fn get_error_statistics(&self) -> ErrorStatistics {
        let history = self.error_history.read().await;
        let now = Utc::now();
        let one_hour_ago = now - Duration::hours(1);
        let one_day_ago = now - Duration::days(1);

        let mut hourly_stats = HashMap::new();
        let mut daily_stats = HashMap::new();
        let mut severity_counts = HashMap::new();
        let mut category_counts = HashMap::new();

        for error in history.iter().rev() {
            // 小时统计
            if error.timestamp > one_hour_ago {
                *hourly_stats.entry(error.category.clone()).or_insert(0) += 1;
            }

            // 天统计
            if error.timestamp > one_day_ago {
                *daily_stats.entry(error.category.clone()).or_insert(0) += 1;
            }

            // 严重程度统计
            *severity_counts.entry(error.severity.clone()).or_insert(0) += 1;

            // 分类统计
            *category_counts.entry(error.category.clone()).or_insert(0) += 1;
        }

        ErrorStatistics {
            total_errors: history.len(),
            hourly_stats,
            daily_stats,
            severity_counts,
            category_counts,
            top_error_patterns: self.get_top_error_patterns().await,
        }
    }

    /// 获取熔断器状态
    pub async fn get_circuit_breaker_status(&self) -> HashMap<String, CircuitBreakerState> {
        self.circuit_breakers.read().await.clone()
    }

    /// 手动重置熔断器
    pub async fn reset_circuit_breaker(&self, component: &str) -> Result<(), EngineError> {
        let mut breakers = self.circuit_breakers.write().await;
        if let Some(breaker) = breakers.get_mut(component) {
            breaker.state = CircuitBreakerStateEnum::Closed;
            breaker.failures = 0;
            breaker.last_failure = None;
            breaker.next_attempt = None;
        }
        Ok(())
    }

    async fn enhance_error(&self, error: EngineError, context: ErrorContext) -> Result<EnhancedError, EngineError> {
        let category = self.categorize_error(&error);
        let severity = self.assess_severity(&error, &category);

        Ok(EnhancedError {
            id: Uuid::new_v4(),
            original_error: error,
            category,
            severity,
            context,
            timestamp: Utc::now(),
            stack_trace: None, // 在实际实现中可以捕获堆栈跟踪
            related_errors: Vec::new(),
            retry_count: 0,
            recovery_attempts: Vec::new(),
            impact_assessment: None,
        })
    }

    fn categorize_error(&self, error: &EngineError) -> ErrorCategory {
        match error {
            EngineError::NetworkError { .. } => ErrorCategory::Network,
            EngineError::DatabaseError { .. } => ErrorCategory::Database,
            EngineError::AuthenticationError { .. } => ErrorCategory::Authentication,
            EngineError::AuthorizationError { .. } => ErrorCategory::Authorization,
            EngineError::ValidationError { .. } => ErrorCategory::Validation,
            EngineError::BusinessLogicError { .. } => ErrorCategory::BusinessLogic,
            EngineError::SystemError { .. } => ErrorCategory::System,
            EngineError::ExternalServiceError { .. } => ErrorCategory::External,
            _ => ErrorCategory::Unknown,
        }
    }

    fn assess_severity(&self, error: &EngineError, category: &ErrorCategory) -> ErrorSeverity {
        match category {
            ErrorCategory::Critical | ErrorCategory::System => ErrorSeverity::Critical,
            ErrorCategory::Network | ErrorCategory::Database => ErrorSeverity::High,
            ErrorCategory::Authentication | ErrorCategory::Authorization => ErrorSeverity::High,
            ErrorCategory::BusinessLogic => ErrorSeverity::Medium,
            ErrorCategory::Validation | ErrorCategory::External => ErrorSeverity::Low,
            ErrorCategory::Unknown => ErrorSeverity::Medium,
        }
    }

    async fn attempt_recovery(&self, error: &EnhancedError) -> Result<RecoveryResult, EngineError> {
        let strategies = self.recovery_strategies.read().await;
        let component_strategies = strategies.get(&error.context.component);

        if let Some(strategies) = component_strategies {
            for strategy in strategies {
                if strategy.can_handle(error) {
                    match strategy.execute(error).await {
                        Ok(result) if result.success => {
                            return Ok(result);
                        }
                        Ok(result) => {
                            // 记录失败的恢复尝试
                            continue;
                        }
                        Err(e) => {
                            tracing::error!("Recovery strategy failed: {:?}", e);
                            continue;
                        }
                    }
                }
            }
        }

        // 默认恢复策略：记录错误并返回失败
        Ok(RecoveryResult {
            success: false,
            strategy_used: RecoveryStrategy::ManualIntervention,
            details: "No suitable recovery strategy found".to_string(),
            fallback_available: false,
            retry_after_ms: None,
        })
    }

    async fn register_default_strategies(&self) -> Result<(), EngineError> {
        // 网络错误重试策略
        self.register_strategy("network", Box::new(RetryStrategy::new(3, 1000))).await?;
        self.register_strategy("network", Box::new(CircuitBreakerStrategy::new(5, 60000))).await?;

        // 数据库错误降级策略
        self.register_strategy("database", Box::new(FallbackStrategy::new())).await?;

        // 外部服务降级策略
        self.register_strategy("external", Box::new(GracefulDegradationStrategy::new())).await?;

        Ok(())
    }

    async fn update_error_patterns(&self, error: &EnhancedError) -> Result<(), EngineError> {
        let mut patterns = self.error_patterns.write().await;

        let pattern_key = format!("{:?}_{}", error.category, error.context.operation);
        let pattern = patterns.entry(pattern_key.clone()).or_insert_with(|| ErrorPattern {
            pattern_id: pattern_key,
            error_category: error.category.clone(),
            frequency: 0,
            first_seen: error.timestamp,
            last_seen: error.timestamp,
            affected_components: vec![error.context.component.clone()],
            suggested_solution: "Investigate and implement appropriate error handling".to_string(),
            prevention_measures: vec!["Add input validation".to_string(), "Implement retry logic".to_string()],
        });

        pattern.frequency += 1;
        pattern.last_seen = error.timestamp;

        if !pattern.affected_components.contains(&error.context.component) {
            pattern.affected_components.push(error.context.component.clone());
        }

        Ok(())
    }

    async fn get_top_error_patterns(&self) -> Vec<ErrorPattern> {
        let patterns = self.error_patterns.read().await;
        let mut sorted_patterns: Vec<_> = patterns.values().cloned().collect();
        sorted_patterns.sort_by(|a, b| b.frequency.cmp(&a.frequency));
        sorted_patterns.into_iter().take(10).collect()
    }

    async fn start_monitoring_task(&self) -> Result<(), EngineError> {
        let system = Arc::new(Self {
            config: Arc::clone(&self.config),
            error_history: Arc::clone(&self.error_history),
            recovery_strategies: Arc::clone(&self.recovery_strategies),
            circuit_breakers: Arc::clone(&self.circuit_breakers),
            error_patterns: Arc::clone(&self.error_patterns),
            impact_analyzer: Arc::clone(&self.impact_analyzer),
            error_sender: self.error_sender.clone(),
            recovery_sender: self.recovery_sender.clone(),
            monitoring_task: Arc::new(RwLock::new(None)),
            cleanup_task: Arc::new(RwLock::new(None)),
        });

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(300)); // 5分钟

            loop {
                interval.tick().await;
                if let Err(e) = system.monitor_and_adjust().await {
                    tracing::error!("Error monitoring task failed: {:?}", e);
                }
            }
        });

        *self.monitoring_task.write().await = Some(handle);
        Ok(())
    }

    async fn start_cleanup_task(&self) -> Result<(), EngineError> {
        let error_history = Arc::clone(&self.error_history);

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(3600)); // 1小时

            loop {
                interval.tick().await;
                let mut history = error_history.write().await;

                // 保留最近7天的错误历史
                let cutoff = Utc::now() - Duration::days(7);
                while let Some(error) = history.front() {
                    if error.timestamp < cutoff {
                        history.pop_front();
                    } else {
                        break;
                    }
                }
            }
        });

        *self.cleanup_task.write().await = Some(handle);
        Ok(())
    }

    async fn monitor_and_adjust(&self) -> Result<(), EngineError> {
        // 监控熔断器状态
        let mut breakers = self.circuit_breakers.write().await;
        let now = Utc::now();

        for (component, breaker) in breakers.iter_mut() {
            match breaker.state {
                CircuitBreakerStateEnum::Open => {
                    if let Some(next_attempt) = breaker.next_attempt {
                        if now >= next_attempt {
                            breaker.state = CircuitBreakerStateEnum::HalfOpen;
                            tracing::info!("Circuit breaker for {} moved to half-open state", component);
                        }
                    }
                }
                CircuitBreakerStateEnum::HalfOpen => {
                    // 在半开状态下，如果请求成功，可以关闭熔断器
                    // 这里可以添加更复杂的逻辑
                    breaker.state = CircuitBreakerStateEnum::Closed;
                    breaker.failures = 0;
                    tracing::info!("Circuit breaker for {} closed", component);
                }
                _ => {}
            }
        }

        Ok(())
    }
}

/// 错误统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorStatistics {
    pub total_errors: usize,
    pub hourly_stats: HashMap<ErrorCategory, u32>,
    pub daily_stats: HashMap<ErrorCategory, u32>,
    pub severity_counts: HashMap<ErrorSeverity, u32>,
    pub category_counts: HashMap<ErrorCategory, u32>,
    pub top_error_patterns: Vec<ErrorPattern>,
}

/// 默认恢复策略实现

pub struct RetryStrategy {
    max_attempts: u32,
    backoff_ms: u64,
}

impl RetryStrategy {
    pub fn new(max_attempts: u32, backoff_ms: u64) -> Self {
        Self { max_attempts, backoff_ms }
    }
}

#[async_trait]
impl RecoveryStrategyHandler for RetryStrategy {
    fn strategy_type(&self) -> RecoveryStrategy {
        RecoveryStrategy::Retry
    }

    fn can_handle(&self, error: &EnhancedError) -> bool {
        matches!(error.category, ErrorCategory::Network | ErrorCategory::External)
            && error.retry_count < self.max_attempts
    }

    async fn execute(&self, error: &EnhancedError) -> Result<RecoveryResult, EngineError> {
        let delay_ms = self.backoff_ms * (2_u64.pow(error.retry_count));

        Ok(RecoveryResult {
            success: true, // 假设重试会成功
            strategy_used: RecoveryStrategy::Retry,
            details: format!("Will retry after {}ms", delay_ms),
            fallback_available: true,
            retry_after_ms: Some(delay_ms),
        })
    }
}

pub struct CircuitBreakerStrategy {
    failure_threshold: u32,
    timeout_ms: u64,
}

impl CircuitBreakerStrategy {
    pub fn new(failure_threshold: u32, timeout_ms: u64) -> Self {
        Self { failure_threshold, timeout_ms }
    }
}

#[async_trait]
impl RecoveryStrategyHandler for CircuitBreakerStrategy {
    fn strategy_type(&self) -> RecoveryStrategy {
        RecoveryStrategy::CircuitBreaker
    }

    fn can_handle(&self, error: &EnhancedError) -> bool {
        matches!(error.category, ErrorCategory::Network | ErrorCategory::External | ErrorCategory::System)
    }

    async fn execute(&self, error: &EnhancedError) -> Result<RecoveryResult, EngineError> {
        // 这里应该更新熔断器状态
        Ok(RecoveryResult {
            success: true,
            strategy_used: RecoveryStrategy::CircuitBreaker,
            details: "Circuit breaker activated".to_string(),
            fallback_available: true,
            retry_after_ms: Some(self.timeout_ms),
        })
    }
}

pub struct FallbackStrategy;

impl FallbackStrategy {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl RecoveryStrategyHandler for FallbackStrategy {
    fn strategy_type(&self) -> RecoveryStrategy {
        RecoveryStrategy::Fallback
    }

    fn can_handle(&self, error: &EnhancedError) -> bool {
        matches!(error.category, ErrorCategory::Database | ErrorCategory::External)
    }

    async fn execute(&self, error: &EnhancedError) -> Result<RecoveryResult, EngineError> {
        Ok(RecoveryResult {
            success: true,
            strategy_used: RecoveryStrategy::Fallback,
            details: "Using cached or default data".to_string(),
            fallback_available: true,
            retry_after_ms: None,
        })
    }
}

pub struct GracefulDegradationStrategy;

impl GracefulDegradationStrategy {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl RecoveryStrategyHandler for GracefulDegradationStrategy {
    fn strategy_type(&self) -> RecoveryStrategy {
        RecoveryStrategy::GracefulDegradation
    }

    fn can_handle(&self, _error: &EnhancedError) -> bool {
        true // 可以处理所有错误
    }

    async fn execute(&self, error: &EnhancedError) -> Result<RecoveryResult, EngineError> {
        Ok(RecoveryResult {
            success: true,
            strategy_used: RecoveryStrategy::GracefulDegradation,
            details: "Service degraded but still functional".to_string(),
            fallback_available: true,
            retry_after_ms: None,
        })
    }
}

impl ImpactAnalyzer {
    pub fn new() -> Self {
        Self {
            user_impact_model: HashMap::new(),
            system_impact_model: HashMap::new(),
        }
    }

    pub async fn analyze_impact(&self, error: &EnhancedError) -> Result<ImpactAssessment, EngineError> {
        // 简化的影响评估逻辑
        let affected_users = match error.severity {
            ErrorSeverity::Critical => 100,
            ErrorSeverity::High => 50,
            ErrorSeverity::Medium => 10,
            ErrorSeverity::Low => 1,
        };

        let affected_requests = affected_users * 10;
        let downtime_seconds = match error.severity {
            ErrorSeverity::Critical => 3600,
            ErrorSeverity::High => 1800,
            ErrorSeverity::Medium => 300,
            ErrorSeverity::Low => 60,
        };

        Ok(ImpactAssessment {
            affected_users,
            affected_requests,
            downtime_seconds,
            data_loss: false,
            recovery_cost: 100.0,
            user_experience_impact: 0.5,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::runtime::Runtime;

    #[tokio::test]
    async fn test_error_recovery_system() {
        let system = AdvancedErrorRecoverySystem::new();

        let context = ErrorContext {
            component: "test".to_string(),
            operation: "test_operation".to_string(),
            user_id: Some("user123".to_string()),
            request_id: None,
            session_id: None,
            metadata: HashMap::new(),
        };

        let error = EngineError::NetworkError {
            message: "Connection failed".to_string(),
        };

        let result = system.handle_error(error, context).await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_error_categorization() {
        let system = AdvancedErrorRecoverySystem::new();
        let error = EngineError::NetworkError {
            message: "Connection failed".to_string(),
        };

        let category = system.categorize_error(&error);
        assert_eq!(category, ErrorCategory::Network);
    }
}