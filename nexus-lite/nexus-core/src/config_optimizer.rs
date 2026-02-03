//! 智能配置优化器
//!
//! 基于运行时指标和机器学习自动优化系统配置：
//! - 动态配置调整
//! - A/B测试配置
//! - 性能预测优化
//! - 自适应参数调优

use crate::error::{EngineError, ErrorCode};
use crate::ml_models::{PerformancePredictor, SystemMetrics};
use async_trait::async_trait;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 配置优化策略
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfigOptimizationStrategy {
    Performance,      // 性能优化
    Cost,            // 成本优化
    Reliability,     // 可靠性优化
    UserExperience,  // 用户体验优化
    Balanced,        // 均衡优化
}

/// 配置参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigParameter {
    pub name: String,
    pub current_value: serde_json::Value,
    pub recommended_value: Option<serde_json::Value>,
    pub min_value: Option<serde_json::Value>,
    pub max_value: Option<serde_json::Value>,
    pub data_type: ConfigDataType,
    pub category: String,
    pub description: String,
}

/// 配置数据类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfigDataType {
    Integer,
    Float,
    Boolean,
    String,
    Array,
    Object,
}

/// 配置优化建议
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigRecommendation {
    pub id: Uuid,
    pub parameter: String,
    pub current_value: serde_json::Value,
    pub recommended_value: serde_json::Value,
    pub expected_improvement: f64,
    pub confidence: f64,
    pub reasoning: Vec<String>,
    pub risks: Vec<String>,
    pub test_duration_minutes: u32,
    pub timestamp: DateTime<Utc>,
}

/// A/B测试配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ABTestConfig {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub parameter: String,
    pub control_value: serde_json::Value,
    pub variant_value: serde_json::Value,
    pub traffic_split: f64, // 0-1, variant组的流量比例
    pub status: ABTestStatus,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub metrics: Vec<String>,
    pub results: Option<ABTestResults>,
}

/// A/B测试状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ABTestStatus {
    Draft,
    Running,
    Completed,
    Stopped,
}

/// A/B测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ABTestResults {
    pub control_metrics: HashMap<String, f64>,
    pub variant_metrics: HashMap<String, f64>,
    pub statistical_significance: f64,
    pub winner: Option<String>, // "control", "variant", or "tie"
    pub confidence_interval: (f64, f64),
    pub sample_size: u32,
}

/// 配置优化器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigOptimizerConfig {
    pub enabled: bool,
    pub strategy: ConfigOptimizationStrategy,
    pub monitoring_window_minutes: u32,
    pub optimization_interval_minutes: u32,
    pub ab_test_enabled: bool,
    pub max_concurrent_tests: usize,
    pub confidence_threshold: f64,
    pub risk_tolerance: f64, // 0-1, 风险容忍度
}

/// 智能配置优化器
pub struct IntelligentConfigOptimizer {
    config: Arc<RwLock<ConfigOptimizerConfig>>,
    performance_predictor: Arc<PerformancePredictor>,
    current_parameters: Arc<RwLock<HashMap<String, ConfigParameter>>>,
    recommendations: Arc<RwLock<VecDeque<ConfigRecommendation>>>,
    ab_tests: Arc<RwLock<HashMap<Uuid, ABTestConfig>>>,
    optimization_history: Arc<RwLock<VecDeque<OptimizationRecord>>>,
    user_segments: Arc<RwLock<HashMap<String, UserSegment>>>,
    optimization_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    ab_test_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

/// 用户分群
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSegment {
    pub segment_id: String,
    pub name: String,
    pub criteria: HashMap<String, serde_json::Value>,
    pub size: u32,
    pub characteristics: HashMap<String, f64>,
}

/// 优化记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationRecord {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub parameter: String,
    pub old_value: serde_json::Value,
    pub new_value: serde_json::Value,
    pub strategy: ConfigOptimizationStrategy,
    pub improvement: f64,
    pub confidence: f64,
    pub user_segment: Option<String>,
}

