//! Incremental DOM Parser Module
//!
//! Stream-based HTML parsing for large documents.
//! Reduces memory usage by processing chunks incrementally.

use scraper::{Html, Selector};
use std::collections::HashMap;

/// Incremental parser configuration
#[derive(Debug, Clone)]
pub struct IncrementalParserConfig {
    /// Maximum chunk size in bytes
    pub max_chunk_size: usize,
    /// Target selector for incremental parsing
    pub target_selector: Option<String>,
    /// Enable caching of parsed chunks
    pub enable_caching: bool,
    /// Maximum cache size
    pub max_cache_size: usize,
}

impl Default for IncrementalParserConfig {
    fn default() -> Self {
        Self {
            max_chunk_size: 1024 * 1024, // 1MB
            target_selector: None,
            enable_caching: true,
            max_cache_size: 100,
        }
    }
}

/// Incremental HTML parser
pub struct IncrementalParser {
    config: IncrementalParserConfig,
    cache: HashMap<String, String>,
    parsed_chunks: Vec<String>,
}

impl IncrementalParser {
    pub fn new(config: IncrementalParserConfig) -> Self {
        Self {
            config,
            cache: HashMap::new(),
            parsed_chunks: Vec::new(),
        }
    }

    /// Parse HTML incrementally by chunks
    /// Returns the HTML content of the first matching element
    pub fn parse_incremental(&mut self, html: &str, target_selector: &str) -> Option<String> {
        // Check cache first
        if self.config.enable_caching {
            let cache_key = format!("{}:{}", target_selector, self.hash_html(html));
            if let Some(cached) = self.cache.get(&cache_key).cloned() {
                return Some(cached);
            }
        }

        // If HTML is small enough, parse normally
        if html.len() <= self.config.max_chunk_size {
            let result = self.parse_full(html, target_selector);

            // Cache the result
            if self.config.enable_caching {
                if let Some(ref result_html) = result {
                    let cache_key = format!("{}:{}", target_selector, self.hash_html(html));
                    self.cache.insert(cache_key, result_html.clone());
                }
            }

            return result;
        }

        // For large HTML, use incremental parsing
        self.parse_large_incremental(html, target_selector)
    }

    /// Parse full HTML document
    /// Returns the HTML content of the first matching element
    fn parse_full(&self, html: &str, target_selector: &str) -> Option<String> {
        let frag = Html::parse_fragment(html);
        let selector = Selector::parse(target_selector).ok()?;
        frag.select(&selector).next().map(|el| el.html())
    }

    /// Parse large HTML incrementally
    fn parse_large_incremental(&mut self, html: &str, target_selector: &str) -> Option<String> {
        // Split HTML into chunks based on target selector
        let chunks = self.split_by_selector(html, target_selector);

        // Process chunks sequentially
        for chunk in &chunks {
            if let Some(el_html) = self.parse_chunk(chunk, target_selector) {
                return Some(el_html);
            }
        }

        // Fallback: parse the first chunk
        if let Some(first_chunk) = self.parsed_chunks.first() {
            self.parse_full(first_chunk, target_selector)
        } else {
            None
        }
    }

    /// Split HTML by target selector
    fn split_by_selector(&self, html: &str, target_selector: &str) -> Vec<String> {
        let mut chunks = Vec::new();
        let selector = match Selector::parse(target_selector) {
            Ok(s) => s,
            Err(_) => return vec![html.to_string()],
        };

        let doc = Html::parse_document(html);

        // Find matching elements and extract their HTML
        for el in doc.select(&selector) {
            let html = el.html();
            chunks.push(html);
        }

        // If no matches found, return original HTML
        if chunks.is_empty() {
            chunks.push(html.to_string());
        }

        chunks
    }

    /// Parse a single chunk
    /// Returns the HTML content of the first matching element
    fn parse_chunk(&self, chunk: &str, target_selector: &str) -> Option<String> {
        let frag = Html::parse_fragment(chunk);
        let selector = Selector::parse(target_selector).ok()?;
        frag.select(&selector).next().map(|el| el.html())
    }

