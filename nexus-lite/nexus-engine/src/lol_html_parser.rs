//! lol-html Streaming Parser Integration
//!
//! High-performance streaming HTML parser for large documents.
//! Reduces memory usage by processing HTML incrementally.

use lol_html::{element, HtmlRewriter, Settings};
use std::io::Write;

/// Streaming HTML parser for content extraction
pub struct StreamingContentExtractor {
    content_selectors: Vec<String>,
}

impl StreamingContentExtractor {
    pub fn new(content_selectors: Vec<String>) -> Self {
        Self { content_selectors }
    }

    /// Parse HTML stream and extract content
    pub fn parse_stream(&self, html: &str) -> Result<String, String> {
        let mut output = Vec::new();

        let selectors = self.content_selectors.clone();
        let mut rewriter = HtmlRewriter::new(
            Settings {
                element_content_handlers: vec![
                    // Handle content elements
                    element!("*", move |el| {
                        let tag_name = el.tag_name();
                        let class = el.get_attribute("class").unwrap_or_default();
                        let id = el.get_attribute("id").unwrap_or_default();

                        if Self::is_content_element_static(&tag_name, &class, &id, &selectors) {
                            let _ = el.set_tag_name(&format!("__nxs_content__{}", tag_name));
                        }
                        Ok(())
                    }),
                ],
                ..Settings::default()
            },
            |c: &[u8]| {
                let _ = output.write(c);
            },
        );

        rewriter.write(html.as_bytes()).map_err(|e| e.to_string())?;
        rewriter.end().map_err(|e| e.to_string())?;

        String::from_utf8(output).map_err(|e| e.to_string())
    }

    /// Check if element is a content element
    fn is_content_element_static(
        tag_name: &str,
        class: &str,
        id: &str,
        selectors: &[String],
    ) -> bool {
        // Check against configured selectors
        for selector in selectors {
            if selector.starts_with('.') {
                // Class selector
                if class.contains(&selector[1..]) {
                    return true;
                }
            } else if selector.starts_with('#') {
                // ID selector
                if id == &selector[1..] {
                    return true;
                }
            } else {
                // Tag selector
                if tag_name == selector {
                    return true;
                }
            }
        }

        // Default content tags
        matches!(tag_name, "article" | "main" | "section" | "content" | "chapter")
    }

    /// Extract content with custom selectors
    pub fn extract_with_selectors(&self, html: &str, selectors: &[&str]) -> Result<String, String> {
        let extractor = Self::new(selectors.iter().map(|s| s.to_string()).collect());
        extractor.parse_stream(html)
    }
}

/// Optimized streaming parser for large HTML documents
pub struct OptimizedStreamingParser {
    chunk_size: usize,
    buffer: String,
    selectors: Vec<String>,
}

impl OptimizedStreamingParser {
    pub fn new(chunk_size: usize, selectors: Vec<String>) -> Self {
        Self {
            chunk_size,
            buffer: String::new(),
            selectors,
        }
    }

    /// Feed data to the parser
    pub fn feed(&mut self, data: &str) {
        self.buffer.push_str(data);
    }

    /// Process available chunks
    pub fn process_chunks(&mut self) -> Vec<String> {
        let mut results = Vec::new();

        while self.buffer.len() > self.chunk_size {
            let chunk = &self.buffer[..self.chunk_size];
            if let Ok(content) = self.extract_content(chunk) {
                results.push(content);
            }
            self.buffer = self.buffer[self.chunk_size..].to_string();
        }

        results
    }

    /// Get remaining buffer
    pub fn remaining(&mut self) -> Option<String> {
        if !self.buffer.is_empty() {
            let content = self.extract_content(&self.buffer).ok()?;
            self.buffer.clear();
            Some(content)
        } else {
            None
        }
    }

    /// Extract content from HTML
    fn extract_content(&self, html: &str) -> Result<String, String> {
        let extractor = StreamingContentExtractor::new(self.selectors.clone());
        extractor.parse_stream(html)
    }

    /// Clear buffer
    pub fn clear(&mut self) {
        self.buffer.clear();
    }
}

/// Memory-efficient HTML parser for very large documents
pub struct MemoryEfficientParser {
    max_memory_mb: usize,
    current_memory_mb: usize,
}

impl MemoryEfficientParser {
    pub fn new(max_memory_mb: usize) -> Self {
        Self {
            max_memory_mb,
            current_memory_mb: 0,
        }
    }

    /// Check if we can process more data
    pub fn can_process(&self, additional_size: usize) -> bool {
        let additional_mb = additional_size / (1024 * 1024);
        (self.current_memory_mb + additional_mb) <= self.max_memory_mb
    }

    /// Process HTML with memory constraints
    pub fn process_with_limit(&mut self, html: &str, selectors: &[&str]) -> Result<String, String> {
        if !self.can_process(html.len()) {
            return Err("Memory limit exceeded".to_string());
        }

        self.current_memory_mb += html.len() / (1024 * 1024);

        let extractor =
            StreamingContentExtractor::new(selectors.iter().map(|s| s.to_string()).collect());

        let result = extractor.parse_stream(html)?;

        // Release memory after processing
        self.current_memory_mb = 0;

        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_streaming_content_extractor() {
        let extractor = StreamingContentExtractor::new(vec![
            ".content".to_string(),
            "#content".to_string(),
            "article".to_string(),
        ]);

        let html = r#"
            <html>
                <body>
                    <div class="content">
                        <h1>Chapter 1</h1>
                        <p>This is the main content.</p>
                    </div>
                </body>
            </html>
        "#;

        let result = extractor.parse_stream(html);
        assert!(result.is_ok());
    }

    #[test]
    fn test_optimized_streaming_parser() {
        let mut parser = OptimizedStreamingParser::new(100, vec![".content".to_string()]);

        parser.feed("<div class=\"content\"><p>Test</p></div>");
        let results = parser.process_chunks();

        assert!(!results.is_empty());
    }

    #[test]
    fn test_memory_efficient_parser() {
        let mut parser = MemoryEfficientParser::new(10); // 10MB limit

        let html = "<div class=\"content\"><p>Test content</p></div>".repeat(1000);

        let result = parser.process_with_limit(&html, &[".content"]);
        assert!(result.is_ok());
    }
}
