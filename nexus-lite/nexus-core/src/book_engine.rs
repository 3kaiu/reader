//! BookEngine trait abstraction for multi-engine support
//!
//! This trait defines the interface for all book source engines,
//! enabling support for multiple formats (NXS, Legado, API-based).

use async_trait::async_trait;

use crate::error::EngineError;
use crate::types::{BookInfo, BookItem, Chapter, ReplaceRule};

/// Abstract interface for book source engines
///
/// Implementing this trait allows different engine types to be used
/// interchangeably by the EngineRegistry and SearchOrchestrator.
#[async_trait]
pub trait BookEngine: Send + Sync {
    /// Unique identifier for this engine instance
    fn id(&self) -> &str;

    /// Human-readable name of the book source
    fn name(&self) -> &str;

    /// Base URL of the book source
    fn base_url(&self) -> &str;

    /// Search for books by keyword
    async fn search(&self, query: &str) -> Result<Vec<BookItem>, EngineError>;

    /// Get detailed book information
    async fn book_info(&self, book_url: &str) -> Result<BookInfo, EngineError>;

    /// Get chapter list for a book
    async fn chapters(&self, toc_url: &str) -> Result<Vec<Chapter>, EngineError>;

    /// Get chapter content with optional replacement rules
    async fn content(
        &self,
        chapter_url: &str,
        rules: &[ReplaceRule],
    ) -> Result<String, EngineError>;

    /// Optional: Check if this engine is healthy
    fn is_healthy(&self) -> bool {
        true
    }

    /// Optional: Get engine-specific metadata
    fn metadata(&self) -> EngineMetadata {
        EngineMetadata::default()
    }
}

/// Engine metadata for monitoring and debugging
#[derive(Debug, Clone, Default)]
pub struct EngineMetadata {
    /// Engine type (e.g., "nxs", "legado", "api")
    pub engine_type: String,
    /// Version of the source definition
    pub version: Option<String>,
    /// Whether this engine requires L6 bypass
    pub requires_l6: bool,
    /// Custom headers required by this source
    pub custom_headers: bool,
}

/// Extension trait for engines that support exploration/discovery
#[async_trait]
pub trait ExploreEngine: BookEngine {
    /// Get available explore categories
    async fn explore_categories(&self) -> Result<Vec<ExploreCategory>, EngineError>;

    /// Get books in a category
    async fn explore(&self, category_url: &str) -> Result<Vec<BookItem>, EngineError>;
}

/// Explore category definition
#[derive(Debug, Clone)]
pub struct ExploreCategory {
    pub name: String,
    pub url: String,
}
