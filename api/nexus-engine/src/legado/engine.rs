//! LegadoEngine — Rust native Legado book source engine
//!
//! Implements the `BookEngine` trait, allowing Legado-format book sources
//! to be used alongside NXS sources seamlessly.
//!
//! ## Usage
//!
//! ```ignore
//! let source: LegadoSource = serde_json::from_str(json_str)?;
//! let engine = LegadoEngine::new(source, anti_crawl_chain)?;
//! let results = engine.search("keyword").await?;
//! ```

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use nexus_core::{
    BookEngine, BookEngineRuntime, BookInfo, BookItem, Chapter, ContentPipelineOutput,
    EngineError, LegadoSource, ReplaceRule, SourceRuntimeProfile,
};
#[cfg(feature = "discovery")]
use nexus_core::{ExploreCategory, ExploreEngine};
use scraper::Html;

use crate::anti_crawl::FallbackChain;
use crate::legado::rule_parser::{CombineOp, CompiledLegadoRule};
use crate::legado::{operator, selector};
use regex::Regex;
use crate::uri::{encode_query, resolve_url};

/// A compiled Legado book source engine
pub struct LegadoEngine {
    source: LegadoSource,
    anti_crawl: Arc<FallbackChain>,
    source_id: String,
}

impl LegadoEngine {
    /// Create a new Legado engine from a LegadoSource
    pub fn new(source: LegadoSource, anti_crawl: Arc<FallbackChain>) -> Result<Self, EngineError> {
        let source_id = source.infer_id();
        Ok(Self { source, anti_crawl, source_id })
    }

    /// Execute a single rule against HTML content
    pub(crate) fn execute_rule(
        &self,
        rule: &CompiledLegadoRule,
        html: &Html,
        base_url: &str,
    ) -> Option<String> {
        match rule.combine {
            CombineOp::Concat => operator::concat::execute_concat(rule, html, None, base_url),
            CombineOp::Merge => operator::merge::execute_merge(rule, html, None, base_url),
            CombineOp::Fallback => operator::fallback::execute_fallback(rule, html, None, base_url),
        }
    }

    /// Execute a rule against JSON content
    pub(crate) fn execute_json_rule(
        &self,
        rule: &CompiledLegadoRule,
        json: &serde_json::Value,
    ) -> Option<String> {
        let html = Html::parse_document("");
        match rule.combine {
            CombineOp::Concat => operator::concat::execute_concat(rule, &html, Some(json), ""),
            CombineOp::Merge => operator::merge::execute_merge(rule, &html, Some(json), ""),
            CombineOp::Fallback => operator::fallback::execute_fallback(rule, &html, Some(json), ""),
        }
    }

    /// Compile an optional rule string
    pub(crate) fn compile_optional(
        &self,
        rule_str: &Option<String>,
    ) -> Option<Arc<CompiledLegadoRule>> {
        let s = rule_str.as_ref()?;
        if s.is_empty() {
            return None;
        }
        CompiledLegadoRule::get_or_compile(s).ok()
    }

    /// Execute a compiled rule and return the result, or None if rule is empty
    fn exec_rule_str(
        &self,
        rule_str: &Option<String>,
        html: &Html,
        base_url: &str,
    ) -> Option<String> {
        let rule = self.compile_optional(rule_str)?;
        self.execute_rule(&rule, html, base_url)
    }

    /// Execute a rule string against JSON
    fn exec_json_rule_str(
        &self,
        rule_str: &Option<String>,
        json: &serde_json::Value,
    ) -> Option<String> {
        let rule = self.compile_optional(rule_str)?;
        self.execute_json_rule(&rule, json)
    }

    /// Make URL absolute
    pub(crate) fn abs_url(&self, url: &str) -> String {
        resolve_url(url, &self.source.book_source_url)
    }

