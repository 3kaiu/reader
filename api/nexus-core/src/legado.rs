//! Legado BookSource — complete data model matching the Android JSON format
//!
//! This module defines the full Legado BookSource entity and all sub-rule types,
//! enabling direct JSON deserialization of community book sources.

use serde::{Deserialize, Serialize};

/// Complete Legado BookSource model
///
/// Matches the Android app's `BookSource` data class.
/// Sources from AOAOSTAR/yckceo are serialized as Vec<LegadoSource>.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LegadoSource {
    // === Identity & Metadata ===
    pub book_source_url: String,
    pub book_source_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_source_group: Option<String>,
    #[serde(default)]
    pub book_source_type: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_url_pattern: Option<String>,
    #[serde(default)]
    pub custom_order: i32,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub enabled_explore: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_source_comment: Option<String>,
    #[serde(default)]
    pub last_update_time: i64,
    #[serde(default = "default_respond_time")]
    pub respond_time: i64,
    #[serde(default)]
    pub weight: i32,

    // === Network & Auth ===
    #[serde(skip_serializing_if = "Option::is_none")]
    pub header: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled_cookie_jar: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub concurrent_rate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub login_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub login_ui: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub login_check_js: Option<String>,

    // === JS & Customization ===
    #[serde(skip_serializing_if = "Option::is_none")]
    pub js_lib: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_decode_js: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variable_comment: Option<String>,

    // === Discovery ===
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explore_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explore_screen: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_explore: Option<ExploreRule>,

    // === Core Rules ===
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_search: Option<SearchRule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_book_info: Option<BookInfoRule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_toc: Option<TocRule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_content: Option<ContentRule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_review: Option<ReviewRule>,
}

impl Default for LegadoSource {
    fn default() -> Self {
        Self {
            book_source_url: String::new(),
            book_source_name: String::new(),
            book_source_group: None,
            book_source_type: 0,
            book_url_pattern: None,
            custom_order: 0,
            enabled: true,
            enabled_explore: true,
            book_source_comment: None,
            last_update_time: 0,
            respond_time: 180_000,
            weight: 0,
            header: None,
            enabled_cookie_jar: None,
            concurrent_rate: None,
            login_url: None,
            login_ui: None,
            login_check_js: None,
            js_lib: None,
            cover_decode_js: None,
            variable_comment: None,
            explore_url: None,
            explore_screen: None,
            rule_explore: None,
            search_url: None,
            rule_search: None,
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            rule_review: None,
        }
    }
}

fn default_true() -> bool {
    true
}
fn default_respond_time() -> i64 {
    180_000
}

/// Base fields shared by rule types that extract book-list items
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BookListRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_list: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_chapter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<String>,
}

// === SearchRule ===

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check_key_word: Option<String>,
    #[serde(flatten)]
    pub base: BookListRule,
}

// === BookInfoRule ===

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BookInfoRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub init: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_chapter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toc_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_re_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_urls: Option<String>,
}

// === TocRule ===

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TocRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pre_update_js: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_list: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format_js: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_volume: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_vip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_pay: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_toc_url: Option<String>,
}

// === ContentRule ===

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_content_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_js: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_regex: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replace_regex: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_decode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pay_action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub call_back_js: Option<String>,
}

// === ExploreRule ===

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExploreRule {
    #[serde(flatten)]
    pub base: BookListRule,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_rule: Option<String>,
}

// === ReviewRule ===

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_rule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_rule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub post_time_rule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_quote_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vote_up_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vote_down_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub post_review_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub post_quote_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delete_url: Option<String>,
}

// === Helper: LegadoSource analysis and metadata ===

impl LegadoSource {
    /// Generate a stable ID from the URL with a short hash suffix to avoid collisions
    pub fn infer_id(&self) -> String {
        let domain = self
            .book_source_url
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_start_matches("www.")
            .split('/')
            .next()
            .unwrap_or(&self.book_source_url)
            .split('.')
            .next()
            .unwrap_or(&self.book_source_url)
            .to_string();
        let base = if domain.is_empty() {
            "unknown".to_string()
        } else {
            domain
        };

        // Add a short hash of the full URL to avoid collisions between sources
        // that share the same domain prefix (e.g. example.com/path1 and example.com/path2)
        use std::hash::{DefaultHasher, Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        self.book_source_url.hash(&mut hasher);
        let hash_suffix = (hasher.finish() & 0xFFFF) as u16; // 4 hex chars
        format!("{}_{:04x}", base, hash_suffix)
    }

    /// Heuristic: does this source contain any `@js:` or `<js>` patterns?
    /// Uses field-level checks instead of full serialization for performance.
    pub fn has_js_rules(&self) -> bool {
        // Collect all rule strings into a single string and scan
        let mut haystack = String::with_capacity(512);
        if let Some(s) = &self.search_url {
            haystack.push_str(s);
            haystack.push('\n');
        }
        if let Some(s) = &self.header {
            haystack.push_str(s);
            haystack.push('\n');
        }
        if let Some(s) = &self.js_lib {
            haystack.push_str(s);
            haystack.push('\n');
        }
        if let Some(s) = &self.cover_decode_js {
            haystack.push_str(s);
            haystack.push('\n');
        }
        if let Some(s) = &self.login_check_js {
            haystack.push_str(s);
            haystack.push('\n');
        }
        if let Some(r) = &self.rule_search {
            if let Some(s) = &r.check_key_word {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.base.book_list {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.base.name {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.base.author {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.base.book_url {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.base.cover_url {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.base.intro {
                haystack.push_str(s);
                haystack.push('\n');
            }
        }
        if let Some(r) = &self.rule_book_info {
            if let Some(s) = &r.init {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.name {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.author {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.intro {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.cover_url {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.toc_url {
                haystack.push_str(s);
                haystack.push('\n');
            }
        }
        if let Some(r) = &self.rule_toc {
            if let Some(s) = &r.chapter_list {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.chapter_name {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.chapter_url {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.format_js {
                haystack.push_str(s);
                haystack.push('\n');
            }
        }
        if let Some(r) = &self.rule_content {
            if let Some(s) = &r.content {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.sub_content {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.web_js {
                haystack.push_str(s);
                haystack.push('\n');
            }
            if let Some(s) = &r.source_regex {
                haystack.push_str(s);
                haystack.push('\n');
            }
        }
        haystack.contains("@js:") || haystack.contains("<js>") || haystack.contains("</js>")
    }

    /// Heuristic: does this source use `webJs` for dynamic rendering?
    pub fn has_web_js(&self) -> bool {
        self.rule_content
            .as_ref()
            .and_then(|c| c.web_js.as_deref())
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    }

    /// Heuristic: does this source use XPath selectors?
    pub fn has_xpath(&self) -> bool {
        let haystack = serde_json::to_string(self).unwrap_or_default();
        haystack.contains("@xpath:") || haystack.contains("@XPath:")
    }

    /// Classification for engine routing
    pub fn classification(&self) -> &'static str {
        if self.has_web_js() {
            "webjs" // requires WebView — highest complexity
        } else if self.has_js_rules() {
            "js" // has @js: snippets — needs JS engine
        } else if self.has_xpath() {
            "xpath" // has XPath selectors — needs import-time conversion
        } else {
            "css" // pure CSS selectors — simplest path
        }
    }

    /// Is this source fully automatable without manual intervention?
    pub fn is_fully_automatable(&self) -> bool {
        !self.has_web_js() && !self.has_xpath()
    }
}
