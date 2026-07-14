//! Content Extraction Adapters
//!
//! Implements ContentExtractorPort for different extraction strategies:
//! - ReadabilityAdapter: Uses Mozilla's Readability algorithm
//! - LegadoAdapter: Uses Legado's native CSS/JSONPath/XPath/Regex selectors

use crate::content_extract::{extract_structured_text_from_root, ContentExtractConfig};
use crate::legado::engine::LegadoEngine;
use crate::legado::selector::css::extract_css;
use crate::legado::selector::js::execute_js;
use crate::legado::selector::json::extract_json_path;
use crate::legado::selector::regex::extract_regex;
use crate::readability_wrapper::{ExtractedContent as ReadabilityContent, ReadabilityExtractor};
use async_trait::async_trait;
use nexus_core::ports::{
    ContentExtractorPort, ExtractionMetadata, ExtractionResult, ExtractorConfig, ExtractorError,
    ExtractorMode, PipelineStageReport,
};
use scraper::{Html, Selector};
use std::sync::Arc;
use std::time::Instant;

/// Adapter using Mozilla's Readability algorithm for content extraction
pub struct ReadabilityAdapter {
    extractor: ReadabilityExtractor,
    name: String,
}

impl ReadabilityAdapter {
    pub fn new() -> Self {
        Self {
            extractor: ReadabilityExtractor::new(),
            name: "readability".to_string(),
        }
    }
}

