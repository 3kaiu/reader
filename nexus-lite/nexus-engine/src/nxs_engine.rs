//! NXS Engine - High-performance book source executor for NXS format
//!
//! Features:
//! - Compiled selectors at initialization
//! - Fallback selector support (| syntax)
//! - Zero-copy extraction where possible
//! - Clean async interface

use nexus_core::types::Chapter;
use nexus_core::{BookInfo, BookItem, EngineError, NxsSource, ReplaceRule};
use scraper::{Html, Selector};
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, info, instrument, warn};

use crate::anti_crawl::FallbackChain;
use crate::content::apply_replace_rules;
use crate::content_extract::{
    extract_structured_text_from_root, readability_like_extract, ContentExtractConfig,
    post_clean_content_enhanced,
};
use crate::extraction_metrics;
use crate::font_decryptor::FontDecryptor;
use crate::selector_cache::{extract_attr, FallbackSelector};
use crate::uri::{encode_query, resolve_url};

/// Compiled selectors for a NXS source (uses global cache)
struct CompiledNxs {
    // Search
    search_list: Arc<FallbackSelector>,
    search_name: Arc<FallbackSelector>,
    search_author: Arc<FallbackSelector>,
    search_url: Arc<FallbackSelector>,
    search_cover: Arc<FallbackSelector>,
    search_intro: Arc<FallbackSelector>,

    // Book info
    book_name: Arc<FallbackSelector>,
    book_author: Arc<FallbackSelector>,
    book_intro: Arc<FallbackSelector>,
    book_cover: Arc<FallbackSelector>,
    book_toc: Arc<FallbackSelector>,

    // TOC
    toc_list: Arc<FallbackSelector>,
    toc_name: Arc<FallbackSelector>,
    toc_url: Arc<FallbackSelector>,

    // Content
    content_body: Arc<FallbackSelector>,
    content_filter: Vec<Selector>,
    content_visible_only: bool,
}

impl CompiledNxs {
    fn compile(source: &NxsSource) -> Result<Self, EngineError> {
        // Use global selector cache for cross-engine sharing
        let compile = |rule: &str| -> Result<Arc<FallbackSelector>, EngineError> {
            FallbackSelector::get_or_compile_global(rule).map_err(|e| {
                EngineError::InvalidSelector {
                    selector: e.to_string(),
                }
            })
        };

        let compile_opt = |rule: &Option<String>| -> Result<Arc<FallbackSelector>, EngineError> {
            match rule {
                Some(r) => compile(r),
                None => compile(""),
            }
        };

        Ok(Self {
            // Search
            search_list: compile(&source.search.list)?,
            search_name: compile(&source.search.item.name)?,
            search_author: compile_opt(&source.search.item.author)?,
            search_url: compile(&source.search.item.url)?,
            search_cover: compile_opt(&source.search.item.cover)?,
            search_intro: compile_opt(&source.search.item.intro)?,

            // Book
            book_name: compile(&source.book.name)?,
            book_author: compile_opt(&source.book.author)?,
            book_intro: compile_opt(&source.book.intro)?,
            book_cover: compile_opt(&source.book.cover)?,
            book_toc: compile_opt(&source.book.toc)?,

            // TOC
            toc_list: compile(&source.toc.list)?,
            toc_name: compile(&source.toc.item.name)?,
            toc_url: compile(&source.toc.item.url)?,

            // Content
            content_body: compile(&source.content.body)?,
            content_filter: source
                .content
                .filter
                .iter()
                .map(|rule| {
                    Selector::parse(rule).map_err(|_| EngineError::InvalidSelector {
                        selector: rule.to_string(),
                    })
                })
                .collect::<Result<Vec<_>, _>>()?,
            content_visible_only: source.content.visible_only,
        })
    }
}

/// High-performance NXS book source engine
pub struct NxsEngine {
    source: NxsSource,
    compiled: CompiledNxs,
    anti_crawl: Arc<FallbackChain>,
}

impl NxsEngine {
    /// Create a new NXS engine with compiled selectors
    pub fn new(source: NxsSource, anti_crawl: Arc<FallbackChain>) -> Result<Self, EngineError> {
        info!("Compiling NXS source: {}", source.id);
        let compiled = CompiledNxs::compile(&source)?;

        Ok(Self {
            source,
            compiled,
            anti_crawl,
        })
    }