    /// Parse `LegadoSource.header` into a HashMap
    fn parse_headers(&self) -> Option<HashMap<String, String>> {
        let header_str = self.source.header.as_ref()?;
        if header_str.trim().is_empty() {
            return None;
        }

        // Legado headers can be:
        // 1. JSON object: {"User-Agent": "...", "Referer": "..."}
        // 2. Python dict literal: {'User-Agent': '...', 'Referer': '...'}
        // 3. @js: expression that evaluates to a header object — skip, not executable here
        // 4. Plain string: Key: Value\nKey2: Value2

        // Skip @js: headers — they would need JS execution
        let cleaned = header_str.trim();
        if cleaned.starts_with("@js:") || cleaned.starts_with("<js>") {
            return None;
        }

        if cleaned.starts_with('{') {
            // Try JSON first
            if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(cleaned) {
                return Some(map);
            }
            // Try Python dict -> JSON conversion (single quotes -> double quotes)
            let json_like = cleaned
                .replace('\'', "\"")
                .replace('\t', " ")
                .replace('\n', " ")
                .replace('\r', "");
            if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&json_like) {
                return Some(map);
            }
        }

        // Simple key-value lines
        let mut headers = HashMap::new();
        for line in cleaned.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once(':') {
                let k = key.trim().trim_matches('"').trim_matches('\'').trim();
                let v = value.trim().trim_matches('"').trim_matches('\'').trim();
                if !k.is_empty() && !v.is_empty() {
                    headers.insert(k.to_string(), v.to_string());
                }
            }
        }

        if headers.is_empty() { None } else { Some(headers) }
    }

    /// Resolve search URL template
    /// Supports: {{key}} / {key} / %s / {{page}} / {page}
    fn resolve_search_url(&self, query: &str) -> Result<(String, Option<String>, String, Option<&'static str>), EngineError> {
        let search_url = self.source.search_url.as_deref().unwrap_or("");
        if search_url.is_empty() {
            return Err(EngineError::InvalidConfig {
                message: "search_url is empty".to_string(),
            });
        }

        // Handle @js: and <js> prefixed search URLs
        let trimmed = search_url.trim();
        if trimmed.starts_with("@js:") || trimmed.starts_with("<js>") {
            let result = selector::js::execute_js(trimmed, query, &self.source.book_source_url);
            match result {
                Some(url) => {
                    return Ok(parse_legado_url(&url, &self.source.book_source_url));
                }
                None => {
                    return Err(EngineError::ScriptError {
                        message: "search URL JS returned empty".to_string(),
                    });
                }
            }
        }

        // Handle Legado's compound URL format: "url,{method:'POST',body:'...'}"
        Ok(parse_legado_url(search_url, &self.source.book_source_url))
    }

    /// Fetch HTML from a URL using the anti-crawl chain
    async fn fetch(&self, url: &str, method: &str, body: Option<String>) -> Result<String, EngineError> {
        use nexus_core::FetchContext;

        let mut ctx = FetchContext::new(url, &self.source_id);
        ctx.method = method.to_string();
        ctx.body = body;

        // Apply source headers
        if let Some(headers) = self.parse_headers() {
            ctx.headers.extend(headers);
        }

        // Set timeout from respond_time
        ctx.timeout_secs = std::cmp::max(1, (self.source.respond_time / 1000) as u64);

        // Use FallbackChain's default strategy order
        let result = self.anti_crawl.execute(&mut ctx).await?;

        if !result.is_success() {
            return Err(EngineError::Network {
                message: format!("HTTP {} for {}", result.status, url),
            });
        }

        Ok(result.body)
    }

    /// Check if a book URL matches the source's bookUrlPattern (if set)
    fn matches_url_pattern(&self, url: &str) -> bool {
        let pattern = match &self.source.book_url_pattern {
            Some(p) => p,
            None => return true, // no pattern = match all
        };
        if pattern.is_empty() {
            return true;
        }
        // bookUrlPattern is a regex — try to match
        Regex::new(pattern).map(|re| re.is_match(url)).unwrap_or(true)
    }

    /// Try to parse response as JSON and extract search results
    fn search_json(
        &self,
        rules: &nexus_core::legado::SearchRule,
        body: &str,
        _base_url: &str,
    ) -> Result<Vec<BookItem>, EngineError> {
        let json: serde_json::Value = serde_json::from_str(body)
            .map_err(|e| EngineError::JsonParse {
                message: format!("search JSON parse failed: {}", e),
            })?;

        let book_list_rule = self.compile_optional(&rules.base.book_list);

        let items = if let Some(list_rule) = &book_list_rule {
            let list_result = self.execute_json_rule(list_rule, &json);
            match list_result {
                Some(list_str) => {
                    serde_json::from_str::<Vec<serde_json::Value>>(&list_str).unwrap_or_default()
                }
                None => vec![json],
            }
        } else {
            vec![json]
        };

        let check_keyword = rules.check_key_word.as_deref().unwrap_or("");
        let mut results = Vec::new();
        let src_id = Arc::<str>::from(self.source_id.as_str());
        let src_name = Arc::<str>::from(self.source.book_source_name.as_str());

        for item in items {
            let name = self.exec_json_rule_str(&rules.base.name, &item)
                .unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            let book_url = self.exec_json_rule_str(&rules.base.book_url, &item)
                .unwrap_or_default();
            if book_url.is_empty() {
                continue;
            }
            let abs_book_url = self.abs_url(&book_url);

            // book_url_pattern filter
            if !self.matches_url_pattern(&abs_book_url) {
                continue;
            }
            // check_key_word filter
            if !check_keyword.is_empty() && !abs_book_url.contains(check_keyword) {
                continue;
            }

            let mut book = BookItem::new(
                name,
                abs_book_url,
                Arc::clone(&src_id),
                Arc::clone(&src_name),
            );
            book.author = self.exec_json_rule_str(&rules.base.author, &item)
                .map(|s| Arc::<str>::from(s));
            book.cover_url = self.exec_json_rule_str(&rules.base.cover_url, &item)
                .map(|s| self.abs_url(&s))
                .map(|s| Arc::<str>::from(s));
            book.intro = self.exec_json_rule_str(&rules.base.intro, &item)
                .map(|s| Arc::<str>::from(s));
            results.push(book);
        }
        Ok(results)
    }

    /// Extract search results from HTML response using CSS selectors
    fn search_html(
        &self,
        rules: &nexus_core::legado::SearchRule,
        body: &str,
        base_url: &str,
    ) -> Result<Vec<BookItem>, EngineError> {
        let doc = Html::parse_document(body);

        let book_list_rule = self.compile_optional(&rules.base.book_list);

        // Collect root elements: either from bookList CSS selector, or the whole document
        let root_elements = if let Some(list_rule) = &book_list_rule {
            // bookList is a CSS selector — extract ALL matching elements
            let all_html = selector::css::extract_all_css(&doc, &list_rule.original);
            if all_html.is_empty() {
                // Fallback: treat whole doc as the list
                vec![doc]
            } else {
                // Each matched element is a root for sub-rules
                // We need to re-parse each selection as its own Html for sub-rule evaluation
                all_html
                    .into_iter()
                    .map(|h| Html::parse_fragment(&h))
                    .collect()
            }
        } else {
            vec![doc]
        };

        let check_keyword = rules.check_key_word.as_deref().unwrap_or("");
        let mut results = Vec::new();
        let src_id = Arc::<str>::from(self.source_id.as_str());
        let src_name = Arc::<str>::from(self.source.book_source_name.as_str());

        for root in &root_elements {
            let name = self.exec_rule_str(&rules.base.name, root, base_url)
                .unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            let book_url = self.exec_rule_str(&rules.base.book_url, root, base_url)
                .unwrap_or_default();
            if book_url.is_empty() {
                continue;
            }
            let abs_book_url = self.abs_url(&book_url);

            // book_url_pattern filter
            if !self.matches_url_pattern(&abs_book_url) {
                continue;
            }
            // check_key_word filter
            if !check_keyword.is_empty() && !abs_book_url.contains(check_keyword) {
                continue;
            }

            let mut book = BookItem::new(
                name,
                abs_book_url,
                Arc::clone(&src_id),
                Arc::clone(&src_name),
            );
            book.author = self.exec_rule_str(&rules.base.author, root, base_url)
                .map(|s| Arc::<str>::from(s));
            book.cover_url = self.exec_rule_str(&rules.base.cover_url, root, base_url)
                .map(|s| self.abs_url(&s))
                .map(|s| Arc::<str>::from(s));
            book.intro = self.exec_rule_str(&rules.base.intro, root, base_url)
                .map(|s| Arc::<str>::from(s));
            results.push(book);
        }
        Ok(results)
    }
}

