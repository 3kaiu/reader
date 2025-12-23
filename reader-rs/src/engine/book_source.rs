//! Book Source Engine - Main entry point for parsing book sources
//!
//! Combines all components:
//! - RuleAnalyzer for content parsing
//! - HttpClient for network requests  
//! - JsExecutor for JavaScript execution

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::rule_analyzer::RuleAnalyzer;
use super::http_client::HttpClient;

/// Book source definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookSource {
    pub book_source_url: String,
    pub book_source_name: String,
    pub book_source_group: Option<String>,
    pub book_source_type: Option<i32>,
    pub search_url: Option<String>,
    pub explore_url: Option<String>,
    pub header: Option<String>,
    pub js_lib: Option<String>,
    pub rule_search: Option<SearchRule>,
    pub rule_explore: Option<ExploreRule>,
    pub rule_book_info: Option<BookInfoRule>,
    pub rule_toc: Option<TocRule>,
    pub rule_content: Option<ContentRule>,
}

/// Search rule configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRule {
    pub book_list: Option<String>,
    pub name: Option<String>,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub cover_url: Option<String>,
    pub book_url: Option<String>,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub word_count: Option<String>,
}

/// Explore rule configuration  
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExploreRule {
    pub book_list: Option<String>,
    pub name: Option<String>,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub cover_url: Option<String>,
    pub book_url: Option<String>,
}

/// Book info rule configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfoRule {
    pub name: Option<String>,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub cover_url: Option<String>,
    pub toc_url: Option<String>,
    pub last_chapter: Option<String>,
}

/// Table of contents rule configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TocRule {
    pub chapter_list: Option<String>,
    pub chapter_name: Option<String>,
    pub chapter_url: Option<String>,
    pub is_volume: Option<String>,
    pub update_time: Option<String>,
}

/// Content rule configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRule {
    pub content: Option<String>,
    pub next_content_url: Option<String>,
    pub web_js: Option<String>,
    pub source_regex: Option<String>,
    pub replace_regex: Option<String>,
}

/// Search result book item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookItem {
    pub name: String,
    pub author: String,
    pub intro: Option<String>,
    pub cover_url: Option<String>,
    pub book_url: String,
    pub kind: Option<String>,
    pub last_chapter: Option<String>,
    pub word_count: Option<String>,
}

/// Chapter item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub url: String,
    pub is_volume: bool,
}

/// Main Book Source Engine
pub struct BookSourceEngine {
    source: BookSource,
    analyzer: RuleAnalyzer,
    http: HttpClient,
}

impl BookSourceEngine {
    /// Create a new engine for a book source
    pub fn new(source: BookSource) -> Result<Self> {
        let http = HttpClient::new(&source.book_source_url)?;
        let mut analyzer = RuleAnalyzer::new()?;
        analyzer.set_base_url(&source.book_source_url);
        
        Ok(Self {
            source,
            analyzer,
            http,
        })
    }
    
    /// Search for books
    pub fn search(&self, key: &str, page: i32) -> Result<Vec<BookItem>> {
        let search_url = self.source.search_url
            .as_ref()
            .ok_or_else(|| anyhow!("No search URL defined"))?;
        
        // Build URL with variables
        let mut vars = HashMap::new();
        vars.insert("key".to_string(), key.to_string());
        vars.insert("page".to_string(), page.to_string());
        vars.insert("searchKey".to_string(), key.to_string());
        
        let url = self.http.parse_url_template(search_url, &vars);
        
        // Make request
        let content = self.http.get(&url)?;
        
        // Parse results
        let rule = self.source.rule_search
            .as_ref()
            .ok_or_else(|| anyhow!("No search rule defined"))?;
        
        let book_list_rule = rule.book_list
            .as_ref()
            .ok_or_else(|| anyhow!("No book_list rule"))?;
        
        let elements = self.analyzer.get_elements(&content, book_list_rule)?;
        
        let mut books = Vec::new();
        for element in elements {
            if let Ok(book) = self.parse_book_item(&element, rule) {
                books.push(book);
            }
        }
        
        Ok(books)
    }
    
