use crate::domain::book_source::value_objects::*;
use crate::types::{
    SourceCapabilityMatrix, SourceHealthReport, SourceImportPolicy, SourcePolicy,
    SourceReadinessState, SourceRuleValidationReport, SourceSearchProfile,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", content = "payload")]
pub enum BookSourceEvent {
    Created(SourceCreated),
    StatusChanged(SourceStatusChanged),
    PolicyUpdated(PolicyUpdated),
    ValidationCompleted(ValidationCompleted),
    HealthUpdated(HealthUpdated),
    CapabilitiesUpdated(CapabilitiesUpdated),
    ImportPolicyUpdated(ImportPolicyUpdated),
    SearchProfileUpdated(SearchProfileUpdated),
    TagAdded(TagAdded),
    TagRemoved(TagRemoved),
    MetadataUpdated(MetadataUpdated),
    MetadataRemoved(MetadataRemoved),
    Deleted(SourceDeleted),
}

impl BookSourceEvent {
    pub fn aggregate_id(&self) -> &SourceId {
        match self {
            BookSourceEvent::Created(e) => &e.source_id,
            BookSourceEvent::StatusChanged(e) => &e.source_id,
            BookSourceEvent::PolicyUpdated(e) => &e.source_id,
            BookSourceEvent::ValidationCompleted(e) => &e.source_id,
            BookSourceEvent::HealthUpdated(e) => &e.source_id,
            BookSourceEvent::CapabilitiesUpdated(e) => &e.source_id,
            BookSourceEvent::ImportPolicyUpdated(e) => &e.source_id,
            BookSourceEvent::SearchProfileUpdated(e) => &e.source_id,
            BookSourceEvent::TagAdded(e) => &e.source_id,
            BookSourceEvent::TagRemoved(e) => &e.source_id,
            BookSourceEvent::MetadataUpdated(e) => &e.source_id,
            BookSourceEvent::MetadataRemoved(e) => &e.source_id,
            BookSourceEvent::Deleted(e) => &e.source_id,
        }
    }

    pub fn event_type(&self) -> &'static str {
        match self {
            BookSourceEvent::Created(_) => "SourceCreated",
            BookSourceEvent::StatusChanged(_) => "SourceStatusChanged",
            BookSourceEvent::PolicyUpdated(_) => "PolicyUpdated",
            BookSourceEvent::ValidationCompleted(_) => "ValidationCompleted",
            BookSourceEvent::HealthUpdated(_) => "HealthUpdated",
            BookSourceEvent::CapabilitiesUpdated(_) => "CapabilitiesUpdated",
            BookSourceEvent::ImportPolicyUpdated(_) => "ImportPolicyUpdated",
            BookSourceEvent::SearchProfileUpdated(_) => "SearchProfileUpdated",
            BookSourceEvent::TagAdded(_) => "TagAdded",
            BookSourceEvent::TagRemoved(_) => "TagRemoved",
            BookSourceEvent::MetadataUpdated(_) => "MetadataUpdated",
            BookSourceEvent::MetadataRemoved(_) => "MetadataRemoved",
            BookSourceEvent::Deleted(_) => "SourceDeleted",
        }
    }

    pub fn occurred_at(&self) -> i64 {
        match self {
            BookSourceEvent::Created(e) => e.created_at,
            BookSourceEvent::StatusChanged(e) => e.changed_at,
            BookSourceEvent::PolicyUpdated(e) => e.updated_at,
            BookSourceEvent::ValidationCompleted(e) => e.completed_at,
            BookSourceEvent::HealthUpdated(e) => e.updated_at,
            BookSourceEvent::CapabilitiesUpdated(e) => e.updated_at,
            BookSourceEvent::ImportPolicyUpdated(e) => e.updated_at,
            BookSourceEvent::SearchProfileUpdated(e) => e.updated_at,
            BookSourceEvent::TagAdded(e) => e.added_at,
            BookSourceEvent::TagRemoved(e) => e.removed_at,
            BookSourceEvent::MetadataUpdated(e) => e.updated_at,
            BookSourceEvent::MetadataRemoved(e) => e.removed_at,
            BookSourceEvent::Deleted(e) => e.deleted_at,
        }
    }
}

impl From<SourceCreated> for BookSourceEvent {
    fn from(e: SourceCreated) -> Self {
        BookSourceEvent::Created(e)
    }
}

impl From<SourceStatusChanged> for BookSourceEvent {
    fn from(e: SourceStatusChanged) -> Self {
        BookSourceEvent::StatusChanged(e)
    }
}

impl From<PolicyUpdated> for BookSourceEvent {
    fn from(e: PolicyUpdated) -> Self {
        BookSourceEvent::PolicyUpdated(e)
    }
}

impl From<ValidationCompleted> for BookSourceEvent {
    fn from(e: ValidationCompleted) -> Self {
        BookSourceEvent::ValidationCompleted(e)
    }
}

impl From<HealthUpdated> for BookSourceEvent {
    fn from(e: HealthUpdated) -> Self {
        BookSourceEvent::HealthUpdated(e)
    }
}

impl From<CapabilitiesUpdated> for BookSourceEvent {
    fn from(e: CapabilitiesUpdated) -> Self {
        BookSourceEvent::CapabilitiesUpdated(e)
    }
}

impl From<ImportPolicyUpdated> for BookSourceEvent {
    fn from(e: ImportPolicyUpdated) -> Self {
        BookSourceEvent::ImportPolicyUpdated(e)
    }
}