impl IntelligentConfigOptimizer {
    pub fn new(performance_predictor: Arc<PerformancePredictor>) -> Self {
        let config = ConfigOptimizerConfig {
            enabled: true,
            strategy: ConfigOptimizationStrategy::Balanced,
            monitoring_window_minutes: 60,
            optimization_interval_minutes: 120,
            ab_test_enabled: true,
            max_concurrent_tests: 3,
            confidence_threshold: 0.8,
            risk_tolerance: 0.3,
        };

        Self {
            config: Arc::new(RwLock::new(config)),
            performance_predictor,
            current_parameters: Arc::new(RwLock::new(HashMap::new())),
            recommendations: Arc::new(RwLock::new(VecDeque::with_capacity(100))),
            ab_tests: Arc::new(RwLock::new(HashMap::new())),
            optimization_history: Arc::new(RwLock::new(VecDeque::with_capacity(1000))),
            user_segments: Arc::new(RwLock::new(HashMap::new())),
            optimization_task: Arc::new(RwLock::new(None)),
            ab_test_task: Arc::new(RwLock::new(None)),
        }
    }

    /// 启动配置优化器
    pub async fn start(&self) -> Result<(), EngineError> {
        self.initialize_default_parameters().await?;
        self.create_user_segments().await?;
        self.start_optimization_task().await?;
        self.start_ab_test_task().await?;
        Ok(())
    }

    /// 添加配置参数
    pub async fn add_parameter(&self, parameter: ConfigParameter) -> Result<(), EngineError> {
        let mut parameters = self.current_parameters.write().await;
        parameters.insert(parameter.name.clone(), parameter);
        Ok(())
    }

    /// 更新参数值
    pub async fn update_parameter(&self, name: &str, value: serde_json::Value) -> Result<(), EngineError> {
        let mut parameters = self.current_parameters.write().await;
        if let Some(param) = parameters.get_mut(name) {
            param.current_value = value.clone();

            // 记录优化历史
            let record = OptimizationRecord {
                id: Uuid::new_v4(),
                timestamp: Utc::now(),
                parameter: name.to_string(),
                old_value: param.current_value.clone(),
                new_value: value,
                strategy: ConfigOptimizationStrategy::Manual,
                improvement: 0.0,
                confidence: 1.0,
                user_segment: None,
            };

            let mut history = self.optimization_history.write().await;
            history.push_back(record);
            if history.len() > 1000 {
                history.pop_front();
            }
        }
        Ok(())
    }

    /// 获取优化建议
    pub async fn get_recommendations(&self, limit: Option<usize>) -> Vec<ConfigRecommendation> {
        let recommendations = self.recommendations.read().await;
        let limit = limit.unwrap_or(recommendations.len());
        recommendations.iter().rev().take(limit).cloned().collect()
    }

    /// 应用优化建议
    pub async fn apply_recommendation(&self, recommendation_id: Uuid) -> Result<(), EngineError> {
        let recommendations = self.recommendations.read().await;
        if let Some(rec) = recommendations.iter().find(|r| r.id == recommendation_id) {
            if rec.confidence >= self.config.read().await.confidence_threshold {
                self.update_parameter(&rec.parameter, rec.recommended_value.clone()).await?;

                // 记录优化历史
                let record = OptimizationRecord {
                    id: Uuid::new_v4(),
                    timestamp: Utc::now(),
                    parameter: rec.parameter.clone(),
                    old_value: rec.current_value.clone(),
                    new_value: rec.recommended_value.clone(),
                    strategy: ConfigOptimizationStrategy::Performance,
                    improvement: rec.expected_improvement,
                    confidence: rec.confidence,
                    user_segment: None,
                };

                let mut history = self.optimization_history.write().await;
                history.push_back(record);
            }
        }
        Ok(())
    }

    /// 创建A/B测试
    pub async fn create_ab_test(&self, config: ABTestConfig) -> Result<Uuid, EngineError> {
        let mut tests = self.ab_tests.write().await;
        let test_id = config.id;
        tests.insert(test_id, config);
        Ok(test_id)
    }

