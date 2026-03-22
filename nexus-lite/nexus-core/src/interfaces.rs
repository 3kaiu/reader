//! Standardized Interfaces for Nexus Components
//!
//! This module defines the core interfaces that all Nexus components must implement
//! to ensure loose coupling and high cohesion.

use crate::error::EngineError;
use crate::types::{BookItem, Chapter, FetchResponse, TocItem};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Standard interface for book source engines
#[async_trait]
pub trait BookSourceEngine: Send + Sync {
    /// Get the engine name
    fn name(&self) -> &str;

    /// Get the engine version
    fn version(&self) -> &str;

    /// Check if the engine supports a given URL
    fn supports_url(&self, url: &str) -> bool;

    /// Search for books
    async fn search_books(
        &self,
        query: &str,
        page: Option<u32>,
    ) -> Result<Vec<BookItem>, EngineError>;

    /// Get book details
    async fn get_book_details(&self, url: &str) -> Result<BookItem, EngineError>;

    /// Get table of contents
    async fn get_table_of_contents(&self, url: &str) -> Result<Vec<TocItem>, EngineError>;

    /// Get chapter content
    async fn get_chapter_content(&self, url: &str) -> Result<Chapter, EngineError>;

    /// Test the engine connectivity
    async fn test_connectivity(&self) -> Result<(), EngineError>;

    /// Get engine health status
    fn health_status(&self) -> EngineHealthStatus;

    /// Get engine statistics
    fn statistics(&self) -> EngineStatistics;
}

/// Standard interface for fetchers (HTTP clients)
#[async_trait]
pub trait Fetcher: Send + Sync {
    /// Execute GET request
    async fn get(
        &self,
        url: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, EngineError>;

    /// Execute POST request
    async fn post(
        &self,
        url: &str,
        body: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, EngineError>;

    /// Get fetcher statistics
    fn statistics(&self) -> FetcherStatistics;
}

/// Standard interface for caches
#[async_trait]
pub trait Cache<K, V>: Send + Sync {
    /// Get value from cache
    async fn get(&self, key: &K) -> Result<Option<V>, EngineError>;

    /// Put value in cache
    async fn put(&self, key: K, value: V, ttl_seconds: Option<u64>) -> Result<(), EngineError>;

    /// Remove value from cache
    async fn remove(&self, key: &K) -> Result<(), EngineError>;

    /// Clear all cache entries
    async fn clear(&self) -> Result<(), EngineError>;

    /// Get cache statistics
    fn statistics(&self) -> CacheStatistics;
}

/// Standard interface for storage backends
#[async_trait]
pub trait Storage: Send + Sync {
    /// Store data
    async fn store(&self, key: &str, data: &[u8]) -> Result<(), EngineError>;

    /// Retrieve data
    async fn retrieve(&self, key: &str) -> Result<Option<Vec<u8>>, EngineError>;

    /// Delete data
    async fn delete(&self, key: &str) -> Result<(), EngineError>;

    /// List keys with prefix
    async fn list_keys(&self, prefix: &str) -> Result<Vec<String>, EngineError>;

    /// Get storage statistics
    fn statistics(&self) -> StorageStatistics;
}

/// Standard interface for configuration providers
#[async_trait]
pub trait ConfigProvider: Send + Sync {
    /// Get configuration value
    async fn get(&self, key: &str) -> Result<Option<serde_json::Value>, EngineError>;

    /// Set configuration value
    async fn set(&self, key: &str, value: serde_json::Value) -> Result<(), EngineError>;

    /// Watch configuration changes
    async fn watch(
        &self,
        key: &str,
    ) -> Result<tokio::sync::broadcast::Receiver<ConfigChangeEvent>, EngineError>;
}

/// Standard interface for health monitoring
#[async_trait]
pub trait HealthMonitor: Send + Sync {
    /// Record a successful operation
    async fn record_success(
        &self,
        operation: &str,
        duration_ms: u64,
        metadata: Option<HashMap<String, String>>,
    ) -> Result<(), EngineError>;

    /// Record a failed operation
    async fn record_failure(
        &self,
        operation: &str,
        error: &EngineError,
        metadata: Option<HashMap<String, String>>,
    ) -> Result<(), EngineError>;

    /// Get health status
    async fn health_status(&self) -> Result<HealthStatus, EngineError>;

    /// Get health statistics
    async fn statistics(&self) -> Result<HealthStatistics, EngineError>;
}

/// Standard interface for metrics collection
#[async_trait]
pub trait MetricsCollector: Send + Sync {
    /// Record a counter metric
    async fn increment_counter(
        &self,
        name: &str,
        value: u64,
        labels: Option<HashMap<String, String>>,
    ) -> Result<(), EngineError>;

    /// Record a gauge metric
    async fn set_gauge(
        &self,
        name: &str,
        value: f64,
        labels: Option<HashMap<String, String>>,
    ) -> Result<(), EngineError>;

    /// Record a histogram metric
    async fn record_histogram(
        &self,
        name: &str,
        value: f64,
        labels: Option<HashMap<String, String>>,
    ) -> Result<(), EngineError>;

    /// Get collected metrics
    async fn collect(&self) -> Result<HashMap<String, MetricValue>, EngineError>;
}

// ===== Data Structures =====

/// Engine health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineHealthStatus {
    pub status: HealthState,
    pub last_check: chrono::DateTime<chrono::Utc>,
    pub response_time_ms: Option<u64>,
    pub error_count: u64,
    pub success_count: u64,
}

/// Engine statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStatistics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub average_response_time_ms: f64,
    pub uptime_seconds: u64,
    pub memory_usage_bytes: Option<u64>,
}

/// Fetcher statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetcherStatistics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub total_bytes_downloaded: u64,
    pub average_response_time_ms: f64,
    pub active_connections: u32,
}

/// Cache statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStatistics {
    pub total_entries: u64,
    pub hit_count: u64,
    pub miss_count: u64,
    pub eviction_count: u64,
    pub hit_rate: f64,
    pub total_size_bytes: u64,
}

/// Storage statistics
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

/// Configuration change event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigChangeEvent {
    pub key: String,
    pub old_value: Option<serde_json::Value>,
    pub new_value: serde_json::Value,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Health state enumeration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HealthState {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

/// Overall health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub overall_state: HealthState,
    pub components: HashMap<String, ComponentHealth>,
    pub last_check: chrono::DateTime<chrono::Utc>,
}

/// Component health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentHealth {
    pub state: HealthState,
    pub response_time_ms: Option<u64>,
    pub error_message: Option<String>,
    pub last_success: Option<chrono::DateTime<chrono::Utc>>,
    pub last_failure: Option<chrono::DateTime<chrono::Utc>>,
}

/// Health statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatistics {
    pub total_checks: u64,
    pub successful_checks: u64,
    pub failed_checks: u64,
    pub average_response_time_ms: f64,
    pub uptime_percentage: f64,
}

/// Metric value types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum MetricValue {
    Counter(u64),
    Gauge(f64),
    Histogram(Vec<f64>),
}

// ===== Default Implementations =====

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
