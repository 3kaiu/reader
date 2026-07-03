//! NXS Engine - High-performance book source executor for NXS format
//!
//! Features:
//! - Compiled selectors at initialization
//! - Fallback selector support (| syntax)
//! - Zero-copy extraction where possible
//! - Clean async interface

use nexus_core::types::{Chapter, PipelineStageReport};
use nexus_core::{
    BookEngineRuntime, BookInfo, BookItem, ContentPipelineOutput, EngineError, NxsSource,
    ReplaceRule, SourceRuntimeProfile,
};
use scraper::Selector;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, info, instrument, warn};

use crate::anti_crawl::FallbackChain;
use crate::content_fetch::PaginatedContentFetch;
use crate::content_pipeline::NxsContentPipeline;
use crate::extraction_metrics;
use crate::nxs_ops::{BookInfoOperation, ChaptersOperation, SearchOperation};
use crate::nxs_parser::NxsParser;
use crate::selector_cache::FallbackSelector;
use crate::skill_telemetry;
use crate::skills::{ContentJudgeSkill, StrategyPlannerSkill};
use crate::uri::{encode_query, resolve_url};
use uuid::Uuid;

/// Compiled selectors for a NXS source (uses global cache)
pub(crate) struct CompiledNxs {
    // Search
    pub(crate) search_list: Arc<FallbackSelector>,
    pub(crate) search_name: Arc<FallbackSelector>,
    pub(crate) search_author: Arc<FallbackSelector>,
    pub(crate) search_url: Arc<FallbackSelector>,
    pub(crate) search_cover: Arc<FallbackSelector>,
    pub(crate) search_intro: Arc<FallbackSelector>,

    // Book info
    pub(crate) book_name: Arc<FallbackSelector>,
    pub(crate) book_author: Arc<FallbackSelector>,
    pub(crate) book_intro: Arc<FallbackSelector>,
    pub(crate) book_cover: Arc<FallbackSelector>,
    pub(crate) book_toc: Arc<FallbackSelector>,

    // TOC
    pub(crate) toc_list: Arc<FallbackSelector>,
    pub(crate) toc_name: Arc<FallbackSelector>,
    pub(crate) toc_url: Arc<FallbackSelector>,

    // Content
    pub(crate) content_body: Arc<FallbackSelector>,
    pub(crate) content_filter: Vec<Selector>,
    pub(crate) content_visible_only: bool,
}

#[derive(Debug, Clone)]
pub struct ContentPipelineRun {
    pub content: String,
    pub stage_reports: Vec<PipelineStageReport>,
}

pub(crate) fn stage_report(stage: &str, ok: bool) -> PipelineStageReport {
    PipelineStageReport {
        stage: stage.to_string(),
        ok,
        strategy: None,
        failure_code: None,
        warnings: Vec::new(),
        metrics: std::collections::HashMap::new(),
    }
}

