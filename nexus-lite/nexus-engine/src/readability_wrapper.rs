//! Readability Integration Module
//!
//! Wrapper around readability-rust library for enhanced content extraction.
//! Provides Mozilla's Readability.js algorithm for extracting main content.

use readability_rust::{Readability, ReadabilityOptions};
use scraper::{Html, Selector};
use std::sync::Arc;

/// Enhanced content extractor using Readability algorithm
pub struct ReadabilityExtractor {
    options: ReadabilityOptions,
}

impl ReadabilityExtractor {
    pub fn new() -> Self {
        Self {
            options: ReadabilityOptions::default(),
        }
    }

    pub fn with_options(options: ReadabilityOptions) -> Self {
        Self { options }
    }

    /// Extract main content using Readability algorithm
    pub fn extract(&self, html: &str) -> Option<ExtractedContent> {
        let mut parser = Readability::new(html, Some(self.options.clone())).ok()?;
        let article = parser.parse()?;

        Some(ExtractedContent {
            title: article.title,
            content: article.content,
            text_content: article.text_content,
            length: article.length,
            excerpt: article.excerpt,
            byline: article.byline,
            dir: article.dir,
            site_name: article.site_name,
            published_time: article.published_time,
        })
    }

    /// Extract content with custom configuration
    pub fn extract_with_config(
        &self,
        html: &str,
        _min_content_length: usize,
        _min_score: f64,
    ) -> Option<ExtractedContent> {
        // Use default options - readability-rust doesn't expose these fields
        let mut parser = Readability::new(html, Some(self.options.clone())).ok()?;
        let article = parser.parse()?;

        Some(ExtractedContent {
            title: article.title,
            content: article.content,
            text_content: article.text_content,
            length: article.length,
            excerpt: article.excerpt,
            byline: article.byline,
            dir: article.dir,
            site_name: article.site_name,
            published_time: article.published_time,
        })
    }
}

impl Default for ReadabilityExtractor {
    fn default() -> Self {
        Self::new()
    }
}

/// Extracted content from Readability
#[derive(Debug, Clone)]
pub struct ExtractedContent {
    pub title: Option<String>,
    pub content: Option<String>,
    pub text_content: Option<String>,
    pub length: Option<usize>,
    pub excerpt: Option<String>,
    pub byline: Option<String>,
    pub dir: Option<String>,
    pub site_name: Option<String>,
    pub published_time: Option<String>,
}

impl ExtractedContent {
    /// Get the main text content
    pub fn get_text(&self) -> Option<String> {
        self.text_content.clone().or_else(|| {
            self.content.as_ref().map(|html| {
                // Strip HTML tags from content using scraper
                let doc = Html::parse_document(html);
                let selector = scraper::Selector::parse("*").ok();
                selector.map(|s| {
                    doc.select(&s).map(|el| el.text().collect::<String>()).collect::<Vec<_>>().join("\n")
                }).unwrap_or_default()
            })
        })
    }

    /// Check if content is valid for novel extraction
    pub fn is_valid_novel_content(&self) -> bool {
        let text = self.get_text().unwrap_or_default();
        
        // Check minimum length
        if text.chars().count() < 100 {
            return false;
        }

        // Check for Chinese characters (novel content)
        let chinese_count = text.chars().filter(|c| {
            (*c as u32) >= 0x4E00 && (*c as u32) <= 0x9FFF
        }).count();

        let chinese_ratio = chinese_count as f64 / text.chars().count() as f64;

        // Novel content should have significant Chinese characters
        chinese_ratio > 0.3
    }

    /// Clean and normalize content for novel reading
    pub fn clean_for_reading(&self) -> Option<String> {
        let text = self.get_text()?;

        // Remove excessive whitespace
        let cleaned = text
            .lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join("\n");

        if cleaned.is_empty() {
            None
        } else {
            Some(cleaned)
        }
    }
}

/// Hybrid extractor combining Readability and custom rules
pub struct HybridExtractor {
    readability: ReadabilityExtractor,
    custom_rules: Arc<dyn CustomExtractionRules + Send + Sync>,
}

impl HybridExtractor {
    pub fn new(custom_rules: Arc<dyn CustomExtractionRules + Send + Sync>) -> Self {
        Self {
            readability: ReadabilityExtractor::new(),
            custom_rules,
        }
    }

