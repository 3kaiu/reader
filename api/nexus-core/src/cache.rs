//! 统一缓存系统
//!
//! 提供统一的缓存接口，支持多种缓存后端：
//! - 内存缓存
//! - 磁盘缓存
//! - Redis缓存
//! - 多级缓存策略

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::sync::RwLock;

/// 缓存配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    pub memory_capacity: u64,      // 内存缓存容量（字节）
    pub disk_capacity: u64,        // 磁盘缓存容量（字节）
    pub redis_url: Option<String>, // Redis连接URL
    pub ttl_default: Duration,     // 默认TTL
    pub enable_compression: bool,  // 启用压缩
    pub enable_encryption: bool,   // 启用加密
}

/// 缓存条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry<T> {
    pub key: String,
    pub value: T,
    pub metadata: CacheMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheMetadata {
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub accessed_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub access_count: u64,
    pub size_bytes: u64,
    pub tags: Vec<String>,
}

/// 缓存统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_entries: u64,
    pub memory_usage: u64,
    pub disk_usage: u64,
    pub hit_count: u64,
    pub miss_count: u64,
    pub eviction_count: u64,
    pub hit_rate: f64,
}

/// 缓存接口
#[async_trait]
pub trait Cache<K, V>: Send + Sync {
    /// 获取缓存值
    async fn get(&self, key: &K) -> Result<Option<V>, CacheError>;

    /// 设置缓存值
    async fn put(&self, key: K, value: V, options: PutOptions) -> Result<(), CacheError>;

    /// 删除缓存值
    async fn remove(&self, key: &K) -> Result<(), CacheError>;

    /// 清空缓存
    async fn clear(&self) -> Result<(), CacheError>;

    /// 获取缓存统计信息
    async fn stats(&self) -> Result<CacheStats, CacheError>;

    /// 健康检查
    async fn health_check(&self) -> Result<(), CacheError>;
}