// ============================================================================
// Legado URL parsing helpers
// ============================================================================

/// Parse a Legado compound URL that may contain method/body options.
/// Format: "url,{method:'POST',body:'searchkey={{key}}&type=all'}"
/// Returns (url, body, method, charset)
fn parse_legado_url(
    url_str: &str,
    base_url: &str,
) -> (String, Option<String>, String, Option<&'static str>) {
    let trimmed = url_str.trim();

    // Check for compound format: URL,{options}
    if let Some(comma_pos) = trimmed.find(",{") {
        let url_part = trimmed[..comma_pos].trim().trim_matches('"').trim_matches('\'');
        let options_part = &trimmed[comma_pos + 1..];

        // Default method
        let mut method = "GET".to_string();
        let mut body: Option<String> = None;

        // Parse options roughly
        if options_part.contains("'method':'POST'") || options_part.contains("\"method\":\"POST\"") {
            method = "POST".to_string();
        }
        if let Some(body_start) = options_part.find("'body':'") {
            let rest = &options_part[body_start + 8..];
            if let Some(body_end) = rest.find('\'') {
                body = Some(rest[..body_end].to_string());
            }
        } else if let Some(body_start) = options_part.find("\"body\":\"") {
            let rest = &options_part[body_start + 8..];
            if let Some(body_end) = rest.find('"') {
                body = Some(rest[..body_end].to_string());
            }
        }

        // Handle charset
        let charset = if options_part.contains("'charset':'gbk'")
            || options_part.contains("\"charset\":\"gbk\"")
        {
            Some("gbk")
        } else if options_part.contains("'charset':'utf-8'")
            || options_part.contains("\"charset\":\"utf-8\"")
        {
            Some("utf-8")
        } else {
            None
        };

        let resolved = resolve_url(url_part, base_url);
        return (resolved, body, method, charset);
    }

    // Simple URL
    (resolve_url(trimmed, base_url), None, "GET".to_string(), None)
}

