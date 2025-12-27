//! Book Source Engine - Main entry point for parsing book sources
//!
//! Combines all components:
//! - RuleAnalyzer for content parsing
//! - HttpClient for network requests  
//! - JsExecutor for JavaScript execution

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::sync::Arc;

use crate::engine::utils::get_cache_dir;

use super::http_client::HttpClient;
use super::native_api::NativeApiProvider;
use super::native_executor::NativeExecutor;
use super::parsers::RuleType;
use super::rule_analyzer::RuleAnalyzer;
use super::source_transformer::{CompiledRule, SourceTransformer, TransformedSource};
use crate::models::BookSourceFull;
use crate::storage::kv::KvStore;

/// Book source definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookSource {
    pub book_source_url: String,
    pub book_source_name: String,
    pub book_source_group: Option<String>,
    pub book_source_type: Option<i32>,
    pub search_url: Option<String>,
    pub explore_url: Option<String>,
    pub header: Option<String>,
    pub js_lib: Option<String>,
    pub rule_search: Option<SearchRule>,
    pub rule_explore: Option<ExploreRule>,
    pub rule_book_info: Option<BookInfoRule>,
    pub rule_toc: Option<TocRule>,
    pub rule_content: Option<ContentRule>,
    /// Login URL configuration (URL or JSON config)
    #[serde(default)]
    pub login_url: Option<String>,
    /// JavaScript to check if logged in (returns "true" if logged in)
    #[serde(default)]
    pub login_check_js: Option<String>,
    /// Login UI configuration (for user interface)
    #[serde(default)]
    pub login_ui: Option<String>,
    /// Concurrent request rate limit
    #[serde(default)]
    pub concurrent_rate: Option<String>,
    /// TLS Fingerprint to mimic (e.g., "chrome", "safari")
    #[serde(default)]
    pub fingerprint: Option<String>,
}

/// Search rule configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRule {
    pub book_list: Option<String>,
    pub name: Option<String>,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub word_count: Option<String>,
    pub last_chapter: Option<String>,
    pub update_time: Option<String>,
    pub cover_url: Option<String>,
    pub book_url: Option<String>,
}

/// Explore rule configuration  
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExploreRule {
    pub book_list: Option<String>,
    pub name: Option<String>,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub word_count: Option<String>,
    pub update_time: Option<String>,
    pub cover_url: Option<String>,
    pub book_url: Option<String>,
    pub toc_url: Option<String>,
}

/// Book info rule configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfoRule {
    pub init: Option<String>,
    pub name: Option<String>,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub word_count: Option<String>,
    pub cover_url: Option<String>,
    pub toc_url: Option<String>,
    pub last_chapter: Option<String>,
    pub update_time: Option<String>,
}

/// Table of contents rule configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TocRule {
    pub chapter_list: Option<String>,
    pub chapter_name: Option<String>,
    pub chapter_url: Option<String>,
    pub is_volume: Option<String>,
    pub next_toc_url: Option<String>,
    pub update_time: Option<String>,
}

/// Content rule configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRule {
    pub content: Option<String>,
    pub next_content_url: Option<String>,
    pub web_js: Option<String>,
    pub source_regex: Option<String>,
    pub replace_regex: Option<String>,
}

/// Search result book item
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BookItem {
    pub name: String,
    pub author: String,
    pub book_url: String,
    pub cover_url: Option<String>,
    pub intro: Option<String>,
    pub kind: Option<String>,
    pub word_count: Option<String>,
    pub last_chapter: Option<String>,
    pub update_time: Option<String>,
    pub toc_url: Option<String>,
}

/// Chapter item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub url: String,
    pub is_volume: bool,
}

// Helper implementations for rule conversions if fields match exactly,
// otherwise use serde_json for robust conversion as they are practically identical structs
// But since they are defined in different modules with same structure...
// Actually, relying on serde might be safer/easier if fields align.
// Let's implement From using serde_json trick in the impl above if explicit mapping is tedious.
// Re-visiting implementation:

