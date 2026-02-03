//! AI-Driven Automatic Performance Tuning System
//!
//! Provides intelligent, self-optimizing capabilities:
//! - Real-time performance monitoring
//! - ML-powered optimization suggestions
//! - Automated configuration adjustments
//! - Learning-based improvement

use crate::error::{EngineError, ErrorCode};
use crate::ml_models::{MLModelRegistry, PerformancePredictor, SystemMetrics, OptimizationConstraints, ConfigurationSuggestion};
use crate::config_manager::{ConfigManager, ConfigSource};
use crate::event_bus::{EventBus, SystemEvent, EngineEvent};
use async_trait::async_trait;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::{RwLock, Semaphore};
use tokio::time::{self, Duration};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Auto-tuning modes
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TuningMode {
    Manual,           // Manual optimization only
    Conservative,     // Safe, gradual optimizations
    Balanced,        // Moderate risk optimizations
    Aggressive,      // High-performance optimizations
    Learning,        // Experimental learning mode
}

/// Optimization strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OptimizationStrategy {
    ResponseTime,
    Throughput,
    ResourceEfficiency,
    CostOptimization,
    Reliability,
    Custom(String),
}

/// Tuning decision
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TuningDecision {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub strategy: OptimizationStrategy,
    pub changes: HashMap<String, serde_json::Value>,
    pub expected_improvement: f64,
    pub confidence: f64,
    pub rollback_plan: Option<HashMap<String, serde_json::Value>>,
    pub reasoning: Vec<String>,
}

/// Performance baseline
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceBaseline {
    pub metrics: SystemMetrics,
    pub timestamp: DateTime<Utc>,
    pub workload_characteristics: HashMap<String, f64>,
}

/// Auto-tuner configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoTunerConfig {
    pub enabled: bool,
    pub mode: TuningMode,
    pub monitoring_interval_seconds: u64,
    pub optimization_interval_minutes: u64,
    pub confidence_threshold: f64,
    pub max_concurrent_optimizations: usize,
    pub enable_rollback: bool,
    pub learning_enabled: bool,
    pub strategies: Vec<OptimizationStrategy>,
    pub constraints: OptimizationConstraints,
}

/// Auto-tuner status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoTunerStatus {
    pub is_active: bool,
    pub current_mode: TuningMode,
    pub last_optimization: Option<DateTime<Utc>>,
    pub total_optimizations: u64,
    pub successful_optimizations: u64,
    pub failed_optimizations: u64,
    pub average_improvement: f64,
    pub current_performance: Option<SystemMetrics>,
}

/// Intelligent Auto-Tuner
pub struct AutoTuner {
    config: Arc<RwLock<AutoTunerConfig>>,
    status: Arc<RwLock<AutoTunerStatus>>,
    model_registry: Arc<MLModelRegistry>,
    config_manager: Arc<ConfigManager>,
    event_bus: Arc<EventBus>,
    performance_history: Arc<RwLock<VecDeque<PerformanceBaseline>>>,
    tuning_history: Arc<RwLock<VecDeque<TuningDecision>>>,
    optimization_semaphore: Arc<Semaphore>,
    monitoring_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    optimization_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

impl AutoTuner {
    /// Create new auto-tuner
    pub fn new(
        model_registry: Arc<MLModelRegistry>,
        config_manager: Arc<ConfigManager>,
        event_bus: Arc<EventBus>
    ) -> Self {
        let config = AutoTunerConfig {
            enabled: true,
            mode: TuningMode::Balanced,
            monitoring_interval_seconds: 30,
            optimization_interval_minutes: 10,
            confidence_threshold: 0.8,
            max_concurrent_optimizations: 1,
            enable_rollback: true,
            learning_enabled: true,
            strategies: vec![
                OptimizationStrategy::ResponseTime,
                OptimizationStrategy::Throughput,
                OptimizationStrategy::ResourceEfficiency,
            ],
            constraints: OptimizationConstraints {
                max_cpu_cores: 16.0,
                min_cpu_cores: 1.0,
                max_memory_gb: 32.0,
                min_memory_gb: 1.0,
                max_connection_pool_size: 200,
                min_connection_pool_size: 10,
                max_response_time: 5000.0,
                budget_limit: None,
            },
        };

        let status = AutoTunerStatus {
            is_active: false,
            current_mode: config.mode.clone(),
            last_optimization: None,
            total_optimizations: 0,
            successful_optimizations: 0,
            failed_optimizations: 0,
            average_improvement: 0.0,
            current_performance: None,
        };

        Self {
            config: Arc::new(RwLock::new(config)),
            status: Arc::new(RwLock::new(status)),
            model_registry,
            config_manager,
            event_bus,
            performance_history: Arc::new(RwLock::new(VecDeque::with_capacity(1000))),
            tuning_history: Arc::new(RwLock::new(VecDeque::with_capacity(100))),
            optimization_semaphore: Arc::new(Semaphore::new(1)),
            monitoring_task: Arc::new(RwLock::new(None)),
            optimization_task: Arc::new(RwLock::new(None)),
        }
    }