impl Default for ReadabilityAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ContentExtractorPort for ReadabilityAdapter {
    async fn extract(
        &self,
        html: &str,
        _url: &str,
        config: ExtractorConfig,
    ) -> Result<ExtractionResult, ExtractorError> {
        let start = Instant::now();
        let mut reports = Vec::new();

        // Stage 1: Readability extraction
        let stage_start = Instant::now();
        let readability_content = self.extractor.extract(html).ok_or_else(|| {
            ExtractorError::ExtractionFailed("Readability extraction failed".to_string())
        })?;

        reports.push(PipelineStageReport {
            stage: "readability_extraction".to_string(),
            ok: true,
            strategy: Some("readability".to_string()),
            failure_code: None,
            warnings: Vec::new(),
            metrics: [("duration_ms".to_string(), stage_start.elapsed().as_millis().to_string())]
                .into_iter()
                .collect(),
        });

        // Stage 2: Content validation and cleaning
        let stage_start = Instant::now();
        let text = readability_content.get_text().ok_or_else(|| {
            ExtractorError::QualityGateFailed("No text content extracted".to_string())
        })?;

        let cleaned = readability_content.clean_for_reading().ok_or_else(|| {
            ExtractorError::QualityGateFailed("Content cleaning failed".to_string())
        })?;

        if !readability_content.is_valid_novel_content() {
            reports.push(PipelineStageReport {
                stage: "validation".to_string(),
                ok: false,
                strategy: Some("readability".to_string()),
                failure_code: Some("content_too_short".to_string()),
                warnings: vec!["Content failed quality check".to_string()],
                metrics: [(
                    "duration_ms".to_string(),
                    stage_start.elapsed().as_millis().to_string(),
                )]
                .into_iter()
                .collect(),
            });
            return Err(ExtractorError::QualityGateFailed(
                "Content failed quality check".to_string(),
            ));
        }

        reports.push(PipelineStageReport {
            stage: "validation".to_string(),
            ok: true,
            strategy: Some("readability".to_string()),
            failure_code: None,
            warnings: Vec::new(),
            metrics: [("duration_ms".to_string(), stage_start.elapsed().as_millis().to_string())]
                .into_iter()
                .collect(),
        });

        // Calculate metadata
        let word_count = cleaned.split_whitespace().count();
        let paragraph_count = cleaned
            .split("\n\n")
            .filter(|p| !p.trim().is_empty())
            .count();

        Ok(ExtractionResult {
            content: cleaned,
            quality_score: 0.85, // Readability generally produces good quality
            metadata: ExtractionMetadata {
                word_count,
                paragraph_count,
                noise_ratio: 0.1,
                duplicate_ratio: 0.05,
                language: Some("zh".to_string()),
                extracted_at: chrono::Utc::now().timestamp_millis(),
            },
            stage_reports: reports,
        })
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn supported_modes(&self) -> Vec<ExtractorMode> {
        vec![ExtractorMode::Readability]
    }
}

/// Adapter using Legado's native selector engine (CSS, XPath, JSONPath, Regex, JS)
pub struct LegadoAdapter {
    engine: Arc<LegadoEngine>,
    name: String,
}

impl LegadoAdapter {
    pub fn new(engine: Arc<LegadoEngine>) -> Self {
        Self {
            engine,
            name: "legado".to_string(),
        }
    }
}

#[async_trait]
impl ContentExtractorPort for LegadoAdapter {
    async fn extract(
        &self,
        html: &str,
        _url: &str,
        config: ExtractorConfig,
    ) -> Result<ExtractionResult, ExtractorError> {
        let start = Instant::now();
        let mut reports = Vec::new();
        let mut final_content = String::new();

        // Determine extraction mode from config
        let mode = config.mode;

        match mode {
            ExtractorMode::LegadoCss => {
                let selector = config.selector.as_deref().ok_or_else(|| {
                    ExtractorError::InvalidSelector("CSS selector required".to_string())
                })?;

                let stage_start = Instant::now();
                let doc = Html::parse_document(html);
                let selector = Selector::parse(selector)
                    .map_err(|e| ExtractorError::InvalidSelector(e.to_string()))?;

                let elements: Vec<_> = doc.select(&selector).collect();
                if elements.is_empty() {
                    return Err(ExtractorError::ExtractionFailed(
                        "CSS selector matched no elements".to_string(),
                    ));
                }

                for el in &elements {
                    final_content.push_str(&el.text().collect::<Vec<_>>().join("\n"));
                    final_content.push_str("\n\n");
                }

                reports.push(PipelineStageReport {
                    stage: "css_selection".to_string(),
                    ok: true,
                    strategy: Some("css".to_string()),
                    failure_code: None,
                    warnings: Vec::new(),
                    metrics: [
                        ("duration_ms".to_string(), stage_start.elapsed().as_millis().to_string()),
                        ("elements_found".to_string(), elements.len().to_string()),
                    ]
                    .into_iter()
                    .collect(),
                });
            },
            ExtractorMode::LegadoXpath => {
                // XPath not implemented in selector module; fall back to CSS
                let selector = config.selector.as_deref().ok_or_else(|| {
                    ExtractorError::InvalidSelector("XPath selector required".to_string())
                })?;

                let stage_start = Instant::now();
                let doc = Html::parse_document(html);
                let content = extract_css(&doc, selector).ok_or_else(|| {
                    ExtractorError::ExtractionFailed("CSS selector matched no elements".to_string())
                })?;

                final_content = content;

                reports.push(PipelineStageReport {
                    stage: "css_fallback_for_xpath".to_string(),
                    ok: true,
                    strategy: Some("css_fallback".to_string()),
                    failure_code: None,
                    warnings: vec!["XPath not implemented, using CSS fallback".to_string()],
                    metrics: [(
                        "duration_ms".to_string(),
                        stage_start.elapsed().as_millis().to_string(),
                    )]
                    .into_iter()
                    .collect(),
                });
            },
            ExtractorMode::LegadoJsonPath => {
                let selector = config.selector.as_deref().ok_or_else(|| {
                    ExtractorError::InvalidSelector("JSONPath selector required".to_string())
                })?;

                let stage_start = Instant::now();
                let json_value: serde_json::Value = serde_json::from_str(html).map_err(|e| {
                    ExtractorError::ExtractionFailed(format!("Invalid JSON: {}", e))
                })?;
                let content = extract_json_path(&json_value, selector).ok_or_else(|| {
                    ExtractorError::ExtractionFailed("JSONPath matched no value".to_string())
                })?;

                final_content = content;

                reports.push(PipelineStageReport {
                    stage: "jsonpath_selection".to_string(),
                    ok: true,
                    strategy: Some("jsonpath".to_string()),
                    failure_code: None,
                    warnings: Vec::new(),
                    metrics: [(
                        "duration_ms".to_string(),
                        stage_start.elapsed().as_millis().to_string(),
                    )]
                    .into_iter()
                    .collect(),
                });
            },
            ExtractorMode::LegadoRegex => {
                let pattern = config.selector.as_deref().ok_or_else(|| {
                    ExtractorError::InvalidSelector("Regex pattern required".to_string())
                })?;

                let stage_start = Instant::now();
                let content = extract_regex(html, pattern).ok_or_else(|| {
                    ExtractorError::ExtractionFailed("Regex matched no content".to_string())
                })?;

                final_content = content;

                reports.push(PipelineStageReport {
                    stage: "regex_extraction".to_string(),
                    ok: true,
                    strategy: Some("regex".to_string()),
                    failure_code: None,
                    warnings: Vec::new(),
                    metrics: [(
                        "duration_ms".to_string(),
                        stage_start.elapsed().as_millis().to_string(),
                    )]
                    .into_iter()
                    .collect(),
                });
            },
            ExtractorMode::LegadoJs => {
                let stage_start = Instant::now();

                let js_code = config.selector.as_deref().ok_or_else(|| {
                    ExtractorError::InvalidSelector("JS code required".to_string())
                })?;

                let content = execute_js(html, js_code, "").ok_or_else(|| {
                    ExtractorError::ExtractionFailed("JS execution returned no content".to_string())
                })?;

                final_content = content;

                reports.push(PipelineStageReport {
                    stage: "js_execution".to_string(),
                    ok: true,
                    strategy: Some("js".to_string()),
                    failure_code: None,
                    warnings: Vec::new(),
                    metrics: [(
                        "duration_ms".to_string(),
                        stage_start.elapsed().as_millis().to_string(),
                    )]
                    .into_iter()
                    .collect(),
                });
            },
            _ => {
                return Err(ExtractorError::UnsupportedMode(format!("{:?}", mode)));
            },
        }

        // Post-process content
        if final_content.trim().is_empty() {
            return Err(ExtractorError::QualityGateFailed("Empty content extracted".to_string()));
        }

        // Clean content
        let cleaned = clean_content(&final_content);

        // Calculate quality metrics
        let word_count = cleaned.split_whitespace().count();
        let paragraph_count = cleaned
            .split("\n\n")
            .filter(|p| !p.trim().is_empty())
            .count();

        // Add final processing report
        reports.push(PipelineStageReport {
            stage: "post_processing".to_string(),
            ok: true,
            strategy: Some(format!("{:?}", mode)),
            failure_code: None,
            warnings: Vec::new(),
            metrics: [
                ("duration_ms".to_string(), start.elapsed().as_millis().to_string()),
                ("output_length".to_string(), cleaned.len().to_string()),
            ]
            .into_iter()
            .collect(),
        });

        Ok(ExtractionResult {
            content: cleaned,
            quality_score: 0.75, // Legado extraction quality varies
            metadata: ExtractionMetadata {
                word_count,
                paragraph_count,
                noise_ratio: 0.15,
                duplicate_ratio: 0.1,
                language: Some("zh".to_string()),
                extracted_at: chrono::Utc::now().timestamp_millis(),
            },
            stage_reports: reports,
        })
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn supported_modes(&self) -> Vec<ExtractorMode> {
        vec![
            ExtractorMode::LegadoCss,
            ExtractorMode::LegadoXpath,
            ExtractorMode::LegadoJsonPath,
            ExtractorMode::LegadoRegex,
            ExtractorMode::LegadoJs,
        ]
    }
}

/// Composite adapter that tries multiple extraction strategies
pub struct CompositeExtractor {
    readability: ReadabilityAdapter,
    legado: LegadoAdapter,
    name: String,
}

impl CompositeExtractor {
    pub fn new(legado_engine: Arc<LegadoEngine>) -> Self {
        Self {
            readability: ReadabilityAdapter::new(),
            legado: LegadoAdapter::new(legado_engine),
            name: "composite".to_string(),
        }
    }
}

#[async_trait]
impl ContentExtractorPort for CompositeExtractor {
    async fn extract(
        &self,
        html: &str,
        url: &str,
        config: ExtractorConfig,
    ) -> Result<ExtractionResult, ExtractorError> {
        // Try primary mode first
        match config.mode {
            ExtractorMode::Readability => self.readability.extract(html, url, config).await,
            mode if self.legado.supported_modes().contains(&mode) => {
                self.legado.extract(html, url, config).await
            },
            _ => {
                // Fallback: try readability first, then legado
                match self.readability.extract(html, url, config.clone()).await {
                    Ok(result) => Ok(result),
                    Err(_) => {
                        let legado_config = ExtractorConfig {
                            mode: ExtractorMode::LegadoCss,
                            selector: config.selector,
                            rules: config.rules,
                            options: config.options,
                        };
                        self.legado.extract(html, url, legado_config).await
                    },
                }
            },
        }
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn supported_modes(&self) -> Vec<ExtractorMode> {
        let mut modes = vec![ExtractorMode::Readability];
        modes.extend(self.legado.supported_modes());
        modes
    }
}

/// Helper function to clean extracted content
fn clean_content(text: &str) -> String {
    text.lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string()
}
