//! NexusLite 统一接口定义
//!
//! 这是简化后的统一接口定义，整合了所有核心接口。
//! 新代码应该优先使用这些接口。

use crate::core::errors::EngineError;
use crate::core::types::{BookItem, Chapter, FetchResponse, TocItem};
use async_trait::async_trait;
use std::collections::HashMap;
use std::time::Duration;

/// 书源引擎接口
///
/// 所有书源引擎都必须实现此接口。
#[async_trait]
pub trait BookSourceEngine: Send + Sync {
    /// 获取引擎名称
    fn name(&self) -> &str;

    /// 获取引擎版本
    fn version(&self) -> &str;

    /// 检查引擎是否支持指定 URL
    fn supports_url(&self, url: &str) -> bool;

    /// 搜索书籍
    async fn search(&self, query: &str, page: Option<u32>) -> Result<Vec<BookItem>, EngineError>;

    /// 获取书籍详情
    async fn get_book(&self, url: &str) -> Result<BookItem, EngineError>;

    /// 获取目录
    async fn get_toc(&self, url: &str) -> Result<Vec<TocItem>, EngineError>;

    /// 获取章节内容
    async fn get_chapter(&self, url: &str) -> Result<Chapter, EngineError>;

    /// 测试连接
    async fn test_connection(&self) -> Result<(), EngineError>;

    /// 获取健康状态
    fn health_status(&self) -> EngineHealthStatus;
}

/// HTTP 客户端接口
#[async_trait]
pub trait HttpClient: Send + Sync {
    /// 执行 GET 请求
    async fn get(
        &self,
        url: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, EngineError>;

    /// 执行 POST 请求
    async fn post(
        &self,
        url: &str,
        body: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, EngineError>;

    /// 获取统计信息
    fn statistics(&self) -> ClientStatistics;
}

/// 缓存接口
#[async_trait]
pub trait Cache<K, V>: Send + Sync {
    /// 获取缓存值
    async fn get(&self, key: &K) -> Result<Option<V>, EngineError>;

    /// 设置缓存值
    async fn set(&self, key: K, value: V, ttl: Option<Duration>) -> Result<(), EngineError>;

    /// 删除缓存值
    async fn delete(&self, key: &K) -> Result<(), EngineError>;

    /// 清空所有缓存
    async fn clear(&self) -> Result<(), EngineError>;

    /// 获取统计信息
    fn statistics(&self) -> CacheStatistics;
}

/// 存储接口
#[async_trait]
pub trait Storage: Send + Sync {
    /// 存储数据
    async fn store(&self, key: &str, data: &[u8]) -> Result<(), EngineError>;

    /// 获取数据
    async fn retrieve(&self, key: &str) -> Result<Option<Vec<u8>>, EngineError>;

    /// 删除数据
    async fn delete(&self, key: &str) -> Result<(), EngineError>;

    /// 获取存储统计
    fn statistics(&self) -> StorageStatistics;
}

/// 引擎健康状态
#[derive(Debug, Clone, PartialEq)]
pub enum EngineHealthStatus {
    /// 健康
    Healthy,
    /// 降级
    Degraded,
    /// 不健康
    Unhealthy,
    /// 未知
    Unknown,
}

/// 客户端统计信息
#[derive(Debug, Clone)]
pub struct ClientStatistics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub average_response_time_ms: u64,
}

/// 缓存统计信息
#[derive(Debug, Clone)]
pub struct CacheStatistics {
    pub total_keys: usize,
    pub total_hits: u64,
    pub total_misses: u64,
    pub hit_rate: f64,
}

/// 存储统计信息
#[derive(Debug, Clone)]
pub struct StorageStatistics {
    pub total_keys: usize,
    pub total_size_bytes: u64,
    pub used_size_bytes: u64,
}