/// 缓存操作选项
#[derive(Debug, Clone, Default)]
pub struct PutOptions {
    pub ttl: Option<Duration>,
    pub tags: Vec<String>,
    pub priority: CachePriority,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum CachePriority {
    Low,
    #[default]
    Normal,
    High,
    Critical,
}

/// 缓存错误
#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Deserialization error: {0}")]
    Deserialization(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Key not found")]
    NotFound,

    #[error("Cache is full")]
    Full,

    #[error("Operation timeout")]
    Timeout,
}

/// 多级缓存实现
pub struct MultiLevelCache {
    memory_cache: Arc<RwLock<MemoryCache>>,
    disk_cache: Option<Arc<RwLock<DiskCache>>>,
    redis_cache: Option<Arc<RedisCache>>,
    config: CacheConfig,
}

impl MultiLevelCache {
    /// 创建多级缓存
    pub async fn new(config: CacheConfig) -> Result<Self, CacheError> {
        let memory_cache = Arc::new(RwLock::new(MemoryCache::new(config.memory_capacity).await?));
        let disk_cache = if config.disk_capacity > 0 {
            Some(Arc::new(RwLock::new(DiskCache::new(config.disk_capacity).await?)))
        } else {
            None
        };
        let redis_cache = if let Some(url) = &config.redis_url {
            Some(Arc::new(RedisCache::new(url).await?))
        } else {
            None
        };

        Ok(Self {
            memory_cache,
            disk_cache,
            redis_cache,
            config,
        })
    }
}

#[async_trait]
impl<K, V> Cache<K, V> for MultiLevelCache
where
    K: Clone + Send + Sync + std::hash::Hash + Eq + std::fmt::Display + 'static,
    V: Clone + Send + Sync + serde::Serialize + for<'de> serde::Deserialize<'de> + 'static,
{
    async fn get(&self, key: &K) -> Result<Option<V>, CacheError> {
        // 首先尝试内存缓存
        if let Some(value) = self.memory_cache.read().await.get(key).await? {
            return Ok(Some(value));
        }

        // 然后尝试Redis缓存
        if let Some(redis) = &self.redis_cache {
            if let Some(value) = redis.get::<V>(key).await? {
                // 写回到内存缓存
                let options = PutOptions {
                    ttl: Some(self.config.ttl_default),
                    ..Default::default()
                };
                let mut guard = self.memory_cache.write().await;
                guard.put(key.clone(), value.clone(), options).await?;
                return Ok(Some(value));
            }
        }

        // 最后尝试磁盘缓存
        if let Some(disk) = &self.disk_cache {
            if let Some(value) = disk.read().await.get::<V>(key).await? {
                // 写回到内存缓存
                let options = PutOptions {
                    ttl: Some(self.config.ttl_default),
                    ..Default::default()
                };
                let mut guard = self.memory_cache.write().await;
                guard.put(key.clone(), value.clone(), options).await?;
                return Ok(Some(value));
            }
        }

        Ok(None)
    }

    async fn put(&self, key: K, value: V, options: PutOptions) -> Result<(), CacheError> {
        // 写入内存缓存
        self.memory_cache
            .write()
            .await
            .put(key.clone(), value.clone(), options.clone())
            .await?;

        // 写入Redis缓存（如果有）
        if let Some(redis) = &self.redis_cache {
            let _ = redis.put(key.clone(), value.clone(), options.clone()).await;
        }

        // 写入磁盘缓存（如果有且优先级足够高）
        if let Some(disk) = &self.disk_cache {
            if matches!(options.priority, CachePriority::High | CachePriority::Critical) {
                let _ = disk
                    .write()
                    .await
                    .put(key.clone(), value.clone(), options)
                    .await;
            }
        }

        Ok(())
    }

    async fn remove(&self, key: &K) -> Result<(), CacheError> {
        // 从所有层删除
        self.memory_cache.write().await.remove(key).await?;
        if let Some(redis) = &self.redis_cache {
            let _ = redis.remove(key).await;
        }
        if let Some(disk) = &self.disk_cache {
            let _ = disk.write().await.remove(key).await;
        }
        Ok(())
    }

    async fn clear(&self) -> Result<(), CacheError> {
        // 清空所有层
        self.memory_cache.write().await.clear().await?;
        if let Some(redis) = &self.redis_cache {
            let _ = redis.clear().await;
        }
        if let Some(disk) = &self.disk_cache {
            let _ = disk.write().await.clear().await;
        }
        Ok(())
    }

    async fn stats(&self) -> Result<CacheStats, CacheError> {
        let memory_stats = self.memory_cache.read().await.stats().await?;
        let mut total_stats = memory_stats;

        // 合并其他层的统计信息
        if let Some(redis) = &self.redis_cache {
            if let Ok(redis_stats) = redis.stats().await {
                total_stats.hit_count += redis_stats.hit_count;
                total_stats.miss_count += redis_stats.miss_count;
                total_stats.eviction_count += redis_stats.eviction_count;
            }
        }

        if let Some(disk) = &self.disk_cache {
            if let Ok(disk_stats) = disk.read().await.stats().await {
                total_stats.hit_count += disk_stats.hit_count;
                total_stats.miss_count += disk_stats.miss_count;
                total_stats.eviction_count += disk_stats.eviction_count;
                total_stats.disk_usage = disk_stats.memory_usage; // 复用字段
            }
        }

        // 计算总命中率
        let total_requests = total_stats.hit_count + total_stats.miss_count;
        total_stats.hit_rate = if total_requests > 0 {
            total_stats.hit_count as f64 / total_requests as f64
        } else {
            0.0
        };

        Ok(total_stats)
    }

    async fn health_check(&self) -> Result<(), CacheError> {
        // 检查内存缓存
        self.memory_cache.read().await.health_check().await?;

        // 检查Redis缓存
        if let Some(redis) = &self.redis_cache {
            redis.health_check().await?;
        }

        // 检查磁盘缓存
        if let Some(disk) = &self.disk_cache {
            disk.read().await.health_check().await?;
        }

        Ok(())
    }
}

/// 内存缓存实现
pub struct MemoryCache {
    entries: HashMap<String, CacheEntry<serde_json::Value>>,
    capacity: u64,
    current_size: u64,
    hits: u64,
    misses: u64,
    evictions: u64,
}

impl MemoryCache {
    pub async fn new(capacity: u64) -> Result<Self, CacheError> {
        Ok(Self {
            entries: HashMap::new(),
            capacity,
            current_size: 0,
            hits: 0,
            misses: 0,
            evictions: 0,
        })
    }

