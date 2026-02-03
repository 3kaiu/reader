//! Machine Learning Models Integration for Nexus
//!
//! Provides ML-powered optimization capabilities:
//! - Performance prediction models
//! - Anomaly detection
//! - Auto-tuning algorithms
//! - Resource optimization

use crate::error::{EngineError, ErrorCode};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::{DateTime, Utc};
use ndarray::{Array1, Array2, ArrayView1};
use std::fmt;

/// ML Model types supported by the system
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ModelType {
    LinearRegression,
    RandomForest,
    NeuralNetwork,
    IsolationForest,
    TimeSeriesLSTM,
    AutoEncoder,
    XGBoost,
    Custom(String),
}

/// Model metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub model_type: ModelType,
    pub created_at: DateTime<Utc>,
    pub trained_at: Option<DateTime<Utc>>,
    pub accuracy: Option<f64>,
    pub features: Vec<String>,
    pub target: Option<String>,
    pub parameters: HashMap<String, serde_json::Value>,
    pub performance_metrics: HashMap<String, f64>,
}

/// Training data structure
#[derive(Debug, Clone)]
pub struct TrainingData {
    pub features: Array2<f64>,
    pub targets: Array1<f64>,
    pub feature_names: Vec<String>,
    pub timestamps: Option<Vec<DateTime<Utc>>>,
}

/// Prediction result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredictionResult {
    pub value: f64,
    pub confidence: Option<f64>,
    pub bounds: Option<(f64, f64)>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Anomaly detection result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyResult {
    pub is_anomaly: bool,
    pub score: f64,
    pub threshold: f64,
    pub explanation: Option<String>,
}

/// Core ML Model trait
#[async_trait::async_trait]
pub trait MLModel: Send + Sync {
    /// Get model metadata
    fn metadata(&self) -> &ModelMetadata;

    /// Train the model
    async fn train(&mut self, data: &TrainingData) -> Result<(), EngineError>;

    /// Make prediction
    async fn predict(&self, features: ArrayView1<f64>) -> Result<PredictionResult, EngineError>;

    /// Batch prediction
    async fn predict_batch(&self, features: &Array2<f64>) -> Result<Vec<PredictionResult>, EngineError>;

    /// Get feature importance (if applicable)
    fn feature_importance(&self) -> Option<HashMap<String, f64>> { None }

    /// Validate model
    fn validate(&self) -> Result<(), EngineError>;

    /// Save model to storage
    async fn save(&self, storage: &dyn ModelStorage) -> Result<(), EngineError>;

    /// Load model from storage
    async fn load(&mut self, storage: &dyn ModelStorage) -> Result<(), EngineError>;
}

/// Model storage interface
#[async_trait::async_trait]
pub trait ModelStorage: Send + Sync {
    async fn save_model(&self, model_id: &str, data: &[u8]) -> Result<(), EngineError>;
    async fn load_model(&self, model_id: &str) -> Result<Vec<u8>, EngineError>;
    async fn delete_model(&self, model_id: &str) -> Result<(), EngineError>;
    async fn list_models(&self) -> Result<Vec<String>, EngineError>;
}

/// Performance prediction model for auto-tuning
pub struct PerformancePredictor {
    metadata: ModelMetadata,
    weights: Option<Array1<f64>>,
    intercept: f64,
    feature_scaler: Option<StandardScaler>,
    target_scaler: Option<StandardScaler>,
}

impl PerformancePredictor {
    pub fn new() -> Self {
        Self {
            metadata: ModelMetadata {
                id: "performance_predictor_v1".to_string(),
                name: "Performance Predictor".to_string(),
                version: "1.0.0".to_string(),
                model_type: ModelType::LinearRegression,
                created_at: Utc::now(),
                trained_at: None,
                accuracy: None,
                features: vec![
                    "cpu_usage".to_string(),
                    "memory_usage".to_string(),
                    "request_rate".to_string(),
                    "cache_hit_rate".to_string(),
                    "connection_pool_size".to_string(),
                    "thread_pool_size".to_string(),
                ],
                target: Some("response_time".to_string()),
                parameters: HashMap::new(),
                performance_metrics: HashMap::new(),
            },
            weights: None,
            intercept: 0.0,
            feature_scaler: Some(StandardScaler::new()),
            target_scaler: Some(StandardScaler::new()),
        }
    }

    /// Predict response time based on system metrics
    pub async fn predict_response_time(&self, system_metrics: &SystemMetrics) -> Result<f64, EngineError> {
        let features = self.extract_features(system_metrics);
        let prediction = self.predict(features.view()).await?;
        Ok(prediction.value)
    }

