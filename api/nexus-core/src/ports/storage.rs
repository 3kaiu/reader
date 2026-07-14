use crate::domain::book_source::{BookSource, BookSourceSnapshot, BookSourceError};
use crate::types::{BookInfo, BookItem, Chapter, ChapterContent, PipelineStageReport, ReplaceRule, SourceRuntimeProfile};
use async_trait::async_trait;
use std::sync::Arc;

#[async_trait]
pub trait BookSourceRepository: Send + Sync {
    async fn save(&self, source: &BookSource) -> Result<(), BookSourceError>;
    async fn find_by_id(&self, id: &str) -> Result<Option<BookSource>, BookSourceError>;
    async fn find_all(&self) -> Result<Vec<BookSource>, BookSourceError>;
    async fn find_by_status(&self, status: crate::domain::book_source::value_objects::SourceStatus) -> Result<Vec<BookSource>, BookSourceError>;
    async fn find_by_readiness(&self, readiness: crate::domain::book_source::value_objects::SourceReadinessState) -> Result<Vec<BookSource>, BookSourceError>;
    async fn find_by_type(&self, source_type: crate::domain::book_source::value_objects::SourceType) -> Result<Vec<BookSource>, BookSourceError>;
    async fn delete(&self, id: &str) -> Result<bool, BookSourceError>;
    async fn exists(&self, id: &str) -> Result<bool, BookSourceError>;
}

#[async_trait]
pub trait BookSourceReadModel: Send + Sync {
    async fn find_by_id(&self, id: &str) -> Result<Option<BookSourceSnapshot>, BookSourceReadModelError>;
    async fn find_all(&self, filter: BookSourceFilter) -> Result<Vec<BookSourceSnapshot>, BookSourceReadModelError>;
    async fn count(&self, filter: BookSourceFilter) -> Result<u64, BookSourceReadModelError>;
}

#[async_trait]
pub trait BookRepository: Send + Sync {
    async fn save_book(&self, book: &BookInfo) -> Result<(), String>;
    async fn find_by_url(&self, url: &str) -> Result<Option<BookInfo>, String>;
    async fn find_by_source(&self, source_id: &str) -> Result<Vec<BookInfo>, String>;
}

#[async_trait]
pub trait ChapterRepository: Send + Sync {
    async fn save_chapters(&self, book_url: &str, chapters: &[Chapter]) -> Result<(), String>;
    async fn find_by_book(&self, book_url: &str) -> Result<Vec<Chapter>, String>;
}

#[async_trait]
pub trait ReadingProgressRepository: Send + Sync {
    async fn save_progress(&self, user_id: &str, book_url: &str, chapter_index: usize, position: f64) -> Result<(), String>;
    async fn get_progress(&self, user_id: &str, book_url: &str) -> Result<Option<(usize, f64)>, String>;
}

#[async_trait]
pub trait FetcherPort: Send + Sync {
    async fn get(&self, url: &str, headers: Option<std::collections::HashMap<String, String>>) -> Result<FetchResponse, String>;
    async fn post(&self, url: &str, body: &str, headers: Option<std::collections::HashMap<String, String>>) -> Result<FetchResponse, String>;
    fn statistics(&self) -> FetcherStatistics;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetcherStatistics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub total_bytes_downloaded: u64,
    pub average_response_time_ms: f64,
    pub active_connections: u32,
}

#[async_trait]
pub trait ContentExtractorPort: Send + Sync {
    async fn extract_content(
        &self,
        html: &str,
        url: &str,
        rules: &[ContentExtractionRule],
    ) -> Result<ExtractedContent, String>;
    
    async fn extract_book_info(
        &self,
        html: &str,
        url: &str,
        rules: &[ContentExtractionRule],
    ) -> Result<ExtractedBookInfo, String>;
    
    async fn extract_chapters(
        &self,
        html: &str,
        url: &str,
        rules: &[ContentExtractionRule],
    ) -> Result<Vec<ExtractedChapter>, String>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentExtractionRule {
    pub name: String,
    pub selector: String,
    pub attribute: Option<String>,
    pub transform: Option<String>,
    pub fallback_selectors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedContent {
    pub content: String,
    pub quality_score: f64,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedBookInfo {
    pub title: String,
    pub author: Option<String>,
    pub cover_url: Option<String>,
    pub intro: Option<String>,
    pub toc_url: Option<String>,
    pub last_chapter: Option<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedChapter {
    pub title: String,
    pub url: String,
    pub index: usize,
}

#[async_trait]
pub trait AntiCrawlPort: Send + Sync {
    async fn execute(
        &self,
        url: &str,
        fetcher: &dyn FetcherPort,
    ) -> Result<FetchResponse, String>;
    
    fn name(&self) -> &str;
    fn should_apply(&self, response: &FetchResponse) -> bool;
}

#[async_trait]
pub trait ContentExtractorAdapter: Send + Sync {
    async fn extract(
        &self,
        html: &str,
        base_url: &str,
        rules: &[ContentExtractionRule],
    ) -> Result<ExtractedContent, String>;
    
    fn extractor_type(&self) -> ExtractorType;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractorType {
    Readability,
    Legado,
    Custom,
}

#[async_trait]
pub trait BookEnginePort: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn base_url(&self) -> &str;
    
    async fn search(&self, query: &str) -> Result<Vec<BookItem>, String>;
    async fn book_info(&self, book_url: &str) -> Result<BookInfo, String>;
    async fn chapters(&self, toc_url: &str) -> Result<Vec<Chapter>, String>;
    async fn content(
        &self,
        chapter_url: &str,
        rules: &[ReplaceRule],
    ) -> Result<String, String>;
    
    async fn content_with_report(
        &self,
        chapter_url: &str,
        rules: &[ReplaceRule],
    ) -> Result<ContentPipelineOutput, String>;
    
    fn runtime_profile(&self) -> SourceRuntimeProfile;
    fn circuit_state_label(&self) -> String;
    fn reset_runtime_state(&self);
    fn is_healthy(&self) -> bool;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentPipelineOutput {
    pub content: String,
    pub stage_reports: Vec<PipelineStageReport>,
}

pub trait SourceStore: BookSourceRepository + BookRepository + ChapterRepository + ReadingProgressRepository {}

impl<T> SourceStore for T where
    T: BookSourceRepository + BookRepository + ChapterRepository + ReadingProgressRepository
{}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn content_extraction_rule_creation() {
        let rule = ContentExtractionRule {
            name: "content".to_string(),
            selector: ".content".to_string(),
            attribute: Some("text".to_string()),
            transform: None,
            fallback_selectors: vec!["#content".to_string(), "article".to_string()],
        };
        
        assert_eq!(rule.name, "content");
        assert_eq!(rule.selector, ".content");
    }
}