    async fn get<V>(&self, key: &impl std::fmt::Display) -> Result<Option<V>, CacheError>
    where
        V: for<'de> serde::Deserialize<'de>,
    {
        let key_str = key.to_string();
        if let Some(entry) = self.entries.get(&key_str) {
            // 检查是否过期
            if let Some(expires_at) = entry.metadata.expires_at {
                if chrono::Utc::now() > expires_at {
                    return Ok(None);
                }
            }

            // 反序列化值
            match serde_json::from_value(entry.value.clone()) {
                Ok(value) => {
                    // 更新访问统计
                    // 注意：这里无法修改，因为是不可变借用
                    Ok(Some(value))
                },
                Err(e) => Err(CacheError::Deserialization(e.to_string())),
            }
        } else {
            Ok(None)
        }
    }

    async fn put<V>(
        &mut self,
        key: impl std::fmt::Display,
        value: V,
        options: PutOptions,
    ) -> Result<(), CacheError>
    where
        V: serde::Serialize,
    {
        let key_str = key.to_string();
        let value_json =
            serde_json::to_value(&value).map_err(|e| CacheError::Serialization(e.to_string()))?;

        let size_bytes = serde_json::to_string(&value_json)
            .map_err(|e| CacheError::Serialization(e.to_string()))?
            .len() as u64;

        let expires_at = options
            .ttl
            .map(chrono::Duration::from_std)
            .transpose()
            .map_err(|e| CacheError::Storage(format!("Invalid TTL duration: {}", e)))?
            .map(|ttl| chrono::Utc::now() + ttl);

        let entry = CacheEntry {
            key: key_str.clone(),
            value: value_json,
            metadata: CacheMetadata {
                created_at: chrono::Utc::now(),
                accessed_at: chrono::Utc::now(),
                expires_at,
                access_count: 0,
                size_bytes,
                tags: options.tags,
            },
        };

        // 检查容量限制
        if self.current_size + size_bytes > self.capacity {
            self.evict_entries(size_bytes);
        }

        // 更新大小统计
        if let Some(old_entry) = self.entries.get(&key_str) {
            self.current_size -= old_entry.metadata.size_bytes;
        }
        self.current_size += size_bytes;

        self.entries.insert(key_str, entry);
        Ok(())
    }

    async fn remove(&mut self, key: &impl std::fmt::Display) -> Result<(), CacheError> {
        let key_str = key.to_string();
        if let Some(entry) = self.entries.remove(&key_str) {
            self.current_size -= entry.metadata.size_bytes;
        }
        Ok(())
    }

    async fn clear(&mut self) -> Result<(), CacheError> {
        self.entries.clear();
        self.current_size = 0;
        Ok(())
    }

    async fn stats(&self) -> Result<CacheStats, CacheError> {
        Ok(CacheStats {
            total_entries: self.entries.len() as u64,
            memory_usage: self.current_size,
            disk_usage: 0,
            hit_count: self.hits,
            miss_count: self.misses,
            eviction_count: self.evictions,
            hit_rate: if self.hits + self.misses > 0 {
                self.hits as f64 / (self.hits + self.misses) as f64
            } else {
                0.0
            },
        })
    }

    async fn health_check(&self) -> Result<(), CacheError> {
        // 检查基本功能
        Ok(())
    }

    fn evict_entries(&mut self, required_space: u64) {
        // 简单的LRU驱逐策略
        let mut entries_to_remove: Vec<String> = Vec::new();
        let mut freed_space = 0u64;

        // 按访问时间排序，移除最久未访问的
        let mut sorted_entries: Vec<_> = self.entries.iter().collect();
        sorted_entries.sort_by_key(|(_, entry)| entry.metadata.accessed_at);

        for (key, entry) in sorted_entries {
            entries_to_remove.push(key.clone());
            freed_space += entry.metadata.size_bytes;
            self.evictions += 1;

            if freed_space >= required_space {
                break;
            }
        }

        for key in entries_to_remove {
            if let Some(entry) = self.entries.remove(&key) {
                self.current_size -= entry.metadata.size_bytes;
            }
        }
    }
}

/// 磁盘缓存实现（简化版）
pub struct DiskCache {
    _capacity: u64,
    current_size: u64,
}

impl DiskCache {
    pub async fn new(capacity: u64) -> Result<Self, CacheError> {
        Ok(Self {
            _capacity: capacity,
            current_size: 0,
        })
    }