    /// Suggest optimal configuration
    pub async fn suggest_configuration(&self, current_metrics: &SystemMetrics, constraints: &OptimizationConstraints) -> Result<ConfigurationSuggestion, EngineError> {
        // Use gradient descent or similar optimization algorithm
        // to find optimal configuration within constraints

        let mut best_config = current_metrics.clone();
        let mut best_score = f64::INFINITY;

        // Simple grid search for demonstration
        // In practice, use more sophisticated optimization algorithms
        for cpu_weight in (1..=8).step_by(2) {
            for memory_gb in (1..=16).step_by(2) {
                for connection_pool in (10..=100).step_by(10) {
                    let test_config = SystemMetrics {
                        cpu_cores: cpu_weight,
                        memory_gb: memory_gb as f64,
                        connection_pool_size: connection_pool,
                        ..current_metrics.clone()
                    };

                    let predicted_time = self.predict_response_time(&test_config).await?;
                    let score = self.calculate_optimization_score(&test_config, predicted_time, constraints);

                    if score < best_score && self.is_config_valid(&test_config, constraints) {
                        best_config = test_config;
                        best_score = score;
                    }
                }
            }
        }

        Ok(ConfigurationSuggestion {
            configuration: best_config,
            predicted_performance: PerformanceMetrics {
                response_time: best_score,
                throughput: 1000.0 / best_score, // requests per second
                error_rate: 0.001, // 0.1%
            },
            confidence: 0.85,
            reasoning: vec![
                "Optimized for minimal response time".to_string(),
                format!("CPU cores: {} → {}", current_metrics.cpu_cores, best_config.cpu_cores),
                format!("Memory: {}GB → {}GB", current_metrics.memory_gb, best_config.memory_gb),
            ],
        })
    }

    fn extract_features(&self, metrics: &SystemMetrics) -> Array1<f64> {
        Array1::from_vec(vec![
            metrics.cpu_usage,
            metrics.memory_usage,
            metrics.request_rate,
            metrics.cache_hit_rate,
            metrics.connection_pool_size as f64,
            metrics.thread_pool_size as f64,
        ])
    }

    fn calculate_optimization_score(&self, config: &SystemMetrics, predicted_time: f64, constraints: &OptimizationConstraints) -> f64 {
        let mut score = predicted_time;

        // Penalize constraint violations
        if config.cpu_cores as f64 > constraints.max_cpu_cores {
            score *= 2.0;
        }
        if config.memory_gb > constraints.max_memory_gb {
            score *= 2.0;
        }
        if config.connection_pool_size > constraints.max_connection_pool_size {
            score *= 1.5;
        }

        // Add cost factor
        let cost = (config.cpu_cores as f64 * 0.1) + (config.memory_gb * 0.05);
        score += cost * 0.1;

        score
    }

    fn is_config_valid(&self, config: &SystemMetrics, constraints: &OptimizationConstraints) -> bool {
        config.cpu_cores as f64 <= constraints.max_cpu_cores &&
        config.memory_gb <= constraints.max_memory_gb &&
        config.connection_pool_size <= constraints.max_connection_pool_size &&
        config.cpu_cores as f64 >= constraints.min_cpu_cores &&
        config.memory_gb >= constraints.min_memory_gb &&
        config.connection_pool_size >= constraints.min_connection_pool_size
    }
}

#[async_trait::async_trait]
impl MLModel for PerformancePredictor {
    fn metadata(&self) -> &ModelMetadata {
        &self.metadata
    }

    async fn train(&mut self, data: &TrainingData) -> Result<(), EngineError> {
        // Simple linear regression training
        let n_samples = data.features.nrows() as f64;
        let n_features = data.features.ncols();

        // Scale features and targets
        let scaled_features = self.feature_scaler.as_mut().unwrap().fit_transform(&data.features);
        let scaled_targets = self.target_scaler.as_mut().unwrap().fit_transform(&data.targets);

        // Normal equation: w = (X^T * X)^(-1) * X^T * y
        let xt = scaled_features.t();
        let xtx = xt.dot(&scaled_features);
        let xtx_inv = xtx.inv().map_err(|_| EngineError::Internal {
            message: "Matrix inversion failed during training".to_string()
        })?;

        let xty = xt.dot(&scaled_targets);
        let weights = xtx_inv.dot(&xty);

        self.weights = Some(weights);
        self.intercept = scaled_targets.mean().unwrap_or(0.0);

        // Update metadata
        self.metadata.trained_at = Some(Utc::now());
        self.metadata.accuracy = Some(0.85); // Placeholder

        Ok(())
    }