    /// Extract content using both Readability and custom rules
    pub fn extract(&self, html: &str) -> Option<ExtractedContent> {
        // Try Readability first
        if let Some(content) = self.readability.extract(html) {
            if content.is_valid_novel_content() {
                return Some(content);
            }
        }

        // Fallback to custom rules
        self.custom_rules.extract(html)
    }
}

/// Custom extraction rules trait
pub trait CustomExtractionRules {
    fn extract(&self, html: &str) -> Option<ExtractedContent>;
}

/// Default custom extraction rules for novel sites
pub struct NovelExtractionRules;

impl CustomExtractionRules for NovelExtractionRules {
    fn extract(&self, html: &str) -> Option<ExtractedContent> {
        let doc = Html::parse_document(html);

        // Try to find content container
        let content_selectors = vec![
            ".content",
            "#content",
            ".article-content",
            "#article-content",
            ".chapter-content",
            "#chapter-content",
            ".novel-content",
            "#novel-content",
            ".read-content",
            "#read-content",
            "article",
            "main",
        ];

        let mut best_content = None;
        let mut best_score = 0.0;

        for selector_str in content_selectors {
            if let Ok(selector) = Selector::parse(selector_str) {
                if let Some(el) = doc.select(&selector).next() {
                    let text = el.text().collect::<Vec<_>>().join("\n");
                    let score = self.score_content(&text);

                    if score > best_score && score > 0.5 {
                        best_score = score;
                        best_content = Some(text);
                    }
                }
            }
        }

        best_content.map(|text| ExtractedContent {
            title: None,
            content: None,
            text_content: Some(text),
            length: None,
            excerpt: None,
            byline: None,
            dir: None,
            site_name: None,
            published_time: None,
        })
    }
}

impl NovelExtractionRules {
    fn score_content(&self, text: &str) -> f64 {
        let chars = text.chars().count();
        if chars < 50 {
            return 0.0;
        }

        // Chinese character ratio
        let chinese_count = text.chars().filter(|c| {
            (*c as u32) >= 0x4E00 && (*c as u32) <= 0x9FFF
        }).count();
        let chinese_ratio = chinese_count as f64 / chars as f64;

        // Punctuation ratio
        let punct_count = text.chars().filter(|c| {
            matches!(
                *c,
                '。' | '！' | '？' | '；' | '，' | '、' | '!' | '?' | ';' | ',' | '.' | ':'
            )
        }).count();
        let punct_ratio = punct_count as f64 / chars as f64;

        // Paragraph count
        let para_count = text.split('\n').filter(|p| !p.trim().is_empty()).count();
        let para_score = (para_count as f64).min(10.0) / 10.0;

        // Calculate overall score
        chinese_ratio * 0.5 + punct_ratio * 0.3 + para_score * 0.2
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_readability_extractor() {
        let extractor = ReadabilityExtractor::new();
        let html = r#"
            <html>
                <head><title>Test Article</title></head>
                <body>
                    <article>
                        <h1>Chapter 1</h1>
                        <p>This is the main content of the article with some text.</p>
                        <p>More content here for testing purposes.</p>
                    </article>
                </body>
            </html>
        "#;

        let result = extractor.extract(html);
        assert!(result.is_some());
    }

    #[test]
    fn test_extracted_content() {
        let extractor = ReadabilityExtractor::new();
        let html = r#"
            <html>
                <body>
                    <article>
                        <h1>第一章</h1>
                        <p>这是一段测试文本，包含中文内容。</p>
                        <p>更多内容用于测试。</p>
                    </article>
                </body>
            </html>
        "#;

        let result = extractor.extract(html);
        assert!(result.is_some());

        if let Some(content) = result {
            assert!(content.is_valid_novel_content());
            let cleaned = content.clean_for_reading();
            assert!(cleaned.is_some());
        }
    }

    #[test]
    fn test_novel_extraction_rules() {
        let rules = NovelExtractionRules;
        let html = r#"
            <html>
                <body>
                    <div class="content">
                        <h1>第一章</h1>
                        <p>这是一段测试文本，包含中文内容。</p>
                        <p>更多内容用于测试。</p>
                    </div>
                </body>
            </html>
        "#;

        let result = rules.extract(html);
        assert!(result.is_some());
    }
}