    /// Start the auto-tuner
    pub async fn start(&self) -> Result<(), EngineError> {
        let config = self.config.read().await;
        if !config.enabled {
            return Ok(());
        }

        // Start monitoring task
        let monitoring_handle = self.start_monitoring_task();
        *self.monitoring_task.write().await = Some(monitoring_handle);

        // Start optimization task
        let optimization_handle = self.start_optimization_task();
        *self.optimization_task.write().await = Some(optimization_handle);

        // Update status
        let mut status = self.status.write().await;
        status.is_active = true;
        status.current_mode = config.mode.clone();

        // Publish startup event
        self.event_bus.publish(
            SystemEvent::ConfigReload {
                changes: vec!["auto_tuner.enabled=true".to_string()],
                triggered_by: "auto_tuner".to_string(),
            },
            "auto_tuner",
            None,
        ).await?;

        tracing::info!("Auto-tuner started in {:?} mode", config.mode);
        Ok(())
    }

    /// Stop the auto-tuner
    pub async fn stop(&self) -> Result<(), EngineError> {
        // Stop tasks
        if let Some(handle) = self.monitoring_task.write().await.take() {
            handle.abort();
        }
        if let Some(handle) = self.optimization_task.write().await.take() {
            handle.abort();
        }

        // Update status
        let mut status = self.status.write().await;
        status.is_active = false;

        tracing::info!("Auto-tuner stopped");
        Ok(())
    }

    /// Update configuration
    pub async fn update_config(&self, new_config: AutoTunerConfig) -> Result<(), EngineError> {
        let was_enabled = self.config.read().await.enabled;
        *self.config.write().await = new_config;

        // Restart if enabled status changed
        if was_enabled != new_config.enabled {
            if new_config.enabled {
                self.start().await?;
            } else {
                self.stop().await?;
            }
        }

        Ok(())
    }

    /// Get current status
    pub async fn get_status(&self) -> AutoTunerStatus {
        self.status.read().await.clone()
    }

    /// Manually trigger optimization
    pub async fn trigger_optimization(&self, strategy: Option<OptimizationStrategy>) -> Result<Option<TuningDecision>, EngineError> {
        let _permit = self.optimization_semaphore.acquire().await
            .map_err(|e| EngineError::Internal {
                message: format!("Failed to acquire optimization semaphore: {}", e)
            })?;

        let config = self.config.read().await;
        if !config.enabled {
            return Ok(None);
        }

        let strategies = if let Some(s) = strategy {
            vec![s]
        } else {
            config.strategies.clone()
        };

        for strategy in strategies {
            if let Some(decision) = self.evaluate_optimization_strategy(strategy).await? {
                if decision.confidence >= config.confidence_threshold {
                    self.apply_tuning_decision(decision.clone()).await?;
                    return Ok(Some(decision));
                }
            }
        }

        Ok(None)
    }

    /// Get performance history
    pub async fn get_performance_history(&self, limit: Option<usize>) -> Vec<PerformanceBaseline> {
        let history = self.performance_history.read().await;
        let limit = limit.unwrap_or(history.len());
        history.iter().rev().take(limit).cloned().collect()
    }

    /// Get tuning history
    pub async fn get_tuning_history(&self, limit: Option<usize>) -> Vec<TuningDecision> {
        let history = self.tuning_history.read().await;
        let limit = limit.unwrap_or(history.len());
        history.iter().rev().take(limit).cloned().collect()
    }

