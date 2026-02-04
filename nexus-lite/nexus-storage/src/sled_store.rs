//! sled-based storage for NexusLite
//!
//! Pure Rust embedded key-value store replacing SQLite.
//! Provides high-concurrency, lock-free reads/writes.
//!
//! [Optimization]
//! All operations are wrapped in `tokio::task::spawn_blocking` to offload
//! synchronous disk I/O from the async runtime.

use nexus_core::{
    AiAnalysisHistory, AiMappingRule, BookGroup, BookshelfItem, EngineError, HealthTracker,
    ReplaceRule, VoiceModelMetadata,
};
use serde::{de::DeserializeOwned, Serialize};
use sled::{Db, Tree};
use std::path::Path;
use std::sync::Arc;
use tracing::{debug, info};

/// sled-based storage for all application data
#[derive(Clone)]
pub struct SledStore {
    #[allow(dead_code)]
    db: Db,

    // Domain-specific trees (high cohesion)
    bookshelf: Tree,
    bookshelf_idx: Tree, // Secondary index: read_time ordering
    groups: Tree,
    rules: Tree,
    ai_mappings: Tree,
    ai_history: Tree,
    voice_meta: Tree,
    voice_config: Tree,
    source_status: Tree, // Source enabled/disabled status

    // Health tracker (in-memory, not persisted)
    health: Arc<HealthTracker>,
}

impl SledStore {
    /// Create a new sled store at the given path
    pub fn new(path: &Path) -> Result<Self, EngineError> {
        info!("Opening sled database at: {:?}", path);

        let db = sled::open(path).map_err(|e| EngineError::Database { message: e.to_string() })?;

        Ok(Self {
            bookshelf: db
                .open_tree("bookshelf")
                .map_err(|e| EngineError::Database { message: e.to_string() })?,
            bookshelf_idx: db
                .open_tree("bookshelf_idx")
                .map_err(|e| EngineError::Database { message: e.to_string() })?,
            groups: db
                .open_tree("groups")
                .map_err(|e| EngineError::Database { message: e.to_string() })?,
            rules: db
                .open_tree("rules")
                .map_err(|e| EngineError::Database { message: e.to_string() })?,
            ai_mappings: db
                .open_tree("ai_mappings")
                .map_err(|e| EngineError::Database { message: e.to_string() })?,
            ai_history: db
                .open_tree("ai_history")
                .map_err(|e| EngineError::Database { message: e.to_string() })?,
            voice_meta: db
                .open_tree("voice_meta")
                .map_err(|e| EngineError::Database { message: e.to_string() })?,
            voice_config: db
                .open_tree("voice_config")
                .map_err(|e| EngineError::Database { message: e.to_string() })?,
            source_status: db
                .open_tree("source_status")
                .map_err(|e| EngineError::Database { message: e.to_string() })?,
            db,
            health: Arc::new(HealthTracker::new()),
        })
    }

    /// Access the health tracker
    pub fn health_tracker(&self) -> &Arc<HealthTracker> {
        &self.health
    }

    // ========== Generic KV Helpers (Internal Sync) ==========

    fn get_sync<T: DeserializeOwned>(tree: &Tree, key: &str) -> Result<Option<T>, EngineError> {
        match tree
            .get(key)
            .map_err(|e| EngineError::Database { message: e.to_string() })?
        {
            Some(bytes) => {
                let value: T = serde_json::from_slice(&bytes)?;
                Ok(Some(value))
            }
            None => Ok(None),
        }
    }

    fn put_sync<T: Serialize>(tree: &Tree, key: &str, value: &T) -> Result<(), EngineError> {
        let bytes = serde_json::to_vec(value)?;
        tree.insert(key, bytes)
            .map_err(|e| EngineError::Database { message: e.to_string() })?;
        Ok(())
    }

    fn delete_sync(tree: &Tree, key: &str) -> Result<(), EngineError> {
        tree.remove(key)
            .map_err(|e| EngineError::Database { message: e.to_string() })?;
        Ok(())
    }

    fn scan_all_sync<T: DeserializeOwned>(tree: &Tree) -> Result<Vec<T>, EngineError> {
        let mut results = Vec::new();
        for entry in tree.iter() {
            let (_, value) = entry.map_err(|e| EngineError::Database { message: e.to_string() })?;
            let item: T = serde_json::from_slice(&value)?;
            results.push(item);
        }
        Ok(results)
    }

    // ========== Bookshelf Operations (Async) ==========

