//! 统一性能优化系统
//!
//! 整合所有性能优化功能，提供统一的优化接口：
//! - 内存优化
//! - CPU优化
//! - I/O优化
//! - 网络优化
//! - 缓存优化
//! - 算法优化

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// 优化配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizerConfig {
    pub enable_memory_optimization: bool,
    pub enable_cpu_optimization: bool,
    pub enable_io_optimization: bool,
    pub enable_network_optimization: bool,
    pub enable_cache_optimization: bool,
    pub enable_algorithm_optimization: bool,
    pub monitoring_interval_ms: u64,
    pub optimization_interval_ms: u64,
    pub max_concurrent_optimizations: usize,
}

/// 性能指标
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub timestamp: u64,
    pub memory_usage_mb: f64,
    pub cpu_usage_percent: f64,
    pub io_operations_per_sec: f64,
    pub network_bandwidth_mbps: f64,
    pub cache_hit_rate: f64,
    pub active_connections: u32,
    pub response_time_ms: f64,
}

/// 优化建议
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationSuggestion {
    pub id: String,
    pub category: OptimizationCategory,
    pub priority: OptimizationPriority,
    pub title: String,
    pub description: String,
    pub estimated_improvement_percent: f64,
    pub implementation_complexity: Complexity,
    pub affected_components: Vec<String>,
    pub prerequisites: Vec<String>,
}

/// 优化类别
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum OptimizationCategory {
    Memory,
    CPU,
    IO,
    Network,
    Cache,
    Algorithm,
    Database,
    Application,
}

/// 优化优先级
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum OptimizationPriority {
    Low,
    Medium,
    High,
    Critical,
}

/// 复杂度
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Complexity {
    Low,
    Medium,
    High,
    VeryHigh,
}

/// 优化结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResult {
    pub suggestion_id: String,
    pub success: bool,
    pub execution_time_ms: u64,
    pub improvement_achieved_percent: f64,
    pub side_effects: Vec<String>,
    pub rollback_instructions: Option<String>,
}

/// 优化引擎接口
#[async_trait]
pub trait OptimizationEngine: Send + Sync {
    /// 获取引擎名称
    fn name(&self) -> &str;

    /// 获取当前性能指标
    async fn collect_metrics(&self) -> Result<PerformanceMetrics, OptimizerError>;

    /// 生成优化建议
    async fn generate_suggestions(&self, metrics: &PerformanceMetrics) -> Result<Vec<OptimizationSuggestion>, OptimizerError>;

    /// 执行优化
    async fn execute_optimization(&self, suggestion: &OptimizationSuggestion) -> Result<OptimizationResult, OptimizerError>;

    /// 回滚优化
    async fn rollback_optimization(&self, result: &OptimizationResult) -> Result<(), OptimizerError>;

    /// 健康检查
    async fn health_check(&self) -> Result<(), OptimizerError>;
}

/// 优化错误
#[derive(Debug, thiserror::Error)]
pub enum OptimizerError {
    #[error("Metrics collection failed: {0}")]
    MetricsCollection(String),

    #[error("Optimization failed: {0}")]
    OptimizationFailed(String),

    #[error("Rollback failed: {0}")]
    RollbackFailed(String),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Resource exhausted: {0}")]
    ResourceExhausted(String),
}

