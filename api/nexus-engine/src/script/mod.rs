//! Script execution backends for running translated JS sources.
//!
//! The `Runner` trait abstracts over different execution backends:
//! - `NodeRunner` — a pool of long-running Node.js processes
//! - Future: `BunRunner`, `NativeRunner` (for pure CSS sources)

use async_trait::async_trait;
use nexus_core::{BookInfo, BookItem, Chapter, EngineError};

/// Result of a source execution, with optional browser interaction signal.
#[derive(Debug)]
pub struct RunResult<T> {
    pub data: T,
    pub needs_browser: Option<String>,
}

/// Runner trait — abstract execution backend for translated JS sources.
#[async_trait]
pub trait Runner: Send + Sync {
    /// Execute a search.
    async fn search(&self, source_id: &str, keyword: &str, page: u32)
        -> Result<RunResult<Vec<BookItem>>, EngineError>;

    /// Get book info.
    async fn book_info(&self, source_id: &str, book_url: &str)
        -> Result<RunResult<BookInfo>, EngineError>;

    /// Get chapter list.
    async fn chapters(&self, source_id: &str, toc_url: &str)
        -> Result<RunResult<Vec<Chapter>>, EngineError>;

    /// Get chapter content.
    async fn content(&self, source_id: &str, chapter_url: &str)
        -> Result<RunResult<String>, EngineError>;
}

pub mod node;