    /// Get book info
    pub fn get_book_info(&self, book_url: &str) -> Result<BookItem> {
        let content = self.http.get(book_url)?;
        
        let rule = self.source.rule_book_info
            .as_ref()
            .ok_or_else(|| anyhow!("No book info rule defined"))?;
        
        Ok(BookItem {
            name: self.get_rule_value(&content, &rule.name).unwrap_or_default(),
            author: self.get_rule_value(&content, &rule.author).unwrap_or_default(),
            intro: self.get_rule_value(&content, &rule.intro).ok(),
            cover_url: self.get_rule_value(&content, &rule.cover_url).ok().map(|u| self.http.absolute_url(&u)),
            book_url: book_url.to_string(),
            kind: None,
            last_chapter: self.get_rule_value(&content, &rule.last_chapter).ok(),
            word_count: None,
        })
    }
    
    /// Get table of contents
    pub fn get_chapters(&self, toc_url: &str) -> Result<Vec<Chapter>> {
        let content = self.http.get(toc_url)?;
        
        let rule = self.source.rule_toc
            .as_ref()
            .ok_or_else(|| anyhow!("No TOC rule defined"))?;
        
        let chapter_list_rule = rule.chapter_list
            .as_ref()
            .ok_or_else(|| anyhow!("No chapter_list rule"))?;
        
        let elements = self.analyzer.get_elements(&content, chapter_list_rule)?;
        
        let mut chapters = Vec::new();
        for element in elements {
            if let Ok(chapter) = self.parse_chapter(&element, rule) {
                chapters.push(chapter);
            }
        }
        
        Ok(chapters)
    }
    
    /// Get chapter content
    pub fn get_content(&self, chapter_url: &str) -> Result<String> {
        let content = self.http.get(chapter_url)?;
        
        let rule = self.source.rule_content
            .as_ref()
            .ok_or_else(|| anyhow!("No content rule defined"))?;
        
        let content_rule = rule.content
            .as_ref()
            .ok_or_else(|| anyhow!("No content rule"))?;
        
        self.analyzer.get_string(&content, content_rule)
    }
    
    // === Private methods ===
    
    fn parse_book_item(&self, element: &str, rule: &SearchRule) -> Result<BookItem> {
        Ok(BookItem {
            name: self.get_rule_value(element, &rule.name)?,
            author: self.get_rule_value(element, &rule.author).unwrap_or_default(),
            intro: self.get_rule_value(element, &rule.intro).ok(),
            cover_url: self.get_rule_value(element, &rule.cover_url).ok().map(|u| self.http.absolute_url(&u)),
            book_url: self.http.absolute_url(&self.get_rule_value(element, &rule.book_url)?),
            kind: self.get_rule_value(element, &rule.kind).ok(),
            last_chapter: self.get_rule_value(element, &rule.last_chapter).ok(),
            word_count: self.get_rule_value(element, &rule.word_count).ok(),
        })
    }
    
    fn parse_chapter(&self, element: &str, rule: &TocRule) -> Result<Chapter> {
        Ok(Chapter {
            title: self.get_rule_value(element, &rule.chapter_name)?,
            url: self.http.absolute_url(&self.get_rule_value(element, &rule.chapter_url)?),
            is_volume: self.get_rule_value(element, &rule.is_volume)
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false),
        })
    }
    
    fn get_rule_value(&self, content: &str, rule: &Option<String>) -> Result<String> {
        let rule = rule.as_ref().ok_or_else(|| anyhow!("Rule is None"))?;
        self.analyzer.get_string(content, rule)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_book_source_parse() {
        let json = r#"{
            "bookSourceUrl": "https://example.com",
            "bookSourceName": "Test Source",
            "searchUrl": "/search?q={{key}}&p={{page}}"
        }"#;
        
        let source: BookSource = serde_json::from_str(json).unwrap();
        assert_eq!(source.book_source_name, "Test Source");
        assert_eq!(source.search_url.unwrap(), "/search?q={{key}}&p={{page}}");
    }
}