/// Main Book Source Engine
pub struct BookSourceEngine {
    pub(crate) source: BookSource,
    pub(crate) analyzer: RuleAnalyzer,
    pub(crate) http: HttpClient,
    pub(crate) transformed: Option<TransformedSource>,
    pub(crate) native_executor: Option<NativeExecutor>,
}

impl BookSourceEngine {
    /// Create a new engine for a book source
    pub fn new(source: BookSource, kv_store: Arc<KvStore>) -> Result<Self> {
        // Try to determine a real base URL if book_source_url is just an ID
        let mut base_url = source.book_source_url.clone();
        if !base_url.contains("://") {
            // Try to find a URL in other fields
            if let Some(url) = source.search_url.as_ref() {
                if let Some(pos) = url.find("://") {
                    let domain_end = url[pos + 3..].find('/').unwrap_or(url.len() - (pos + 3));
                    base_url = url[..pos + 3 + domain_end].to_string();
                }
            } else if let Some(url) = source.explore_url.as_ref() {
                if let Some(pos) = url.find("://") {
                    let domain_end = url[pos + 3..].find('/').unwrap_or(url.len() - (pos + 3));
                    base_url = url[..pos + 3 + domain_end].to_string();
                }
            }
        }

        // Create HTTP client with source-level headers
        let http = HttpClient::with_config(&base_url, source.header.as_deref(), source.fingerprint.as_deref())?;
        let mut analyzer = RuleAnalyzer::new(kv_store.clone())?;
        analyzer.set_base_url(&base_url);

        // Preload jsLib if present
        if let Some(ref js_lib) = source.js_lib {
            if let Err(e) = analyzer.preload_lib(js_lib) {
                tracing::warn!("Failed to preload jsLib: {}", e);
            }
        }

        // Compile source rules
        // Compile source rules with caching
        let mut transformed = None;
        // Initialize Native Executor early infrastructure
        let cm = Arc::new(crate::engine::cookie::CookieManager::new());
        let provider = Arc::new(NativeApiProvider::new(cm, kv_store));
        let native_executor = Some(NativeExecutor::new(provider));

        // Setup cache
        let cache_dir = get_cache_dir().join("rules");
        let _ = fs::create_dir_all(&cache_dir);

        let source_json_str = serde_json::to_string(&source).unwrap_or_default();
        let hash = format!("{:x}", md5::compute(&source_json_str));
        let cache_path = cache_dir.join(format!("{}.json", hash));

        // Try load from cache
        if cache_path.exists() {
            if let Ok(file) = fs::File::open(&cache_path) {
                if let Ok(cached) = serde_json::from_reader(file) {
                    transformed = Some(cached);
                }
            }
        }

        // Convert to BookSourceFull for transformer if not cached
        if transformed.is_none() {
            if let Ok(json) = serde_json::to_value(&source) {
                if let Ok(full_source) = serde_json::from_value::<BookSourceFull>(json) {
                    let transformer = SourceTransformer::new();
                    let t = transformer.transform(&full_source);

                    // Save to cache
                    if let Ok(file) = fs::File::create(&cache_path) {
                        let _ = serde_json::to_writer(file, &t);
                    }

                    transformed = Some(t);
                }
            }
        }

        Ok(Self {
            source,
            analyzer,
            http,
            transformed,
            native_executor,
        })
    }

    /// Reconstruct rule string from CompiledRule
    fn reconstruct_rule(&self, rule_type: &RuleType, selector: &str) -> String {
        let prefix = match rule_type {
            RuleType::Css => "@css:",
            RuleType::XPath => "@xpath:",
            RuleType::JsonPath => "@json:",
            RuleType::JsoupDefault => "",
            RuleType::Regex => "@regex:",
            _ => "",
        };
        format!("{}{}", prefix, selector)
    }

