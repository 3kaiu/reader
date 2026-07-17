use std::sync::Arc;

use super::store::{KnowledgeStore, SyncReceipt};
use crate::client::types::AliasMapping;
use crate::error::AiError;

/// Syncs AI knowledge from a producer (M4 dev machine) to a consumer (NAS server).
pub struct SyncClient {
    store: Arc<dyn KnowledgeStore>,
}

impl SyncClient {
    pub fn new(store: Arc<dyn KnowledgeStore>) -> Self {
        Self { store }
    }

    /// Push a batch of confirmed mappings from local inference to the remote store.
    ///
    /// TODO V3: implement conflict detection based on version + timestamp.
    pub async fn push_batch(&self, mappings: Vec<AliasMapping>) -> Result<SyncReceipt, AiError> {
        let book_id = mappings
            .first()
            .map(|m| m.book_id.clone())
            .unwrap_or_default();

        let mut accepted = 0;
        let mut conflicts = 0;

        for mapping in &mappings {
            match self.store.get_mapping(&mapping.book_id, &mapping.alias).await {
                Ok(Some(existing)) if existing.version >= mapping.version => {
                    conflicts += 1;
                    // TODO V3: proper conflict resolution (keep higher version / user decision)
                }
                _ => {
                    self.store.put_mapping(mapping).await?;
                    accepted += 1;
                }
            }
        }

        Ok(SyncReceipt {
            book_id,
            accepted,
            conflicts,
            timestamp: chrono::Utc::now(),
        })
    }
}