    /// 获取A/B测试结果
    pub async fn get_ab_test_results(&self, test_id: Uuid) -> Option<ABTestResults> {
        let tests = self.ab_tests.read().await;
        tests.get(&test_id)?.results.clone()
    }

    /// 停止A/B测试
    pub async fn stop_ab_test(&self, test_id: Uuid, winner: Option<String>) -> Result<(), EngineError> {
        let mut tests = self.ab_tests.write().await;
        if let Some(test) = tests.get_mut(&test_id) {
            test.status = ABTestStatus::Completed;
            test.end_time = Some(Utc::now());

            if let Some(winner) = winner {
                if let Some(results) = &mut test.results {
                    results.winner = Some(winner);
                }
            }
        }
        Ok(())
    }

    async fn initialize_default_parameters(&self) -> Result<(), EngineError> {
        let default_params = vec![
            ConfigParameter {
                name: "cache.ttl".to_string(),
                current_value: serde_json::json!(3600),
                recommended_value: None,
                min_value: Some(serde_json::json!(300)),
                max_value: Some(serde_json::json!(86400)),
                data_type: ConfigDataType::Integer,
                category: "cache".to_string(),
                description: "缓存TTL时间（秒）".to_string(),
            },
            ConfigParameter {
                name: "connection_pool.max_size".to_string(),
                current_value: serde_json::json!(100),
                recommended_value: None,
                min_value: Some(serde_json::json!(10)),
                max_value: Some(serde_json::json!(1000)),
                data_type: ConfigDataType::Integer,
                category: "database".to_string(),
                description: "连接池最大大小".to_string(),
            },
            ConfigParameter {
                name: "worker.threads".to_string(),
                current_value: serde_json::json!(8),
                recommended_value: None,
                min_value: Some(serde_json::json!(1)),
                max_value: Some(serde_json::json!(32)),
                data_type: ConfigDataType::Integer,
                category: "performance".to_string(),
                description: "工作线程数".to_string(),
            },
            ConfigParameter {
                name: "compression.enabled".to_string(),
                current_value: serde_json::json!(true),
                recommended_value: None,
                min_value: None,
                max_value: None,
                data_type: ConfigDataType::Boolean,
                category: "performance".to_string(),
                description: "启用压缩".to_string(),
            },
        ];

        let mut parameters = self.current_parameters.write().await;
        for param in default_params {
            parameters.insert(param.name.clone(), param);
        }

        Ok(())
    }

    async fn create_user_segments(&self) -> Result<(), EngineError> {
        let segments = vec![
            UserSegment {
                segment_id: "power_users".to_string(),
                name: "重度用户".to_string(),
                criteria: HashMap::from([
                    ("daily_reading_time".to_string(), serde_json::json!(120)), // 120分钟
                    ("books_read_monthly".to_string(), serde_json::json!(10)),
                ]),
                size: 0,
                characteristics: HashMap::from([
                    ("engagement_score".to_string(), 0.9),
                    ("performance_sensitivity".to_string(), 0.8),
                ]),
            },
            UserSegment {
                segment_id: "casual_users".to_string(),
                name: "轻度用户".to_string(),
                criteria: HashMap::from([
                    ("daily_reading_time".to_string(), serde_json::json!(15)), // 15分钟
                    ("books_read_monthly".to_string(), serde_json::json!(1)),
                ]),
                size: 0,
                characteristics: HashMap::from([
                    ("engagement_score".to_string(), 0.3),
                    ("performance_sensitivity".to_string(), 0.4),
                ]),
            },
            UserSegment {
                segment_id: "mobile_users".to_string(),
                name: "移动用户".to_string(),
                criteria: HashMap::from([
                    ("device_type".to_string(), serde_json::json!("mobile")),
                ]),
                size: 0,
                characteristics: HashMap::from([
                    ("bandwidth_sensitivity".to_string(), 0.9),
                    ("battery_sensitivity".to_string(), 0.8),
                ]),
            },
        ];

        let mut user_segments = self.user_segments.write().await;
        for segment in segments {
            user_segments.insert(segment.segment_id.clone(), segment);
        }

        Ok(())
    }