impl From<SearchProfileUpdated> for BookSourceEvent {
    fn from(e: SearchProfileUpdated) -> Self {
        BookSourceEvent::SearchProfileUpdated(e)
    }
}

impl From<TagAdded> for BookSourceEvent {
    fn from(e: TagAdded) -> Self {
        BookSourceEvent::TagAdded(e)
    }
}

impl From<TagRemoved> for BookSourceEvent {
    fn from(e: TagRemoved) -> Self {
        BookSourceEvent::TagRemoved(e)
    }
}

impl From<MetadataUpdated> for BookSourceEvent {
    fn from(e: MetadataUpdated) -> Self {
        BookSourceEvent::MetadataUpdated(e)
    }
}

impl From<MetadataRemoved> for BookSourceEvent {
    fn from(e: MetadataRemoved) -> Self {
        BookSourceEvent::MetadataRemoved(e)
    }
}

impl From<SourceDeleted> for BookSourceEvent {
    fn from(e: SourceDeleted) -> Self {
        BookSourceEvent::Deleted(e)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventStore {
    pub events: Vec<StoredEvent>,
}

impl EventStore {
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }

    pub fn append(&mut self, event: BookSourceEvent) -> StoredEvent {
        let stored = StoredEvent::new(event);
        self.events.push(stored.clone());
        stored
    }

    pub fn events_for(&self, aggregate_id: &SourceId) -> Vec<&StoredEvent> {
        self.events
            .iter()
            .filter(|e| e.aggregate_id == *aggregate_id)
            .collect()
    }

    pub fn all_events(&self) -> &[StoredEvent] {
        &self.events
    }
}

impl Default for EventStore {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredEvent {
    pub event_id: String,
    pub aggregate_id: SourceId,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub version: u64,
    pub timestamp: i64,
    pub causation_id: Option<String>,
    pub correlation_id: Option<String>,
}

impl StoredEvent {
    pub fn new(event: BookSourceEvent) -> Self {
        let payload = serde_json::to_value(&event).unwrap_or_default();
        Self {
            event_id: uuid::Uuid::new_v4().to_string(),
            aggregate_id: event.aggregate_id().clone(),
            event_type: event.event_type().to_string(),
            payload,
            version: 0,
            timestamp: event.occurred_at(),
            causation_id: None,
            correlation_id: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReadinessTransition {
    DraftToBlocked,
    DraftToSearchReady,
    BlockedToDraft,
    SearchReadyToCatalogReady,
    SearchReadyToBlocked,
    CatalogReadyToReadingReady,
    CatalogReadyToSearchReady,
    ReadingReadyToFullFlowReady,
    ReadingReadyToCatalogReady,
    FullFlowReadyToReadingReady,
    AnyToBlocked,
}

impl ReadinessTransition {
    pub fn from_states(from: SourceReadinessState, to: SourceReadinessState) -> Option<Self> {
        match (from, to) {
            (SourceReadinessState::Draft, SourceReadinessState::Blocked) => {
                Some(Self::DraftToBlocked)
            },
            (SourceReadinessState::Draft, SourceReadinessState::SearchReady) => {
                Some(Self::DraftToSearchReady)
            },
            (SourceReadinessState::Blocked, SourceReadinessState::Draft) => {
                Some(Self::BlockedToDraft)
            },
            (SourceReadinessState::SearchReady, SourceReadinessState::CatalogReady) => {
                Some(Self::SearchReadyToCatalogReady)
            },
            (SourceReadinessState::SearchReady, SourceReadinessState::Blocked) => {
                Some(Self::SearchReadyToBlocked)
            },
            (SourceReadinessState::CatalogReady, SourceReadinessState::ReadingReady) => {
                Some(Self::CatalogReadyToReadingReady)
            },
            (SourceReadinessState::CatalogReady, SourceReadinessState::SearchReady) => {
                Some(Self::CatalogReadyToSearchReady)
            },
            (SourceReadinessState::ReadingReady, SourceReadinessState::FullFlowReady) => {
                Some(Self::ReadingReadyToFullFlowReady)
            },
            (SourceReadinessState::ReadingReady, SourceReadinessState::CatalogReady) => {
                Some(Self::ReadingReadyToCatalogReady)
            },
            (SourceReadinessState::FullFlowReady, SourceReadinessState::ReadingReady) => {
                Some(Self::FullFlowReadyToReadingReady)
            },
            (_, SourceReadinessState::Blocked) => Some(Self::AnyToBlocked),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn readiness_transitions() {
        assert!(matches!(
            ReadinessTransition::from_states(
                SourceReadinessState::Draft,
                SourceReadinessState::SearchReady
            ),
            Some(ReadinessTransition::DraftToSearchReady)
        ));

        assert!(matches!(
            ReadinessTransition::from_states(
                SourceReadinessState::SearchReady,
                SourceReadinessState::CatalogReady
            ),
            Some(ReadinessTransition::SearchReadyToCatalogReady)
        ));

        assert!(matches!(
            ReadinessTransition::from_states(
                SourceReadinessState::CatalogReady,
                SourceReadinessState::ReadingReady
            ),
            Some(ReadinessTransition::CatalogReadyToReadingReady)
        ));

        assert!(matches!(
            ReadinessTransition::from_states(
                SourceReadinessState::ReadingReady,
                SourceReadinessState::FullFlowReady
            ),
            Some(ReadinessTransition::ReadingReadyToFullFlowReady)
        ));

        assert!(ReadinessTransition::from_states(
            SourceReadinessState::FullFlowReady,
            SourceReadinessState::Draft
        )
        .is_none());
    }
}
