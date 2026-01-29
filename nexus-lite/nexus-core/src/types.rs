use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============== Book Data Models ==============

/// Book search result item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookItem {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    pub book_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro: Option<String>,
    pub source_id: String,
    pub source_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_chapter: Option<String>,
}

/// Book detailed information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
    pub name: String,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toc_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_chapter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
}

/// Chapter information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub title: String,
    pub url: String,
    pub index: usize,
    #[serde(default)]
    pub is_vip: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<u32>,
}

// ============== HTTP Models ==============

/// HTTP fetch response
#[derive(Debug, Clone)]
pub struct FetchResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub url: String,
}

impl FetchResponse {
    pub fn is_success(&self) -> bool {
        self.status >= 200 && self.status < 300
    }

    pub fn is_cloudflare_challenge(&self) -> bool {
        self.status == 403
            || self.status == 503
            || self.body.contains("cf-browser-verification")
            || self.body.contains("Just a moment")
    }
}

/// Fetch context for requests
#[derive(Debug, Clone)]
pub struct FetchContext {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub source_id: String,
    pub last_response: Option<FetchResponse>,
    pub cookies: HashMap<String, String>,
    /// Timeout in seconds for this request
    pub timeout_secs: u64,
}

impl FetchContext {
    pub fn new(url: &str, source_id: &str) -> Self {
        Self {
            url: url.to_string(),
            method: "GET".to_string(),
            headers: HashMap::new(),
            body: None,
            source_id: source_id.to_string(),
            last_response: None,
            cookies: HashMap::new(),
            timeout_secs: 30, // Default 30s timeout
        }
    }

    /// Create a context with custom timeout
    pub fn with_timeout(url: &str, source_id: &str, timeout_secs: u64) -> Self {
        let mut ctx = Self::new(url, source_id);
        ctx.timeout_secs = timeout_secs;
        ctx
    }
}

// ============== Bookshelf Models ==============

/// Structured chapter content response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterContent {
    pub content: String,
}

/// Bookshelf item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookshelfItem {
    pub id: String,
    pub source_id: String,
    pub book_url: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    #[serde(default)]
    pub last_chapter_index: u32,
    #[serde(default)]
    pub last_read_position: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_read_time: Option<i64>,
    pub created_at: i64,
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

/// Content replacement rule
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceRule {
    pub id: String,
    pub name: String,
    pub pattern: String,
    pub replacement: Option<String>,
    pub scope: Option<String>, // "all" or specific source_id
    pub is_enabled: bool,
    pub is_regex: bool,
}

// ============== Discovery Models ==============

/// Discovery item (book representation in discovery feeds)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryItem {
    pub book_id: String,
    pub name: String,
    pub author: Option<String>,
    pub cover_url: Option<String>,
    pub book_url: String,
    pub intro: Option<String>,
    pub followers: Option<u32>,
    pub position: u32,
}

/// Discovery section (Carousel, List, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySection {
    pub section: String, // "carousel", "list", "image_list", etc.
    pub items: Vec<DiscoveryItem>,
}

/// Discovery response (aggregated for a period)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResponse {
    pub period: String,
    pub start_date: String,
    pub end_date: String,
    pub sections: Vec<DiscoverySection>,
    pub available_periods: Vec<String>,
}

// ============== AI Analysis ==============

/// AI Mapping Rule for homophones/entity resolution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMappingRule {
    pub id: String,
    pub original: String,
    pub target: String,
    pub r#type: String, // "person", "company", etc.
    pub confidence: f32,
    pub enabled: bool,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_count: Option<u32>,
}

/// AI Analysis History
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisHistory {
    pub id: String,
    pub book_title: String,
    pub chapter_title: String,
    pub mappings: Vec<AiMappingRule>,
    pub analyzed_at: i64,
}

// ============== Voice Models ==============

/// Voice model metadata for TTS
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceModelMetadata {
    pub id: String,
    pub name: String,
    pub r#type: String,                    // "custom", "system"
    pub metadata: HashMap<String, String>, // language, description, etc.
    pub model_size: u64,
    pub sample_duration: f32,
    pub created_at: i64,
    pub updated_at: i64,
}