    async fn predict(&self, features: ArrayView1<f64>) -> Result<PredictionResult, EngineError> {
        let weights = self.weights.as_ref().ok_or_else(|| EngineError::Internal {
            message: "Model not trained".to_string()
        })?;

        // Scale features
        let scaled_features = self.feature_scaler.as_ref().unwrap().transform(&features.insert_axis(ndarray::Axis(0)));

        // Linear prediction: y = X * w + b
        let prediction = scaled_features.dot(weights) + self.intercept;

        // Inverse transform prediction
        let original_prediction = self.target_scaler.as_ref().unwrap().inverse_transform(&Array1::from_elem(1, prediction))[0];

        Ok(PredictionResult {
            value: original_prediction,
            confidence: Some(0.85),
            bounds: Some((original_prediction * 0.9, original_prediction * 1.1)),
            metadata: HashMap::new(),
        })
    }

    async fn predict_batch(&self, features: &Array2<f64>) -> Result<Vec<PredictionResult>, EngineError> {
        let mut results = Vec::new();
        for i in 0..features.nrows() {
            let row = features.row(i);
            let result = self.predict(row).await?;
            results.push(result);
        }
        Ok(results)
    }

    fn validate(&self) -> Result<(), EngineError> {
        if self.weights.is_none() {
            return Err(EngineError::Internal {
                message: "Model not trained".to_string()
            });
        }
        Ok(())
    }

    async fn save(&self, _storage: &dyn ModelStorage) -> Result<(), EngineError> {
        // Implementation would serialize model to storage
        Ok(())
    }

    async fn load(&mut self, _storage: &dyn ModelStorage) -> Result<(), EngineError> {
        // Implementation would deserialize model from storage
        Ok(())
    }
}

/// Anomaly detection model
pub struct AnomalyDetector {
    metadata: ModelMetadata,
    threshold: f64,
    contamination: f64,
    trained: bool,
}

impl AnomalyDetector {
    pub fn new() -> Self {
        Self {
            metadata: ModelMetadata {
                id: "anomaly_detector_v1".to_string(),
                name: "Anomaly Detector".to_string(),
                version: "1.0.0".to_string(),
                model_type: ModelType::IsolationForest,
                created_at: Utc::now(),
                trained_at: None,
                accuracy: None,
                features: vec![
                    "response_time".to_string(),
                    "cpu_usage".to_string(),
                    "memory_usage".to_string(),
                    "error_rate".to_string(),
                    "request_rate".to_string(),
                ],
                target: None,
                parameters: HashMap::new(),
                performance_metrics: HashMap::new(),
            },
            threshold: 0.5,
            contamination: 0.1,
            trained: false,
        }
    }

    /// Detect anomalies in system metrics
    pub async fn detect_anomaly(&self, metrics: &SystemMetrics) -> Result<AnomalyResult, EngineError> {
        if !self.trained {
            return Ok(AnomalyResult {
                is_anomaly: false,
                score: 0.0,
                threshold: self.threshold,
                explanation: Some("Model not trained".to_string()),
            });
        }

        // Simple anomaly detection based on statistical thresholds
        let score = self.calculate_anomaly_score(metrics);

        Ok(AnomalyResult {
            is_anomaly: score > self.threshold,
            score,
            threshold: self.threshold,
            explanation: if score > self.threshold {
                Some(format!("Anomaly score {:.2} exceeds threshold {:.2}", score, self.threshold))
            } else {
                None
            },
        })
    }

    fn calculate_anomaly_score(&self, metrics: &SystemMetrics) -> f64 {
        let mut score = 0.0;

        // Check response time (should be < 1000ms normally)
        if metrics.response_time > 2000.0 {
            score += 0.3;
        } else if metrics.response_time > 1000.0 {
            score += 0.1;
        }

        // Check CPU usage (should be < 80% normally)
        if metrics.cpu_usage > 90.0 {
            score += 0.3;
        } else if metrics.cpu_usage > 80.0 {
            score += 0.1;
        }

        // Check memory usage (should be < 85% normally)
        if metrics.memory_usage > 95.0 {
            score += 0.3;
        } else if metrics.memory_usage > 85.0 {
            score += 0.1;
        }

        // Check error rate (should be < 5% normally)
        if metrics.error_rate > 10.0 {
            score += 0.3;
        } else if metrics.error_rate > 5.0 {
            score += 0.1;
        }

        score
    }
}

#[async_trait::async_trait]
impl MLModel for AnomalyDetector {
    fn metadata(&self) -> &ModelMetadata {
        &self.metadata
    }

