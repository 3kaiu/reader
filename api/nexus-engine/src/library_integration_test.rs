//! Library Integration Test Module
//!
//! Comprehensive testing and validation of integrated open-source libraries.
//! Tests readability-rust, lol-html, kuchiki integration.

use crate::kuchiki_wrapper::KuchikiContentExtractor;
use crate::lol_html_parser::{OptimizedStreamingParser, StreamingContentExtractor};
use crate::readability_wrapper::{HybridExtractor, NovelExtractionRules, ReadabilityExtractor};

/// Test results for library integration
#[derive(Debug, Clone)]
pub struct IntegrationTestResult {
    pub library_name: String,
    pub test_name: String,
    pub passed: bool,
    pub duration_ms: u64,
    pub details: String,
}

/// Comprehensive integration tester
pub struct LibraryIntegrationTester {
    results: Vec<IntegrationTestResult>,
}

impl LibraryIntegrationTester {
    pub fn new() -> Self {
        Self {
            results: Vec::new(),
        }
    }

    /// Run all integration tests
    pub fn run_all_tests(&mut self) -> Vec<IntegrationTestResult> {
        self.test_readability_rust();
        self.test_lol_html();
        self.test_kuchiki();
        self.test_hybrid_extractor();
        self.test_streaming_parser();
        self.results.clone()
    }

    /// Test readability-rust integration
    fn test_readability_rust(&mut self) {
        let start = std::time::Instant::now();

        let html = r#"
            <html>
                <head><title>第一章 开始</title></head>
                <body>
                    <article>
                        <h1>第一章 开始</h1>
                        <p>这是一个测试章节，包含中文小说内容。</p>
                        <p>这是第二段内容，用于测试提取效果。</p>
                        <p>第三段内容，确保有足够的文本长度。</p>
                    </article>
                </body>
            </html>
        "#;

        let extractor = ReadabilityExtractor::new();
        let result = extractor.extract(html);

        let duration = start.elapsed().as_millis() as u64;

        let test_result = IntegrationTestResult {
            library_name: "readability-rust".to_string(),
            test_name: "Basic content extraction".to_string(),
            passed: result.is_some(),
            duration_ms: duration,
            details: if let Some(content) = &result {
                format!(
                    "Title: {:?}, Content length: {:?}, Valid novel: {}",
                    content.title,
                    content.length,
                    content.is_valid_novel_content()
                )
            } else {
                "Failed to extract content".to_string()
            },
        };

        self.results.push(test_result);
    }

    /// Test lol-html streaming parser
    fn test_lol_html(&mut self) {
        let start = std::time::Instant::now();

        let html = r#"
            <html>
                <body>
                    <div class="content">
                        <h1>测试章节</h1>
                        <p>这是测试内容。</p>
                    </div>
                </body>
            </html>
        "#;

        let extractor = StreamingContentExtractor::new(vec![".content".to_string()]);

        let result = extractor.parse_stream(html);

        let duration = start.elapsed().as_millis() as u64;

        let test_result = IntegrationTestResult {
            library_name: "lol-html".to_string(),
            test_name: "Streaming content extraction".to_string(),
            passed: result.is_ok(),
            duration_ms: duration,
            details: if let Ok(content) = result {
                format!("Extracted {} characters", content.len())
            } else {
                "Failed to parse".to_string()
            },
        };

        self.results.push(test_result);
    }

    /// Test kuchiki tree operations
    fn test_kuchiki(&mut self) {
        let start = std::time::Instant::now();

        let html = r#"
            <html>
                <body>
                    <nav>导航菜单</nav>
                    <div class="content">
                        <h1>章节标题</h1>
                        <p>主要内容</p>
                    </div>
                    <footer>页脚</footer>
                </body>
            </html>
        "#;

        let mut extractor = KuchikiContentExtractor::new(html).unwrap();
        let content = extractor.extract_clean();

        let duration = start.elapsed().as_millis() as u64;

        let test_result = IntegrationTestResult {
            library_name: "kuchiki".to_string(),
            test_name: "Tree-based content extraction".to_string(),
            passed: content.is_some(),
            duration_ms: duration,
            details: if let Some(text) = content {
                format!("Extracted {} characters", text.len())
            } else {
                "Failed to extract".to_string()
            },
        };

        self.results.push(test_result);
    }

    /// Test hybrid extractor
    fn test_hybrid_extractor(&mut self) {
        let start = std::time::Instant::now();

        let html = r#"
            <html>
                <body>
                    <div class="content">
                        <h1>第一章</h1>
                        <p>这是混合提取器的测试内容。</p>
                    </div>
                </body>
            </html>
        "#;

        let custom_rules = std::sync::Arc::new(NovelExtractionRules);
        let extractor = HybridExtractor::new(custom_rules);
        let result = extractor.extract(html);

        let duration = start.elapsed().as_millis() as u64;

        let test_result = IntegrationTestResult {
            library_name: "Hybrid Extractor".to_string(),
            test_name: "Readability + Custom rules".to_string(),
            passed: result.is_some(),
            duration_ms: duration,
            details: if let Some(content) = &result {
                format!("Extracted content, valid: {}", content.is_valid_novel_content())
            } else {
                "Failed to extract".to_string()
            },
        };

        self.results.push(test_result);
    }

