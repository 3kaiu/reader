use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Book search result item
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SearchExplainStrategy {
    NativeSearch,
    DirectDetail,
    ExternalDiscovery,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchExplain {
    pub strategy: SearchExplainStrategy,
    pub provider: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_score: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_rank: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<Arc<str>>,
}

/// Book search result item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookItem {
    pub name: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<Arc<str>>,
    pub book_url: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro: Option<Arc<str>>,
    pub source_id: Arc<str>,
    pub source_name: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_chapter: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_explain: Option<SearchExplain>,
}

impl BookItem {
    /// Minimal constructor with stable defaults for evolving optional fields.
    pub fn new(
        name: impl Into<Arc<str>>,
        book_url: impl Into<Arc<str>>,
        source_id: impl Into<Arc<str>>,
        source_name: impl Into<Arc<str>>,
    ) -> Self {
        Self {
            name: name.into(),
            author: None,
            cover_url: None,
            book_url: book_url.into(),
            intro: None,
            source_id: source_id.into(),
            source_name: source_name.into(),
            latest_chapter: None,
            search_explain: None,
        }
    }
}

/// Book detailed information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
    pub name: Arc<str>,
    pub author: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toc_url: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_chapter: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<Arc<str>>,
}

/// Table of contents item (chapter entry for TOC listing)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TocItem {
    pub title: Arc<str>,
    pub url: Arc<str>,
    pub index: usize,
}

/// Chapter information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub title: Arc<str>,
    pub url: Arc<str>,
    pub index: usize,
    #[serde(default)]
    pub is_vip: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<u32>,
}