/// 统一性能优化器
pub struct UnifiedOptimizer {
    config: Arc<RwLock<OptimizerConfig>>,
    engines: HashMap<OptimizationCategory, Box<dyn OptimizationEngine>>,
    metrics_history: Arc<RwLock<Vec<PerformanceMetrics>>>,
    suggestions_cache: Arc<RwLock<HashMap<String, OptimizationSuggestion>>>,
    execution_history: Arc<RwLock<Vec<OptimizationResult>>>,
    monitoring_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    optimization_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

impl UnifiedOptimizer {
    /// 创建统一优化器
    pub fn new(config: OptimizerConfig) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            engines: HashMap::new(),
            metrics_history: Arc::new(RwLock::new(Vec::new())),
            suggestions_cache: Arc::new(RwLock::new(HashMap::new())),
            execution_history: Arc::new(RwLock::new(Vec::new())),
            monitoring_task: Arc::new(RwLock::new(None)),
            optimization_task: Arc::new(RwLock::new(None)),
        }
    }

    /// 注册优化引擎
    pub fn register_engine(&mut self, category: OptimizationCategory, engine: Box<dyn OptimizationEngine>) {
        self.engines.insert(category, engine);
    }

    /// 启动优化器
    pub async fn start(&self) -> Result<(), OptimizerError> {
        self.start_monitoring_task().await?;
        self.start_optimization_task().await?;
        Ok(())
    }

    /// 停止优化器
    pub async fn stop(&self) -> Result<(), OptimizerError> {
        if let Some(task) = self.monitoring_task.write().await.take() {
            task.abort();
        }
        if let Some(task) = self.optimization_task.write().await.take() {
            task.abort();
        }
        Ok(())
    }

    /// 获取当前性能指标
    pub async fn get_current_metrics(&self) -> Result<PerformanceMetrics, OptimizerError> {
        let mut aggregated_metrics = PerformanceMetrics {
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            memory_usage_mb: 0.0,
            cpu_usage_percent: 0.0,
            io_operations_per_sec: 0.0,
            network_bandwidth_mbps: 0.0,
            cache_hit_rate: 0.0,
            active_connections: 0,
            response_time_ms: 0.0,
        };

        let mut engine_count = 0;

        for engine in self.engines.values() {
            let metrics = engine.collect_metrics().await?;
            aggregated_metrics.memory_usage_mb += metrics.memory_usage_mb;
            aggregated_metrics.cpu_usage_percent += metrics.cpu_usage_percent;
            aggregated_metrics.io_operations_per_sec += metrics.io_operations_per_sec;
            aggregated_metrics.network_bandwidth_mbps += metrics.network_bandwidth_mbps;
            aggregated_metrics.cache_hit_rate += metrics.cache_hit_rate;
            aggregated_metrics.active_connections += metrics.active_connections;
            aggregated_metrics.response_time_ms += metrics.response_time_ms;
            engine_count += 1;
        }

        if engine_count > 0 {
            aggregated_metrics.memory_usage_mb /= engine_count as f64;
            aggregated_metrics.cpu_usage_percent /= engine_count as f64;
            aggregated_metrics.io_operations_per_sec /= engine_count as f64;
            aggregated_metrics.network_bandwidth_mbps /= engine_count as f64;
            aggregated_metrics.cache_hit_rate /= engine_count as f64;
            aggregated_metrics.response_time_ms /= engine_count as f64;
        }

        Ok(aggregated_metrics)
    }

    /// 获取优化建议
    pub async fn get_optimization_suggestions(&self, category: Option<OptimizationCategory>) -> Result<Vec<OptimizationSuggestion>, OptimizerError> {
        let current_metrics = self.get_current_metrics().await?;
        let mut all_suggestions = Vec::new();

        let engines_to_check = if let Some(cat) = category {
            vec![cat]
        } else {
            vec![
                OptimizationCategory::Memory,
                OptimizationCategory::CPU,
                OptimizationCategory::IO,
                OptimizationCategory::Network,
                OptimizationCategory::Cache,
                OptimizationCategory::Algorithm,
            ]
        };

        for cat in engines_to_check {
            if let Some(engine) = self.engines.get(&cat) {
                let suggestions = engine.generate_suggestions(&current_metrics).await?;
                all_suggestions.extend(suggestions);
            }
        }

        // 按优先级和改进程度排序
        all_suggestions.sort_by(|a, b| {
            b.priority.cmp(&a.priority)
                .then(b.estimated_improvement_percent.partial_cmp(&a.estimated_improvement_percent).unwrap())
        });

        Ok(all_suggestions)
    }

    /// 执行优化
    pub async fn execute_optimization(&self, suggestion_id: &str) -> Result<OptimizationResult, OptimizerError> {
        let suggestions = self.suggestions_cache.read().await;
        let suggestion = suggestions.get(suggestion_id)
            .ok_or_else(|| OptimizerError::OptimizationFailed(format!("Suggestion {} not found", suggestion_id)))?;

        let engine = self.engines.get(&suggestion.category)
            .ok_or_else(|| OptimizerError::OptimizationFailed(format!("Engine for category {:?} not found", suggestion.category)))?;

        let start_time = Instant::now();
        let result = engine.execute_optimization(suggestion).await?;
        let execution_time = start_time.elapsed();

        let full_result = OptimizationResult {
            suggestion_id: suggestion_id.to_string(),
            success: result.success,
            execution_time_ms: execution_time.as_millis() as u64,
            improvement_achieved_percent: result.improvement_achieved_percent,
            side_effects: result.side_effects,
            rollback_instructions: result.rollback_instructions,
        };

        // 记录执行历史
        self.execution_history.write().await.push(full_result.clone());

        Ok(full_result)
    }

    /// 批量执行优化（顺序执行以避免 spawn 导致的 Send 约束）
    pub async fn execute_optimizations_batch(&self, suggestion_ids: &[String]) -> Result<Vec<OptimizationResult>, OptimizerError> {
        let mut results = Vec::new();
        for id in suggestion_ids {
            let result = self.execute_optimization(id).await?;
            results.push(result);
        }
        Ok(results)
    }

    /// 获取优化历史
    pub async fn get_optimization_history(&self, limit: Option<usize>) -> Vec<OptimizationResult> {
        let history = self.execution_history.read().await;
        let limit = limit.unwrap_or(history.len());
        history.iter().rev().take(limit).cloned().collect()
    }

    /// 获取性能趋势
    pub async fn get_performance_trend(&self, duration_minutes: u32) -> Result<PerformanceTrend, OptimizerError> {
        let history = self.metrics_history.read().await;
        let cutoff_time = chrono::Utc::now().timestamp_millis() as u64 - (duration_minutes as u64 * 60 * 1000);

        let relevant_metrics: Vec<_> = history.iter()
            .filter(|m| m.timestamp >= cutoff_time)
            .collect();

        if relevant_metrics.is_empty() {
            return Ok(PerformanceTrend {
                duration_minutes,
                data_points: 0,
                average_memory_mb: 0.0,
                average_cpu_percent: 0.0,
                peak_memory_mb: 0.0,
                peak_cpu_percent: 0.0,
                trend_direction: TrendDirection::Stable,
            });
        }

        let avg_memory = relevant_metrics.iter().map(|m| m.memory_usage_mb).sum::<f64>() / relevant_metrics.len() as f64;
        let avg_cpu = relevant_metrics.iter().map(|m| m.cpu_usage_percent).sum::<f64>() / relevant_metrics.len() as f64;
        let peak_memory = relevant_metrics.iter().map(|m| m.memory_usage_mb).fold(0.0, f64::max);
        let peak_cpu = relevant_metrics.iter().map(|m| m.cpu_usage_percent).fold(0.0, f64::max);

        // 简单的趋势分析
        let trend_direction = if relevant_metrics.len() >= 2 {
            let first_half = &relevant_metrics[0..relevant_metrics.len()/2];
            let second_half = &relevant_metrics[relevant_metrics.len()/2..];

            let first_avg = first_half.iter().map(|m| m.cpu_usage_percent).sum::<f64>() / first_half.len() as f64;
            let second_avg = second_half.iter().map(|m| m.cpu_usage_percent).sum::<f64>() / second_half.len() as f64;

            if second_avg > first_avg + 5.0 {
                TrendDirection::Increasing
            } else if second_avg < first_avg - 5.0 {
                TrendDirection::Decreasing
            } else {
                TrendDirection::Stable
            }
        } else {
            TrendDirection::Stable
        };

        Ok(PerformanceTrend {
            duration_minutes,
            data_points: relevant_metrics.len(),
            average_memory_mb: avg_memory,
            average_cpu_percent: avg_cpu,
            peak_memory_mb: peak_memory,
            peak_cpu_percent: peak_cpu,
            trend_direction,
        })
    }

    async fn start_monitoring_task(&self) -> Result<(), OptimizerError> {
        // 监控任务暂不 spawn，避免 raw pointer 导致的 Send 约束；可改为在调用方循环中轮询
        *self.monitoring_task.write().await = None;
        Ok(())
    }

    async fn start_optimization_task(&self) -> Result<(), OptimizerError> {
        // 自动优化任务暂不 spawn，避免 raw pointer 导致的 Send 约束
        *self.optimization_task.write().await = None;
        Ok(())
    }
}

