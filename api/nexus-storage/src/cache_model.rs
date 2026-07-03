//! Cache persistence models — moved from nexus-core::types::fetch
//!
//! These types describe storage-layer persistence formats for fetch sessions
//! and raw HTML caches. They belong in nexus-storage, not nexus-core, because
//! they are infrastructure concerns that the domain layer should not know about.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchSessionProfile {
    pub session_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default)]
    pub cookies: HashMap<String, String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referer: Option<String>,
    pub created_at_ms: i64,
    pub expires_at_ms: i64,
    #[serde(default)]
    pub hit_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawHtmlCacheEntry {
    pub cache_key: String,
    pub url: String,
    pub status: u16,
    pub final_url: String,
    pub html: String,
    pub cached_at_ms: i64,
    pub expires_at_ms: i64,
}