    /// Execute a compiled rule (helper)
    fn execute_compiled(&self, rule: &CompiledRule, content: &str) -> Result<String> {
        match rule {
            CompiledRule::Empty => Ok(String::new()),
            CompiledRule::Selector {
                rule_type,
                selector,
            } => {
                let rule_str = self.reconstruct_rule(rule_type, selector);
                self.analyzer.get_string(content, &rule_str)
            }
            CompiledRule::Native(exec) => {
                if let Some(executor) = &self.native_executor {
                    let context = crate::engine::native_api::ExecutionContext {
                        base_url: self.source.book_source_url.clone(),
                    };
                    let vars = HashMap::new();
                    executor.execute(exec, &context, &vars, Some(content))
                } else {
                    Err(anyhow!("Native executor not initialized"))
                }
            }
            CompiledRule::JavaScript(code) => {
                let rule_str = format!("@js:{}", code);
                self.analyzer.get_string(content, &rule_str)
            }
            _ => Err(anyhow!("Unsupported compiled rule type")),
        }
    }

    /// Execute a compiled rule returning list (helper)
    fn execute_compiled_list(&self, rule: &CompiledRule, content: &str) -> Result<Vec<String>> {
        match rule {
            CompiledRule::Selector {
                rule_type,
                selector,
            } => {
                let rule_str = self.reconstruct_rule(rule_type, selector);
                self.analyzer.get_elements(content, &rule_str)
            }
            CompiledRule::Native(exec) => {
                if let Some(executor) = &self.native_executor {
                    let context = crate::engine::native_api::ExecutionContext {
                        base_url: self.source.book_source_url.clone(),
                    };
                    let vars = HashMap::new();
                    let res = executor.execute(exec, &context, &vars, Some(content))?;
                    // Try parse as JSON list
                    if res.trim().starts_with('[') {
                        if let Ok(list) = serde_json::from_str::<Vec<String>>(&res) {
                            return Ok(list);
                        }
                    }
                    Ok(vec![res])
                } else {
                    Err(anyhow!("Native executor not initialized"))
                }
            }
            CompiledRule::Empty => Ok(vec![]),
            _ => Ok(vec![]),
        }
    }

    /// Search for books
    pub fn search(&self, key: &str, page: i32) -> Result<Vec<BookItem>> {
        let search_url = self
            .source
            .search_url
            .as_ref()
            .ok_or_else(|| anyhow!("No search URL defined"))?;

        tracing::debug!(
            "Search URL template: {}",
            search_url.chars().take(200).collect::<String>()
        );

        // Build URL with variables
        let mut vars = HashMap::new();
        vars.insert("key".to_string(), key.to_string());
        vars.insert("page".to_string(), page.to_string());
        vars.insert("searchKey".to_string(), key.to_string());

        let url = match self.analyzer.evaluate_url(search_url, &vars) {
            Ok(u) => {
                tracing::info!(
                    "Evaluated search URL: {}",
                    u.chars().take(300).collect::<String>()
                );
                u
            }
            Err(e) => {
                tracing::error!("Failed to evaluate search URL: {}", e);
                return Err(e);
            }
        };

        // Make request
        let config = self.http.parse_request_config(&url);
        tracing::debug!(
            "Making search request to: {} (method: {})",
            config.url,
            config.method
        );

        let content = match self.http.request(&config) {
            Ok(c) => {
                tracing::debug!("Search response length: {} bytes", c.len());
                c
            }
            Err(e) => {
                tracing::error!("Search HTTP request failed: {}", e);
                return Err(e);
            }
        };

        // Parse results
        // Compiled path
        if let Some(transformed) = &self.transformed {
            let rules = &transformed.search_rules;
            // Execute list rule to get "element" strings
            let elements = self.execute_compiled_list(&rules.book_list, &content)?;

            let mut books = Vec::new();
            for element in elements {
                let name = self
                    .execute_compiled(&rules.name, &element)
                    .unwrap_or_default();
                if name.is_empty() {
                    continue;
                }

                let book = BookItem {
                    name,
                    author: self
                        .execute_compiled(&rules.author, &element)
                        .unwrap_or_default(),
                    intro: self.execute_compiled(&rules.intro, &element).ok(),
                    kind: self.execute_compiled(&rules.kind, &element).ok(),
                    last_chapter: self.execute_compiled(&rules.last_chapter, &element).ok(),
                    cover_url: self
                        .execute_compiled(&rules.cover_url, &element)
                        .ok()
                        .map(|u| self.http.absolute_url(&u)),
                    book_url: self
                        .execute_compiled(&rules.book_url, &element)
                        .ok()
                        .map(|u| self.http.absolute_url(&u))
                        .unwrap_or_default(),
                    word_count: self.execute_compiled(&rules.word_count, &element).ok(),
                    update_time: self.execute_compiled(&rules.update_time, &element).ok(),
                    toc_url: None, // Search usually doesn't provide TOC link directly or same as book_url
                };
                books.push(book);
            }
            return Ok(books);
        }

        let rule = self
            .source
            .rule_search
            .as_ref()
            .ok_or_else(|| anyhow!("No search rule defined"))?;

        let book_list_rule = rule
            .book_list
            .as_ref()
            .ok_or_else(|| anyhow!("No book_list rule"))?;

        let elements = self.analyzer.get_elements(&content, book_list_rule)?;

        let mut books = Vec::new();
        for element in elements {
            if let Ok(book) = self.parse_book_item(&element, rule) {
                books.push(book);
            }
        }

        Ok(books)
    }