    /// Get source ID
    pub fn id(&self) -> &str {
        &self.source.id
    }

    /// Get source name
    pub fn name(&self) -> &str {
        &self.source.name
    }

    fn content_stats(text: &str) -> (usize, usize) {
        let trimmed = text.trim();
        let chars = trimmed.chars().count();
        let paragraphs = trimmed
            .split("\n\n")
            .filter(|p| !p.trim().is_empty())
            .count();
        (chars, paragraphs)
    }

    /// Fetch content via CF bypass service
    async fn fetch(
        &self,
        url: &str,
        method: Option<&str>,
        body: Option<String>,
        _script: Option<String>,
    ) -> Result<String, EngineError> {
        use nexus_core::FetchContext;

        let mut ctx = FetchContext::new(url, &self.source.id);
        if let Some(m) = method {
            ctx.method = m.to_string();
        }
        ctx.body = body;

        if let Some(headers) = &self.source.headers {
            ctx.headers.extend(headers.clone());
        }

        // Add default Content-Type for POST if not present
        if ctx.method == "POST" && !ctx.headers.contains_key("Content-Type") {
            ctx.headers.insert(
                "Content-Type".to_string(),
                "application/x-www-form-urlencoded".to_string(),
            );
        }

        let response = self.anti_crawl.execute(&mut ctx).await?;

        if !response.is_success() {
            return Err(EngineError::Network {
                message: format!("HTTP {} for {}", response.status, url),
            });
        }

        Ok(response.body)
    }

    /// Make URL absolute
    fn abs_url(&self, url: &str) -> String {
        resolve_url(url, &self.source.url)
    }

    /// Search for books
    #[instrument(skip(self), fields(source = %self.source.id))]
    pub async fn search(&self, query: &str) -> Result<Vec<BookItem>, EngineError> {
        let method = &self.source.search.method;
        let is_post = method.to_uppercase() == "POST";

        // 1. Handle encoding
        let encoded_query = self.get_encoded_query(query);

        // 2. Build URL
        let url_path = self.source.search.path.replace("{q}", &encoded_query);
        let url = if url_path.starts_with("http") {
            url_path
        } else {
            format!("{}{}", self.source.url.trim_end_matches('/'), url_path)
        };

        // 3. Build Body for POST
        let body = if is_post {
            self.source
                .search
                .body
                .as_ref()
                .map(|b| b.replace("{q}", &encoded_query))
        } else {
            None
        };

        let html = self.fetch(&url, Some(method), body, None).await?;
        let doc = Html::parse_document(&html);

        let items = self.compiled.search_list.select_all(&doc);

        // Pre-calculate domain for filtering
        let source_domain = self
            .source
            .url
            .strip_prefix("https://")
            .or_else(|| self.source.url.strip_prefix("http://"))
            .unwrap_or(&self.source.url)
            .trim_end_matches('/');

        let source_id: Arc<str> = self.source.id.as_str().into();
        let source_name: Arc<str> = self.source.name.as_str().into();

        let results: Vec<BookItem> = items
            .iter()
            .filter_map(|el| {
                let name = self.compiled.search_name.select_from_and_extract(el)?;
                let url = self.compiled.search_url.select_from_and_extract(el)?;
                let book_url = self.abs_url(&url);

                // 1. Filter by domain if it's an external search
                let is_external = !url.starts_with('/') && !url.contains(source_domain);

                if is_external && !book_url.contains(source_domain) {
                    return None;
                }

                // 2. Filter by path if result_filter is provided
                if let Some(filter) = &self.source.search.result_filter {
                    if !book_url.contains(filter) {
                        return None;
                    }
                }

                Some(BookItem {
                    name: name.into(),
                    book_url: book_url.into(),
                    author: self
                        .compiled
                        .search_author
                        .select_from_and_extract(el)
                        .map(|s| s.into()),
                    cover_url: self
                        .compiled
                        .search_cover
                        .select_from_and_extract(el)
                        .map(|u| self.abs_url(&u).into()),
                    intro: self
                        .compiled
                        .search_intro
                        .select_from_and_extract(el)
                        .map(|s| s.into()),
                    source_id: source_id.clone(),
                    source_name: source_name.clone(),
                    latest_chapter: None,
                })
            })
            .collect();

        Ok(results)
    }