// ============================================================================
// BookEngine Trait Implementation
// ============================================================================

#[async_trait]
impl BookEngine for LegadoEngine {
    fn id(&self) -> &str {
        &self.source_id
    }

    fn name(&self) -> &str {
        &self.source.book_source_name
    }

    fn base_url(&self) -> &str {
        &self.source.book_source_url
    }

    async fn search(&self, query: &str) -> Result<Vec<BookItem>, EngineError> {
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }

        let rules = match &self.source.rule_search {
            Some(r) => r,
            None => return Ok(Vec::new()),
        };

        // Resolve URL template — returns (url, body, method, charset)
        let (url, body, method, _charset) = self.resolve_search_url(query)?;

        // Replace {{key}} / {key} / %s in URL and body
        let encoded = encode_query(query, None);
        let url = url
            .replace("{{key}}", &encoded)
            .replace("{{search}}", &encoded)
            .replace("{key}", &encoded)
            .replace("{search}", &encoded)
            .replace("%s", &encoded);
        let body = body.map(|b| {
            b.replace("{{key}}", &encoded)
                .replace("{{search}}", &encoded)
                .replace("{key}", &encoded)
                .replace("{search}", &encoded)
                .replace("%s", &encoded)
        });

        // Fetch
        let html_str = self.fetch(&url, &method, body).await?;

        // Determine if the response is JSON or HTML
        let trimmed = html_str.trim();
        let is_json = trimmed.starts_with('[') || trimmed.starts_with('{');