    /// Explore/Discovery books by URL (e.g. from exploreUrl categories)
    pub fn explore(&self, url_template: &str, page: i32) -> Result<Vec<BookItem>> {
        let mut vars = HashMap::new();
        vars.insert("page".to_string(), page.to_string());

        let url = match self.analyzer.evaluate_url(url_template, &vars) {
            Ok(u) => {
                tracing::info!(
                    "Evaluated explore URL: {}",
                    u.chars().take(300).collect::<String>()
                );
                u
            }
            Err(e) => {
                tracing::error!("Failed to evaluate explore URL: {}", e);
                return Err(e);
            }
        };

        // Make request
        let config = self.http.parse_request_config(&url);
        tracing::debug!(
            "Making explore request to: {} (method: {})",
            config.url,
            config.method
        );

        let content = self.http.request(&config)?;

        // Parse results
        let rule = self
            .source
            .rule_explore
            .as_ref()
            .ok_or_else(|| anyhow!("No explore rule defined"))?;

        let book_list_rule = rule
            .book_list
            .as_ref()
            .ok_or_else(|| anyhow!("No book_list rule in rule_explore"))?;

        let elements = self.analyzer.get_elements(&content, book_list_rule)?;

        let mut books = Vec::new();
        for element in elements {
            if let Ok(book) = self.parse_explore_item(&element, rule) {
                books.push(book);
            }
        }

        Ok(books)
    }

    /// Check if the source is working by performing a test search
    /// Returns true if the source returns at least one valid result
    pub fn check_source(&self) -> Result<bool> {
        // Use a common test keyword
        let test_keywords = ["斗破苍穹", "完美世界", "test"];

        for keyword in test_keywords {
            match self.search(keyword, 1) {
                Ok(results) => {
                    if !results.is_empty() {
                        // Verify at least one result has a valid name
                        let has_valid = results
                            .iter()
                            .any(|b| !b.name.is_empty() && b.name != "null");
                        if has_valid {
                            return Ok(true);
                        }
                    }
                }
                Err(_) => continue, // Try next keyword
            }
        }

        Ok(false)
    }

