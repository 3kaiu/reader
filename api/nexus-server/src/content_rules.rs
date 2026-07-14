use nexus_core::{EngineError, ReplaceRule};
use nexus_storage::SledStore;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

/// Cached resolver for chapter-content cleaning rules.
///
/// The content path should not rebuild rules from multiple stores on every
/// chapter request. We keep a merged snapshot in memory and invalidate it
/// only when replace rules or AI mappings change.
pub struct ContentRuleResolver {
    store: Arc<SledStore>,
    cached_rules: RwLock<Option<Arc<[ReplaceRule]>>>,
}

impl ContentRuleResolver {
    pub fn new(store: Arc<SledStore>) -> Self {
        Self {
            store,
            cached_rules: RwLock::new(None),
        }
    }

    pub async fn current(&self) -> Result<Arc<[ReplaceRule]>, EngineError> {
        if let Some(rules) = self.cached_rules.read().await.as_ref() {
            return Ok(rules.clone());
        }

        let merged_rules = Arc::<[ReplaceRule]>::from(load_merged_rules(&self.store).await?);

        let mut cached_rules = self.cached_rules.write().await;
        if let Some(rules) = cached_rules.as_ref() {
            return Ok(rules.clone());
        }

        *cached_rules = Some(merged_rules.clone());
        Ok(merged_rules)
    }

    pub async fn refresh(&self) -> Result<Arc<[ReplaceRule]>, EngineError> {
        let merged_rules = Arc::<[ReplaceRule]>::from(load_merged_rules(&self.store).await?);
        let mut cached_rules = self.cached_rules.write().await;
        *cached_rules = Some(merged_rules.clone());
        Ok(merged_rules)
    }

    pub async fn invalidate(&self) {
        let mut cached_rules = self.cached_rules.write().await;
        *cached_rules = None;
    }
}

async fn load_merged_rules(store: &SledStore) -> Result<Vec<ReplaceRule>, EngineError> {
    let merged_rules = store.get_replace_rules().await?;
    info!(
        replace_rule_count = merged_rules.len(),
        merged_rule_count = merged_rules.len(),
        "Loaded content cleaning rules snapshot"
    );
    Ok(merged_rules)
}
