//! NexusLite 核心类型定义
//!
//! 这是简化后的核心类型定义，包含所有基础数据类型。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 书籍项目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookItem {
    pub title: String,
    pub url: String,
    pub author: Option<String>,
    pub cover_url: Option<String>,
    pub description: Option<String>,
    pub word_count: Option<u32>,
    pub status: Option<String>,
    pub tags: Option<Vec<String>>,
}

/// 目录项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TocItem {
    pub title: String,
    pub url: String,
    pub chapter_number: Option<u32>,
    pub updated_at: Option<String>,
}

/// 章节
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub url: String,
    pub content: Option<ChapterContent>,
    pub word_count: Option<u32>,
}

/// 章节内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterContent {
    pub text: String,
    pub next_url: Option<String>,
    pub prev_url: Option<String>,
}

/// HTTP 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResponse {
    pub status_code: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub encoding: Option<String>,
}

/// 替换规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplaceRule {
    pub pattern: String,
    pub replacement: String,
    pub is_regex: bool,
    pub scope: Option<String>,
    pub enabled: bool,
}

/// 书源配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceConfig {
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub rate_limit: Option<u32>,
    pub timeout: Option<u64>,
    pub retry_count: Option<u32>,
}