    /// Refresh book URL by searching for the book again
    /// Useful for sources where bookUrl changes periodically
    pub fn refresh_book_url(&self, book: &mut BookItem) -> Result<()> {
        let results = self.search(&book.name, 1)?;

        for result in results {
            // Match by name and author
            if result.name == book.name {
                // Check author match if both have authors
                if !result.author.is_empty() && !book.author.is_empty() {
                    if result.author == book.author {
                        book.book_url = result.book_url;
                        if result.toc_url.is_some() {
                            book.toc_url = result.toc_url;
                        }
                        return Ok(());
                    }
                } else {
                    // If no author to match, use the first name match
                    book.book_url = result.book_url;
                    if result.toc_url.is_some() {
                        book.toc_url = result.toc_url;
                    }
                    return Ok(());
                }
            }
        }

        Err(anyhow!("Book not found in search results"))
    }

    /// Refresh TOC URL by fetching book info again
    /// Useful for sources where tocUrl changes periodically
    pub fn refresh_toc_url(&self, book: &mut BookItem) -> Result<()> {
        let info = self.get_book_info(&book.book_url)?;
        if let Some(toc_url) = info.toc_url {
            book.toc_url = Some(toc_url);
        }
        Ok(())
    }

    /// Get book info
    pub fn get_book_info(&self, book_url: &str) -> Result<BookItem> {
        let config = self.http.parse_request_config(book_url);
        let content_raw = self.http.request(&config)?;

        // Use compiled rules if available
        if let Some(transformed) = &self.transformed {
            let rules = &transformed.book_info_rules;
            let content = if matches!(rules.init, CompiledRule::Empty) {
                content_raw
            } else {
                self.execute_compiled(&rules.init, &content_raw)
                    .unwrap_or_else(|_| content_raw.to_string())
            };

            return Ok(BookItem {
                name: self
                    .execute_compiled(&rules.name, &content)
                    .unwrap_or_default(),
                author: self
                    .execute_compiled(&rules.author, &content)
                    .unwrap_or_default(),
                intro: self.execute_compiled(&rules.intro, &content).ok(),
                cover_url: self
                    .execute_compiled(&rules.cover_url, &content)
                    .ok()
                    .map(|u| self.http.absolute_url(&u)),
                book_url: book_url.to_string(),
                kind: self.execute_compiled(&rules.kind, &content).ok(),
                last_chapter: self.execute_compiled(&rules.last_chapter, &content).ok(),
                word_count: self.execute_compiled(&rules.word_count, &content).ok(),
                update_time: self.execute_compiled(&rules.update_time, &content).ok(),
                toc_url: self.execute_compiled(&rules.toc_url, &content).ok(),
            });
        }

        // Legacy path
        let rule = self
            .source
            .rule_book_info
            .as_ref()
            .ok_or_else(|| anyhow!("No book info rule defined"))?;

        // Process init rule if present
        let content = if let Some(init_rule) = &rule.init {
            if !init_rule.is_empty() {
                self.analyzer
                    .get_string(&content_raw, init_rule)
                    .unwrap_or(content_raw)
            } else {
                content_raw
            }
        } else {
            content_raw
        };

        Ok(BookItem {
            name: self
                .get_rule_value(&content, &rule.name)
                .unwrap_or_default(),
            author: self
                .get_rule_value(&content, &rule.author)
                .unwrap_or_default(),
            intro: self.get_rule_value(&content, &rule.intro).ok(),
            cover_url: self
                .get_rule_value(&content, &rule.cover_url)
                .ok()
                .map(|u| self.http.absolute_url(&u)),
            book_url: book_url.to_string(),
            kind: self.get_rule_value(&content, &rule.kind).ok(),
            last_chapter: self.get_rule_value(&content, &rule.last_chapter).ok(),
            word_count: self.get_rule_value(&content, &rule.word_count).ok(),
            update_time: self.get_rule_value(&content, &rule.update_time).ok(),
            toc_url: self.get_rule_value(&content, &rule.toc_url).ok(),
        })
    }

