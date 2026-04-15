use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Bookshelf item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookshelfItem {
    pub id: String,
    pub source_id: Arc<str>,
    pub book_url: Arc<str>,
    pub name: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<Arc<str>>,
    #[serde(default)]
    pub last_chapter_index: u32,
    #[serde(default)]
    pub last_read_position: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_read_time: Option<i64>,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_chapter_num: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_chapter_title: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
}

/// Book group categorization
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookGroup {
    pub id: String,
    pub name: String,
    pub order_index: u32,
}