    /// Get book information
    #[instrument(skip(self), fields(source = %self.source.id))]
    pub async fn book_info(&self, book_url: &str) -> Result<BookInfo, EngineError> {
        let url = self.abs_url(book_url);
        let html = self.fetch(&url, None, None, None).await?;
        let doc = Html::parse_document(&html);

        let name =
            self.compiled
                .book_name
                .select_and_extract(&doc)
                .ok_or(EngineError::RuleMismatch {
                    rule: "book.name".to_string(),
                })?;

        Ok(BookInfo {
            name: name.into(),
            author: self
                .compiled
                .book_author
                .select_and_extract(&doc)
                .unwrap_or_default()
                .into(),
            intro: self
                .compiled
                .book_intro
                .select_and_extract(&doc)
                .map(|s| s.into()),
            cover_url: self
                .compiled
                .book_cover
                .select_and_extract(&doc)
                .map(|u| self.abs_url(&u).into()),
            toc_url: self
                .compiled
                .book_toc
                .select_and_extract(&doc)
                .map(|u| self.abs_url(&u).into()),
            last_chapter: None,
            word_count: None,
            update_time: None,
            status: None,
            category: None,
        })
    }

    /// Get chapters list
    #[instrument(skip(self), fields(source = %self.source.id))]
    pub async fn chapters(&self, toc_url: &str) -> Result<Vec<Chapter>, EngineError> {
        let url = self.abs_url(toc_url);
        let html = self.fetch(&url, None, None, None).await?;

        // 1. Check for redirect (Sync operation)
        // Parse doc locally in this block so it drops before we ever await
        let redirect_url = {
            let doc = Html::parse_document(&html);
            self.compiled
                .book_toc
                .select_and_extract(&doc)
                .map(|u| self.abs_url(&u))
        };

        // 2. Decide if we need to fetch (Sync/Async boundary)
        let final_doc = if let Some(real_url) = redirect_url {
            if real_url != url && !real_url.contains('#') {
                // Fetch new content
                let new_html = self.fetch(&real_url, None, None, None).await?;
                Html::parse_document(&new_html)
            } else {
                // No valid redirect, use original
                Html::parse_document(&html)
            }
        } else {
            // No redirect found, use original
            Html::parse_document(&html)
        };

        let items = self.compiled.toc_list.select_all(&final_doc);

        let mut chapters: Vec<Chapter> = items
            .iter()
            .enumerate()
            .filter_map(|(idx, el)| {
                let name = if self.compiled.toc_name.is_empty() {
                    extract_attr(*el, "text")
                } else {
                    self.compiled
                        .toc_name
                        .select_from_and_extract(el)
                        .or_else(|| extract_attr(*el, "text"))
                };

                let url = if self.compiled.toc_url.is_empty() {
                    el.value().attr("href").map(|s| s.to_string())
                } else {
                    self.compiled
                        .toc_url
                        .select_from_and_extract(el)
                        .or_else(|| el.value().attr("href").map(|s| s.to_string()))
                };

                let url = url?;
                let name = name?;
                if name.is_empty() {
                    return None;
                }

                Some(Chapter {
                    title: name.into(),
                    url: self.abs_url(&url).into(),
                    index: idx,
                    is_vip: false,
                    word_count: None,
                })
            })
            .collect();

        if self.source.toc.reverse {
            chapters.reverse();
            // Re-index after reverse
            for (idx, chapter) in chapters.iter_mut().enumerate() {
                chapter.index = idx;
            }
        }

        Ok(chapters)
    }

