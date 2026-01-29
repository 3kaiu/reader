//! NXS Engine - High-performance book source executor for NXS format
//!
//! Features:
//! - Compiled selectors at initialization
//! - Fallback selector support (| syntax)
//! - Zero-copy extraction where possible
//! - Clean async interface

use nexus_core::{BookInfo, BookItem, Chapter, EngineError, NxsSource, ReplaceRule};
use scraper::Html;
use std::sync::Arc;
use tracing::{info, instrument};

use crate::anti_crawl::FallbackChain;
use crate::content::apply_replace_rules;
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
}

impl CompiledNxs {
    fn compile(source: &NxsSource) -> Result<Self, EngineError> {
        // Use global selector cache for cross-engine sharing
        let compile = |rule: &str| -> Result<Arc<FallbackSelector>, EngineError> {
            FallbackSelector::get_or_compile_global(rule).map_err(EngineError::InvalidSelector)
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
            return Err(EngineError::Network(format!(
                "HTTP {} for {}",
                response.status, url
            )));
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

        let results: Vec<BookItem> = items
            .iter()
            .filter_map(|el| {
                let name = self.compiled.search_name.select_from_and_extract(el)?;
                let url = self.compiled.search_url.select_from_and_extract(el)?;
                let book_url = self.abs_url(&url);

                // 1. Filter by domain if it's an external search
                let source_domain = self
                    .source
                    .url
                    .replace("https://", "")
                    .replace("http://", "")
                    .trim_end_matches('/')
                    .to_string();

                let is_external = !url.starts_with('/') && !url.contains(&source_domain);

                if is_external && !book_url.contains(&source_domain) {
                    return None;
                }

                // 2. Filter by path if result_filter is provided
                if let Some(filter) = &self.source.search.result_filter {
                    if !book_url.contains(filter) {
                        return None;
                    }
                }

                Some(BookItem {
                    name,
                    book_url,
                    author: self.compiled.search_author.select_from_and_extract(el),
                    cover_url: self
                        .compiled
                        .search_cover
                        .select_from_and_extract(el)
                        .map(|u| self.abs_url(&u)),
                    intro: self.compiled.search_intro.select_from_and_extract(el),
                    source_id: self.source.id.clone(),
                    source_name: self.source.name.clone(),
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
            name,
            author: self
                .compiled
                .book_author
                .select_and_extract(&doc)
                .unwrap_or_default(),
            intro: self.compiled.book_intro.select_and_extract(&doc),
            cover_url: self
                .compiled
                .book_cover
                .select_and_extract(&doc)
                .map(|u| self.abs_url(&u)),
            toc_url: self
                .compiled
                .book_toc
                .select_and_extract(&doc)
                .map(|u| self.abs_url(&u)),
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

        // 1. Initial parse to check for redirects
        let mut doc = Html::parse_document(&html);

        let redirect_url = self
            .compiled
            .book_toc
            .select_and_extract(&doc)
            .map(|u| self.abs_url(&u));

        // 2. Handle redirect if necessary
        let final_doc = if let Some(real_toc_url) = redirect_url {
            if real_toc_url != url && !real_toc_url.contains('#') {
                // Drop old doc before await to be safe with !Send types
                drop(doc);
                let new_html = self.fetch(&real_toc_url, None, None, None).await?;
                Html::parse_document(&new_html)
            } else {
                doc
            }
        } else {
            doc
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
                    title: name,
                    url: self.abs_url(&url),
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
        let html = self
            .fetch(chapter_url, None, None, self.source.content.script.clone())
            .await?;
        let doc = Html::parse_document(&html);

        let content = self
            .compiled
            .content_body
            .select_and_extract(&doc)
            .or_else(|| {
                if self.source.content.script.is_some() {
                    Some(html)
                } else {
                    None
                }
            })
            .ok_or(EngineError::RuleMismatch {
                rule: "content.body".to_string(),
            })?;

        // Apply system rules
        info!("Applying {} system rules to content", rules.len());
        let content = apply_replace_rules(content, rules, &self.source.id);

        // Apply source-specific rules
        info!(
            "Applying {} source rules to content",
            self.source.content.replace.len()
        );
        let content = apply_replace_rules(content, &self.source.content.replace, &self.source.id);

        info!("Content length after rules: {}", content.len());

        Ok(content)
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
