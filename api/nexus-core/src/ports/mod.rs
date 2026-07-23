use crate::domain::book_source::{
    BookSource, BookSourceError, BookSourceFilter, BookSourceReadModelError,
    RepoSnapshot, SourceId,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[async_trait]
pub trait BookSourceRepository: Send + Sync {
    async fn save(&self, source: &BookSource) -> Result<(), BookSourceError>;
    async fn find_by_id(&self, id: &SourceId) -> Result<Option<BookSource>, BookSourceError>;
    async fn find_all(&self, filter: BookSourceFilter) -> Result<Vec<BookSource>, BookSourceError>;
    async fn delete(&self, id: &SourceId) -> Result<bool, BookSourceError>;
    async fn exists(&self, id: &SourceId) -> Result<bool, BookSourceError>;
    async fn count(&self, filter: BookSourceFilter) -> Result<u64, BookSourceError>;
}

#[async_trait]
pub trait BookSourceReadModel: Send + Sync {
    async fn find_by_id(&self, id: &SourceId) -> Result<RepoSnapshot, BookSourceReadModelError>;
    async fn find_all(
        &self,
        filter: BookSourceFilter,
    ) -> Result<Vec<RepoSnapshot>, BookSourceReadModelError>;
    async fn count(&self, filter: BookSourceFilter) -> Result<u64, BookSourceReadModelError>;
}

pub trait BookSourceEventStore: Send + Sync {
    fn append(
        &self,
        events: Vec<crate::domain::book_source::events::StoredEvent>,
    ) -> Result<(), String>;
    fn events_for(
        &self,
        aggregate_id: &SourceId,
    ) -> Result<Vec<crate::domain::book_source::events::StoredEvent>, String>;
    fn all_events(&self) -> Result<Vec<crate::domain::book_source::events::StoredEvent>, String>;
}

#[async_trait]
pub trait FetcherPort: Send + Sync {
    async fn get(
        &self,
        url: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, FetchError>;

    async fn post(
        &self,
        url: &str,
        body: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, FetchError>;

    fn statistics(&self) -> FetcherStatistics;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
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

#[derive(Debug, thiserror::Error)]
pub enum FetchError {
    #[error("network error: {0}")]
    Network(String),
    #[error("timeout after {0}ms")]
    Timeout(u64),
    #[error("HTTP error {status}: {body}")]
    HttpError { status: u16, body: String },
    #[error("redirect loop detected")]
    RedirectLoop,
    #[error("invalid URL: {0}")]
    InvalidUrl(String),
}

#[async_trait]
pub trait AntiCrawlPort: Send + Sync {
    async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, FetchError>;

    fn name(&self) -> &str;
    fn should_apply(&self, response: &FetchResponse) -> bool;
    fn supports_script(&self) -> bool;
}

#[derive(Debug, Clone)]
pub struct FetchContext {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub timeout_ms: u64,
    pub proxy: Option<String>,
    pub metadata: HashMap<String, String>,
}

impl FetchContext {
    pub fn new(url: String) -> Self {
        Self {
            url,
            method: "GET".to_string(),
            headers: HashMap::new(),
            body: None,
            timeout_ms: 30000,
            proxy: None,
            metadata: HashMap::new(),
        }
    }
}

#[async_trait]
pub trait ContentExtractorPort: Send + Sync {
    async fn extract(
        &self,
        html: &str,
        url: &str,
        config: ExtractorConfig,
    ) -> Result<ExtractionResult, ExtractorError>;

    fn name(&self) -> &str;
    fn supported_modes(&self) -> Vec<ExtractorMode>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractorConfig {
    pub mode: ExtractorMode,
    pub selector: Option<String>,
    pub rules: HashMap<String, String>,
    pub options: HashMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExtractorMode {
    Readability,
    LegadoCss,
    LegadoXpath,
    LegadoJsonPath,
    LegadoRegex,
    LegadoJs,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionResult {
    pub content: String,
    pub quality_score: f64,
    pub metadata: ExtractionMetadata,
    pub stage_reports: Vec<PipelineStageReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionMetadata {
    pub word_count: usize,
    pub paragraph_count: usize,
    pub noise_ratio: f64,
    pub duplicate_ratio: f64,
    pub language: Option<String>,
    pub extracted_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStageReport {
    pub stage: String,
    pub ok: bool,
    pub strategy: Option<String>,
    pub failure_code: Option<String>,
    pub warnings: Vec<String>,
    pub metrics: HashMap<String, String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ExtractorError {
    #[error("extraction failed: {0}")]
    ExtractionFailed(String),
    #[error("unsupported mode: {0}")]
    UnsupportedMode(String),
    #[error("invalid selector: {0}")]
    InvalidSelector(String),
    #[error("quality gate failed: {0}")]
    QualityGateFailed(String),
}

#[async_trait]
pub trait StoragePort: Send + Sync {
    async fn put(&self, key: &str, value: &[u8]) -> Result<(), StorageError>;
    async fn get(&self, key: &str) -> Result<Option<Vec<u8>>, StorageError>;
    async fn delete(&self, key: &str) -> Result<bool, StorageError>;
    async fn exists(&self, key: &str) -> Result<bool, StorageError>;
    async fn scan(&self, prefix: &str) -> Result<Vec<String>, StorageError>;
}

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("key not found: {0}")]
    NotFound(String),
    #[error("storage backend error: {0}")]
    Backend(String),
    #[error("serialization error: {0}")]
    Serialization(String),
}

#[async_trait]
pub trait CachePort: Send + Sync {
    async fn get(&self, key: &str) -> Result<Option<String>, CacheError>;
    async fn set(&self, key: &str, value: &str, ttl_seconds: u64) -> Result<(), CacheError>;
    async fn delete(&self, key: &str) -> Result<bool, CacheError>;
    async fn clear(&self) -> Result<(), CacheError>;
}

#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    #[error("cache backend error: {0}")]
    Backend(String),
    #[error("serialization error: {0}")]
    Serialization(String),
}

#[async_trait]
pub trait EventBusPort: Send + Sync {
    async fn publish(
        &self,
        topic: &str,
        event: &dyn erased_serde::Serialize,
    ) -> Result<(), EventBusError>;
    async fn subscribe(
        &self,
        topic: &str,
        handler: Box<dyn EventHandler>,
    ) -> Result<(), EventBusError>;
}

#[async_trait]
pub trait EventHandler: Send + Sync {
    async fn handle(&self, topic: &str, payload: &[u8]) -> Result<(), EventBusError>;
}

#[derive(Debug, thiserror::Error)]
pub enum EventBusError {
    #[error("publish failed: {0}")]
    Publish(String),
    #[error("subscribe failed: {0}")]
    Subscribe(String),
    #[error("handler error: {0}")]
    Handler(String),
}