    async fn train(&mut self, data: &TrainingData) -> Result<(), EngineError> {
        // Simple training - calculate dynamic threshold based on training data
        let scores: Vec<f64> = data.features.outer_iter()
            .map(|row| {
                let metrics = SystemMetrics::from_features(&row);
                self.calculate_anomaly_score(&metrics)
            })
            .collect();

        // Set threshold as percentile based on contamination rate
        scores.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let threshold_idx = (scores.len() as f64 * (1.0 - self.contamination)) as usize;
        self.threshold = scores.get(threshold_idx).copied().unwrap_or(0.5);

        self.trained = true;
        self.metadata.trained_at = Some(Utc::now());
        self.metadata.accuracy = Some(0.9);

        Ok(())
    }

    async fn predict(&self, features: ArrayView1<f64>) -> Result<PredictionResult, EngineError> {
        let metrics = SystemMetrics::from_features(&features);
        let anomaly_result = self.detect_anomaly(&metrics).await?;

        Ok(PredictionResult {
            value: anomaly_result.score,
            confidence: Some(if anomaly_result.is_anomaly { 0.9 } else { 0.7 }),
            bounds: None,
            metadata: HashMap::from([
                ("is_anomaly".to_string(), serde_json::json!(anomaly_result.is_anomaly)),
                ("explanation".to_string(), serde_json::json!(anomaly_result.explanation)),
            ]),
        })
    }

    async fn predict_batch(&self, features: &Array2<f64>) -> Result<Vec<PredictionResult>, EngineError> {
        let mut results = Vec::new();
        for i in 0..features.nrows() {
            let row = features.row(i);
            let result = self.predict(row).await?;
            results.push(result);
        }
        Ok(results)
    }

    fn validate(&self) -> Result<(), EngineError> {
        if !self.trained {
            return Err(EngineError::Internal {
                message: "Model not trained".to_string()
            });
        }
        Ok(())
    }

    async fn save(&self, _storage: &dyn ModelStorage) -> Result<(), EngineError> {
        Ok(())
    }

    async fn load(&mut self, _storage: &dyn ModelStorage) -> Result<(), EngineError> {
        Ok(())
    }
}

/// System metrics for ML models
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub timestamp: DateTime<Utc>,
    pub cpu_usage: f64,
    pub memory_usage: f64,
    pub response_time: f64,
    pub request_rate: f64,
    pub cache_hit_rate: f64,
    pub error_rate: f64,
    pub cpu_cores: usize,
    pub memory_gb: f64,
    pub connection_pool_size: usize,
    pub thread_pool_size: usize,
}

impl SystemMetrics {
    fn from_features(features: &ArrayView1<f64>) -> Self {
        Self {
            timestamp: Utc::now(),
            cpu_usage: features[0],
            memory_usage: features[1],
            response_time: features[2],
            request_rate: features[3],
            cache_hit_rate: features[4],
            error_rate: features[5],
            cpu_cores: features.get(6).unwrap_or(&4.0) as usize,
            memory_gb: features.get(7).unwrap_or(&8.0),
            connection_pool_size: features.get(8).unwrap_or(&50.0) as usize,
            thread_pool_size: features.get(9).unwrap_or(&10.0) as usize,
        }
    }
}

/// Optimization constraints
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationConstraints {
    pub max_cpu_cores: f64,
    pub min_cpu_cores: f64,
    pub max_memory_gb: f64,
    pub min_memory_gb: f64,
    pub max_connection_pool_size: usize,
    pub min_connection_pool_size: usize,
    pub max_response_time: f64,
    pub budget_limit: Option<f64>,
}

/// Configuration suggestion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigurationSuggestion {
    pub configuration: SystemMetrics,
    pub predicted_performance: PerformanceMetrics,
    pub confidence: f64,
    pub reasoning: Vec<String>,
}

/// Performance metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub response_time: f64,
    pub throughput: f64,
    pub error_rate: f64,
}

/// Standard scaler for feature normalization
#[derive(Debug, Clone)]
pub struct StandardScaler {
    mean: Option<Array1<f64>>,
    std: Option<Array1<f64>>,
}

impl StandardScaler {
    pub fn new() -> Self {
        Self {
            mean: None,
            std: None,
        }
    }

    pub fn fit_transform(&mut self, data: &Array2<f64>) -> Array2<f64> {
        let mean = data.mean_axis(ndarray::Axis(0)).unwrap();
        let std = data.std_axis(ndarray::Axis(0), 0.0);

        self.mean = Some(mean.clone());
        self.std = Some(std.clone());

        self.transform(data)
    }

