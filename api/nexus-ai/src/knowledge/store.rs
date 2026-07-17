use async_trait::async_trait;

use crate::client::types::{AliasMapping, ChapterMeta, SyncLogEntry};
use crate::error::AiError;

/// Persistent store for AI knowledge (alias mappings, chapter metadata, sync log).
#[async_trait]
pub trait KnowledgeStore: Send + Sync {
    // ── Mapping CRUD ────────────────────────────────────────────

    async fn get_mapping(&self, book_id: &str, alias: &str) -> Result<Option<AliasMapping>, AiError>;

    async fn put_mapping(&self, mapping: &AliasMapping) -> Result<(), AiError>;

    async fn delete_mapping(&self, book_id: &str, alias: &str) -> Result<(), AiError>;

    async fn list_mappings(&self, book_id: &str) -> Result<Vec<AliasMapping>, AiError>;

    // ── Chapter metadata ────────────────────────────────────────

    async fn get_chapter_meta(
        &self,
        book_id: &str,
        chapter_index: usize,
    ) -> Result<Option<ChapterMeta>, AiError>;

    async fn put_chapter_meta(&self, meta: &ChapterMeta) -> Result<(), AiError>;

    async fn list_chapter_meta(&self, book_id: &str) -> Result<Vec<ChapterMeta>, AiError>;

    // ── Sync ────────────────────────────────────────────────────

    async fn push_sync_log(&self, entry: &SyncLogEntry) -> Result<(), AiError>;

    async fn get_sync_log(
        &self,
        book_id: &str,
        since: chrono::DateTime<chrono::Utc>,
    ) -> Result<Vec<SyncLogEntry>, AiError>;

    // ─── Batch ───────────────────────────────────────────────────

    async fn sync_batch(&self, batch: Vec<AliasMapping>) -> Result<SyncReceipt, AiError>;
}

/// Receipt returned after a successful batch sync.
#[derive(Debug)]
pub struct SyncReceipt {
    pub book_id: String,
    pub accepted: usize,
    pub conflicts: usize,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}