        if is_json {
            // Try JSON path first; fall back to HTML if JSON parse fails
            match self.search_json(rules, &html_str, &url) {
                Ok(results) => Ok(results),
                Err(_) => self.search_html(rules, &html_str, &url),
            }
        } else {
            self.search_html(rules, &html_str, &url)
        }
    }

    async fn book_info(&self, book_url: &str) -> Result<BookInfo, EngineError> {
        let rules = match &self.source.rule_book_info {
            Some(r) => r,
            None => {
                return Err(EngineError::RuleMismatch {
                    rule: "book_info".to_string(),
                });
            }
        };

        let url = self.abs_url(book_url);
        let html_str = self.fetch(&url, "GET", None).await?;
        let doc = Html::parse_document(&html_str);

        let name = self
            .exec_rule_str(&rules.name, &doc, &url)
            .ok_or(EngineError::RuleMismatch {
                rule: "book_info.name".to_string(),
            })?;

        let author = self
            .exec_rule_str(&rules.author, &doc, &url)
            .unwrap_or_default();

        let mut info = BookInfo {
            name: Arc::<str>::from(name),
            author: Arc::<str>::from(author),
            cover_url: self
                .exec_rule_str(&rules.cover_url, &doc, &url)
                .map(|s| self.abs_url(&s))
                .map(|s| Arc::<str>::from(s)),
            intro: self
                .exec_rule_str(&rules.intro, &doc, &url)
                .map(|s| Arc::<str>::from(s)),
            toc_url: self
                .exec_rule_str(&rules.toc_url, &doc, &url)
                .map(|s| self.abs_url(&s))
                .map(|s| Arc::<str>::from(s)),
            last_chapter: self
                .exec_rule_str(&rules.last_chapter, &doc, &url)
                .map(|s| Arc::<str>::from(s)),
            word_count: self
                .exec_rule_str(&rules.word_count, &doc, &url)
                .map(|s| Arc::<str>::from(s)),
            category: self
                .exec_rule_str(&rules.kind, &doc, &url)
                .map(|s| Arc::<str>::from(s)),
            update_time: self
                .exec_rule_str(&rules.update_time, &doc, &url)
                .map(|s| Arc::<str>::from(s)),
            status: None,
            meta: None,
        };

        // If no explicit toc_url, use the book_url itself
        if info.toc_url.is_none() {
            info.toc_url = Some(Arc::<str>::from(url.clone()));
        }

        Ok(info)
    }

    async fn chapters(&self, toc_url: &str) -> Result<Vec<Chapter>, EngineError> {
        let rules = match &self.source.rule_toc {
            Some(r) => r,
            None => {
                return Err(EngineError::RuleMismatch {
                    rule: "toc".to_string(),
                });
            }
        };

        let url = self.abs_url(toc_url);
        let html_str = self.fetch(&url, "GET", None).await?;
        let doc = Html::parse_document(&html_str);

        // Get chapter list — each item is a row in the TOC
        let chapter_list_rule = self.compile_optional(&rules.chapter_list);
        let chapter_name_rule = self.compile_optional(&rules.chapter_name);
        let chapter_url_rule = self.compile_optional(&rules.chapter_url);

        let chapters = if let Some(list_rule) = &chapter_list_rule {
            // Extract list items via CSS
            let list_html = self.execute_rule(list_rule, &doc, &url);
            match list_html {
                Some(html_fragment) => {
                    let fragment = Html::parse_document(&html_fragment);
                    // For each item in the fragment, split by elements
                    // Use the list rule result as-is
                    let mut chaps = Vec::new();
                    // Use CSS selector to find individual items
                    if let Some(name_rule) = &chapter_name_rule {
                        if let Some(url_rule) = &chapter_url_rule {
                            // Try to extract multiple items — zip avoids clone
                            let names = selector::css::extract_all_css(&fragment, &name_rule.original);
                            let urls = selector::css::extract_all_css(&fragment, &url_rule.original);
                            for (i, (name, url)) in names.into_iter().zip(urls.into_iter()).enumerate() {
                                chaps.push(Chapter {
                                    title: Arc::<str>::from(name),
                                    url: Arc::<str>::from(self.abs_url(&url)),
                                    index: i,
                                    is_vip: false,
                                    word_count: None,
                                });
                            }
                        }
                    }
                    chaps
                }
                None => Vec::new(),
            }
        } else {
            // No list rule — try to extract single chapter info
            let name = self.exec_rule_str(&rules.chapter_name, &doc, &url).unwrap_or_default();
            let chap_url = self.exec_rule_str(&rules.chapter_url, &doc, &url).unwrap_or_default();
            if !name.is_empty() && !chap_url.is_empty() {
                vec![Chapter {
                    title: Arc::<str>::from(name),
                    url: Arc::<str>::from(self.abs_url(&chap_url)),
                    index: 0,
                    is_vip: false,
                    word_count: None,
                }]
            } else {
                Vec::new()
            }
        };

        Ok(chapters)
    }

    async fn content(
        &self,
        chapter_url: &str,
        _rules: &[ReplaceRule],
    ) -> Result<String, EngineError> {
        let rules = match &self.source.rule_content {
            Some(r) => r,
            None => {
                return Err(EngineError::RuleMismatch {
                    rule: "content".to_string(),
                });
            }
        };

        let url = self.abs_url(chapter_url);
        let html_str = self.fetch(&url, "GET", None).await?;
        let doc = Html::parse_document(&html_str);

        let content = self
            .exec_rule_str(&rules.content, &doc, &url)
            .ok_or(EngineError::ContentExtractionFailed {
                reason: "content rule returned empty".to_string(),
            })?;

        // Apply source_regex replacement if present
        let cleaned = if let Some(source_regex) = &rules.source_regex {
            if let Some(replace_regex) = &rules.replace_regex {
                selector::regex::replace_regex(&content, source_regex, replace_regex)
            } else {
                content
            }
        } else {
            content
        };

        // Clean text: remove zero-width chars, deduplicate
        let cleaned = crate::text_cleaner::remove_zero_width_chars(&cleaned);
        let cleaned = cleaned.trim().to_string();

        if cleaned.is_empty() {
            return Err(EngineError::EmptyContent);
        }

        Ok(cleaned)
    }
}