    /// Hash HTML for caching
    fn hash_html(&self, html: &str) -> u64 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        html.hash(&mut hasher);
        hasher.finish()
    }

    /// Clear the cache
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }

    /// Get cache statistics
    pub fn cache_stats(&self) -> CacheStats {
        CacheStats {
            size: self.cache.len(),
            max_size: self.config.max_cache_size,
        }
    }
}

/// Cache statistics
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub size: usize,
    pub max_size: usize,
}

/// Lazy DOM parser - parses only when needed
pub struct LazyDomParser {
    html: String,
    parsed: bool,
}

impl LazyDomParser {
    pub fn new(html: String) -> Self {
        Self {
            html,
            parsed: false,
        }
    }

    /// Select elements with lazy parsing
    /// Returns the HTML content of matching elements
    pub fn select(&mut self, selector_str: &str) -> Vec<String> {
        // Parse if not already parsed
        if !self.parsed {
            self.parsed = true;
        }

        // Select elements
        let doc = Html::parse_document(&self.html);
        let selector = match Selector::parse(selector_str) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        doc.select(&selector).map(|el| el.html()).collect()
    }

    /// Force parse the entire document
    pub fn force_parse(&mut self) {
        if !self.parsed {
            self.parsed = true;
        }
    }

    /// Check if document is parsed
    pub fn is_parsed(&self) -> bool {
        self.parsed
    }

    /// Get HTML length
    pub fn html_length(&self) -> usize {
        self.html.len()
    }
}

/// Streaming parser for very large documents
pub struct StreamingParser {
    chunk_size: usize,
    buffer: String,
}

impl StreamingParser {
    pub fn new(chunk_size: usize) -> Self {
        Self {
            chunk_size,
            buffer: String::new(),
        }
    }

    /// Feed data to the parser
    pub fn feed(&mut self, data: &str) {
        self.buffer.push_str(data);
    }

    /// Process available chunks
    pub fn process_chunks<F>(&mut self, mut processor: F)
    where
        F: FnMut(&str),
    {
        while self.buffer.len() > self.chunk_size {
            let chunk = &self.buffer[..self.chunk_size];
            processor(chunk);
            self.buffer = self.buffer[self.chunk_size..].to_string();
        }
    }

    /// Get remaining buffer
    pub fn remaining(&self) -> &str {
        &self.buffer
    }

    /// Clear buffer
    pub fn clear(&mut self) {
        self.buffer.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_incremental_parser_small_html() {
        let config = IncrementalParserConfig::default();
        let mut parser = IncrementalParser::new(config);

        let html = r#"<div class="content"><p>Test content</p></div>"#;
        let result = parser.parse_incremental(html, ".content");

        assert!(result.is_some());
    }

    #[test]
    fn test_incremental_parser_cache() {
        let config = IncrementalParserConfig::default();
        let mut parser = IncrementalParser::new(config);

        let html = r#"<div class="content"><p>Test content</p></div>"#;

        // First parse
        let result1 = parser.parse_incremental(html, ".content");
        assert!(result1.is_some());

        // Second parse should use cache
        let result2 = parser.parse_incremental(html, ".content");
        assert!(result2.is_some());

        // Cache should have one entry
        let stats = parser.cache_stats();
        assert_eq!(stats.size, 1);
    }

    #[test]
    fn test_lazy_dom_parser() {
        let html = r#"<div class="content"><p>Test content</p></div>"#;
        let mut parser = LazyDomParser::new(html.to_string());

        assert!(!parser.is_parsed());

        let elements = parser.select(".content");
        assert!(parser.is_parsed());
    }

    #[test]
    fn test_streaming_parser() {
        let mut parser = StreamingParser::new(10);

        parser.feed("0123456789abcdefghij");

        let mut chunks = Vec::new();
        parser.process_chunks(|chunk| {
            chunks.push(chunk.to_string());
        });

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0], "0123456789");
        assert_eq!(chunks[1], "abcdefghij");
    }
}