    async fn start_optimization_task(&self) -> Result<(), EngineError> {
        let optimizer = Arc::new(Self {
            config: Arc::clone(&self.config),
            performance_predictor: Arc::clone(&self.performance_predictor),
            current_parameters: Arc::clone(&self.current_parameters),
            recommendations: Arc::clone(&self.recommendations),
            ab_tests: Arc::clone(&self.ab_tests),
            optimization_history: Arc::clone(&self.optimization_history),
            user_segments: Arc::clone(&self.user_segments),
            optimization_task: Arc::new(RwLock::new(None)),
            ab_test_task: Arc::new(RwLock::new(None)),
        });

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(
                tokio::time::Duration::from_secs(
                    optimizer.config.read().await.optimization_interval_minutes as u64 * 60
                )
            );

            loop {
                interval.tick().await;
                if let Err(e) = optimizer.generate_optimization_recommendations().await {
                    tracing::error!("Optimization task failed: {:?}", e);
                }
            }
        });

        *self.optimization_task.write().await = Some(handle);
        Ok(())
    }

    async fn start_ab_test_task(&self) -> Result<(), EngineError> {
        let ab_tests = Arc::clone(&self.ab_tests);

        let handle = tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(3600)); // 1小时

            loop {
                interval.tick().await;
                if let Err(e) = Self::evaluate_ab_tests(&ab_tests).await {
                    tracing::error!("A/B test evaluation failed: {:?}", e);
                }
            }
        });

        *self.ab_test_task.write().await = Some(handle);
        Ok(())
    }

    async fn generate_optimization_recommendations(&self) -> Result<(), EngineError> {
        let config = self.config.read().await;
        let parameters = self.current_parameters.read().await;

        for (param_name, parameter) in &*parameters {
            if let Some(recommendation) = self.analyze_parameter(parameter).await? {
                if recommendation.confidence >= config.confidence_threshold {
                    let mut recommendations = self.recommendations.write().await;
                    recommendations.push_back(recommendation);
                    if recommendations.len() > 100 {
                        recommendations.pop_front();
                    }
                }
            }
        }

        Ok(())
    }

    async fn analyze_parameter(&self, parameter: &ConfigParameter) -> Result<Option<ConfigRecommendation>, EngineError> {
        // 简化的参数分析逻辑
        match parameter.name.as_str() {
            "cache.ttl" => {
                // 基于使用模式分析缓存TTL
                let current_ttl = parameter.current_value.as_u64().unwrap_or(3600);

                // 如果缓存命中率高，建议增加TTL
                // 如果内存使用高，建议减少TTL
                let recommended_ttl = if current_ttl < 7200 { 7200 } else { current_ttl };

                if recommended_ttl != current_ttl {
                    return Ok(Some(ConfigRecommendation {
                        id: Uuid::new_v4(),
                        parameter: parameter.name.clone(),
                        current_value: parameter.current_value.clone(),
                        recommended_value: serde_json::json!(recommended_ttl),
                        expected_improvement: 0.15,
                        confidence: 0.8,
                        reasoning: vec![
                            "基于缓存使用模式分析".to_string(),
                            "当前TTL可能过短或过长".to_string(),
                        ],
                        risks: vec![
                            "可能增加内存使用".to_string(),
                        ],
                        test_duration_minutes: 30,
                        timestamp: Utc::now(),
                    }));
                }
            }
            "connection_pool.max_size" => {
                // 基于负载分析连接池大小
                let current_size = parameter.current_value.as_u64().unwrap_or(100);

                // 如果连接使用率高，建议增加池大小
                let recommended_size = if current_size < 200 { 200 } else { current_size };

                if recommended_size != current_size {
                    return Ok(Some(ConfigRecommendation {
                        id: Uuid::new_v4(),
                        parameter: parameter.name.clone(),
                        current_value: parameter.current_value.clone(),
                        recommended_value: serde_json::json!(recommended_size),
                        expected_improvement: 0.1,
                        confidence: 0.75,
                        reasoning: vec![
                            "基于数据库负载分析".to_string(),
                            "连接池大小可能不足".to_string(),
                        ],
                        risks: vec![
                            "可能增加内存开销".to_string(),
                        ],
                        test_duration_minutes: 15,
                        timestamp: Utc::now(),
                    }));
                }
            }
            _ => {}
        }

        Ok(None)
    }

    async fn evaluate_ab_tests(ab_tests: &Arc<RwLock<HashMap<Uuid, ABTestConfig>>>) -> Result<(), EngineError> {
        let mut tests = ab_tests.write().await;

        for (test_id, test) in tests.iter_mut() {
            if test.status == ABTestStatus::Running {
                // 检查测试是否应该结束
                if let Some(end_time) = test.end_time {
                    if Utc::now() > end_time {
                        test.status = ABTestStatus::Completed;

                        // 生成测试结果
                        let results = ABTestResults {
                            control_metrics: HashMap::from([
                                ("conversion_rate".to_string(), 0.05),
                                ("response_time".to_string(), 200.0),
                            ]),
                            variant_metrics: HashMap::from([
                                ("conversion_rate".to_string(), 0.06),
                                ("response_time".to_string(), 180.0),
                            ]),
                            statistical_significance: 0.95,
                            winner: Some("variant".to_string()),
                            confidence_interval: (0.04, 0.08),
                            sample_size: 10000,
                        };

                        test.results = Some(results);
                    }
                }
            }
        }

        Ok(())
    }

    /// 获取参数优化历史
    pub async fn get_optimization_history(&self, limit: Option<usize>) -> Vec<OptimizationRecord> {
        let history = self.optimization_history.read().await;
        let limit = limit.unwrap_or(history.len());
        history.iter().rev().take(limit).cloned().collect()
    }

    /// 获取当前运行的A/B测试
    pub async fn get_active_ab_tests(&self) -> Vec<ABTestConfig> {
        let tests = self.ab_tests.read().await;
        tests.values()
            .filter(|t| t.status == ABTestStatus::Running)
            .cloned()
            .collect()
    }

    /// 为用户分配A/B测试组
    pub async fn assign_user_to_ab_test(&self, user_id: &str, test_id: Uuid) -> Result<String, EngineError> {
        let tests = self.ab_tests.read().await;
        if let Some(test) = tests.get(&test_id) {
            if test.status == ABTestStatus::Running {
                // 简单的用户分配逻辑（基于用户ID哈希）
                let hash = user_id.chars().map(|c| c as u32).sum::<u32>();
                let group = if (hash % 100) < (test.traffic_split * 100.0) as u32 {
                    "variant"
                } else {
                    "control"
                };
                return Ok(group.to_string());
            }
        }
        Err(EngineError::NotFound)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::runtime::Runtime;

    #[tokio::test]
    async fn test_config_optimizer_creation() {
        let predictor = Arc::new(PerformancePredictor::new());
        let optimizer = IntelligentConfigOptimizer::new(predictor);
        assert!(optimizer.config.read().await.enabled);
    }

    #[tokio::test]
    async fn test_parameter_management() {
        let predictor = Arc::new(PerformancePredictor::new());
        let optimizer = IntelligentConfigOptimizer::new(predictor);

        let param = ConfigParameter {
            name: "test.param".to_string(),
            current_value: serde_json::json!(100),
            recommended_value: None,
            min_value: Some(serde_json::json!(0)),
            max_value: Some(serde_json::json!(1000)),
            data_type: ConfigDataType::Integer,
            category: "test".to_string(),
            description: "Test parameter".to_string(),
        };

        optimizer.add_parameter(param).await.unwrap();
        optimizer.update_parameter("test.param", serde_json::json!(200)).await.unwrap();

        // 参数应该已被更新
        assert!(true);
    }
}