#[async_trait]
impl BookEngineRuntime for LegadoEngine {
    async fn content_with_report(
        &self,
        chapter_url: &str,
        rules: &[ReplaceRule],
    ) -> Result<ContentPipelineOutput, EngineError> {
        let content = BookEngine::content(self, chapter_url, rules).await?;
        Ok(ContentPipelineOutput {
            content,
            stage_reports: Vec::new(),
        })
    }

    fn runtime_profile(&self) -> SourceRuntimeProfile {
        SourceRuntimeProfile::default()
    }

    fn circuit_state_label(&self) -> String {
        // Check circuit breaker state from anti_crawl chain
        self.anti_crawl
            .circuit_state(&self.source_id)
            .map(|state| format!("{state:?}").to_ascii_lowercase())
            .unwrap_or_else(|| "closed".to_string())
    }

    fn reset_runtime_state(&self) {
        self.anti_crawl.reset_circuit(&self.source_id);
    }
}

// ============================================================================
// ExploreEngine Trait Implementation (feature-gated)
// ============================================================================

#[cfg(feature = "discovery")]
#[async_trait]
impl ExploreEngine for LegadoEngine {
    async fn explore_categories(&self) -> Result<Vec<ExploreCategory>, EngineError> {
        let explore_url = self.source.explore_url.as_deref().unwrap_or("");
        if explore_url.is_empty() {
            return Ok(Vec::new());
        }

        // Fetch the explore page
        let html_str = self.fetch(explore_url, "GET", None).await?;

        // Check if the response is JSON or HTML
        let trimmed = html_str.trim();
        if trimmed.starts_with('[') || trimmed.starts_with('{') {
            // JSON response — try to parse as category list
            // Legado expects: array of { name: "...", url: "..." } or plain strings
            if let Ok(json) = serde_json::from_str::<Vec<String>>(&html_str) {
                return Ok(json
                    .into_iter()
                    .map(|name| ExploreCategory {
                        name: name.clone(),
                        url: name,
                    })
                    .collect());
            }
            if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&html_str) {
                let mut categories = Vec::new();
                for item in arr {
                    let name = item
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let url = item
                        .get("url")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&name)
                        .to_string();
                    if !name.is_empty() {
                        categories.push(ExploreCategory { name, url });
                    }
                }
                return Ok(categories);
            }
        }

        // HTML response — use title_rule from rule_explore
        let doc = Html::parse_document(&html_str);
        let rules = self.source.rule_explore.as_ref();

        // Try to extract category links from the page
        // Use title_rule if present, otherwise try common patterns
        let title_rule = rules.and_then(|r| r.title_rule.as_ref());
        let _style = rules.and_then(|r| r.style.as_ref());

        if let Some(rule) = title_rule {
            // title_rule is a CSS selector to extract category names
            let names = selector::css::extract_all_css(&doc, rule);
            if !names.is_empty() {
                return Ok(names
                    .into_iter()
                    .map(|n| ExploreCategory {
                        name: n.clone(),
                        url: n,
                    })
                    .collect());
            }
        }

        // Fallback: look for links in the page
        let fallback_categories = vec![
            ExploreCategory {
                name: "默认".to_string(),
                url: explore_url.to_string(),
            },
        ];
        Ok(fallback_categories)
    }

    async fn explore(&self, category_url: &str) -> Result<Vec<BookItem>, EngineError> {
        let rules = match &self.source.rule_explore {
            Some(r) => r,
            None => {
                // No explore rules — try to use the category URL directly
                // as a page that contains book items
                return Ok(Vec::new());
            }
        };

        // Determine the URL to fetch
        let fetch_url = if category_url.is_empty() || category_url == "GETALL" {
            match &self.source.explore_url {
                Some(u) => u.clone(),
                None => return Ok(Vec::new()),
            }
        } else {
            category_url.to_string()
        };

        let html_str = self.fetch(&fetch_url, "GET", None).await?;

        // Check if response is JSON or HTML
        let trimmed = html_str.trim();
        let is_json = trimmed.starts_with('[') || trimmed.starts_with('{');

        if is_json {
            // JSON response
            let json: serde_json::Value = serde_json::from_str(&html_str)
                .map_err(|e| EngineError::JsonParse {
                    message: format!("explore JSON parse failed: {}", e),
                })?;

            let book_list_rule = self.compile_optional(&rules.base.book_list);

            let items = if let Some(list_rule) = &book_list_rule {
                let list_result = self.execute_json_rule(list_rule, &json);
                match list_result {
                    Some(list_str) => {
                        serde_json::from_str::<Vec<serde_json::Value>>(&list_str)
                            .unwrap_or_default()
                    }
                    None => vec![json],
                }
            } else {
                vec![json]
            };

            let mut results = Vec::new();
            let src_id = Arc::<str>::from(self.source_id.as_str());
            let src_name = Arc::<str>::from(self.source.book_source_name.as_str());
            for item in items {
                let name = self
                    .exec_json_rule_str(&rules.base.name, &item)
                    .unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                let book_url = self
                    .exec_json_rule_str(&rules.base.book_url, &item)
                    .unwrap_or_default();
                if book_url.is_empty() {
                    continue;
                }
                let abs_book_url = self.abs_url(&book_url);

                let mut book = BookItem::new(
                    name,
                    abs_book_url,
                    Arc::clone(&src_id),
                    Arc::clone(&src_name),
                );
                book.author = self
                    .exec_json_rule_str(&rules.base.author, &item)
                    .map(|s| Arc::<str>::from(s));
                book.cover_url = self
                    .exec_json_rule_str(&rules.base.cover_url, &item)
                    .map(|s| self.abs_url(&s))
                    .map(|s| Arc::<str>::from(s));
                book.intro = self
                    .exec_json_rule_str(&rules.base.intro, &item)
                    .map(|s| Arc::<str>::from(s));
                book.latest_chapter = self
                    .exec_json_rule_str(&rules.base.last_chapter, &item)
                    .map(|s| Arc::<str>::from(s));
                results.push(book);
            }
            Ok(results)
        } else {
            // HTML response
            let doc = Html::parse_document(&html_str);
            let book_list_rule = self.compile_optional(&rules.base.book_list);

            let root_elements = if let Some(list_rule) = &book_list_rule {
                let all_html = selector::css::extract_all_css(&doc, &list_rule.original);
                if all_html.is_empty() {
                    vec![doc]
                } else {
                    all_html
                        .into_iter()
                        .map(|h| Html::parse_fragment(&h))
                        .collect()
                }
            } else {
                vec![doc]
            };

            let mut results = Vec::new();
            let src_id = Arc::<str>::from(self.source_id.as_str());
            let src_name = Arc::<str>::from(self.source.book_source_name.as_str());
            for root in &root_elements {
                let name = self
                    .exec_rule_str(&rules.base.name, root, &fetch_url)
                    .unwrap_or_default();
                if name.is_empty() {
                    continue;
                }
                let book_url = self
                    .exec_rule_str(&rules.base.book_url, root, &fetch_url)
                    .unwrap_or_default();
                if book_url.is_empty() {
                    continue;
                }
                let abs_book_url = self.abs_url(&book_url);

                let mut book = BookItem::new(
                    name,
                    abs_book_url,
                    Arc::clone(&src_id),
                    Arc::clone(&src_name),
                );
                book.author = self
                    .exec_rule_str(&rules.base.author, root, &fetch_url)
                    .map(|s| Arc::<str>::from(s));
                book.cover_url = self
                    .exec_rule_str(&rules.base.cover_url, root, &fetch_url)
                    .map(|s| self.abs_url(&s))
                    .map(|s| Arc::<str>::from(s));
                book.intro = self
                    .exec_rule_str(&rules.base.intro, root, &fetch_url)
                    .map(|s| Arc::<str>::from(s));
                book.latest_chapter = self
                    .exec_rule_str(&rules.base.last_chapter, root, &fetch_url)
                    .map(|s| Arc::<str>::from(s));
                results.push(book);
            }
            Ok(results)
        }
    }
}