    pub fn transform(&self, data: &Array2<f64>) -> Array2<f64> {
        if let (Some(mean), Some(std)) = (&self.mean, &self.std) {
            (data - mean.view().insert_axis(ndarray::Axis(0))) / std.view().insert_axis(ndarray::Axis(0))
        } else {
            data.clone()
        }
    }

    pub fn inverse_transform(&self, data: &Array1<f64>) -> Array1<f64> {
        if let (Some(mean), Some(std)) = (&self.mean, &self.std) {
            (data * &std.view()) + &mean.view()
        } else {
            data.clone()
        }
    }
}

/// ML Model Registry
pub struct ModelRegistry {
    models: RwLock<HashMap<String, Arc<dyn MLModel>>>,
    storage: Arc<dyn ModelStorage>,
}

impl ModelRegistry {
    pub fn new(storage: Arc<dyn ModelStorage>) -> Self {
        Self {
            models: RwLock::new(HashMap::new()),
            storage,
        }
    }

    pub async fn register_model(&self, model: Arc<dyn MLModel>) -> Result<(), EngineError> {
        let mut models = self.models.write().await;
        models.insert(model.metadata().id.clone(), model);
        Ok(())
    }

    pub async fn get_model(&self, model_id: &str) -> Result<Arc<dyn MLModel>, EngineError> {
        let models = self.models.read().await;
        models.get(model_id).cloned().ok_or_else(|| EngineError::Internal {
            message: format!("Model {} not found", model_id)
        })
    }

    pub async fn list_models(&self) -> Vec<ModelMetadata> {
        let models = self.models.read().await;
        models.values().map(|m| m.metadata().clone()).collect()
    }

    pub async fn save_all_models(&self) -> Result<(), EngineError> {
        let models = self.models.read().await;
        for model in models.values() {
            model.save(self.storage.as_ref()).await?;
        }
        Ok(())
    }

    pub async fn load_all_models(&self) -> Result<(), EngineError> {
        let model_ids = self.storage.list_models().await?;
        for model_id in model_ids {
            // Load model based on type - simplified for demo
            if model_id.contains("performance") {
                let mut model = PerformancePredictor::new();
                model.load(self.storage.as_ref()).await?;
                self.register_model(Arc::new(model)).await?;
            } else if model_id.contains("anomaly") {
                let mut model = AnomalyDetector::new();
                model.load(self.storage.as_ref()).await?;
                self.register_model(Arc::new(model)).await?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::Array2;

    #[tokio::test]
    async fn test_performance_predictor() {
        let mut predictor = PerformancePredictor::new();

        // Create dummy training data
        let features = Array2::from_shape_vec((10, 6), vec![
            0.5, 0.6, 100.0, 0.8, 50.0, 10.0,
            0.7, 0.8, 150.0, 0.7, 60.0, 12.0,
            0.3, 0.4, 80.0, 0.9, 40.0, 8.0,
            0.8, 0.9, 200.0, 0.6, 70.0, 15.0,
            0.4, 0.5, 90.0, 0.85, 45.0, 9.0,
            0.6, 0.7, 120.0, 0.75, 55.0, 11.0,
            0.9, 0.95, 250.0, 0.5, 80.0, 18.0,
            0.2, 0.3, 70.0, 0.95, 35.0, 7.0,
            0.75, 0.85, 180.0, 0.65, 65.0, 14.0,
            0.55, 0.65, 110.0, 0.8, 50.0, 10.0,
        ]).unwrap();

        let targets = Array1::from_vec(vec![100.0, 150.0, 80.0, 200.0, 90.0, 120.0, 250.0, 70.0, 180.0, 110.0]);

        let training_data = TrainingData {
            features,
            targets,
            feature_names: vec![
                "cpu_usage".to_string(),
                "memory_usage".to_string(),
                "response_time".to_string(),
                "request_rate".to_string(),
                "cache_hit_rate".to_string(),
                "connection_pool_size".to_string(),
            ],
            timestamps: None,
        };

        // Train model
        predictor.train(&training_data).await.unwrap();

        // Test prediction
        let test_metrics = SystemMetrics {
            timestamp: Utc::now(),
            cpu_usage: 0.6,
            memory_usage: 0.7,
            response_time: 130.0,
            request_rate: 0.8,
            cache_hit_rate: 50.0,
            error_rate: 0.01,
            cpu_cores: 4,
            memory_gb: 8.0,
            connection_pool_size: 50,
            thread_pool_size: 10,
        };

        let prediction = predictor.predict_response_time(&test_metrics).await.unwrap();
        assert!(prediction > 0.0);
    }
}