    /// Get chapter content with replacement rules
    #[instrument(skip(self, rules), fields(source = %self.source.id))]
    pub async fn content(
        &self,
        chapter_url: &str,
        rules: &[ReplaceRule],
    ) -> Result<String, EngineError> {
        let initial_url = self.abs_url(chapter_url);
        let pagination = self.source.content.pagination.clone();
        let validation = self
            .source
            .content
            .validation
            .clone()
            .unwrap_or_default();

        if self.source.content.script.is_some() {
            if !self.source.content.script_enabled {
                warn!(
                    "content.script is configured for source {}, but script_enabled=false; skipping script execution",
                    self.source.id
                );
            } else if !self.anti_crawl.supports_script() {
                warn!(
                    "content.script is configured for source {}, using built-in restricted post-processor",
                    self.source.id
                );
            }
        }

        if let Some(pagination) = pagination {
            let next_selector =
                Selector::parse(&pagination.next_selector).map_err(|_| EngineError::InvalidSelector {
                    selector: pagination.next_selector.clone(),
                })?;
            let mut visited = HashSet::new();
            let mut current_url = initial_url;
            let mut merged = Vec::new();

            for idx in 0..pagination.max_pages.max(1) {
                if !visited.insert(current_url.clone()) {
                    break;
                }

                let html = self.fetch(&current_url, None, None, None).await?;
                let extracted = self.extract_content_from_html(&html, rules, idx == 0)?;
                if let Some(stop_text) = &pagination.stop_text {
                    if extracted.contains(stop_text) {
                        merged.push(extracted);
                        break;
                    }
                }
                merged.push(extracted);

                let next = {
                    let doc = Html::parse_document(&html);
                    doc.select(&next_selector)
                        .next()
                        .and_then(|el| el.value().attr("href"))
                        .map(|s| self.abs_url(s))
                };

                let Some(next_url) = next else { break };
                if visited.contains(&next_url) {
                    break;
                }

                current_url = next_url;
                if pagination.delay_ms > 0 {
                    tokio::time::sleep(Duration::from_millis(pagination.delay_ms)).await;
                }
            }

            let separator = pagination.separator;
            let combined = merged.join(&separator);
            if self.looks_like_content(&combined, &validation) {
                return Ok(combined);
            }

            return Err(EngineError::RuleMismatch {
                rule: "content.pagination".to_string(),
            });
        }

        let html = self.fetch(&initial_url, None, None, None).await?;
        self.extract_content_from_html(&html, rules, true)
    }

    fn looks_like_content(
        &self,
        text: &str,
        validation: &nexus_core::nxs::ContentValidationConfig,
    ) -> bool {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return false;
        }

        let (chars, paragraphs) = Self::content_stats(trimmed);

        if chars < validation.min_chars {
            if validation.allow_short_chapter {
                return chars >= 20 && paragraphs >= 1;
            }
            return false;
        }

