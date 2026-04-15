use nexus_core::types::PipelineStageReport;
use nexus_core::{EngineError, NxsSource};
use scraper::{Html, Selector};
use std::collections::HashSet;

use crate::content_pipeline::NxsContentPipeline;
use crate::nxs_engine::{stage_report, ContentPipelineRun};

pub(crate) struct PaginatedContentFetch<'a> {
    validation: nexus_core::nxs::ContentValidationConfig,
    pagination: nexus_core::nxs::PaginationConfig,
    next_selector: Selector,
    visited: HashSet<String>,
    merged: Vec<String>,
    stage_reports: Vec<PipelineStageReport>,
    _marker: std::marker::PhantomData<&'a NxsSource>,
}

impl<'a> PaginatedContentFetch<'a> {
    pub(crate) fn new(source: &'a NxsSource) -> Result<Option<Self>, EngineError> {
        let Some(pagination) = source.content.pagination.clone() else {
            return Ok(None);
        };
        let next_selector = Selector::parse(&pagination.next_selector).map_err(|_| {
            EngineError::InvalidSelector {
                selector: pagination.next_selector.clone(),
            }
        })?;

        Ok(Some(Self {
            validation: source.content.validation.clone().unwrap_or_default(),
            pagination,
            next_selector,
            visited: HashSet::new(),
            merged: Vec::new(),
            stage_reports: Vec::new(),
            _marker: std::marker::PhantomData,
        }))
    }

    pub(crate) fn max_pages(&self) -> usize {
        self.pagination.max_pages.max(1)
    }

    pub(crate) fn mark_visited(&mut self, url: &str) -> bool {
        self.visited.insert(url.to_string())
    }

    pub(crate) fn record_page(
        &mut self,
        url: &str,
        page_index: usize,
        mut page_run: ContentPipelineRun,
    ) -> bool {
        let mut fetch_stage = stage_report("fetch", true);
        fetch_stage.strategy = Some("anti_crawl_chain".to_string());
        fetch_stage
            .metrics
            .insert("pageIndex".to_string(), page_index.to_string());
        fetch_stage
            .metrics
            .insert("url".to_string(), url.to_string());
        page_run.stage_reports.insert(0, fetch_stage);

        let extracted = page_run.content.clone();
        let should_stop = self
            .pagination
            .stop_text
            .as_ref()
            .is_some_and(|stop_text| extracted.contains(stop_text));

        self.merged.push(extracted);
        self.stage_reports.extend(page_run.stage_reports);
        should_stop
    }

    pub(crate) fn next_url<F>(&self, html: &str, abs_url: F) -> Option<String>
    where
        F: Fn(&str) -> String,
    {
        let doc = Html::parse_document(html);
        doc.select(&self.next_selector)
            .next()
            .and_then(|el| el.value().attr("href"))
            .map(abs_url)
    }

    pub(crate) fn should_follow(&self, next_url: &str) -> bool {
        !self.visited.contains(next_url)
    }

    pub(crate) async fn maybe_delay(&self) {
        if self.pagination.delay_ms > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(self.pagination.delay_ms)).await;
        }
    }

    pub(crate) fn finish(
        mut self,
        pipeline: &NxsContentPipeline<'_>,
    ) -> Result<ContentPipelineRun, EngineError> {
        let combined = self.merged.join(&self.pagination.separator);
        let mut validation_stage = stage_report("validation", true);
        validation_stage
            .metrics
            .insert("chars".to_string(), combined.chars().count().to_string());
        validation_stage.metrics.insert(
            "paragraphs".to_string(),
            NxsContentPipeline::content_stats(&combined).1.to_string(),
        );

        if pipeline.looks_like_content(&combined, &self.validation) {
            self.stage_reports.push(validation_stage);
            Ok(ContentPipelineRun {
                content: combined,
                stage_reports: self.stage_reports,
            })
        } else {
            Err(EngineError::RuleMismatch {
                rule: "content.pagination".to_string(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture_path(rel: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
    }

    fn load_source(rel: &str) -> NxsSource {
        let raw = std::fs::read_to_string(fixture_path(rel)).expect("read source fixture");
        serde_json::from_str(&raw).expect("parse source fixture")
    }

    #[test]
    fn paginated_fetch_tracks_visits_and_next_links() {
        let mut source = load_source("../sources/hetushu.nxs");
        source.content.pagination = Some(nexus_core::nxs::PaginationConfig {
            next_selector: "a.next".to_string(),
            max_pages: 3,
            delay_ms: 0,
            separator: "\n\n".to_string(),
            stop_text: Some("END".to_string()),
        });

        let mut fetch = PaginatedContentFetch::new(&source)
            .expect("pagination parse")
            .expect("pagination enabled");

        assert_eq!(fetch.max_pages(), 3);
        assert!(fetch.mark_visited("https://example.com/1"));
        assert!(!fetch.mark_visited("https://example.com/1"));

        let next = fetch.next_url(
            r#"<html><body><a class="next" href="/chapter-2.html">next</a></body></html>"#,
            |value| format!("https://example.com{value}"),
        );

        assert_eq!(next.as_deref(), Some("https://example.com/chapter-2.html"));
        assert!(fetch.should_follow("https://example.com/chapter-2.html"));
        assert!(!fetch.should_follow("https://example.com/1"));
    }

    #[test]
    fn paginated_fetch_stops_when_stop_text_appears() {
        let mut source = load_source("../sources/hetushu.nxs");
        source.content.pagination = Some(nexus_core::nxs::PaginationConfig {
            next_selector: "a.next".to_string(),
            max_pages: 2,
            delay_ms: 0,
            separator: "\n\n".to_string(),
            stop_text: Some("END".to_string()),
        });

        let mut fetch = PaginatedContentFetch::new(&source)
            .expect("pagination parse")
            .expect("pagination enabled");
        let page_run = ContentPipelineRun {
            content: "content END".to_string(),
            stage_reports: Vec::new(),
        };

        let should_stop = fetch.record_page("https://example.com/1", 0, page_run);

        assert!(should_stop);
    }
}