    /// Get table of contents
    pub fn get_chapters(&self, toc_url: &str) -> Result<Vec<Chapter>> {
        // Compiled path
        if let Some(transformed) = &self.transformed {
            let rules = &transformed.toc_rules;
            let mut all_chapters = Vec::new();
            let mut current_url = toc_url.to_string();
            let max_pages = 50;

            for _ in 0..max_pages {
                let config = self.http.parse_request_config(&current_url);
                let content = self.http.request(&config)?;

                let elements = self.execute_compiled_list(&rules.chapter_list, &content)?;
                if elements.is_empty() {
                    break;
                }

                for element in elements {
                    let title = self
                        .execute_compiled(&rules.chapter_name, &element)
                        .unwrap_or_default();
                    let url = self
                        .execute_compiled(&rules.chapter_url, &element)
                        .unwrap_or_default();
                    if !title.is_empty() {
                        all_chapters.push(Chapter {
                            title,
                            url: self.http.absolute_url(&url),
                            is_volume: self
                                .execute_compiled(&rules.is_volume, &element)
                                .ok()
                                .map(|s| s == "true")
                                .unwrap_or(false),
                        });
                    }
                }

                // Next page
                let next_url = self
                    .execute_compiled(&rules.next_toc_url, &content)
                    .unwrap_or_default();
                let next_url = next_url.trim();

                if !next_url.is_empty() && next_url != current_url {
                    let old_url = current_url.clone();
                    current_url = self.http.absolute_url(next_url);
                    if current_url != old_url {
                        continue;
                    }
                }
                break;
            }
            return Ok(all_chapters);
        }

        let rule = self
            .source
            .rule_toc
            .as_ref()
            .ok_or_else(|| anyhow!("No TOC rule defined"))?;

        let chapter_list_rule = rule
            .chapter_list
            .as_ref()
            .ok_or_else(|| anyhow!("No chapter_list rule"))?;

        let mut all_chapters = Vec::new();
        let mut current_url = toc_url.to_string();
        let max_pages = 50; // TOC can be very long

        for page_num in 0..max_pages {
            let config = self.http.parse_request_config(&current_url);
            let content = self.http.request(&config)?;

            tracing::debug!(
                "get_chapters: url={}, content_len={}, chapter_list_rule='{}', has_id_list={}, has_dd={}",
                current_url, content.len(), chapter_list_rule,
                content.contains("id=\"list\"") || content.contains("id='list'"),
                content.contains("<dd>") || content.contains("<dd ")
            );

            let elements = self.analyzer.get_elements(&content, chapter_list_rule)?;
            let page_chapters_count = elements.len();

            tracing::debug!(
                "get_chapters: found {} elements on page {}",
                page_chapters_count,
                page_num
            );

            for element in elements {
                match self.parse_chapter(&element, rule, &current_url) {
                    Ok(chapter) => all_chapters.push(chapter),
                    Err(e) => tracing::error!("Failed to parse chapter: {}", e),
                }
            }

            // Check for next page
            if let Some(next_url_rule) = &rule.next_toc_url {
                if !next_url_rule.is_empty() {
                    if let Ok(next_url) = self.analyzer.get_string(&content, next_url_rule) {
                        let next_url = next_url.trim();
                        if !next_url.is_empty() && next_url != current_url {
                            let old_url = current_url.clone();
                            current_url = self.http.absolute_url(next_url);
                            if current_url != old_url {
                                tracing::debug!(
                                    "Following nextTocUrl to page {}: {}",
                                    page_num + 2,
                                    current_url
                                );
                                continue;
                            }
                        }
                    }
                }
            }

            // If no next page or same URL, stop
            if page_chapters_count == 0 {
                break;
            }
            break;
        }

        Ok(all_chapters)
    }

