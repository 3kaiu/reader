//! sled-based storage for Nexus
//!
//! Pure Rust embedded key-value store replacing SQLite.
//! Provides high-concurrency, lock-free reads/writes.
//!
//! [Optimization]
//! All operations are wrapped in `tokio::task::spawn_blocking` to offload
//! synchronous disk I/O from the async runtime.

use crate::cache_model::{FetchSessionProfile, RawHtmlCacheEntry};
use nexus_core::{
    AiAnalysisHistory, AiMappingRule, BookGroup, BookshelfItem, EngineError, HealthTracker,
    PersistedExtractionMetrics, PersistedSourceHealth, ReplaceRule, SkillDecisionLogEntry,
    SourcePolicy, SourceRulePackage, VoiceModelMetadata,
};
use serde::{de::DeserializeOwned, Serialize};
use sled::{Db, Tree};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, info};

/// sled-based storage for all application data
#[derive(Clone)]
pub struct SledStore {
    #[allow(dead_code)]
    db: Db,

    // Domain-specific trees (high cohesion)
    bookshelf: Tree,
    bookshelf_idx: Tree,          // Secondary index: read_time ordering
    bookshelf_idx_reverse: Tree,  // Reverse index: book_id -> index_key for O(1) removal
    bookshelf_lookup: Tree,       // Secondary index: source_id:book_url -> id for O(1) exists(),
    groups: Tree,
    rules: Tree,
    ai_mappings: Tree,
    ai_history: Tree,
    skill_decisions: Tree,
    voice_meta: Tree,
    voice_config: Tree,
    source_status: Tree,            // Source enabled/disabled status
    source_policy: Tree,            // Source governance metadata
    source_packages: Tree,          // Full source rule packages for import/export/docs
    health_state: Tree,             // Persisted source health snapshot
    extraction_metrics_state: Tree, // Persisted extraction metrics snapshot
    fetch_sessions: Tree,           // Human-assisted fetch sessions
    raw_html_cache: Tree,           // Cached HTML responses for sessionized fetch

    // Health tracker (in-memory, not persisted)
    health: Arc<HealthTracker>,
}

impl SledStore {
    /// Create a new sled store at the given path
    pub fn new(path: &Path) -> Result<Self, EngineError> {
        info!("Opening sled database at: {:?}", path);

        let db = sled::open(path).map_err(|e| EngineError::Database {
            message: e.to_string(),
        })?;

        Ok(Self {
            bookshelf: db
                .open_tree("bookshelf")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            bookshelf_idx: db
                .open_tree("bookshelf_idx")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            bookshelf_lookup: db.open_tree("bookshelf_lookup").map_err(|e| {
                EngineError::Database {
                    message: e.to_string(),
                }
            })?,
            // Reverse index: book_id -> index_key (for O(1) removal from time index)
            bookshelf_idx_reverse: db
                .open_tree("bookshelf_idx_reverse")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            groups: db.open_tree("groups").map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?,
            rules: db.open_tree("rules").map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?,
            ai_mappings: db
                .open_tree("ai_mappings")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            ai_history: db
                .open_tree("ai_history")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            skill_decisions: db.open_tree("skill_decisions").map_err(|e| {
                EngineError::Database {
                    message: e.to_string(),
                }
            })?,
            voice_meta: db
                .open_tree("voice_meta")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            voice_config: db
                .open_tree("voice_config")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            source_status: db
                .open_tree("source_status")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            source_policy: db
                .open_tree("source_policy")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            source_packages: db.open_tree("source_packages").map_err(|e| {
                EngineError::Database {
                    message: e.to_string(),
                }
            })?,
            health_state: db
                .open_tree("health_state")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            extraction_metrics_state: db.open_tree("extraction_metrics_state").map_err(|e| {
                EngineError::Database {
                    message: e.to_string(),
                }
            })?,
            fetch_sessions: db
                .open_tree("fetch_sessions")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            raw_html_cache: db
                .open_tree("raw_html_cache")
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?,
            db,
            health: Arc::new(HealthTracker::new()),
        })
    }

    /// Access the health tracker
    pub fn health_tracker(&self) -> &Arc<HealthTracker> {
        &self.health
    }