impl CompiledNxs {
    pub(crate) fn compile(source: &NxsSource) -> Result<Self, EngineError> {
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
    strategy_planner_skill: StrategyPlannerSkill,
    content_judge_skill: ContentJudgeSkill,
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
            strategy_planner_skill: StrategyPlannerSkill::default(),
            content_judge_skill: ContentJudgeSkill::default(),
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

    pub(crate) fn source(&self) -> &NxsSource {
        &self.source
    }

    pub fn runtime_profile(&self) -> SourceRuntimeProfile {
        crate::skills::runtime_profile_for(&self.source.id)
    }

    pub fn circuit_state(&self) -> Option<crate::circuit_breaker::CircuitState> {
        self.anti_crawl.circuit_state(&self.source.id)
    }

    pub fn reset_circuit(&self) {
        self.anti_crawl.reset_circuit(&self.source.id);
    }

    /// Fetch content via CF bypass service
    pub(crate) async fn fetch(
        &self,
        url: &str,
        method: Option<&str>,
        body: Option<String>,
        _script: Option<String>,
    ) -> Result<String, EngineError> {
        use nexus_core::FetchContext;

        let mut ctx = FetchContext::new(url, &self.source.id);
        ctx.trace_id = Some(Uuid::new_v4().to_string());
        if let Some(m) = method {
            ctx.method = m.to_string();
        }
        ctx.body = body;
        ctx.timeout_secs = 30; // default, will be overridden by planner

        // Plan anti-crawl strategy before executing
        let source_stats = extraction_metrics::stats_for(&self.source.id);
        let (profile, planner_decision) = self
            .strategy_planner_skill
            .plan(&ctx, source_stats.as_ref());
        ctx.timeout_secs = profile.timeout_ms.max(1).div_ceil(1000).max(1);

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

        debug!(
            "strategy planner decision source={} mode={} confidence={:.2} chain={:?}",
            self.source.id,
            planner_decision.mode,
            planner_decision.confidence,
            profile.strategy_chain
        );
        skill_telemetry::record(&self.source.id, ctx.trace_id.as_deref(), planner_decision.clone());

        let mut last_error = None;
        let max_attempts = profile.retry_budget.saturating_add(1);
        let mut response = None;
        for attempt in 0..max_attempts {
            match self
                .anti_crawl
                .execute_with_strategy_order(&mut ctx, &profile.strategy_chain)
                .await
            {
                Ok(resp) => {
                    response = Some(resp);
                    break;
                },
                Err(err) => {
                    let can_retry = attempt + 1 < max_attempts && err.is_retryable();
                    if can_retry {
                        let delay_ms = 150_u64 * (attempt as u64 + 1);
                        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                    }
                    last_error = Some(err);
                },
            }
        }
        let response = match response {
            Some(resp) => resp,
            None => return Err(last_error.unwrap_or(EngineError::AllStrategiesFailed)),
        };

        if !response.is_success() {
            return Err(EngineError::Network {
                message: format!("HTTP {} for {}", response.status, url),
            });
        }

        Ok(response.body)
    }

    /// Make URL absolute
    pub(crate) fn abs_url(&self, url: &str) -> String {
        resolve_url(url, &self.source.url)
    }

    /// Search for books
    #[instrument(skip(self), fields(source = %self.source.id))]
    pub async fn search(&self, query: &str) -> Result<Vec<BookItem>, EngineError> {
        SearchOperation::new(self).execute(query).await
    }

    /// Get book information
    #[instrument(skip(self), fields(source = %self.source.id))]
    pub async fn book_info(&self, book_url: &str) -> Result<BookInfo, EngineError> {
        BookInfoOperation::new(self).execute(book_url).await
    }

    /// Get chapters list
    #[instrument(skip(self), fields(source = %self.source.id))]
    pub async fn chapters(&self, toc_url: &str) -> Result<Vec<Chapter>, EngineError> {
        ChaptersOperation::new(self).execute(toc_url).await
    }

    /// Get chapter content with replacement rules
    #[instrument(skip(self, rules), fields(source = %self.source.id))]
    pub async fn content(
        &self,
        chapter_url: &str,
        rules: &[ReplaceRule],
    ) -> Result<String, EngineError> {
        self.content_with_report(chapter_url, rules)
            .await
            .map(|run| run.content)
    }

    #[instrument(skip(self, rules), fields(source = %self.source.id))]
    pub async fn content_with_report(
        &self,
        chapter_url: &str,
        rules: &[ReplaceRule],
    ) -> Result<ContentPipelineRun, EngineError> {
        let initial_url = self.abs_url(chapter_url);
        let content_pipeline = self.content_pipeline();

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

        if let Some(mut pagination_fetch) = PaginatedContentFetch::new(&self.source)? {
            let mut current_url = initial_url;

            for idx in 0..pagination_fetch.max_pages() {
                if !pagination_fetch.mark_visited(&current_url) {
                    break;
                }

                let html = self.fetch(&current_url, None, None, None).await?;
                let page_run = content_pipeline.execute_from_html(&html, rules, idx == 0)?;
                if pagination_fetch.record_page(&current_url, idx, page_run) {
                    break;
                }

                let Some(next_url) = pagination_fetch.next_url(&html, |value| self.abs_url(value))
                else {
                    break;
                };

                if !pagination_fetch.should_follow(&next_url) {
                    break;
                }
                current_url = next_url;
                pagination_fetch.maybe_delay().await;
            }

            return pagination_fetch.finish(&content_pipeline);
        }

        let html = self.fetch(&initial_url, None, None, None).await?;
        let mut fetch_stage = stage_report("fetch", true);
        fetch_stage.strategy = Some("anti_crawl_chain".to_string());
        fetch_stage.metrics.insert("url".to_string(), initial_url);
        let mut run = content_pipeline.execute_from_html(&html, rules, true)?;
        run.stage_reports.insert(0, fetch_stage);
        Ok(run)
    }

    /// Helper to encode query based on source configuration
    pub(crate) fn get_encoded_query(&self, query: &str) -> String {
        encode_query(query, self.source.search.encoding.as_deref())
    }

    pub(crate) fn parser(&self) -> NxsParser<'_> {
        NxsParser {
            source: &self.source,
            compiled: &self.compiled,
        }
    }

    fn content_pipeline(&self) -> NxsContentPipeline<'_> {
        NxsContentPipeline {
            source: &self.source,
            compiled: &self.compiled,
            judge_skill: &self.content_judge_skill,
        }
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

#[async_trait]
impl BookEngineRuntime for NxsEngine {
    async fn content_with_report(
        &self,
        chapter_url: &str,
        rules: &[ReplaceRule],
    ) -> Result<ContentPipelineOutput, EngineError> {
        NxsEngine::content_with_report(self, chapter_url, rules)
            .await
            .map(|run| ContentPipelineOutput {
                content: run.content,
                stage_reports: run.stage_reports,
            })
    }

    fn runtime_profile(&self) -> SourceRuntimeProfile {
        NxsEngine::runtime_profile(self)
    }

    fn circuit_state_label(&self) -> String {
        self.circuit_state()
            .map(|state| format!("{state:?}").to_ascii_lowercase())
            .unwrap_or_else(|| "closed".to_string())
    }

    fn reset_runtime_state(&self) {
        self.reset_circuit();
    }
}