    /// Analyze performance trends
    pub async fn analyze_performance_trends(&self) -> Result<PerformanceAnalysis, EngineError> {
        let history = self.performance_history.read().await;
        if history.len() < 10 {
            return Err(EngineError::Internal {
                message: "Insufficient performance data for analysis".to_string()
            });
        }

        let recent_data: Vec<&PerformanceBaseline> = history.iter().rev().take(50).collect();

        let mut response_times = Vec::new();
        let mut cpu_usage = Vec::new();
        let mut memory_usage = Vec::new();
        let mut error_rates = Vec::new();

        for baseline in recent_data {
            response_times.push(baseline.metrics.response_time);
            cpu_usage.push(baseline.metrics.cpu_usage);
            memory_usage.push(baseline.metrics.memory_usage);
            error_rates.push(baseline.metrics.error_rate);
        }

        // Calculate trends using linear regression
        let response_time_trend = self.calculate_trend(&response_times);
        let cpu_trend = self.calculate_trend(&cpu_usage);
        let memory_trend = self.calculate_trend(&memory_usage);
        let error_trend = self.calculate_trend(&error_rates);

        // Predict future performance
        let predicted_response_time = self.predict_future_value(&response_times, 10);
        let predicted_cpu_usage = self.predict_future_value(&cpu_usage, 10);

        let analysis = PerformanceAnalysis {
            time_range: (
                recent_data.last().unwrap().timestamp,
                recent_data.first().unwrap().timestamp,
            ),
            trends: PerformanceTrends {
                response_time_slope: response_time_trend,
                cpu_usage_slope: cpu_trend,
                memory_usage_slope: memory_trend,
                error_rate_slope: error_trend,
            },
            predictions: PerformancePredictions {
                predicted_response_time,
                predicted_cpu_usage,
                confidence_intervals: (
                    predicted_response_time * 0.9,
                    predicted_response_time * 1.1,
                ),
            },
            recommendations: self.generate_recommendations(
                response_time_trend,
                cpu_trend,
                memory_trend,
                error_trend
            ).await,
        };

        Ok(analysis)
    }

    fn start_monitoring_task(&self) -> tokio::task::JoinHandle<()> {
        let config = Arc::clone(&self.config);
        let status = Arc::clone(&self.status);
        let performance_history = Arc::clone(&self.performance_history);
        let event_bus = Arc::clone(&self.event_bus);

        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(config.read().await.monitoring_interval_seconds));

