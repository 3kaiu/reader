pub use crate::types::{
    SourceCapabilityMatrix, SourceHealthReport, SourceImportPolicy, SourcePolicy,
    SourceReadinessReport, SourceReadinessState, SourceRuleValidationReport, SourceSearchProfile,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SourceId(Arc<str>);

impl SourceId {
    pub fn new(id: impl Into<Arc<str>>) -> Result<Self, SourceIdError> {
        let id: Arc<str> = id.into();
        if id.is_empty() {
            return Err(SourceIdError::Empty);
        }
        if id.contains("..") || id.contains('/') || id.contains('\\') || id.contains('\0') {
            return Err(SourceIdError::InvalidCharacters);
        }
        if id.len() > 128 {
            return Err(SourceIdError::TooLong);
        }
        Ok(Self(id))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for SourceId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::ops::Deref for SourceId {
    type Target = str;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SourceIdError {
    #[error("source id cannot be empty")]
    Empty,
    #[error("source id contains invalid characters")]
    InvalidCharacters,
    #[error("source id exceeds maximum length of 128")]
    TooLong,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceName(Arc<str>);

impl SourceName {
    pub fn new(name: impl Into<Arc<str>>) -> Result<Self, SourceNameError> {
        let name: Arc<str> = name.into();
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(SourceNameError::Empty);
        }
        if trimmed.len() > 256 {
            return Err(SourceNameError::TooLong);
        }
        Ok(Self(trimmed.into()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for SourceName {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SourceNameError {
    #[error("source name cannot be empty")]
    Empty,
    #[error("source name exceeds maximum length of 256")]
    TooLong,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceUrl(Arc<str>);

impl SourceUrl {
    pub fn new(url: impl Into<Arc<str>>) -> Result<Self, SourceUrlError> {
        let url: Arc<str> = url.into();
        let trimmed = url.trim();
        if trimmed.is_empty() {
            return Err(SourceUrlError::Empty);
        }
        if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
            return Err(SourceUrlError::InvalidScheme);
        }
        Ok(Self(trimmed.into()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for SourceUrl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SourceUrlError {
    #[error("source url cannot be empty")]
    Empty,
    #[error("source url must use http or https scheme")]
    InvalidScheme,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceType {
    Nxs,
    Legado,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceStatus {
    Active,
    Disabled,
    Blocked,
    Deprecated,
}

impl Default for SourceStatus {
    fn default() -> Self {
        Self::Active
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceCreated {
    pub source_id: SourceId,
    pub name: SourceName,
    pub source_type: SourceType,
    pub base_url: SourceUrl,
    pub policy: SourcePolicy,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceStatusChanged {
    pub source_id: SourceId,
    pub old_status: SourceStatus,
    pub new_status: SourceStatus,
    pub reason: Option<String>,
    pub changed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyUpdated {
    pub source_id: SourceId,
    pub old_policy: SourcePolicy,
    pub new_policy: SourcePolicy,
    pub changed_fields: Vec<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationCompleted {
    pub source_id: SourceId,
    pub validation_report: SourceRuleValidationReport,
    pub readiness_changed: bool,
    pub old_readiness: SourceReadinessState,
    pub new_readiness: SourceReadinessState,
    pub completed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthUpdated {
    pub source_id: SourceId,
    pub old_health: SourceHealthReport,
    pub new_health: SourceHealthReport,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilitiesUpdated {
    pub source_id: SourceId,
    pub old_capabilities: SourceCapabilityMatrix,
    pub new_capabilities: SourceCapabilityMatrix,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPolicyUpdated {
    pub source_id: SourceId,
    pub old_policy: SourceImportPolicy,
    pub new_policy: SourceImportPolicy,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchProfileUpdated {
    pub source_id: SourceId,
    pub old_profile: Option<SourceSearchProfile>,
    pub new_profile: Option<SourceSearchProfile>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagAdded {
    pub source_id: SourceId,
    pub tag: String,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagRemoved {
    pub source_id: SourceId,
    pub tag: String,
    pub removed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataUpdated {
    pub source_id: SourceId,
    pub key: String,
    pub old_value: Option<String>,
    pub new_value: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataRemoved {
    pub source_id: SourceId,
    pub key: String,
    pub old_value: String,
    pub removed_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceDeleted {
    pub source_id: SourceId,
    pub deleted_at: i64,
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
    fn source_id_validation() {
        assert!(SourceId::new("valid-id").is_ok());
        assert!(SourceId::new("").is_err());
        assert!(SourceId::new("invalid/..").is_err());
        assert!(SourceId::new("a".repeat(129)).is_err());
    }

    #[test]
    fn source_name_validation() {
        assert!(SourceName::new("Valid Name").is_ok());
        assert!(SourceName::new("").is_err());
        assert!(SourceName::new("a".repeat(257)).is_err());
    }

    #[test]
    fn source_url_validation() {
        assert!(SourceUrl::new("https://example.com").is_ok());
        assert!(SourceUrl::new("http://example.com").is_ok());
        assert!(SourceUrl::new("").is_err());
        assert!(SourceUrl::new("ftp://example.com").is_err());
    }

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