    async fn get<V>(&self, _key: &impl std::fmt::Display) -> Result<Option<V>, CacheError> {
        // 简化的磁盘缓存实现
        Ok(None)
    }

    async fn put<V>(
        &mut self,
        _key: impl std::fmt::Display,
        _value: V,
        _options: PutOptions,
    ) -> Result<(), CacheError> {
        // 简化的磁盘缓存实现
        Ok(())
    }

    async fn remove(&mut self, _key: &impl std::fmt::Display) -> Result<(), CacheError> {
        Ok(())
    }

    async fn clear(&mut self) -> Result<(), CacheError> {
        Ok(())
    }

    async fn stats(&self) -> Result<CacheStats, CacheError> {
        Ok(CacheStats {
            total_entries: 0,
            memory_usage: 0,
            disk_usage: self.current_size,
            hit_count: 0,
            miss_count: 0,
            eviction_count: 0,
            hit_rate: 0.0,
        })
    }

    async fn health_check(&self) -> Result<(), CacheError> {
        Ok(())
    }
}

/// Redis缓存实现（简化版）
pub struct RedisCache;

impl RedisCache {
    pub async fn new(_url: &str) -> Result<Self, CacheError> {
        // 简化的Redis实现
        Ok(Self)
    }

    async fn get<V>(&self, _key: &impl std::fmt::Display) -> Result<Option<V>, CacheError> {
        Ok(None)
    }

    async fn put<V>(
        &self,
        _key: impl std::fmt::Display,
        _value: V,
        _options: PutOptions,
    ) -> Result<(), CacheError> {
        Ok(())
    }

    async fn remove(&self, _key: &impl std::fmt::Display) -> Result<(), CacheError> {
        Ok(())
    }

    async fn clear(&self) -> Result<(), CacheError> {
        Ok(())
    }

    async fn stats(&self) -> Result<CacheStats, CacheError> {
        Ok(CacheStats {
            total_entries: 0,
            memory_usage: 0,
            disk_usage: 0,
            hit_count: 0,
            miss_count: 0,
            eviction_count: 0,
            hit_rate: 0.0,
        })
    }

    async fn health_check(&self) -> Result<(), CacheError> {
        Ok(())
    }
}

/// 全局缓存管理器
pub struct CacheManager {
    cache: Arc<RwLock<MultiLevelCache>>,
}

impl CacheManager {
    pub async fn new(config: CacheConfig) -> Result<Self, CacheError> {
        let cache = Arc::new(RwLock::new(MultiLevelCache::new(config).await?));
        Ok(Self { cache })
    }

    /// 获取缓存实例
    pub fn cache(&self) -> Arc<RwLock<MultiLevelCache>> {
        Arc::clone(&self.cache)
    }

    /// 获取缓存统计信息
    pub async fn stats(&self) -> Result<CacheStats, CacheError> {
        let guard = self.cache.read().await;
        <MultiLevelCache as Cache<String, serde_json::Value>>::stats(&*guard).await
    }

    /// 健康检查
    pub async fn health_check(&self) -> Result<(), CacheError> {
        let guard = self.cache.read().await;
        <MultiLevelCache as Cache<String, serde_json::Value>>::health_check(&*guard).await
    }
}

/// 全局缓存管理器实例
static CACHE_MANAGER: OnceLock<CacheManager> = OnceLock::new();

/// 初始化全局缓存管理器
pub async fn init_cache_manager(config: CacheConfig) -> Result<(), CacheError> {
    let manager = CacheManager::new(config).await?;
    let _ = CACHE_MANAGER.set(manager);
    Ok(())
}

/// 获取全局缓存管理器
pub fn get_cache_manager() -> Option<&'static CacheManager> {
    CACHE_MANAGER.get()
}
