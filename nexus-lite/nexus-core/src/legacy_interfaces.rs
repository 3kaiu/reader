//! Legacy interface surface kept for backward compatibility.
//!
//! New architecture work should prefer:
//! - `crate::book_engine` for engine contracts
//! - `crate::traits` for fetch/anti-crawl contracts
//! - `crate::types` for runtime DTOs

use crate::error::EngineError;
pub use crate::traits::{Fetcher, FetcherStatistics};
use crate::types::{BookItem, Chapter, TocItem};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Legacy standard interface for book source engines.
#[async_trait]
pub trait BookSourceEngine: Send + Sync {
    fn name(&self) -> &str;
    fn version(&self) -> &str;
    fn supports_url(&self, url: &str) -> bool;

    async fn search_books(
        &self,
        query: &str,
        page: Option<u32>,
    ) -> Result<Vec<BookItem>, EngineError>;

    async fn get_book_details(&self, url: &str) -> Result<BookItem, EngineError>;
    async fn get_table_of_contents(&self, url: &str) -> Result<Vec<TocItem>, EngineError>;
    async fn get_chapter_content(&self, url: &str) -> Result<Chapter, EngineError>;
    async fn test_connectivity(&self) -> Result<(), EngineError>;
    fn health_status(&self) -> EngineHealthStatus;
    fn statistics(&self) -> EngineStatistics;
}

#[async_trait]
pub trait Cache<K, V>: Send + Sync {
    async fn get(&self, key: &K) -> Result<Option<V>, EngineError>;
    async fn put(&self, key: K, value: V, ttl_seconds: Option<u64>) -> Result<(), EngineError>;
    async fn remove(&self, key: &K) -> Result<(), EngineError>;
    async fn clear(&self) -> Result<(), EngineError>;
    fn statistics(&self) -> CacheStatistics;
}

#[async_trait]
pub trait Storage: Send + Sync {
    async fn store(&self, key: &str, data: &[u8]) -> Result<(), EngineError>;
    async fn retrieve(&self, key: &str) -> Result<Option<Vec<u8>>, EngineError>;
    async fn delete(&self, key: &str) -> Result<(), EngineError>;
    async fn list_keys(&self, prefix: &str) -> Result<Vec<String>, EngineError>;
    fn statistics(&self) -> StorageStatistics;
}

#[async_trait]
pub trait ConfigProvider: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<serde_json::Value>, EngineError>;
    async fn set(&self, key: &str, value: serde_json::Value) -> Result<(), EngineError>;
    async fn watch(
        &self,
        key: &str,
    ) -> Result<tokio::sync::broadcast::Receiver<ConfigChangeEvent>, EngineError>;
}

#[async_trait]
pub trait HealthMonitor: Send + Sync {
    async fn record_success(
        &self,
        operation: &str,
        duration_ms: u64,
        metadata: Option<HashMap<String, String>>,
    ) -> Result<(), EngineError>;

    async fn record_failure(
        &self,
        operation: &str,
        error: &EngineError,
        metadata: Option<HashMap<String, String>>,
    ) -> Result<(), EngineError>;

    async fn health_status(&self) -> Result<HealthStatus, EngineError>;
    async fn statistics(&self) -> Result<HealthStatistics, EngineError>;
}

#[async_trait]
pub trait MetricsCollector: Send + Sync {
    async fn increment_counter(
        &self,
        name: &str,
        value: u64,
        labels: Option<HashMap<String, String>>,
    ) -> Result<(), EngineError>;

    async fn set_gauge(
        &self,
        name: &str,
        value: f64,
        labels: Option<HashMap<String, String>>,
    ) -> Result<(), EngineError>;

    async fn record_histogram(
        &self,
        name: &str,
        value: f64,
        labels: Option<HashMap<String, String>>,
    ) -> Result<(), EngineError>;

    async fn collect(&self) -> Result<HashMap<String, MetricValue>, EngineError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineHealthStatus {
    pub status: HealthState,
    pub last_check: chrono::DateTime<chrono::Utc>,
    pub response_time_ms: Option<u64>,
    pub error_count: u64,
    pub success_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStatistics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub average_response_time_ms: f64,
    pub uptime_seconds: u64,
    pub memory_usage_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStatistics {
    pub total_entries: u64,
    pub hit_count: u64,
    pub miss_count: u64,
    pub eviction_count: u64,
    pub hit_rate: f64,
    pub total_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStatistics {
    pub total_files: u64,
    pub total_size_bytes: u64,
    pub read_operations: u64,
    pub write_operations: u64,
    pub delete_operations: u64,
    pub average_read_time_ms: f64,
    pub average_write_time_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigChangeEvent {
    pub key: String,
    pub old_value: Option<serde_json::Value>,
    pub new_value: serde_json::Value,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HealthState {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub overall_state: HealthState,
    pub components: HashMap<String, ComponentHealth>,
    pub last_check: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentHealth {
    pub state: HealthState,
    pub response_time_ms: Option<u64>,
    pub error_message: Option<String>,
    pub last_success: Option<chrono::DateTime<chrono::Utc>>,
    pub last_failure: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatistics {
    pub total_checks: u64,
    pub successful_checks: u64,
    pub failed_checks: u64,
    pub average_response_time_ms: f64,
    pub uptime_percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum MetricValue {
    Counter(u64),
    Gauge(f64),
    Histogram(Vec<f64>),
}

impl Default for EngineHealthStatus {
    fn default() -> Self {
        Self {
            status: HealthState::Unknown,
            last_check: chrono::Utc::now(),
            response_time_ms: None,
            error_count: 0,
            success_count: 0,
        }
    }
}

impl Default for EngineStatistics {
    fn default() -> Self {
        Self {
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            average_response_time_ms: 0.0,
            uptime_seconds: 0,
            memory_usage_bytes: None,
        }
    }
}