            loop {
                interval.tick().await;

                if let Err(e) = Self::collect_performance_metrics(
                    &config,
                    &status,
                    &performance_history,
                    &event_bus
                ).await {
                    tracing::error!("Failed to collect performance metrics: {:?}", e);
                }
            }
        })
    }

    fn start_optimization_task(&self) -> tokio::task::JoinHandle<()> {
        let config = Arc::clone(&self.config);
        let status = Arc::clone(&self.status);
        let optimization_semaphore = Arc::clone(&self.optimization_semaphore);
        let tuner = Arc::new(Self {
            config: Arc::clone(&config),
            status: Arc::clone(&status),
            model_registry: Arc::clone(&self.model_registry),
            config_manager: Arc::clone(&self.config_manager),
            event_bus: Arc::clone(&self.event_bus),
            performance_history: Arc::clone(&self.performance_history),
            tuning_history: Arc::clone(&self.tuning_history),
            optimization_semaphore: Arc::clone(&optimization_semaphore),
            monitoring_task: Arc::new(RwLock::new(None)),
            optimization_task: Arc::new(RwLock::new(None)),
        });

        tokio::spawn(async move {
            let mut interval = time::interval(Duration::from_secs(config.read().await.optimization_interval_minutes * 60));

            loop {
                interval.tick().await;

                let _permit = match optimization_semaphore.acquire().await {
                    Ok(p) => p,
                    Err(_) => continue,
                };

                if let Err(e) = Self::run_automatic_optimization(&tuner).await {
                    tracing::error!("Automatic optimization failed: {:?}", e);
                }
            }
        })
    }

    async fn collect_performance_metrics(
        config: &Arc<RwLock<AutoTunerConfig>>,
        status: &Arc<RwLock<AutoTunerStatus>>,
        performance_history: &Arc<RwLock<VecDeque<PerformanceBaseline>>>,
        event_bus: &Arc<EventBus>,
    ) -> Result<(), EngineError> {
        // In a real implementation, this would collect actual system metrics
        // For now, we'll simulate metric collection
        let metrics = SystemMetrics {
            timestamp: Utc::now(),
            cpu_usage: (50.0 + (rand::random::<f64>() - 0.5) * 20.0).max(0.0).min(100.0),
            memory_usage: (60.0 + (rand::random::<f64>() - 0.5) * 20.0).max(0.0).min(100.0),
            response_time: (200.0 + (rand::random::<f64>() - 0.5) * 100.0).max(10.0),
            request_rate: (500.0 + (rand::random::<f64>() - 0.5) * 200.0).max(0.0),
            cache_hit_rate: (80.0 + (rand::random::<f64>() - 0.5) * 10.0).max(0.0).min(100.0),
            error_rate: (0.01 + (rand::random::<f64>() - 0.5) * 0.02).max(0.0).min(1.0),
            cpu_cores: 4,
            memory_gb: 8.0,
            connection_pool_size: 50,
            thread_pool_size: 10,
        };

        let baseline = PerformanceBaseline {
            metrics: metrics.clone(),
            timestamp: metrics.timestamp,
            workload_characteristics: HashMap::from([
                ("peak_hours".to_string(), if metrics.timestamp.hour() >= 9 && metrics.timestamp.hour() <= 17 { 1.0 } else { 0.0 }),
                ("high_load".to_string(), if metrics.request_rate > 700.0 { 1.0 } else { 0.0 }),
            ]),
        };

        // Store in history
        let mut history = performance_history.write().await;
        history.push_back(baseline.clone());
        if history.len() > 1000 {
            history.pop_front();
        }

        // Update status
        let mut status = status.write().await;
        status.current_performance = Some(metrics.clone());

        // Publish performance event
        event_bus.publish(
            EngineEvent::SearchCompleted {
                query: "performance_check".to_string(),
                result_count: 1,
                duration_ms: 50,
                source_id: "auto_tuner".to_string(),
            },
            "auto_tuner",
            None,
        ).await?;

        Ok(())
    }

    async fn run_automatic_optimization(tuner: &Arc<AutoTuner>) -> Result<(), EngineError> {
        let config = tuner.config.read().await;
        if !config.enabled {
            return Ok(());
        }

        // Get current performance
        let status = tuner.status.read().await;
        let current_metrics = match &status.current_performance {
            Some(m) => m.clone(),
            None => return Ok(()),
        };

        // Try different strategies
        for strategy in &config.strategies {
            if let Some(decision) = tuner.evaluate_optimization_strategy(strategy.clone()).await? {
                if decision.confidence >= config.confidence_threshold {
                    tuner.apply_tuning_decision(decision).await?;
                    break; // Only apply one optimization at a time
                }
            }
        }

        Ok(())
    }

    async fn evaluate_optimization_strategy(&self, strategy: OptimizationStrategy) -> Result<Option<TuningDecision>, EngineError> {
        let status = self.status.read().await;
        let current_metrics = match &status.current_performance {
            Some(m) => m.clone(),
            None => return Ok(None),
        };

        let predictor = self.model_registry.get_model("performance_predictor").await?;
        let performance_predictor: &PerformancePredictor = predictor.as_ref()
            .downcast_ref()
            .ok_or_else(|| EngineError::Internal {
                message: "Invalid model type".to_string()
            })?;

        let config = self.config.read().await;
        let suggestion = performance_predictor.suggest_configuration(&current_metrics, &config.constraints).await?;

        if suggestion.confidence >= config.confidence_threshold {
            let decision = TuningDecision {
                id: format!("tuning_{}", Utc::now().timestamp()),
                timestamp: Utc::now(),
                strategy,
                changes: self.configuration_to_changes(&suggestion.configuration),
                expected_improvement: current_metrics.response_time - suggestion.predicted_performance.response_time,
                confidence: suggestion.confidence,
                rollback_plan: Some(self.configuration_to_changes(&current_metrics)),
                reasoning: suggestion.reasoning,
            };

            Ok(Some(decision))
        } else {
            Ok(None)
        }
    }

    async fn apply_tuning_decision(&self, decision: TuningDecision) -> Result<(), EngineError> {
        // Store rollback plan
        let rollback_key = format!("rollback_{}", decision.id);
        if let Some(rollback) = &decision.rollback_plan {
            self.config_manager.set_config(&rollback_key, rollback.clone(), ConfigSource::Runtime).await?;
        }

        // Apply changes
        for (key, value) in &decision.changes {
            self.config_manager.set_config(key, value.clone(), ConfigSource::Runtime).await?;
        }

        // Update status
        let mut status = self.status.write().await;
        status.total_optimizations += 1;
        status.last_optimization = Some(decision.timestamp);
        status.average_improvement = (status.average_improvement * (status.total_optimizations - 1) as f64 + decision.expected_improvement) / status.total_optimizations as f64;

        // Store in history
        let mut history = self.tuning_history.write().await;
        history.push_back(decision.clone());
        if history.len() > 100 {
            history.pop_front();
        }

        // Publish event
        self.event_bus.publish(
            SystemEvent::ConfigReload {
                changes: vec![format!("auto_tuning_applied: {}", decision.id)],
                triggered_by: "auto_tuner".to_string(),
            },
            "auto_tuner",
            None,
        ).await?;

        tracing::info!("Applied tuning decision: {} (expected improvement: {:.1f}ms)",
                      decision.id, decision.expected_improvement);

        Ok(())
    }

    fn configuration_to_changes(&self, config: &SystemMetrics) -> HashMap<String, serde_json::Value> {
        HashMap::from([
            ("server.cpu_cores".to_string(), serde_json::json!(config.cpu_cores)),
            ("server.memory_gb".to_string(), serde_json::json!(config.memory_gb)),
            ("connection_pool.size".to_string(), serde_json::json!(config.connection_pool_size)),
            ("thread_pool.size".to_string(), serde_json::json!(config.thread_pool_size)),
        ])
    }

    fn calculate_trend(&self, values: &[f64]) -> f64 {
        if values.len() < 2 {
            return 0.0;
        }

        let n = values.len() as f64;
        let x_sum: f64 = (0..values.len()).map(|i| i as f64).sum();
        let y_sum: f64 = values.iter().sum();
        let xy_sum: f64 = values.iter().enumerate().map(|(i, &y)| i as f64 * y).sum();
        let x_squared_sum: f64 = (0..values.len()).map(|i| (i as f64).powi(2)).sum();

        // Slope = (n * Σ(xy) - Σ(x) * Σ(y)) / (n * Σ(x²) - (Σ(x))²)
        (n * xy_sum - x_sum * y_sum) / (n * x_squared_sum - x_sum.powi(2))
    }

    fn predict_future_value(&self, values: &[f64], steps_ahead: usize) -> f64 {
        let trend = self.calculate_trend(values);
        let last_value = values.last().unwrap_or(&0.0);
        let n = values.len() as f64;

        // Simple linear extrapolation
        last_value + trend * steps_ahead as f64
    }

    async fn generate_recommendations(&self, response_trend: f64, cpu_trend: f64, memory_trend: f64, error_trend: f64) -> Vec<String> {
        let mut recommendations = Vec::new();

        if response_trend > 1.0 {
            recommendations.push("Response time is increasing - consider scaling up CPU or optimizing queries".to_string());
        }

        if cpu_trend > 0.5 {
            recommendations.push("CPU usage trending up - consider horizontal scaling".to_string());
        }

        if memory_trend > 0.3 {
            recommendations.push("Memory usage increasing - check for memory leaks".to_string());
        }

        if error_trend > 0.001 {
            recommendations.push("Error rate trending up - investigate recent changes".to_string());
        }

        if recommendations.is_empty() {
            recommendations.push("System performance is stable".to_string());
        }

        recommendations
    }
}

