use std::sync::Arc;

use super::store::KnowledgeStore;
use crate::client::inference::InferenceService;
use crate::client::inference::ChapterContext;
use crate::client::types::{
    AliasMapping, ConfidenceLevel, DecodeRequest, MappingSource,
};
use crate::error::AiError;

/// Core engine: combines stored knowledge with live inference to resolve terms.
pub struct KnowledgeEngine {
    store: Arc<dyn KnowledgeStore>,
    inference: Arc<dyn InferenceService>,
}

impl KnowledgeEngine {
    pub fn new(store: Arc<dyn KnowledgeStore>, inference: Arc<dyn InferenceService>) -> Self {
        Self { store, inference }
    }

    /// Resolve a term against known mappings, falling back to inference when needed.
    pub async fn resolve(
        &self,
        book_id: &str,
        term: &str,
        context: &ChapterContext,
    ) -> Result<ResolvedMapping, AiError> {
        // 1. Check store for existing confirmed mapping
        if let Some(mapping) = self.store.get_mapping(book_id, term).await? {
            if mapping.confirmed && mapping.confidence >= 0.7 {
                return Ok(ResolvedMapping::from(mapping));
            }
        }

        // 2. Not found or low confidence — call inference
        let decode_req = DecodeRequest {
            book_id: book_id.to_string(),
            chapter_index: context.chapter_index,
            selected_text: term.to_string(),
            surrounding_text: String::new(), // filled by caller
            context_meta: Some(
                serde_json::to_string(&context.known_mappings).unwrap_or_default(),
            ),
        };

        let result = self.inference.decode(decode_req).await?;

        // 3. If inference returned high-confidence single match, auto-suggest
        if result.confidence == ConfidenceLevel::High && result.candidate_mappings.len() == 1 {
            let cm = &result.candidate_mappings[0];
            let pending = AliasMapping {
                id: uuid::Uuid::new_v4().to_string(),
                book_id: book_id.to_string(),
                alias: cm.alias.clone(),
                canonical: cm.canonical.clone(),
                category: cm.category.clone(),
                confidence: cm.confidence,
                source: MappingSource::Ai,
                confirmed: false,
                context_clues: cm.context_clue.iter().cloned().collect::<Vec<_>>(),
                created_at: chrono::Utc::now(),
                confirmed_at: None,
                version: 1,
            };
            return Ok(ResolvedMapping::Pending(pending));
        }

        // 4. Multiple candidates or low confidence — surface for human choice
        Ok(ResolvedMapping::Ambiguous {
            term: term.to_string(),
            candidates: result.candidate_mappings,
        })
    }

    /// User confirmed a mapping — persist it.
    pub async fn confirm(&self, mapping: AliasMapping) -> Result<(), AiError> {
        let mut m = mapping;
        m.confirmed = true;
        m.confirmed_at = Some(chrono::Utc::now());
        m.source = MappingSource::User;
        m.version += 1;
        self.store.put_mapping(&m).await
    }
}

/// Result of a resolve() call — either a ready mapping, a pending suggestion,
/// or an ambiguous set of candidates.
#[derive(Debug)]
pub enum ResolvedMapping {
    /// Already-confirmed mapping ready for rendering
    Confirmed(AliasMapping),
    /// AI-suggested mapping awaiting user confirmation (high confidence)
    Pending(AliasMapping),
    /// Multiple or uncertain candidates requiring user choice
    Ambiguous {
        term: String,
        candidates: Vec<crate::client::types::CandidateMapping>,
    },
}

impl From<AliasMapping> for ResolvedMapping {
    fn from(m: AliasMapping) -> Self {
        if m.confirmed {
            ResolvedMapping::Confirmed(m)
        } else {
            ResolvedMapping::Pending(m)
        }
    }
}
