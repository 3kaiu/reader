//! sled-based storage for NexusLite
//!
//! Pure Rust embedded key-value store replacing SQLite.
//! Provides high-concurrency, lock-free reads/writes.

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

    // Health tracker (in-memory, not persisted)
    health: Arc<HealthTracker>,
}

impl SledStore {
    /// Create a new sled store at the given path
    pub fn new(path: &Path) -> Result<Self, EngineError> {
        info!("Opening sled database at: {:?}", path);

        let db = sled::open(path).map_err(|e| EngineError::Database(e.to_string()))?;

        Ok(Self {
            bookshelf: db
                .open_tree("bookshelf")
                .map_err(|e| EngineError::Database(e.to_string()))?,
            bookshelf_idx: db
                .open_tree("bookshelf_idx")
                .map_err(|e| EngineError::Database(e.to_string()))?,
            groups: db
                .open_tree("groups")
                .map_err(|e| EngineError::Database(e.to_string()))?,
            rules: db
                .open_tree("rules")
                .map_err(|e| EngineError::Database(e.to_string()))?,
            ai_mappings: db
                .open_tree("ai_mappings")
                .map_err(|e| EngineError::Database(e.to_string()))?,
            ai_history: db
                .open_tree("ai_history")
                .map_err(|e| EngineError::Database(e.to_string()))?,
            voice_meta: db
                .open_tree("voice_meta")
                .map_err(|e| EngineError::Database(e.to_string()))?,
            voice_config: db
                .open_tree("voice_config")
                .map_err(|e| EngineError::Database(e.to_string()))?,
            db,
            health: Arc::new(HealthTracker::new()),
        })
    }

    /// Access the health tracker
    pub fn health_tracker(&self) -> &Arc<HealthTracker> {
        &self.health
    }

    // ========== Generic KV Helpers ==========

    fn get<T: DeserializeOwned>(&self, tree: &Tree, key: &str) -> Result<Option<T>, EngineError> {
        match tree.get(key).map_err(|e| EngineError::Database(e.to_string()))? {
            Some(bytes) => {
                let value: T = serde_json::from_slice(&bytes)?;
                Ok(Some(value))
            }
            None => Ok(None),
        }
    }

    fn put<T: Serialize>(&self, tree: &Tree, key: &str, value: &T) -> Result<(), EngineError> {
        let bytes = serde_json::to_vec(value)?;
        tree.insert(key, bytes)
            .map_err(|e| EngineError::Database(e.to_string()))?;
        Ok(())
    }

    fn delete(&self, tree: &Tree, key: &str) -> Result<(), EngineError> {
        tree.remove(key)
            .map_err(|e| EngineError::Database(e.to_string()))?;
        Ok(())
    }

    fn scan_all<T: DeserializeOwned>(&self, tree: &Tree) -> Result<Vec<T>, EngineError> {
        let mut results = Vec::new();
        for entry in tree.iter() {
            let (_, value) = entry.map_err(|e| EngineError::Database(e.to_string()))?;
            let item: T = serde_json::from_slice(&value)?;
            results.push(item);
        }
        Ok(results)
    }

    // ========== Bookshelf Operations ==========

    /// Get all bookshelf items (sorted by last_read_time DESC)
    pub fn get_all(&self) -> Result<Vec<BookshelfItem>, EngineError> {
        let mut results = Vec::new();

        // Use index for sorted retrieval
        for entry in self.bookshelf_idx.iter() {
            let (key, _) = entry.map_err(|e| EngineError::Database(e.to_string()))?;
            let key_str = String::from_utf8_lossy(&key);

            // Key format: {inverted_timestamp}:{id}
            if let Some(id) = key_str.split(':').nth(1) {
                if let Some(item) = self.get::<BookshelfItem>(&self.bookshelf, id)? {
                    results.push(item);
                }
            }
        }

        Ok(results)
    }

    /// Add item to bookshelf
    pub fn add(&self, item: &BookshelfItem) -> Result<(), EngineError> {
        // Remove old index entry if exists
        self.remove_book_index(&item.id)?;

        // Write main data
        self.put(&self.bookshelf, &item.id, item)?;

        // Write time index (inverted for DESC order)
        let timestamp = item.last_read_time.unwrap_or(item.created_at);
        let idx_key = format!("{:020}:{}", i64::MAX - timestamp, item.id);
        self.bookshelf_idx
            .insert(idx_key, &[])
            .map_err(|e| EngineError::Database(e.to_string()))?;

        debug!("Added book to shelf: {}", item.name);
        Ok(())
    }