    /// Get all bookshelf items (sorted by last_read_time DESC)
    pub async fn get_all(&self) -> Result<Vec<BookshelfItem>, EngineError> {
        let idx_tree = self.bookshelf_idx.clone();
        let bookshelf_tree = self.bookshelf.clone();

        tokio::task::spawn_blocking(move || {
            let mut results = Vec::new();
            // Use index for sorted retrieval
            for entry in idx_tree.iter() {
                let (key, _) = entry.map_err(|e| EngineError::Database { message: e.to_string() })?;
                let key_str = String::from_utf8_lossy(&key);

                // Key format: {inverted_timestamp}:{id}
                if let Some(id) = key_str.split(':').nth(1) {
                    if let Some(item) = Self::get_sync::<BookshelfItem>(&bookshelf_tree, id)? {
                        results.push(item);
                    }
                }
            }
            Ok(results)
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    /// Add item to bookshelf
    pub async fn add(&self, item: BookshelfItem) -> Result<(), EngineError> {
        let bookshelf_tree = self.bookshelf.clone();
        let idx_tree = self.bookshelf_idx.clone();

        tokio::task::spawn_blocking(move || {
            // Remove old index entry if exists
            Self::remove_book_index_sync(&idx_tree, &item.id)?;

            // Write main data
            Self::put_sync(&bookshelf_tree, &item.id, &item)?;

            // Write time index (inverted for DESC order)
            let timestamp = item.last_read_time.unwrap_or(item.created_at);
            let idx_key = format!("{:020}:{}", i64::MAX - timestamp, item.id);
            idx_tree
                .insert(idx_key, &[])
                .map_err(|e| EngineError::Database { message: e.to_string() })?;

            debug!("Added book to shelf: {}", item.name);
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    /// Update reading progress
    pub async fn update_progress(
        &self,
        id: String,
        chapter_index: u32,
        position: f64,
    ) -> Result<(), EngineError> {
        let bookshelf_tree = self.bookshelf.clone();
        let idx_tree = self.bookshelf_idx.clone();
        // We need to clone `self` logic or move clones into the closure.
        // For complexity, let's duplicate the logic inside the closure.

        tokio::task::spawn_blocking(move || {
            if let Some(mut item) = Self::get_sync::<BookshelfItem>(&bookshelf_tree, &id)? {
                // Remove old index
                Self::remove_book_index_sync(&idx_tree, &id)?;

                // Update fields
                item.last_chapter_index = chapter_index;
                item.last_read_position = position;
                item.last_read_time = Some(chrono::Utc::now().timestamp());

                // Re-add with new timestamp
                // Internal add logic
                Self::put_sync(&bookshelf_tree, &item.id, &item)?;
                let timestamp = item.last_read_time.unwrap_or(item.created_at);
                let idx_key = format!("{:020}:{}", i64::MAX - timestamp, item.id);
                idx_tree
                    .insert(idx_key, &[])
                    .map_err(|e| EngineError::Database { message: e.to_string() })?;
            }
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    /// Remove from bookshelf
    pub async fn remove(&self, id: String) -> Result<(), EngineError> {
        let bookshelf_tree = self.bookshelf.clone();
        let idx_tree = self.bookshelf_idx.clone();

        tokio::task::spawn_blocking(move || {
            Self::remove_book_index_sync(&idx_tree, &id)?;
            Self::delete_sync(&bookshelf_tree, &id)?;
            debug!("Removed book from shelf: {}", id);
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    /// Check if book exists
    pub async fn exists(&self, source_id: String, book_url: String) -> Result<bool, EngineError> {
        let bookshelf_tree = self.bookshelf.clone();

        tokio::task::spawn_blocking(move || {
            // Scan all books to check (could optimize with secondary index if needed)
            for entry in bookshelf_tree.iter() {
                let (_, value) = entry.map_err(|e| EngineError::Database { message: e.to_string() })?;
                let item: BookshelfItem = serde_json::from_slice(&value)?;
                if item.source_id.as_ref() == source_id && item.book_url.as_ref() == book_url {
                    return Ok(true);
                }
            }
            Ok(false)
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    /// Move book to group
    pub async fn move_to_group(
        &self,
        id: String,
        group_id: Option<String>,
    ) -> Result<(), EngineError> {
        let bookshelf_tree = self.bookshelf.clone();

        tokio::task::spawn_blocking(move || {
            if let Some(mut item) = Self::get_sync::<BookshelfItem>(&bookshelf_tree, &id)? {
                item.group_id = group_id;
                Self::put_sync(&bookshelf_tree, &id, &item)?;
            }
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    /// Helper: remove book from time index (Sync)
    fn remove_book_index_sync(idx_tree: &Tree, id: &str) -> Result<(), EngineError> {
        // Find and remove the index entry
        let prefix_to_find = format!(":{}", id);
        let mut to_remove = None;

        for entry in idx_tree.iter() {
            let (key, _) = entry.map_err(|e| EngineError::Database { message: e.to_string() })?;
            let key_str = String::from_utf8_lossy(&key);
            if key_str.ends_with(&prefix_to_find) {
                to_remove = Some(key.to_vec());
                break;
            }
        }

        if let Some(key) = to_remove {
            idx_tree
                .remove(key)
                .map_err(|e| EngineError::Database { message: e.to_string() })?;
        }

        Ok(())
    }

    // ========== Groups (Async) ==========

    pub async fn get_groups(&self) -> Result<Vec<BookGroup>, EngineError> {
        let groups_tree = self.groups.clone();
        tokio::task::spawn_blocking(move || {
            let mut groups = Self::scan_all_sync::<BookGroup>(&groups_tree)?;
            groups.sort_by_key(|g| g.order_index);
            Ok(groups)
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn save_group(&self, group: BookGroup) -> Result<(), EngineError> {
        let groups_tree = self.groups.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&groups_tree, &group.id, &group))
            .await
            .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn delete_group(&self, id: String) -> Result<(), EngineError> {
        let groups_tree = self.groups.clone();
        let bookshelf_tree = self.bookshelf.clone();

        tokio::task::spawn_blocking(move || {
            // Clear group_id from all books in this group
            for entry in bookshelf_tree.iter() {
                let (key, value) = entry.map_err(|e| EngineError::Database { message: e.to_string() })?;
                let mut item: BookshelfItem = serde_json::from_slice(&value)?;
                if item.group_id.as_deref() == Some(&id) {
                    item.group_id = None;
                    let key_str = String::from_utf8_lossy(&key);
                    Self::put_sync(&bookshelf_tree, &key_str, &item)?;
                }
            }
            Self::delete_sync(&groups_tree, &id)
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    // ========== Replace Rules (Async) ==========

    pub async fn get_replace_rules(&self) -> Result<Vec<ReplaceRule>, EngineError> {
        let rules_tree = self.rules.clone();
        tokio::task::spawn_blocking(move || Self::scan_all_sync(&rules_tree))
            .await
            .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn save_replace_rule(&self, rule: ReplaceRule) -> Result<(), EngineError> {
        let rules_tree = self.rules.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&rules_tree, &rule.id, &rule))
            .await
            .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn delete_replace_rule(&self, id: String) -> Result<(), EngineError> {
        let rules_tree = self.rules.clone();
        tokio::task::spawn_blocking(move || Self::delete_sync(&rules_tree, &id))
            .await
            .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    // ========== AI Mapping Rules (Async) ==========

    pub async fn get_ai_mapping_rules(&self) -> Result<Vec<AiMappingRule>, EngineError> {
        let mapping_tree = self.ai_mappings.clone();
        tokio::task::spawn_blocking(move || {
            let mut rules = Self::scan_all_sync::<AiMappingRule>(&mapping_tree)?;
            rules.sort_by(|a, b| b.created_at.cmp(&a.created_at)); // DESC by created_at
            Ok(rules)
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn save_ai_mapping_rule(&self, rule: AiMappingRule) -> Result<(), EngineError> {
        let mapping_tree = self.ai_mappings.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&mapping_tree, &rule.id, &rule))
            .await
            .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn delete_ai_mapping_rule(&self, id: String) -> Result<(), EngineError> {
        let mapping_tree = self.ai_mappings.clone();
        tokio::task::spawn_blocking(move || Self::delete_sync(&mapping_tree, &id))
            .await
            .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    // ========== AI Analysis History (Async) ==========

    pub async fn get_ai_analysis_history(
        &self,
        limit: u32,
    ) -> Result<Vec<AiAnalysisHistory>, EngineError> {
        let history_tree = self.ai_history.clone();
        tokio::task::spawn_blocking(move || {
            let mut history = Self::scan_all_sync::<AiAnalysisHistory>(&history_tree)?;
            history.sort_by(|a, b| b.analyzed_at.cmp(&a.analyzed_at)); // DESC
            history.truncate(limit as usize);
            Ok(history)
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn save_ai_analysis_history(
        &self,
        history: AiAnalysisHistory,
    ) -> Result<(), EngineError> {
        let history_tree = self.ai_history.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&history_tree, &history.id, &history))
            .await
            .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn clear_ai_analysis_history(&self) -> Result<(), EngineError> {
        let history_tree = self.ai_history.clone();
        tokio::task::spawn_blocking(move || {
            history_tree
                .clear()
                .map_err(|e| EngineError::Database { message: e.to_string() })?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    // ========== Voice Metadata (Async) ==========

    pub async fn get_voice_metadata(&self) -> Result<Vec<VoiceModelMetadata>, EngineError> {
        let voice_tree = self.voice_meta.clone();
        tokio::task::spawn_blocking(move || Self::scan_all_sync(&voice_tree))
            .await
            .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn save_voice_metadata(&self, model: VoiceModelMetadata) -> Result<(), EngineError> {
        let voice_tree = self.voice_meta.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&voice_tree, &model.id, &model))
            .await
            .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn delete_voice_metadata(&self, id: String) -> Result<(), EngineError> {
        let voice_tree = self.voice_meta.clone();
        tokio::task::spawn_blocking(move || Self::delete_sync(&voice_tree, &id))
            .await
            .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    // ========== Voice Configuration (Async) ==========

    pub async fn get_voice_config(&self, key: String) -> Result<Option<String>, EngineError> {
        let config_tree = self.voice_config.clone();
        tokio::task::spawn_blocking(move || {
            match config_tree
                .get(&key)
                .map_err(|e| EngineError::Database { message: e.to_string() })?
            {
                Some(bytes) => {
                    let bytes_ref: &[u8] = &bytes;
                    let s = String::from_utf8_lossy(bytes_ref);
                    Ok(Some(s.into_owned()))
                },
                None => Ok(None),
            }
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    pub async fn save_voice_config(&self, key: String, value: String) -> Result<(), EngineError> {
        let config_tree = self.voice_config.clone();
        tokio::task::spawn_blocking(move || {
            config_tree
                .insert(&key, value.as_bytes())
                .map_err(|e| EngineError::Database { message: e.to_string() })?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    // ========== Source Status (Async) ==========

    /// Get source enabled status (default: true if not set)
    pub async fn get_source_status(&self, source_id: String) -> Result<bool, EngineError> {
        let status_tree = self.source_status.clone();
        tokio::task::spawn_blocking(move || {
            match status_tree
                .get(&source_id)
                .map_err(|e| EngineError::Database { message: e.to_string() })?
            {
                Some(bytes) => {
                    // Store as "1" for enabled, "0" for disabled
                    Ok(bytes[0] == b'1')
                }
                None => Ok(true), // Default to enabled
            }
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    /// Set source enabled status
    pub async fn set_source_status(
        &self,
        source_id: String,
        enabled: bool,
    ) -> Result<(), EngineError> {
        let status_tree = self.source_status.clone();
        tokio::task::spawn_blocking(move || {
            let value = if enabled { b"1" } else { b"0" };
            status_tree
                .insert(&source_id, value)
                .map_err(|e| EngineError::Database { message: e.to_string() })?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }

    /// Flush all pending writes to disk
    pub async fn flush(&self) -> Result<(), EngineError> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            db.flush()
                .map_err(|e| EngineError::Database { message: e.to_string() })?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal { message: format!("Storage execution failed: {}", e) })?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_bookshelf_crud() {
        let dir = tempdir().unwrap();
        let store = SledStore::new(dir.path()).unwrap();

        let item = BookshelfItem {
            id: "test-1".to_string(),
            source_id: Arc::from("source-1"),
            book_url: Arc::from("https://example.com/book/1"),
            name: Arc::from("Test Book"),
            author: Some(Arc::from("Author")),
            cover_url: None,
            last_chapter_index: 0,
            last_read_position: 0.0,
            last_read_time: Some(1000),
            created_at: 1000,
            total_chapter_num: None,
            latest_chapter_title: None,
            group_id: None,
        };

        // Add
        store.add(item).await.unwrap();

        // Get all
        let books = store.get_all().await.unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].name.as_ref(), "Test Book");

        // Update progress
        store
            .update_progress("test-1".to_string(), 5, 0.5)
            .await
            .unwrap();
        let books = store.get_all().await.unwrap();
        assert_eq!(books[0].last_chapter_index, 5);

        // Remove
        store.remove("test-1".to_string()).await.unwrap();
        let books = store.get_all().await.unwrap();
        assert!(books.is_empty());
    }

    #[tokio::test]
    async fn test_sorted_by_read_time() {
        let dir = tempdir().unwrap();
        let store = SledStore::new(dir.path()).unwrap();

        // Add books with different timestamps
        for i in 1..=3 {
            let item = BookshelfItem {
                id: format!("book-{}", i),
                source_id: Arc::from("source-1"),
                book_url: Arc::from(format!("https://example.com/book/{}", i).as_str()),
                name: Arc::from(format!("Book {}", i).as_str()),
                author: None,
                cover_url: None,
                last_chapter_index: 0,
                last_read_position: 0.0,
                last_read_time: Some(i * 1000), // 1000, 2000, 3000
                created_at: i * 1000,
                total_chapter_num: None,
                latest_chapter_title: None,
                group_id: None,
            };
            store.add(item).await.unwrap();
        }

        let books = store.get_all().await.unwrap();
        assert_eq!(books.len(), 3);
        // Should be sorted DESC by last_read_time
        assert_eq!(books[0].name.as_ref(), "Book 3");
        assert_eq!(books[1].name.as_ref(), "Book 2");
        assert_eq!(books[2].name.as_ref(), "Book 1");
    }
}