    pub async fn load_health_snapshot(&self) -> Result<Vec<PersistedSourceHealth>, EngineError> {
        let tree = self.health_state.clone();
        tokio::task::spawn_blocking(move || {
            Self::get_sync::<Vec<PersistedSourceHealth>>(&tree, "snapshot")
                .map(|value| value.unwrap_or_default())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn load_health_snapshot_updated_at_ms(&self) -> Result<Option<i64>, EngineError> {
        let tree = self.health_state.clone();
        tokio::task::spawn_blocking(move || Self::get_sync::<i64>(&tree, "updatedAtMs"))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn save_health_snapshot(
        &self,
        items: Vec<PersistedSourceHealth>,
    ) -> Result<(), EngineError> {
        let tree = self.health_state.clone();
        tokio::task::spawn_blocking(move || {
            let now_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|it| it.as_millis() as i64)
                .unwrap_or(0);
            Self::put_sync(&tree, "snapshot", &items)?;
            Self::put_sync(&tree, "updatedAtMs", &now_ms)
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn load_extraction_metrics_snapshot(
        &self,
    ) -> Result<Vec<PersistedExtractionMetrics>, EngineError> {
        let tree = self.extraction_metrics_state.clone();
        tokio::task::spawn_blocking(move || {
            Self::get_sync::<Vec<PersistedExtractionMetrics>>(&tree, "snapshot")
                .map(|value| value.unwrap_or_default())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn save_extraction_metrics_snapshot(
        &self,
        items: Vec<PersistedExtractionMetrics>,
    ) -> Result<(), EngineError> {
        let tree = self.extraction_metrics_state.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&tree, "snapshot", &items))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    // ========== Generic KV Helpers (Internal Sync) ==========

    fn get_sync<T: DeserializeOwned>(tree: &Tree, key: &str) -> Result<Option<T>, EngineError> {
        match tree.get(key).map_err(|e| EngineError::Database {
            message: e.to_string(),
        })? {
            Some(bytes) => {
                let value: T = serde_json::from_slice(&bytes)?;
                Ok(Some(value))
            },
            None => Ok(None),
        }
    }

    fn put_sync<T: Serialize>(tree: &Tree, key: &str, value: &T) -> Result<(), EngineError> {
        let bytes = serde_json::to_vec(value)?;
        tree.insert(key, bytes).map_err(|e| EngineError::Database {
            message: e.to_string(),
        })?;
        Ok(())
    }

    fn delete_sync(tree: &Tree, key: &str) -> Result<(), EngineError> {
        tree.remove(key).map_err(|e| EngineError::Database {
            message: e.to_string(),
        })?;
        Ok(())
    }

    fn scan_all_sync<T: DeserializeOwned>(tree: &Tree) -> Result<Vec<T>, EngineError> {
        let mut results = Vec::new();
        for entry in tree.iter() {
            let (_, value) = entry.map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?;
            let item: T = serde_json::from_slice(&value)?;
            results.push(item);
        }
        Ok(results)
    }

    /// Write bookshelf item and all secondary indices (Sync helper)
    fn write_book_sync(
        bookshelf_tree: &Tree,
        idx_tree: &Tree,
        idx_reverse_tree: &Tree,
        lookup_tree: &Tree,
        item: &BookshelfItem,
    ) -> Result<(), EngineError> {
        // Remove old index entry if exists
        Self::remove_book_index_sync(idx_tree, idx_reverse_tree, &item.id)?;
        Self::remove_book_lookup_sync(lookup_tree, &item.source_id, &item.book_url)?;

        // Write main data
        Self::put_sync(bookshelf_tree, &item.id, item)?;

        // Write time index (inverted for DESC order)
        let timestamp = item.last_read_time.unwrap_or(item.created_at);
        let idx_key = format!("{:020}:{}", i64::MAX - timestamp, item.id);
        idx_tree
            .insert(idx_key.as_bytes(), &[])
            .map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?;

        // Write reverse index for O(1) removal
        idx_reverse_tree
            .insert(item.id.as_bytes(), idx_key.as_bytes())
            .map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?;

        // Write lookup index for O(1) exists()
        let lookup_key = format!("{}:{}", item.source_id, item.book_url);
        lookup_tree
            .insert(lookup_key.as_bytes(), item.id.as_bytes())
            .map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?;

        Ok(())
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
                let (key, _) = entry.map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?;
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
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    /// Add item to bookshelf
    pub async fn add(&self, item: BookshelfItem) -> Result<(), EngineError> {
        let bookshelf_tree = self.bookshelf.clone();
        let idx_tree = self.bookshelf_idx.clone();
        let idx_reverse_tree = self.bookshelf_idx_reverse.clone();
        let lookup_tree = self.bookshelf_lookup.clone();

        tokio::task::spawn_blocking(move || {
            Self::write_book_sync(&bookshelf_tree, &idx_tree, &idx_reverse_tree, &lookup_tree, &item)?;
            debug!("Added book to shelf: {}", item.name);
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
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
        let idx_reverse_tree = self.bookshelf_idx_reverse.clone();
        let lookup_tree = self.bookshelf_lookup.clone();

        tokio::task::spawn_blocking(move || {
            if let Some(mut item) = Self::get_sync::<BookshelfItem>(&bookshelf_tree, &id)? {
                // Update fields
                item.last_chapter_index = chapter_index;
                item.last_read_position = position;
                item.last_read_time = Some(chrono::Utc::now().timestamp());

                // Re-add with all indices via shared helper
                Self::write_book_sync(&bookshelf_tree, &idx_tree, &idx_reverse_tree, &lookup_tree, &item)?;
            }
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    /// Remove from bookshelf
    pub async fn remove(&self, id: String) -> Result<(), EngineError> {
        let bookshelf_tree = self.bookshelf.clone();
        let idx_tree = self.bookshelf_idx.clone();
        let idx_reverse_tree = self.bookshelf_idx_reverse.clone();
        let lookup_tree = self.bookshelf_lookup.clone();

        tokio::task::spawn_blocking(move || {
            // Fetch item before deletion to clean up lookup
            if let Ok(Some(item)) = Self::get_sync::<BookshelfItem>(&bookshelf_tree, &id) {
                Self::remove_book_lookup_sync(&lookup_tree, &item.source_id, &item.book_url)?;
            }
            Self::remove_book_index_sync(&idx_tree, &idx_reverse_tree, &id)?;
            Self::delete_sync(&bookshelf_tree, &id)?;
            debug!("Removed book from shelf: {}", id);
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    /// Check if book exists (O(1) via secondary index)
    pub async fn exists(&self, source_id: String, book_url: String) -> Result<bool, EngineError> {
        let lookup_tree = self.bookshelf_lookup.clone();

        tokio::task::spawn_blocking(move || {
            let lookup_key = format!("{}:{}", source_id, book_url);
            lookup_tree
                .contains_key(lookup_key.as_bytes())
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    /// Atomically insert book if not exists (prevents TOCTOU race)
    /// Returns Ok(true) if inserted, Ok(false) if already exists
    pub async fn insert_book_if_not_exists(
        &self,
        item: &BookshelfItem,
    ) -> Result<bool, EngineError> {
        let bookshelf_tree = self.bookshelf.clone();
        let idx_tree = self.bookshelf_idx.clone();
        let idx_reverse_tree = self.bookshelf_idx_reverse.clone();
        let lookup_tree = self.bookshelf_lookup.clone();
        let item = item.clone();

        tokio::task::spawn_blocking(move || {
            let lookup_key = format!("{}:{}", item.source_id, item.book_url);

            // Use compare_and_swap for atomic check-and-insert on lookup index
            let result = lookup_tree.compare_and_swap(
                lookup_key.as_bytes(),
                None::<&[u8]>, // Only insert if key doesn't exist
                Some(item.id.as_bytes()),
            );

            match result {
                Ok(Ok(())) => {
                    // Inserted successfully, now write main data and time index
                    Self::write_book_sync(&bookshelf_tree, &idx_tree, &idx_reverse_tree, &lookup_tree, &item)?;
                    Ok(true)
                },
                Ok(Err(_)) => {
                    // Key already exists — book already in bookshelf
                    Ok(false)
                },
                Err(e) => Err(EngineError::Database {
                    message: e.to_string(),
                }),
            }
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
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
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    /// Helper: remove book from time index using reverse index (O(1))
    fn remove_book_index_sync(
        idx_tree: &Tree,
        idx_reverse_tree: &Tree,
        id: &str,
    ) -> Result<(), EngineError> {
        // Look up the index key from reverse index
        if let Some(idx_key) = idx_reverse_tree
            .get(id.as_bytes())
            .map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?
        {
            // Remove from time index
            idx_tree
                .remove(idx_key.as_ref())
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?;
            // Remove from reverse index
            idx_reverse_tree
                .remove(id.as_bytes())
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?;
        }
        Ok(())
    }

    /// Helper: remove book from lookup index (Sync)
    fn remove_book_lookup_sync(
        lookup_tree: &Tree,
        source_id: &Arc<str>,
        book_url: &Arc<str>,
    ) -> Result<(), EngineError> {
        let lookup_key = format!("{}:{}", source_id, book_url);
        lookup_tree
            .remove(lookup_key.as_bytes())
            .map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?;
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
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn save_group(&self, group: BookGroup) -> Result<(), EngineError> {
        let groups_tree = self.groups.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&groups_tree, &group.id, &group))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn delete_group(&self, id: String) -> Result<(), EngineError> {
        let groups_tree = self.groups.clone();
        let bookshelf_tree = self.bookshelf.clone();

        tokio::task::spawn_blocking(move || {
            // Clear group_id from all books in this group
            for entry in bookshelf_tree.iter() {
                let (key, value) = entry.map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?;
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
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    // ========== Replace Rules (Async) ==========

    pub async fn get_replace_rules(&self) -> Result<Vec<ReplaceRule>, EngineError> {
        let rules_tree = self.rules.clone();
        tokio::task::spawn_blocking(move || Self::scan_all_sync(&rules_tree))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn save_replace_rule(&self, rule: ReplaceRule) -> Result<(), EngineError> {
        let rules_tree = self.rules.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&rules_tree, &rule.id, &rule))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn delete_replace_rule(&self, id: String) -> Result<(), EngineError> {
        let rules_tree = self.rules.clone();
        tokio::task::spawn_blocking(move || Self::delete_sync(&rules_tree, &id))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
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
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn save_ai_mapping_rule(&self, rule: AiMappingRule) -> Result<(), EngineError> {
        let mapping_tree = self.ai_mappings.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&mapping_tree, &rule.id, &rule))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn delete_ai_mapping_rule(&self, id: String) -> Result<(), EngineError> {
        let mapping_tree = self.ai_mappings.clone();
        tokio::task::spawn_blocking(move || Self::delete_sync(&mapping_tree, &id))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
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
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn save_ai_analysis_history(
        &self,
        history: AiAnalysisHistory,
    ) -> Result<(), EngineError> {
        let history_tree = self.ai_history.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&history_tree, &history.id, &history))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn clear_ai_analysis_history(&self) -> Result<(), EngineError> {
        let history_tree = self.ai_history.clone();
        tokio::task::spawn_blocking(move || {
            history_tree.clear().map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    // ========== Skill Decision History (Async) ==========

    pub async fn get_skill_decision_history(
        &self,
        limit: u32,
        source_id: Option<String>,
        skill_name: Option<String>,
        since_ms: Option<i64>,
    ) -> Result<Vec<SkillDecisionLogEntry>, EngineError> {
        let decisions_tree = self.skill_decisions.clone();
        tokio::task::spawn_blocking(move || {
            let mut items = Self::scan_all_sync::<SkillDecisionLogEntry>(&decisions_tree)?;
            if let Some(source_id) = source_id {
                items.retain(|it| it.source_id == source_id);
            }
            if let Some(skill_name) = skill_name {
                let normalized = skill_name.to_ascii_lowercase();
                items.retain(|it| it.decision.skill_name.to_ascii_lowercase() == normalized);
            }
            if let Some(since_ms) = since_ms {
                items.retain(|it| it.occurred_at_ms >= since_ms);
            }
            items.sort_by(|a, b| b.occurred_at_ms.cmp(&a.occurred_at_ms));
            items.truncate(limit.max(1) as usize);
            Ok(items)
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn save_skill_decision(
        &self,
        decision: SkillDecisionLogEntry,
    ) -> Result<(), EngineError> {
        let decisions_tree = self.skill_decisions.clone();
        tokio::task::spawn_blocking(move || {
            let key = format!("{:020}:{}", decision.occurred_at_ms.max(0), decision.id);
            Self::put_sync(&decisions_tree, &key, &decision)
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn clear_skill_decision_history(&self) -> Result<(), EngineError> {
        let decisions_tree = self.skill_decisions.clone();
        tokio::task::spawn_blocking(move || {
            decisions_tree.clear().map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    // ========== Voice Metadata (Async) ==========

    pub async fn get_voice_metadata(&self) -> Result<Vec<VoiceModelMetadata>, EngineError> {
        let voice_tree = self.voice_meta.clone();
        tokio::task::spawn_blocking(move || Self::scan_all_sync(&voice_tree))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn save_voice_metadata(&self, model: VoiceModelMetadata) -> Result<(), EngineError> {
        let voice_tree = self.voice_meta.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&voice_tree, &model.id, &model))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn delete_voice_metadata(&self, id: String) -> Result<(), EngineError> {
        let voice_tree = self.voice_meta.clone();
        tokio::task::spawn_blocking(move || Self::delete_sync(&voice_tree, &id))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    // ========== Voice Configuration (Async) ==========

    pub async fn get_voice_config(&self, key: String) -> Result<Option<String>, EngineError> {
        let config_tree = self.voice_config.clone();
        tokio::task::spawn_blocking(move || {
            match config_tree.get(&key).map_err(|e| EngineError::Database {
                message: e.to_string(),
            })? {
                Some(bytes) => {
                    let bytes_ref: &[u8] = &bytes;
                    let s = String::from_utf8_lossy(bytes_ref);
                    Ok(Some(s.into_owned()))
                },
                None => Ok(None),
            }
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn save_voice_config(&self, key: String, value: String) -> Result<(), EngineError> {
        let config_tree = self.voice_config.clone();
        tokio::task::spawn_blocking(move || {
            config_tree
                .insert(&key, value.as_bytes())
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    // ========== Source Status (Async) ==========

    /// Get source enabled status (default: true if not set)
    pub async fn get_source_status(&self, source_id: String) -> Result<bool, EngineError> {
        let status_tree = self.source_status.clone();
        tokio::task::spawn_blocking(move || {
            match status_tree
                .get(&source_id)
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })? {
                Some(bytes) => {
                    // Store as "1" for enabled, "0" for disabled
                    // Guard against empty value (manual DB manipulation or bug)
                    Ok(bytes.first().copied().unwrap_or(b'1') == b'1')
                },
                None => Ok(true), // Default to enabled
            }
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
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
                .map_err(|e| EngineError::Database {
                    message: e.to_string(),
                })?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    /// Get source governance policy (default: unreviewed)
    pub async fn get_source_policy(&self, source_id: String) -> Result<SourcePolicy, EngineError> {
        let policy_tree = self.source_policy.clone();
        tokio::task::spawn_blocking(move || {
            Ok(Self::get_sync::<SourcePolicy>(&policy_tree, &source_id)?.unwrap_or_default())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    /// Batch-load source enabled statuses for many IDs in a single blocking pass.
    ///
    /// Used to avoid N+1 queries in list endpoints: one sled scan replaces N individual
    /// `get_source_status` calls. Missing IDs default to `true` (enabled).
    pub async fn get_source_statuses_batch(
        &self,
        source_ids: Vec<String>,
    ) -> Result<HashMap<String, bool>, EngineError> {
        let status_tree = self.source_status.clone();
        tokio::task::spawn_blocking(move || {
            let mut result = HashMap::with_capacity(source_ids.len());
            for id in source_ids {
                let enabled = match status_tree.get(&id) {
                    Ok(Some(bytes)) => bytes.first().copied().unwrap_or(b'1') == b'1',
                    Ok(None) => true, // default: enabled
                    Err(e) => {
                        return Err(EngineError::Database {
                            message: e.to_string(),
                        })
                    },
                };
                result.insert(id, enabled);
            }
            Ok(result)
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    /// Batch-load source governance policies for many IDs in a single blocking pass.
    ///
    /// Used to avoid N+1 queries in list endpoints: one sled scan replaces N individual
    /// `get_source_policy` calls. Missing IDs default to `SourcePolicy::default()`.
    pub async fn get_source_policies_batch(
        &self,
        source_ids: Vec<String>,
    ) -> Result<HashMap<String, SourcePolicy>, EngineError> {
        let policy_tree = self.source_policy.clone();
        tokio::task::spawn_blocking(move || {
            let mut result = HashMap::with_capacity(source_ids.len());
            for id in source_ids {
                let policy = Self::get_sync::<SourcePolicy>(&policy_tree, &id)?
                    .unwrap_or_default();
                result.insert(id, policy);
            }
            Ok(result)
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn save_source_package(&self, package: SourceRulePackage) -> Result<(), EngineError> {
        let package_tree = self.source_packages.clone();
        let key = package.source.id.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&package_tree, &key, &package))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn get_source_package(
        &self,
        source_id: String,
    ) -> Result<Option<SourceRulePackage>, EngineError> {
        let package_tree = self.source_packages.clone();
        tokio::task::spawn_blocking(move || Self::get_sync(&package_tree, &source_id))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn list_source_packages(&self) -> Result<Vec<SourceRulePackage>, EngineError> {
        let package_tree = self.source_packages.clone();
        tokio::task::spawn_blocking(move || Self::scan_all_sync(&package_tree))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn delete_source_package(&self, source_id: String) -> Result<(), EngineError> {
        let package_tree = self.source_packages.clone();
        tokio::task::spawn_blocking(move || Self::delete_sync(&package_tree, &source_id))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    /// Set source governance policy
    pub async fn set_source_policy(
        &self,
        source_id: String,
        policy: SourcePolicy,
    ) -> Result<(), EngineError> {
        let policy_tree = self.source_policy.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&policy_tree, &source_id, &policy))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    /// Flush all pending writes to disk
    pub async fn flush(&self) -> Result<(), EngineError> {
        let db = self.db.clone();
        tokio::task::spawn_blocking(move || {
            db.flush().map_err(|e| EngineError::Database {
                message: e.to_string(),
            })?;
            Ok(())
        })
        .await
        .map_err(|e| EngineError::Internal {
            message: format!("Storage execution failed: {}", e),
        })?
    }

    pub async fn save_fetch_session(
        &self,
        session: FetchSessionProfile,
    ) -> Result<(), EngineError> {
        let tree = self.fetch_sessions.clone();
        let key = session.session_key.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&tree, &key, &session))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn get_fetch_session(
        &self,
        session_key: String,
    ) -> Result<Option<FetchSessionProfile>, EngineError> {
        let tree = self.fetch_sessions.clone();
        tokio::task::spawn_blocking(move || Self::get_sync(&tree, &session_key))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn save_raw_html_cache(&self, entry: RawHtmlCacheEntry) -> Result<(), EngineError> {
        let tree = self.raw_html_cache.clone();
        let key = entry.cache_key.clone();
        tokio::task::spawn_blocking(move || Self::put_sync(&tree, &key, &entry))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }

    pub async fn get_raw_html_cache(
        &self,
        cache_key: String,
    ) -> Result<Option<RawHtmlCacheEntry>, EngineError> {
        let tree = self.raw_html_cache.clone();
        tokio::task::spawn_blocking(move || Self::get_sync(&tree, &cache_key))
            .await
            .map_err(|e| EngineError::Internal {
                message: format!("Storage execution failed: {}", e),
            })?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nexus_core::{SourceAccessMode, SourceLicenseStatus};
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

    #[tokio::test]
    async fn test_source_policy_defaults_and_roundtrip() {
        let dir = tempdir().unwrap();
        let store = SledStore::new(dir.path()).unwrap();

        let default_policy = store
            .get_source_policy("missing-source".to_string())
            .await
            .unwrap();
        assert_eq!(default_policy.license_status, SourceLicenseStatus::Unknown);

        let saved_policy = SourcePolicy {
            license_status: SourceLicenseStatus::Licensed,
            access_mode: SourceAccessMode::Api,
            last_verified_at: Some(1_710_000_000),
            notes: Some("approved partner feed".to_string()),
        };

        store
            .set_source_policy("source-1".to_string(), saved_policy.clone())
            .await
            .unwrap();

        let loaded_policy = store
            .get_source_policy("source-1".to_string())
            .await
            .unwrap();

        assert_eq!(loaded_policy, saved_policy);
    }
}
