use serde::{Deserialize, Serialize};

/// 书籍模型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub book_url: String,
    pub name: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toc_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "type")]
    pub book_type: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dur_chapter_index: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dur_chapter_pos: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dur_chapter_time: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dur_chapter_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_chapter_num: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_chapter_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_update: Option<bool>,
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub book_url: String,
    pub name: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_name: Option<String>,
}