    /// Get chapter content (with pagination support)
    pub fn get_content(&self, chapter_url: &str) -> Result<String> {
        // Compiled path
        if let Some(transformed) = &self.transformed {
            let rules = &transformed.content_rules;
            let mut full_content = String::new();
            let mut current_url = chapter_url.to_string();
            let max_pages = 20;

            for page_num in 0..max_pages {
                let config = self.http.parse_request_config(&current_url);
                let page_html = self.http.request(&config)?;

                let page_content = self
                    .execute_compiled(&rules.content, &page_html)
                    .unwrap_or_default();

                if !page_content.is_empty() {
                    if page_num > 0 {
                        full_content.push_str("\n\n");
                    }
                    full_content.push_str(&page_content);
                }

                // Next page
                let next_url = self
                    .execute_compiled(&rules.next_content_url, &page_html)
                    .unwrap_or_default();
                let next_url = next_url.trim();

                if !next_url.is_empty() && next_url != current_url {
                    current_url = self.http.absolute_url(next_url);
                    continue;
                }
                break;
            }

            let smart_cleaned = self.smart_filter_content(&full_content);
            let mut result = smart_cleaned;

            // Apply compiled replace regex
            for (pattern, replacement) in &rules.replace_regex {
                if let Ok(re) = regex::Regex::new(pattern) {
                    result = re.replace_all(&result, replacement.as_str()).to_string();
                }
            }
            return Ok(result);
        }

        let rule = self
            .source
            .rule_content
            .as_ref()
            .ok_or_else(|| anyhow!("No content rule defined"))?;

        let content_rule = rule
            .content
            .as_ref()
            .ok_or_else(|| anyhow!("No content rule"))?;

        let mut full_content = String::new();
        let mut current_url = chapter_url.to_string();
        let max_pages = 20; // Prevent infinite loops

        for page_num in 0..max_pages {
            let config = self.http.parse_request_config(&current_url);
            let page_html = self.http.request(&config)?;

            // Extract content from this page
            let page_content = self.analyzer.get_string(&page_html, content_rule)?;

            if !page_content.is_empty() {
                if page_num > 0 {
                    full_content.push_str("\n\n"); // Page separator
                }
                full_content.push_str(&page_content);
            }

            // Check for next page
            if let Some(next_url_rule) = &rule.next_content_url {
                if !next_url_rule.is_empty() {
                    if let Ok(next_url) = self.analyzer.get_string(&page_html, next_url_rule) {
                        let next_url = next_url.trim();
                        if !next_url.is_empty() && next_url != current_url {
                            current_url = self.http.absolute_url(next_url);
                            tracing::debug!(
                                "Following nextContentUrl to page {}: {}",
                                page_num + 2,
                                current_url
                            );
                            continue;
                        }
                    }
                }
            }
            break; // No more pages
        }

        // Apply smart filtering for common artifacts (pagination, loading text)
        let smart_cleaned = self.smart_filter_content(&full_content);

        // Apply replaceRegex if configured
        let final_content = if let Some(replace_regex) = &rule.replace_regex {
            self.apply_replace_regex(&smart_cleaned, replace_regex)
        } else {
            smart_cleaned
        };

        Ok(final_content)
    }

    /// Smart filter to remove common pollution (pagination info, 'loading', 'next page' prompts)
    fn smart_filter_content(&self, content: &str) -> String {
        use regex::Regex;
        let mut result = content.to_string();

        // Common patterns to strip
        let patterns = [
            r"（本章未完，请点击下一页继续阅读）",
            r"\(第\d+/\d+页\)",
            r"\(第\d+页\)",
            r"请点击下一页继续阅读",
            r"本章未完，点击下一页继续阅读",
            r"加载中...",
            r"-->>",
        ];

        for pattern in patterns {
            if let Ok(re) = Regex::new(pattern) {
                result = re.replace_all(&result, "").to_string();
            }
        }

        result
    }

    /// Apply replaceRegex rules to content
    fn apply_replace_regex(&self, content: &str, replace_rules: &str) -> String {
        use regex::Regex;

        let mut result = content.to_string();

        // Format: ##regex##replacement or multiple lines
        for line in replace_rules.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            // Parse ##pattern##replacement
            let line = line.trim_start_matches("##");
            let parts: Vec<&str> = line.split("##").collect();

            if let Some(pattern) = parts.first() {
                let replacement = parts.get(1).map(|s| *s).unwrap_or("");
                if let Ok(re) = Regex::new(pattern) {
                    result = re.replace_all(&result, replacement).to_string();
                }
            }
        }