        paragraphs >= validation.min_paragraphs
    }

    fn apply_content_script(&self, mut content: String) -> Result<String, EngineError> {
        let Some(script) = self.source.content.script.as_ref() else {
            return Ok(content);
        };
        if !self.source.content.script_enabled {
            return Ok(content);
        }
        if script.trim().is_empty() {
            return Ok(content);
        }
        if script.len() > 16 * 1024 {
            return Err(EngineError::ScriptMemoryExceeded);
        }

        for line in script.lines() {
            let cmd = line.trim();
            if cmd.is_empty() || cmd.starts_with('#') || cmd.starts_with("//") {
                continue;
            }

            if cmd.eq_ignore_ascii_case("trim") {
                content = content.trim().to_string();
                continue;
            }
            if cmd.eq_ignore_ascii_case("collapse_blank_lines") {
                while content.contains("\n\n\n") {
                    content = content.replace("\n\n\n", "\n\n");
                }
                continue;
            }

            if let Some(payload) = cmd.strip_prefix("replace::") {
                let mut parts = payload.splitn(2, "::");
                let pattern = parts.next().unwrap_or_default();
                let replacement = parts.next().unwrap_or_default();
                let re = regex::Regex::new(pattern).map_err(|e| EngineError::ScriptError {
                    message: format!("invalid replace regex: {}", e),
                })?;
                content = re.replace_all(&content, replacement).to_string();
                continue;
            }

            if let Some(pattern) = cmd.strip_prefix("remove::") {
                let re = regex::Regex::new(pattern).map_err(|e| EngineError::ScriptError {
                    message: format!("invalid remove regex: {}", e),
                })?;
                content = re.replace_all(&content, "").to_string();
                continue;
            }

            warn!("Unsupported script command for source {}: {}", self.source.id, cmd);
        }

        Ok(content)
    }

    fn apply_font_decrypt(&self, content: String) -> String {
        let Some(cfg) = self.source.content.font_decrypt.as_ref() else {
            return content;
        };

        if let Some(mapping) = cfg.mapping.as_ref() {
            let decryptor = FontDecryptor::new();
            return decryptor.decrypt(&content, mapping);
        }

        if cfg.auto_decrypt {
            warn!(
                "font_decrypt.auto_decrypt is enabled for source {}, but no mapping is provided",
                self.source.id
            );
        }

        content
    }

    fn extract_content_from_html(
        &self,
        html: &str,
        rules: &[ReplaceRule],
        strict_validate: bool,
    ) -> Result<String, EngineError> {
        let doc = Html::parse_document(html);
        let extract_cfg = ContentExtractConfig {
            filter_selectors: &self.compiled.content_filter,
            visible_only: self.compiled.content_visible_only,
        };
        let validation = self
            .source
            .content
            .validation
            .clone()
            .unwrap_or_default();

        // 1) Selector extraction first
        let mut used_fallback = false;
        let mut extracted = if self.compiled.content_body.attr == "text" {
            self.compiled
                .content_body
                .select_first(&doc)
                .map(|root| extract_structured_text_from_root(root, &extract_cfg))
        } else {
            self.compiled.content_body.select_and_extract(&doc)
        }
        .unwrap_or_default();

        // 2) Fallback extraction
        if extracted.trim().is_empty() && self.compiled.content_body.attr == "text" {
            if let Some(fallback) = readability_like_extract(&doc, &extract_cfg) {
                used_fallback = true;
                extracted = fallback;
            }
        }

        if used_fallback {
            debug!(
                "content extraction fallback triggered for source {}",
                self.source.id
            );
        }

        if extracted.trim().is_empty() {
            extraction_metrics::record_rule_mismatch_failure(&self.source.id);
            return Err(EngineError::RuleMismatch {
                rule: "content.body".to_string(),
            });
        }

        // 3) Global + source replacement rules
        extracted = apply_replace_rules(extracted, rules, &self.source.id);
        extracted = apply_replace_rules(extracted, &self.source.content.replace, &self.source.id);

        // 4) Optional restricted script post-processing
        extracted = self.apply_content_script(extracted)?;

        // 5) Optional font decryption
        extracted = self.apply_font_decrypt(extracted);

        // 6) Enhanced content cleaning
        let cleaned = post_clean_content_enhanced(extracted, self.source.content.clean.as_ref());
        if strict_validate && !self.looks_like_content(&cleaned, &validation) {
            let (chars, paragraphs) = Self::content_stats(&cleaned);
            warn!(
                "content validation failed for source {} (chars={}, paragraphs={}, min_chars={}, min_paragraphs={}, allow_short={})",
                self.source.id,
                chars,
                paragraphs,
                validation.min_chars,
                validation.min_paragraphs,
                validation.allow_short_chapter
            );
            extraction_metrics::record_validation_failure(&self.source.id);
            return Err(EngineError::RuleMismatch {
                rule: "content.validation".to_string(),
            });
        }
        if cleaned.trim().is_empty() {
            extraction_metrics::record_empty_content_failure(&self.source.id);
            return Err(EngineError::EmptyContent);
        }

        extraction_metrics::record_success(&self.source.id, used_fallback);
        Ok(cleaned)
    }

    /// Helper to encode query based on source configuration
    fn get_encoded_query(&self, query: &str) -> String {
        encode_query(query, self.source.search.encoding.as_deref())
    }
}

// ============================================================================
// BookEngine Trait Implementation
// ============================================================================

use async_trait::async_trait;
use nexus_core::{BookEngine, EngineMetadata};

#[async_trait]
impl BookEngine for NxsEngine {
    fn id(&self) -> &str {
        &self.source.id
    }

    fn name(&self) -> &str {
        &self.source.name
    }

    fn base_url(&self) -> &str {
        &self.source.url
    }

    async fn search(&self, query: &str) -> Result<Vec<BookItem>, EngineError> {
        // Delegate to existing implementation
        NxsEngine::search(self, query).await
    }

    async fn book_info(&self, book_url: &str) -> Result<BookInfo, EngineError> {
        NxsEngine::book_info(self, book_url).await
    }

    async fn chapters(&self, toc_url: &str) -> Result<Vec<Chapter>, EngineError> {
        NxsEngine::chapters(self, toc_url).await
    }

    async fn content(
        &self,
        chapter_url: &str,
        rules: &[ReplaceRule],
    ) -> Result<String, EngineError> {
        NxsEngine::content(self, chapter_url, rules).await
    }

    fn is_healthy(&self) -> bool {
        true // Could integrate with health tracker
    }

    fn metadata(&self) -> EngineMetadata {
        EngineMetadata {
            engine_type: "nxs".to_string(),
            version: Some(self.source.version.to_string()),
            custom_headers: self.source.headers.is_some(),
        }
    }
}
