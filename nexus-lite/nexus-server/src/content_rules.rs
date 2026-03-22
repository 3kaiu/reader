use nexus_core::{EngineError, ReplaceRule};
use nexus_storage::SledStore;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

/// Cached resolver for chapter-content cleaning rules.
///
/// The content path should not rebuild rules from multiple stores on every
/// chapter request. We keep a merged snapshot in memory and invalidate it
/// only when replace rules or AI mappings change.
pub struct ContentRuleResolver {
    store: Arc<SledStore>,
    include_ai_mappings: bool,
    cached_rules: RwLock<Option<Arc<[ReplaceRule]>>>,
}

impl ContentRuleResolver {
    pub fn new(store: Arc<SledStore>, include_ai_mappings: bool) -> Self {
        Self {
            store,
            include_ai_mappings,
            cached_rules: RwLock::new(None),
        }
    }

    pub async fn current(&self) -> Result<Arc<[ReplaceRule]>, EngineError> {
        if let Some(rules) = self.cached_rules.read().await.as_ref() {
            return Ok(rules.clone());
        }

        let merged_rules = Arc::<[ReplaceRule]>::from(
            load_merged_rules(&self.store, self.include_ai_mappings).await?,
        );

        let mut cached_rules = self.cached_rules.write().await;
        if let Some(rules) = cached_rules.as_ref() {
            return Ok(rules.clone());
        }

        *cached_rules = Some(merged_rules.clone());
        Ok(merged_rules)
    }

    pub async fn refresh(&self) -> Result<Arc<[ReplaceRule]>, EngineError> {
        let merged_rules = Arc::<[ReplaceRule]>::from(
            load_merged_rules(&self.store, self.include_ai_mappings).await?,
        );
        let mut cached_rules = self.cached_rules.write().await;
        *cached_rules = Some(merged_rules.clone());
        Ok(merged_rules)
    }

    pub async fn invalidate(&self) {
        let mut cached_rules = self.cached_rules.write().await;
        *cached_rules = None;
    }
}

async fn load_merged_rules(
    store: &SledStore,
    include_ai_mappings: bool,
) -> Result<Vec<ReplaceRule>, EngineError> {
    let mut merged_rules = store.get_replace_rules().await?;
    let replace_rule_count = merged_rules.len();

    if !include_ai_mappings {
        info!(
            replace_rule_count,
            merged_rule_count = merged_rules.len(),
            "Loaded content cleaning rules snapshot without AI mappings"
        );
        return Ok(merged_rules);
    }

    match store.get_ai_mapping_rules().await {
        Ok(ai_mappings) => {
            let ai_rule_count = ai_mappings.iter().filter(|mapping| mapping.enabled).count();
            merged_rules.extend(
                ai_mappings
                    .into_iter()
                    .filter(|mapping| mapping.enabled)
                    .map(|mapping| ReplaceRule {
                        id: mapping.id,
                        name: format!("AI: {}", mapping.original),
                        pattern: mapping.original,
                        replacement: Some(mapping.target),
                        scope: Some("all".to_string()),
                        is_enabled: true,
                        is_regex: false,
                    }),
            );

            info!(
                replace_rule_count,
                ai_rule_count,
                merged_rule_count = merged_rules.len(),
                "Loaded content cleaning rules snapshot"
            );
        }
        Err(error) => {
            warn!(
                error = %error,
                replace_rule_count,
                "Failed to load AI mapping rules for content cleaning; continuing with replace rules only"
            );
        }
    }

    Ok(merged_rules)
}
