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

    /// Optional JavaScript script to run in the browser for extraction/cleaning
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub script: Option<String>,

    /// Content replacement rules for this source
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub replace: Vec<ReplaceRule>,
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