    /// Update reading progress
    pub fn update_progress(
        &self,
        id: &str,
        chapter_index: u32,
        position: f64,
    ) -> Result<(), EngineError> {
        if let Some(mut item) = self.get::<BookshelfItem>(&self.bookshelf, id)? {
            // Remove old index
            self.remove_book_index(id)?;

            // Update fields
            item.last_chapter_index = chapter_index;
            item.last_read_position = position;
            item.last_read_time = Some(chrono::Utc::now().timestamp());

            // Re-add with new timestamp
            self.add(&item)?;
        }
        Ok(())
    }

    /// Remove from bookshelf
    pub fn remove(&self, id: &str) -> Result<(), EngineError> {
        self.remove_book_index(id)?;
        self.delete(&self.bookshelf, id)?;
        debug!("Removed book from shelf: {}", id);
        Ok(())
    }

    /// Check if book exists
    pub fn exists(&self, source_id: &str, book_url: &str) -> Result<bool, EngineError> {
        // Scan all books to check (could optimize with secondary index if needed)
        for entry in self.bookshelf.iter() {
            let (_, value) = entry.map_err(|e| EngineError::Database(e.to_string()))?;
            let item: BookshelfItem = serde_json::from_slice(&value)?;
            if item.source_id == source_id && item.book_url == book_url {
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Move book to group
    pub fn move_to_group(&self, id: &str, group_id: Option<String>) -> Result<(), EngineError> {
        if let Some(mut item) = self.get::<BookshelfItem>(&self.bookshelf, id)? {
            item.group_id = group_id;
            self.put(&self.bookshelf, id, &item)?;
        }
        Ok(())
    }

    /// Helper: remove book from time index
    fn remove_book_index(&self, id: &str) -> Result<(), EngineError> {
        // Find and remove the index entry
        let prefix_to_find = format!(":{}", id);
        let mut to_remove = None;

        for entry in self.bookshelf_idx.iter() {
            let (key, _) = entry.map_err(|e| EngineError::Database(e.to_string()))?;
            let key_str = String::from_utf8_lossy(&key);
            if key_str.ends_with(&prefix_to_find) {
                to_remove = Some(key.to_vec());
                break;
            }
        }

        if let Some(key) = to_remove {
            self.bookshelf_idx
                .remove(key)
                .map_err(|e| EngineError::Database(e.to_string()))?;
        }

        Ok(())
    }

    // ========== Groups ==========

    pub fn get_groups(&self) -> Result<Vec<BookGroup>, EngineError> {
        let mut groups = self.scan_all::<BookGroup>(&self.groups)?;
        groups.sort_by_key(|g| g.order_index);
        Ok(groups)
    }

    pub fn save_group(&self, group: &BookGroup) -> Result<(), EngineError> {
        self.put(&self.groups, &group.id, group)
    }

    pub fn delete_group(&self, id: &str) -> Result<(), EngineError> {
        // Clear group_id from all books in this group
        for entry in self.bookshelf.iter() {
            let (key, value) = entry.map_err(|e| EngineError::Database(e.to_string()))?;
            let mut item: BookshelfItem = serde_json::from_slice(&value)?;
            if item.group_id.as_deref() == Some(id) {
                item.group_id = None;
                let key_str = String::from_utf8_lossy(&key);
                self.put(&self.bookshelf, &key_str, &item)?;
            }
        }

        self.delete(&self.groups, id)
    }

    // ========== Replace Rules ==========

    pub fn get_replace_rules(&self) -> Result<Vec<ReplaceRule>, EngineError> {
        self.scan_all(&self.rules)
    }

    pub fn save_replace_rule(&self, rule: &ReplaceRule) -> Result<(), EngineError> {
        self.put(&self.rules, &rule.id, rule)
    }

    pub fn delete_replace_rule(&self, id: &str) -> Result<(), EngineError> {
        self.delete(&self.rules, id)
    }

    // ========== AI Mapping Rules ==========

    pub fn get_ai_mapping_rules(&self) -> Result<Vec<AiMappingRule>, EngineError> {
        let mut rules = self.scan_all::<AiMappingRule>(&self.ai_mappings)?;
        rules.sort_by(|a, b| b.created_at.cmp(&a.created_at)); // DESC by created_at
        Ok(rules)
    }

    pub fn save_ai_mapping_rule(&self, rule: &AiMappingRule) -> Result<(), EngineError> {
        self.put(&self.ai_mappings, &rule.id, rule)
    }

    pub fn delete_ai_mapping_rule(&self, id: &str) -> Result<(), EngineError> {
        self.delete(&self.ai_mappings, id)
    }

    // ========== AI Analysis History ==========

    pub fn get_ai_analysis_history(&self, limit: u32) -> Result<Vec<AiAnalysisHistory>, EngineError> {
        let mut history = self.scan_all::<AiAnalysisHistory>(&self.ai_history)?;
        history.sort_by(|a, b| b.analyzed_at.cmp(&a.analyzed_at)); // DESC
        history.truncate(limit as usize);
        Ok(history)
    }

    pub fn save_ai_analysis_history(&self, history: &AiAnalysisHistory) -> Result<(), EngineError> {
        self.put(&self.ai_history, &history.id, history)
    }

    pub fn clear_ai_analysis_history(&self) -> Result<(), EngineError> {
        self.ai_history
            .clear()
            .map_err(|e| EngineError::Database(e.to_string()))?;
        Ok(())
    }

    // ========== Voice Metadata ==========

    pub fn get_voice_metadata(&self) -> Result<Vec<VoiceModelMetadata>, EngineError> {
        self.scan_all(&self.voice_meta)
    }

    pub fn save_voice_metadata(&self, model: &VoiceModelMetadata) -> Result<(), EngineError> {
        self.put(&self.voice_meta, &model.id, model)
    }

    pub fn delete_voice_metadata(&self, id: &str) -> Result<(), EngineError> {
        self.delete(&self.voice_meta, id)
    }

    // ========== Voice Configuration ==========

    pub fn get_voice_config(&self, key: &str) -> Result<Option<String>, EngineError> {
        match self
            .voice_config
            .get(key)
            .map_err(|e| EngineError::Database(e.to_string()))?
        {
            Some(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
            None => Ok(None),
        }
    }

    pub fn save_voice_config(&self, key: &str, value: &str) -> Result<(), EngineError> {
        self.voice_config
            .insert(key, value.as_bytes())
            .map_err(|e| EngineError::Database(e.to_string()))?;
        Ok(())
    }

    /// Flush all pending writes to disk
    pub fn flush(&self) -> Result<(), EngineError> {
        self.db
            .flush()
            .map_err(|e| EngineError::Database(e.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_bookshelf_crud() {
        let dir = tempdir().unwrap();
        let store = SledStore::new(dir.path()).unwrap();

        let item = BookshelfItem {
            id: "test-1".to_string(),
            source_id: "source-1".to_string(),
            book_url: "https://example.com/book/1".to_string(),
            name: "Test Book".to_string(),
            author: Some("Author".to_string()),
            cover_url: None,
            last_chapter_index: 0,
            last_read_position: 0.0,
            last_read_time: Some(1000),
            created_at: 1000,
            group_id: None,
        };

        // Add
        store.add(&item).unwrap();

        // Get all
        let books = store.get_all().unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].name, "Test Book");

        // Update progress
        store.update_progress("test-1", 5, 0.5).unwrap();
        let books = store.get_all().unwrap();
        assert_eq!(books[0].last_chapter_index, 5);

        // Remove
        store.remove("test-1").unwrap();
        let books = store.get_all().unwrap();
        assert!(books.is_empty());
    }

    #[test]
    fn test_sorted_by_read_time() {
        let dir = tempdir().unwrap();
        let store = SledStore::new(dir.path()).unwrap();

        // Add books with different timestamps
        for i in 1..=3 {
            let item = BookshelfItem {
                id: format!("book-{}", i),
                source_id: "source-1".to_string(),
                book_url: format!("https://example.com/book/{}", i),
                name: format!("Book {}", i),
                author: None,
                cover_url: None,
                last_chapter_index: 0,
                last_read_position: 0.0,
                last_read_time: Some(i * 1000), // 1000, 2000, 3000
                created_at: i * 1000,
                group_id: None,
            };
            store.add(&item).unwrap();
        }

        let books = store.get_all().unwrap();
        assert_eq!(books.len(), 3);
        // Should be sorted DESC by last_read_time
        assert_eq!(books[0].name, "Book 3");
        assert_eq!(books[1].name, "Book 2");
        assert_eq!(books[2].name, "Book 1");
    }
}