/// 性能趋势
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceTrend {
    pub duration_minutes: u32,
    pub data_points: usize,
    pub average_memory_mb: f64,
    pub average_cpu_percent: f64,
    pub peak_memory_mb: f64,
    pub peak_cpu_percent: f64,
    pub trend_direction: TrendDirection,
}

/// 趋势方向
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TrendDirection {
    Increasing,
    Decreasing,
    Stable,
}

/// 默认优化引擎实现
pub struct DefaultOptimizationEngine {
    category: OptimizationCategory,
    name: String,
}

impl DefaultOptimizationEngine {
    pub fn new(category: OptimizationCategory, name: &str) -> Self {
        Self {
            category,
            name: name.to_string(),
        }
    }
}

#[async_trait]
impl OptimizationEngine for DefaultOptimizationEngine {
    fn name(&self) -> &str {
        &self.name
    }

    async fn collect_metrics(&self) -> Result<PerformanceMetrics, OptimizerError> {
        // 简化的指标收集实现
        Ok(PerformanceMetrics {
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            memory_usage_mb: 256.0,
            cpu_usage_percent: 45.0,
            io_operations_per_sec: 150.0,
            network_bandwidth_mbps: 50.0,
            cache_hit_rate: 0.85,
            active_connections: 25,
            response_time_ms: 120.0,
        })
    }