    /// Test streaming parser with large content
    fn test_streaming_parser(&mut self) {
        let start = std::time::Instant::now();

        let large_html = "<div class=\"content\"><p>".repeat(1000) + "测试内容</p></div>";

        let mut parser = OptimizedStreamingParser::new(500, vec![".content".to_string()]);

        parser.feed(&large_html);
        let results = parser.process_chunks();

        let duration = start.elapsed().as_millis() as u64;

        let test_result = IntegrationTestResult {
            library_name: "OptimizedStreamingParser".to_string(),
            test_name: "Large document streaming".to_string(),
            passed: !results.is_empty(),
            duration_ms: duration,
            details: format!("Processed {} chunks", results.len()),
        };

        self.results.push(test_result);
    }

    /// Get test summary
    pub fn get_summary(&self) -> IntegrationTestSummary {
        let total = self.results.len();
        let passed = self.results.iter().filter(|r| r.passed).count();
        let failed = total - passed;
        let total_duration: u64 = self.results.iter().map(|r| r.duration_ms).sum();

        IntegrationTestSummary {
            total_tests: total,
            passed,
            failed,
            total_duration_ms: total_duration,
            success_rate: if total > 0 {
                passed as f64 / total as f64
            } else {
                0.0
            },
        }
    }

    /// Get detailed results
    pub fn get_results(&self) -> &[IntegrationTestResult] {
        &self.results
    }
}

impl Default for LibraryIntegrationTester {
    fn default() -> Self {
        Self::new()
    }
}

/// Integration test summary
#[derive(Debug, Clone)]
pub struct IntegrationTestSummary {
    pub total_tests: usize,
    pub passed: usize,
    pub failed: usize,
    pub total_duration_ms: u64,
    pub success_rate: f64,
}

/// Performance comparison between libraries
pub struct PerformanceComparison {
    pub readability_duration: u64,
    pub lol_html_duration: u64,
    pub kuchiki_duration: u64,
    pub hybrid_duration: u64,
}

impl PerformanceComparison {
    pub fn new(readability: u64, lol_html: u64, kuchiki: u64, hybrid: u64) -> Self {
        Self {
            readability_duration: readability,
            lol_html_duration: lol_html,
            kuchiki_duration: kuchiki,
            hybrid_duration: hybrid,
        }
    }

    pub fn get_fastest(&self) -> &str {
        let durations = [
            ("readability-rust", self.readability_duration),
            ("lol-html", self.lol_html_duration),
            ("kuchiki", self.kuchiki_duration),
            ("hybrid", self.hybrid_duration),
        ];

        durations
            .iter()
            .min_by_key(|(_, d)| *d)
            .map(|(name, _)| *name)
            .unwrap_or("unknown")
    }

    pub fn get_slowest(&self) -> &str {
        let durations = [
            ("readability-rust", self.readability_duration),
            ("lol-html", self.lol_html_duration),
            ("kuchiki", self.kuchiki_duration),
            ("hybrid", self.hybrid_duration),
        ];

        durations
            .iter()
            .max_by_key(|(_, d)| *d)
            .map(|(name, _)| *name)
            .unwrap_or("unknown")
    }
}

/// Content quality comparison
pub struct ContentQualityComparison {
    pub readability_quality: f64,
    pub lol_html_quality: f64,
    pub kuchiki_quality: f64,
    pub hybrid_quality: f64,
}

impl ContentQualityComparison {
    pub fn new(readability: f64, lol_html: f64, kuchiki: f64, hybrid: f64) -> Self {
        Self {
            readability_quality: readability,
            lol_html_quality: lol_html,
            kuchiki_quality: kuchiki,
            hybrid_quality: hybrid,
        }
    }

    pub fn get_best_quality(&self) -> &str {
        let qualities = [
            ("readability-rust", self.readability_quality),
            ("lol-html", self.lol_html_quality),
            ("kuchiki", self.kuchiki_quality),
            ("hybrid", self.hybrid_quality),
        ];

        qualities
            .iter()
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(name, _)| *name)
            .unwrap_or("unknown")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_integration_tester() {
        let mut tester = LibraryIntegrationTester::new();
        let results = tester.run_all_tests();

        assert!(!results.is_empty());

        let summary = tester.get_summary();
        assert_eq!(summary.total_tests, 5);
        assert!(summary.success_rate > 0.0);
    }

    #[test]
    fn test_performance_comparison() {
        let comparison = PerformanceComparison::new(10, 5, 15, 12);
        assert_eq!(comparison.get_fastest(), "lol-html");
        assert_eq!(comparison.get_slowest(), "kuchiki");
    }

    #[test]
    fn test_content_quality_comparison() {
        let comparison = ContentQualityComparison::new(0.9, 0.7, 0.8, 0.95);
        assert_eq!(comparison.get_best_quality(), "hybrid");
    }
}
