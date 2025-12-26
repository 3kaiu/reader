//! Storage Operations - Cache, KvStore, File operations
//!
//! Native Rust implementations of storage APIs.

use crate::storage::kv::KvStore;
use anyhow::Result;
use std::sync::Arc;

/// Get value from cache
pub fn cache_get(kv_store: &Arc<KvStore>, key: &str) -> Result<String> {
    Ok(kv_store.get_cache(key).unwrap_or_default())
}

/// Set value in cache (with default 1 hour expiry)
pub fn cache_set(kv_store: &Arc<KvStore>, key: &str, value: &str) -> Result<String> {
    let expire_time = chrono::Utc::now().timestamp_millis() + 3600_000; // 1 hour
    kv_store.set_cache(key, value, expire_time);
    Ok(String::new())
}

/// Get source variable
pub fn get_source_var(kv_store: &Arc<KvStore>, source_url: &str, key: &str) -> Option<String> {
    kv_store.get_source_var(source_url, key)
}

/// Set source variable
pub fn set_source_var(kv_store: &Arc<KvStore>, source_url: &str, key: &str, value: &str) {
    kv_store.set_source_var(source_url, key, value);
}

/// Delete file from cache
pub fn delete_file(path: &str) -> bool {
    std::fs::remove_file(path).is_ok()
}

/// Check if file exists
pub fn file_exists(path: &str) -> bool {
    std::path::Path::new(path).exists()
}