    async fn generate_suggestions(&self, metrics: &PerformanceMetrics) -> Result<Vec<OptimizationSuggestion>, OptimizerError> {
        let mut suggestions = Vec::new();

        match self.category {
            OptimizationCategory::Memory => {
                if metrics.memory_usage_mb > 512.0 {
                    suggestions.push(OptimizationSuggestion {
                        id: format!("{}_memory_gc", self.name),
                        category: OptimizationCategory::Memory,
                        priority: OptimizationPriority::High,
                        title: "触发垃圾回收".to_string(),
                        description: "内存使用过高，建议触发垃圾回收".to_string(),
                        estimated_improvement_percent: 25.0,
                        implementation_complexity: Complexity::Low,
                        affected_components: vec!["memory_manager".to_string()],
                        prerequisites: vec![],
                    });
                }
            }
            OptimizationCategory::CPU => {
                if metrics.cpu_usage_percent > 80.0 {
                    suggestions.push(OptimizationSuggestion {
                        id: format!("{}_cpu_optimization", self.name),
                        category: OptimizationCategory::CPU,
                        priority: OptimizationPriority::High,
                        title: "优化CPU使用".to_string(),
                        description: "CPU使用率过高，建议优化计算密集型任务".to_string(),
                        estimated_improvement_percent: 30.0,
                        implementation_complexity: Complexity::Medium,
                        affected_components: vec!["thread_pool".to_string(), "task_scheduler".to_string()],
                        prerequisites: vec![],
                    });
                }
            }
            OptimizationCategory::Cache => {
                if metrics.cache_hit_rate < 0.8 {
                    suggestions.push(OptimizationSuggestion {
                        id: format!("{}_cache_optimization", self.name),
                        category: OptimizationCategory::Cache,
                        priority: OptimizationPriority::Medium,
                        title: "优化缓存策略".to_string(),
                        description: "缓存命中率偏低，建议调整缓存策略".to_string(),
                        estimated_improvement_percent: 20.0,
                        implementation_complexity: Complexity::Low,
                        affected_components: vec!["cache_manager".to_string()],
                        prerequisites: vec![],
                    });
                }
            }
            _ => {}
        }

        Ok(suggestions)
    }