        result
    }

    // === Private methods ===

    fn parse_explore_item(&self, element: &str, rule: &ExploreRule) -> Result<BookItem> {
        Ok(BookItem {
            name: self.get_rule_value(element, &rule.name)?,
            author: self
                .get_rule_value(element, &rule.author)
                .unwrap_or_default(),
            intro: self.get_rule_value(element, &rule.intro).ok(),
            cover_url: self
                .get_rule_value(element, &rule.cover_url)
                .ok()
                .map(|u| self.http.absolute_url(&u)),
            book_url: self
                .http
                .absolute_url(&self.get_rule_value(element, &rule.book_url)?),
            kind: self.get_rule_value(element, &rule.kind).ok(),
            last_chapter: None,
            word_count: self.get_rule_value(element, &rule.word_count).ok(),
            update_time: self.get_rule_value(element, &rule.update_time).ok(),
            toc_url: self
                .get_rule_value(element, &rule.toc_url)
                .ok()
                .map(|u| self.http.absolute_url(&u)),
        })
    }

    fn parse_book_item(&self, element: &str, rule: &SearchRule) -> Result<BookItem> {
        Ok(BookItem {
            name: self.get_rule_value(element, &rule.name)?,
            author: self
                .get_rule_value(element, &rule.author)
                .unwrap_or_default(),
            intro: self.get_rule_value(element, &rule.intro).ok(),
            cover_url: self
                .get_rule_value(element, &rule.cover_url)
                .ok()
                .map(|u| self.http.absolute_url(&u)),
            book_url: self
                .http
                .absolute_url(&self.get_rule_value(element, &rule.book_url)?),
            kind: self.get_rule_value(element, &rule.kind).ok(),
            last_chapter: self.get_rule_value(element, &rule.last_chapter).ok(),
            word_count: self.get_rule_value(element, &rule.word_count).ok(),
            update_time: self.get_rule_value(element, &rule.update_time).ok(),
            toc_url: None,
        })
    }

    fn parse_chapter(&self, element: &str, rule: &TocRule, base_url: &str) -> Result<Chapter> {
        let title = self.get_rule_value(element, &rule.chapter_name)?;

        // For chapter URL, we need to process templates with baseUrl and element data
        let chapter_url_raw = self.get_rule_value(element, &rule.chapter_url)?;

        // Replace baseUrl in the URL template
        let chapter_url_processed = chapter_url_raw.replace("{{baseUrl}}", base_url);

        // If URL contains more template expressions, process them with the element as context
        let chapter_url = if chapter_url_processed.contains("{{") {
            // Use process_templates with baseUrl as a variable
            let mut vars = HashMap::new();
            vars.insert("baseUrl".to_string(), base_url.to_string());
            vars.insert("result".to_string(), element.to_string());
            self.analyzer
                .process_templates(&chapter_url_processed, &vars)
        } else {
            chapter_url_processed
        };

        Ok(Chapter {
            title,
            url: self.http.absolute_url(&chapter_url),
            is_volume: self
                .get_rule_value(element, &rule.is_volume)
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false),
        })
    }

    fn get_rule_value(&self, content: &str, rule: &Option<String>) -> Result<String> {
        let rule = rule.as_ref().ok_or_else(|| anyhow!("Rule is None"))?;
        self.analyzer.get_string(content, rule)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_book_source_parse() {
        let json = r#"{
            "bookSourceUrl": "https://example.com",
            "bookSourceName": "Test Source",
            "searchUrl": "/search?q={{key}}&p={{page}}"
        }"#;

        let source: BookSource = serde_json::from_str(json).unwrap();
        assert_eq!(source.book_source_name, "Test Source");
        assert_eq!(source.search_url.unwrap(), "/search?q={{key}}&p={{page}}");
    }


}
