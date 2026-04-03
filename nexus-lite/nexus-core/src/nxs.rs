//! NXS (Nexus Source) v1 format models
//!
//! A clean, simple book source format with:
//! - Fallback selectors (| syntax)
//! - Smart attribute inference
//! - Declarative filtering

use serde::{Deserialize, Serialize};

use crate::ReplaceRule;

/// NXS Source - the main book source configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NxsSource {
    /// Format version
    #[serde(rename = "$v", default = "default_version")]
    pub version: u8,

    /// Unique identifier
    pub id: String,

    /// Display name
    pub name: String,

    /// Base URL
    pub url: String,

    /// Search rules
    pub search: SearchRule,

    /// Book detail rules
    pub book: BookRule,

    /// Table of contents rules
    pub toc: TocRule,

    /// Content extraction rules
    pub content: ContentRule,

    /// Anti-crawl/Protection level: "L1", "L2", "L3"
    #[serde(default, alias = "cf")]
    pub protection: Option<String>,

    /// Custom headers (optional)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<std::collections::HashMap<String, String>>,

    /// Extra configuration for plugins/experiments
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Map<String, serde_json::Value>>,
}

fn default_version() -> u8 {
    1
}

/// Search rules
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchRule {
    /// URL path with {q} placeholder for query
    pub path: String,

    /// HTTP method (GET, POST), default: GET
    #[serde(default = "default_method")]
    pub method: String,

    /// POST body template with {q} placeholder
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,

    /// Query encoding (e.g. GBK), default: UTF-8
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,

    /// Selector for book list items (supports | fallback)
    pub list: String,

    /// Filter for search result URLs (optional, result URL must contain this)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result_filter: Option<String>,

    /// Fields to extract from each item
    pub item: SearchItemFields,
}

fn default_method() -> String {
    "GET".to_string()
}

/// Fields for search result items
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchItemFields {
    /// Book name selector
    pub name: String,

    /// Author selector
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,

    /// Book URL selector (auto-extracts href from <a>)
    pub url: String,

    /// Cover image selector (auto-extracts src from <img>)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,

    /// Introduction/summary selector
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intro: Option<String>,
}

/// Book detail page rules
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookRule {
    /// Book name selector (supports | fallback)
    pub name: String,

    /// Author selector
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,

    /// Introduction selector
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub intro: Option<String>,

    /// Cover image selector
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,

    /// TOC container/link selector
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub toc: Option<String>,
}

/// Table of contents rules
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TocRule {
    /// Selector for chapter list items
    pub list: String,

    /// Fields to extract from each chapter
    pub item: TocItemFields,

    /// Whether to reverse the chapter list (for sites with newest chapters first)
    #[serde(default)]
    pub reverse: bool,
}

/// Fields for TOC items
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TocItemFields {
    /// Chapter name selector (default: "text" for inner text)
    #[serde(default = "default_text")]
    pub name: String,

    /// Chapter URL selector (default: "href")
    #[serde(default = "default_href")]
    pub url: String,
}

fn default_text() -> String {
    "text".to_string()
}

fn default_href() -> String {
    "href".to_string()
}

/// Content extraction rules
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentRule {
    /// Main content body selector (supports | fallback)
    pub body: String,

    /// CSS selectors for elements to remove (ads, scripts, etc.)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub filter: Vec<String>,

    /// Whether to extract visible text only (filters display:none)
    #[serde(default)]
    pub visible_only: bool,

    /// Optional restricted post-processing script (line-based mini DSL).
    ///
    /// Supported commands:
    /// - `trim`
    /// - `collapse_blank_lines`
    /// - `replace::<regex>::<replacement>`
    /// - `remove::<regex>`
    ///
    /// Notes:
    /// - This is NOT JavaScript execution.
    /// - Commands outside this allow-list are ignored with warning logs.
    /// - Effective only when `script_enabled = true`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script: Option<String>,

    /// Explicitly enable script-based post-processing (default: false for safety)
    #[serde(default)]
    pub script_enabled: bool,

    /// Content replacement rules for this source
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub replace: Vec<ReplaceRule>,

    // === Enhanced Cleaning Configuration ===
    /// Text cleaning configuration
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clean: Option<CleanConfig>,

    /// Pagination configuration for multi-page chapters
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pagination: Option<PaginationConfig>,

    /// Font decryption configuration
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_decrypt: Option<FontDecryptConfig>,

    /// Content validation thresholds
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub validation: Option<ContentValidationConfig>,
}