    async fn execute_optimization(&self, suggestion: &OptimizationSuggestion) -> Result<OptimizationResult, OptimizerError> {
        // 简化的优化执行实现
        Ok(OptimizationResult {
            suggestion_id: suggestion.id.clone(),
            success: true,
            execution_time_ms: 150,
            improvement_achieved_percent: suggestion.estimated_improvement_percent * 0.8, // 实际改进略低于预期
            side_effects: vec![],
            rollback_instructions: Some("重启服务即可回滚".to_string()),
        })
    }

    async fn rollback_optimization(&self, _result: &OptimizationResult) -> Result<(), OptimizerError> {
        // 简化的回滚实现
        Ok(())
    }

    async fn health_check(&self) -> Result<(), OptimizerError> {
        Ok(())
    }
}

/// 全局优化器管理器
pub struct OptimizerManager {
    optimizer: Arc<RwLock<UnifiedOptimizer>>,
}

impl OptimizerManager {
    pub fn new(config: OptimizerConfig) -> Self {
        let mut optimizer = UnifiedOptimizer::new(config);

        // 注册默认优化引擎
        optimizer.register_engine(OptimizationCategory::Memory, Box::new(DefaultOptimizationEngine::new(OptimizationCategory::Memory, "memory_optimizer")));
        optimizer.register_engine(OptimizationCategory::CPU, Box::new(DefaultOptimizationEngine::new(OptimizationCategory::CPU, "cpu_optimizer")));
        optimizer.register_engine(OptimizationCategory::Cache, Box::new(DefaultOptimizationEngine::new(OptimizationCategory::Cache, "cache_optimizer")));
        optimizer.register_engine(OptimizationCategory::IO, Box::new(DefaultOptimizationEngine::new(OptimizationCategory::IO, "io_optimizer")));
        optimizer.register_engine(OptimizationCategory::Network, Box::new(DefaultOptimizationEngine::new(OptimizationCategory::Network, "network_optimizer")));
        optimizer.register_engine(OptimizationCategory::Algorithm, Box::new(DefaultOptimizationEngine::new(OptimizationCategory::Algorithm, "algorithm_optimizer")));

        Self {
            optimizer: Arc::new(RwLock::new(optimizer)),
        }
    }

    pub async fn start(&self) -> Result<(), OptimizerError> {
        self.optimizer.write().await.start().await
    }

    pub async fn stop(&self) -> Result<(), OptimizerError> {
        self.optimizer.write().await.stop().await
    }

    pub fn optimizer(&self) -> Arc<RwLock<UnifiedOptimizer>> {
        Arc::clone(&self.optimizer)
    }
}

/// 全局优化器管理器实例
static mut OPTIMIZER_MANAGER: Option<OptimizerManager> = None;

/// 初始化全局优化器管理器
pub fn init_optimizer_manager(config: OptimizerConfig) -> Result<(), OptimizerError> {
    unsafe {
        OPTIMIZER_MANAGER = Some(OptimizerManager::new(config));
    }
    Ok(())
}

/// 获取全局优化器管理器
pub fn get_optimizer_manager() -> Option<&'static OptimizerManager> {
    unsafe { OPTIMIZER_MANAGER.as_ref() }
}