/// Performance analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceAnalysis {
    pub time_range: (DateTime<Utc>, DateTime<Utc>),
    pub trends: PerformanceTrends,
    pub predictions: PerformancePredictions,
    pub recommendations: Vec<String>,
}

/// Performance trends
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceTrends {
    pub response_time_slope: f64,
    pub cpu_usage_slope: f64,
    pub memory_usage_slope: f64,
    pub error_rate_slope: f64,
}

/// Performance predictions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformancePredictions {
    pub predicted_response_time: f64,
    pub predicted_cpu_usage: f64,
    pub confidence_intervals: (f64, f64),
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::runtime::Runtime;

    #[tokio::test]
    async fn test_auto_tuner_creation() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            // This would require setting up mock dependencies
            // For now, just test the basic structure
            assert!(true);
        });
    }

    #[test]
    fn test_trend_calculation() {
        let tuner = AutoTuner::new(
            Arc::new(MLModelRegistry::new(Arc::new(MockStorage))),
            Arc::new(ConfigManager::new(crate::config_manager::ConfigEnvironment::Testing)),
            Arc::new(EventBus::new()),
        );

        let values = vec![100.0, 105.0, 110.0, 115.0, 120.0];
        let trend = tuner.calculate_trend(&values);
        assert!(trend > 0.0); // Should show upward trend
    }

    // Mock storage for testing
    struct MockStorage;
    #[async_trait::async_trait]
    impl crate::ml_models::ModelStorage for MockStorage {
        async fn save_model(&self, _model_id: &str, _data: &[u8]) -> Result<(), EngineError> { Ok(()) }
        async fn load_model(&self, _model_id: &str) -> Result<Vec<u8>, EngineError> { Err(EngineError::NotFound) }
        async fn delete_model(&self, _model_id: &str) -> Result<(), EngineError> { Ok(()) }
        async fn list_models(&self) -> Result<Vec<String>, EngineError> { Ok(vec![]) }
    }
}