/// Text cleaning configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanConfig {
    /// Remove zero-width characters (default: true)
    #[serde(default = "default_true")]
    pub remove_zero_width: bool,

    /// Remove control characters (default: true)
    #[serde(default = "default_true")]
    pub remove_control_chars: bool,

    /// Apply Unicode normalization (default: true)
    #[serde(default = "default_true")]
    pub unicode_normalize: bool,

    /// Normalize whitespace (default: true)
    #[serde(default = "default_true")]
    pub normalize_whitespace: bool,

    /// Deduplication configuration
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dedup: Option<DedupConfig>,

    /// Content encoding (e.g., "gbk", "gb2312")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encoding: Option<String>,
}

/// Deduplication configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DedupConfig {
    /// Similarity threshold (0.0-1.0), default: 0.9
    #[serde(default = "default_similarity_threshold")]
    pub threshold: f64,

    /// Minimum length to consider for deduplication, default: 10
    #[serde(default = "default_min_length")]
    pub min_length: usize,

    /// Maximum length difference ratio (0.0-1.0), default: 0.2
    #[serde(default = "default_max_length_diff_ratio")]
    pub max_length_diff_ratio: f64,
}

/// Pagination configuration for multi-page chapters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationConfig {
    /// Selector for "next page" link/button
    pub next_selector: String,

    /// Maximum pages to aggregate, default: 10
    #[serde(default = "default_max_pages")]
    pub max_pages: usize,

    /// Delay between page requests (ms), default: 500
    #[serde(default = "default_delay_ms")]
    pub delay_ms: u64,

    /// Content separator between pages, default: "\n\n"
    #[serde(default = "default_separator")]
    pub separator: String,

    /// Stop when content contains this text (e.g., "下一章")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_text: Option<String>,
}

/// Font decryption configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontDecryptConfig {
    /// Selector for font file URL (e.g., "link[href$='.woff']")
    pub font_url_selector: String,

    /// Attribute containing font URL, default: "href"
    #[serde(default = "default_font_url_attr")]
    pub font_url_attr: String,

    /// Whether to auto-decrypt, default: true
    #[serde(default = "default_true")]
    pub auto_decrypt: bool,

    /// Pre-defined character mapping (encrypted -> decrypted)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mapping: Option<std::collections::HashMap<char, char>>,
}

/// Content validation configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentValidationConfig {
    /// Minimum character count for valid chapter content
    #[serde(default = "default_min_chars")]
    pub min_chars: usize,

    /// Minimum non-empty paragraph count for valid chapter content
    #[serde(default = "default_min_paragraphs")]
    pub min_paragraphs: usize,

    /// Allow short chapters (poems/announcements) when enabled
    #[serde(default)]
    pub allow_short_chapter: bool,
}

// Default value functions
fn default_true() -> bool {
    true
}
fn default_similarity_threshold() -> f64 {
    0.9
}
fn default_min_length() -> usize {
    10
}
fn default_max_length_diff_ratio() -> f64 {
    0.2
}
fn default_max_pages() -> usize {
    10
}
fn default_delay_ms() -> u64 {
    500
}
fn default_separator() -> String {
    "\n\n".to_string()
}
fn default_font_url_attr() -> String {
    "href".to_string()
}
fn default_min_chars() -> usize {
    80
}
fn default_min_paragraphs() -> usize {
    1
}

impl Default for CleanConfig {
    fn default() -> Self {
        Self {
            remove_zero_width: true,
            remove_control_chars: true,
            unicode_normalize: true,
            normalize_whitespace: true,
            dedup: None,
            encoding: None,
        }
    }
}

impl Default for ContentValidationConfig {
    fn default() -> Self {
        Self {
            min_chars: default_min_chars(),
            min_paragraphs: default_min_paragraphs(),
            allow_short_chapter: false,
        }
    }
}

impl NxsSource {
    /// Get anti-crawl level as u8
    pub fn anti_crawl_level(&self) -> u8 {
        match self.protection.as_deref() {
            Some("L6") => 6,
            Some("L3") => 3,
            Some("L2") => 2,
            _ => 1,
        }
    }

    /// Build full search URL
    pub fn search_url(&self, query: &str) -> String {
        let path = self.path_with_query(&self.search.path, query);
        if path.starts_with("http") {
            path
        } else {
            format!("{}{}", self.url.trim_end_matches('/'), path)
        }
    }

    fn path_with_query(&self, path: &str, query: &str) -> String {
        path.replace("{q}", &urlencoding::encode(query))
            .replace("{{key}}", &urlencoding::encode(query))
    }
}
