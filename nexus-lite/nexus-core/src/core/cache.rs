//! NexusLite 核心缓存模块
//!
//! 这是简化后的核心缓存模块，提供统一的缓存接口。

use crate::core::errors::EngineError;
use crate::core::interfaces::Cache;
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

/// 内存缓存实现
pub struct MemoryCache<K, V> {
    data: Arc<RwLock<HashMap<K, CacheEntry<V>>>>,
}

#[derive(Clone)]
struct CacheEntry<V> {
    value: V,
    expires_at: Option<tokio::time::Instant>,
}

impl<K, V> MemoryCache<K, V>
where
    K: Eq + std::hash::Hash + Clone + Send + Sync,
    V: Clone + Send + Sync,
{
    pub fn new() -> Self {
        Self {
            data: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 清理过期条目
    pub async fn cleanup_expired(&self) {
        let mut data = self.data.write().await;
        data.retain(|_, entry| {
            if let Some(expires_at) = entry.expires_at {
                expires_at > tokio::time::Instant::now()
            } else {
                true
            }
        });
    }
}

#[async_trait]
impl<K, V> Cache<K, V> for MemoryCache<K, V>
where
    K: Eq + std::hash::Hash + Clone + Send + Sync,
    V: Clone + Send + Sync,
{
    async fn get(&self, key: &K) -> Result<Option<V>, EngineError> {
        let data = self.data.read().await;
        if let Some(entry) = data.get(key) {
            if let Some(expires_at) = entry.expires_at {
                if expires_at > tokio::time::Instant::now() {
                    return Ok(Some(entry.value.clone()));
                }
            } else {
                return Ok(Some(entry.value.clone()));
            }
        }
        Ok(None)
    }

    async fn set(&self, key: K, value: V, ttl: Option<Duration>) -> Result<(), EngineError> {
        let expires_at = ttl.map(|d| tokio::time::Instant::now() + d);
        let entry = CacheEntry { value, expires_at };
        let mut data = self.data.write().await;
        data.insert(key, entry);
        Ok(())
    }

    async fn delete(&self, key: &K) -> Result<(), EngineError> {
        let mut data = self.data.write().await;
        data.remove(key);
        Ok(())
    }

    async fn clear(&self) -> Result<(), EngineError> {
        let mut data = self.data.write().await;
        data.clear();
        Ok(())
    }

    fn statistics(&self) -> crate::core::interfaces::CacheStatistics {
        // 简化的统计信息
        crate::core::interfaces::CacheStatistics {
            total_keys: 0,
            total_hits: 0,
            total_misses: 0,
            hit_rate: 0.0,
        }
    }
}

impl<K, V> Default for MemoryCache<K, V>
where
    K: Eq + std::hash::Hash + Clone + Send + Sync,
    V: Clone + Send + Sync,
{
    fn default() -> Self {
        Self::new()
    }
}

/// 缓存管理器
pub struct CacheManager {
    memory_cache: Arc<MemoryCache<String, String>>,
}

impl CacheManager {
    pub fn new() -> Self {
        Self {
            memory_cache: Arc::new(MemoryCache::new()),
        }
    }

    pub fn memory_cache(&self) -> Arc<MemoryCache<String, String>> {
        self.memory_cache.clone()
    }
}

impl Default for CacheManager {
    fn default() -> Self {
        Self::new()
    }
}
