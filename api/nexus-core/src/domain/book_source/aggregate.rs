use crate::domain::book_source::events::*;
use crate::domain::book_source::value_objects::*;
use crate::types::{
    SourceCapabilityMatrix, SourceHealthReport, SourceImportPolicy, SourcePolicy,
    SourceReadinessReport, SourceReadinessState, SourceRuleValidationReport, SourceSearchProfile,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookSource {
    id: SourceId,
    source_type: SourceType,
    name: SourceName,
    base_url: SourceUrl,
    status: SourceStatus,
    readiness: SourceReadinessState,
    policy: SourcePolicy,
    health: SourceHealthReport,
    validation_report: Option<SourceRuleValidationReport>,
    readiness_report: SourceReadinessReport,
    capabilities: SourceCapabilityMatrix,
    import_policy: SourceImportPolicy,
    search_profile: Option<SourceSearchProfile>,
    tags: Vec<String>,
    metadata: HashMap<String, String>,
    version: u64,
    created_at: i64,
    updated_at: i64,
    deleted_at: Option<i64>,
    pending_events: Vec<BookSourceEvent>,
}

impl BookSource {
    pub fn new_nxs(
        id: SourceId,
        name: SourceName,
        base_url: SourceUrl,
        policy: SourcePolicy,
    ) -> Result<Self, BookSourceError> {
        let now = current_timestamp();
        Ok(Self {
            id,
            source_type: SourceType::Nxs,
            name,
            base_url,
            status: SourceStatus::Active,
            readiness: SourceReadinessState::Draft,
            policy,
            health: SourceHealthReport::default(),
            validation_report: None,
            readiness_report: SourceReadinessReport::default(),
            capabilities: SourceCapabilityMatrix::default(),
            import_policy: SourceImportPolicy::default(),
            search_profile: None,
            tags: Vec::new(),
            metadata: HashMap::new(),
            version: 1,
            created_at: now,
            updated_at: now,
            deleted_at: None,
            pending_events: Vec::new(),
        })
    }

    pub fn new_legado(
        id: SourceId,
        name: SourceName,
        base_url: SourceUrl,
        policy: SourcePolicy,
    ) -> Result<Self, BookSourceError> {
        let now = current_timestamp();
        Ok(Self {
            id,
            source_type: SourceType::Legado,
            name,
            base_url,
            status: SourceStatus::Active,
            readiness: SourceReadinessState::Draft,
            policy,
            health: SourceHealthReport::default(),
            validation_report: None,
            readiness_report: SourceReadinessReport::default(),
            capabilities: SourceCapabilityMatrix::default(),
            import_policy: SourceImportPolicy::default(),
            search_profile: None,
            tags: Vec::new(),
            metadata: HashMap::new(),
            version: 1,
            created_at: now,
            updated_at: now,
            deleted_at: None,
            pending_events: Vec::new(),
        })
    }

    pub fn from_snapshot(snapshot: BookSourceSnapshot) -> Self {
        let mut source = Self {
            id: snapshot.id,
            source_type: snapshot.source_type,
            name: snapshot.name,
            base_url: snapshot.base_url,
            status: snapshot.status,
            readiness: snapshot.readiness,
            policy: snapshot.policy,
            health: snapshot.health,
            validation_report: snapshot.validation_report,
            readiness_report: snapshot.readiness_report,
            capabilities: snapshot.capabilities,
            import_policy: snapshot.import_policy,
            search_profile: snapshot.search_profile,
            tags: snapshot.tags,
            metadata: snapshot.metadata,
            version: snapshot.version,
            created_at: snapshot.created_at,
            updated_at: snapshot.updated_at,
            deleted_at: snapshot.deleted_at,
            pending_events: Vec::new(),
        };

        if source.deleted_at.is_some() {
            source.mark_deleted();
        }

        source
    }

    pub fn id(&self) -> &SourceId {
        &self.id
    }

    pub fn source_type(&self) -> SourceType {
        self.source_type
    }

    pub fn name(&self) -> &SourceName {
        &self.name
    }

    pub fn base_url(&self) -> &SourceUrl {
        &self.base_url
    }

    pub fn status(&self) -> SourceStatus {
        self.status
    }

    pub fn readiness(&self) -> SourceReadinessState {
        self.readiness
    }

    pub fn policy(&self) -> &SourcePolicy {
        &self.policy
    }

    pub fn health(&self) -> &SourceHealthReport {
        &self.health
    }

    pub fn validation_report(&self) -> Option<&SourceRuleValidationReport> {
        self.validation_report.as_ref()
    }

    pub fn readiness_report(&self) -> &SourceReadinessReport {
        &self.readiness_report
    }

    pub fn capabilities(&self) -> &SourceCapabilityMatrix {
        &self.capabilities
    }

    pub fn import_policy(&self) -> &SourceImportPolicy {
        &self.import_policy
    }

    pub fn search_profile(&self) -> Option<&SourceSearchProfile> {
        self.search_profile.as_ref()
    }

    pub fn tags(&self) -> &[String] {
        &self.tags
    }

    pub fn metadata(&self) -> &HashMap<String, String> {
        &self.metadata
    }

    pub fn version(&self) -> u64 {
        self.version
    }

    pub fn created_at(&self) -> i64 {
        self.created_at
    }

    pub fn updated_at(&self) -> i64 {
        self.updated_at
    }

    pub fn is_deleted(&self) -> bool {
        self.deleted_at.is_some()
    }

    pub fn can_search(&self) -> bool {
        matches!(
            self.readiness,
            SourceReadinessState::SearchReady
                | SourceReadinessState::CatalogReady
                | SourceReadinessState::ReadingReady
                | SourceReadinessState::FullFlowReady
        ) && self.status == SourceStatus::Active
    }

    pub fn can_read(&self) -> bool {
        matches!(
            self.readiness,
            SourceReadinessState::ReadingReady | SourceReadinessState::FullFlowReady
        ) && self.status == SourceStatus::Active
    }

    pub fn is_fully_ready(&self) -> bool {
        self.readiness == SourceReadinessState::FullFlowReady && self.status == SourceStatus::Active
    }

    pub fn enable(&mut self) -> Result<SourceStatusChanged, BookSourceError> {
        if self.status == SourceStatus::Active {
            return Err(BookSourceError::AlreadyActive);
        }
        if self.status == SourceStatus::Deprecated {
            return Err(BookSourceError::CannotActivateDeprecated);
        }
        if self.status == SourceStatus::Blocked {
            return Err(BookSourceError::CannotActivateBlocked);
        }

        let old_status = self.status;
        self.status = SourceStatus::Active;
        self.touch();

        let event = SourceStatusChanged {
            source_id: self.id.clone(),
            old_status,
            new_status: SourceStatus::Active,
            reason: None,
            changed_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::StatusChanged(event.clone()));

        Ok(event)
    }

    pub fn disable(
        &mut self,
        reason: Option<String>,
    ) -> Result<SourceStatusChanged, BookSourceError> {
        if self.status == SourceStatus::Disabled {
            return Err(BookSourceError::AlreadyDisabled);
        }
        if self.status == SourceStatus::Deprecated {
            return Err(BookSourceError::CannotDisableDeprecated);
        }

        let old_status = self.status;
        self.status = SourceStatus::Disabled;
        if let Some(r) = &reason {
            self.metadata
                .insert("disable_reason".to_string(), r.clone());
        }
        self.touch();

        let event = SourceStatusChanged {
            source_id: self.id.clone(),
            old_status,
            new_status: SourceStatus::Disabled,
            reason: reason.clone(),
            changed_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::StatusChanged(event.clone()));

        Ok(event)
    }

    pub fn block(&mut self, reason: String) -> Result<SourceStatusChanged, BookSourceError> {
        if self.status == SourceStatus::Blocked {
            return Err(BookSourceError::AlreadyBlocked);
        }

        let old_status = self.status;
        self.status = SourceStatus::Blocked;
        self.metadata
            .insert("block_reason".to_string(), reason.clone());
        self.touch();

        let event = SourceStatusChanged {
            source_id: self.id.clone(),
            old_status,
            new_status: SourceStatus::Blocked,
            reason: Some(reason),
            changed_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::StatusChanged(event.clone()));

        Ok(event)
    }

    pub fn deprecate(&mut self, reason: String) -> Result<SourceStatusChanged, BookSourceError> {
        if self.status == SourceStatus::Deprecated {
            return Err(BookSourceError::AlreadyDeprecated);
        }

        let old_status = self.status;
        self.status = SourceStatus::Deprecated;
        self.metadata
            .insert("deprecate_reason".to_string(), reason.clone());
        self.touch();

        let event = SourceStatusChanged {
            source_id: self.id.clone(),
            old_status,
            new_status: SourceStatus::Deprecated,
            reason: Some(reason),
            changed_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::StatusChanged(event.clone()));

        Ok(event)
    }

    pub fn update_policy(
        &mut self,
        policy: SourcePolicy,
    ) -> Result<PolicyUpdated, BookSourceError> {
        if self.policy == policy {
            return Err(BookSourceError::PolicyUnchanged);
        }

        let old_policy = self.policy.clone();
        let changed_fields = vec!["policy".to_string()];
        self.policy = policy;
        self.touch();

        let event = PolicyUpdated {
            source_id: self.id.clone(),
            old_policy,
            new_policy: self.policy.clone(),
            changed_fields,
            updated_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::PolicyUpdated(event.clone()));

        Ok(event)
    }

    pub fn update_validation_report(
        &mut self,
        report: SourceRuleValidationReport,
    ) -> Result<ValidationCompleted, BookSourceError> {
        if let Some(existing) = &self.validation_report {
            if existing == &report {
                return Err(BookSourceError::ValidationReportUnchanged);
            }
        }

        let old_readiness = self.readiness;
        self.validation_report = Some(report.clone());
        self.readiness_report = SourceReadinessReport::from_validation(&report);
        self.readiness = self.readiness_report.state;
        self.touch();

        let readiness_changed = old_readiness != self.readiness;
        let event = ValidationCompleted {
            source_id: self.id.clone(),
            validation_report: report,
            readiness_changed,
            old_readiness,
            new_readiness: self.readiness,
            completed_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::ValidationCompleted(event.clone()));

        Ok(event)
    }

    pub fn update_health(
        &mut self,
        health: SourceHealthReport,
    ) -> Result<HealthUpdated, BookSourceError> {
        if self.health == health {
            return Err(BookSourceError::HealthUnchanged);
        }

        let old_health = self.health.clone();
        self.health = health;
        self.touch();

        let event = HealthUpdated {
            source_id: self.id.clone(),
            old_health,
            new_health: self.health.clone(),
            updated_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::HealthUpdated(event.clone()));

        Ok(event)
    }

    pub fn update_capabilities(
        &mut self,
        capabilities: SourceCapabilityMatrix,
    ) -> Result<CapabilitiesUpdated, BookSourceError> {
        if self.capabilities == capabilities {
            return Err(BookSourceError::CapabilitiesUnchanged);
        }

        let old_capabilities = self.capabilities.clone();
        self.capabilities = capabilities;
        self.touch();

        let event = CapabilitiesUpdated {
            source_id: self.id.clone(),
            old_capabilities,
            new_capabilities: self.capabilities.clone(),
            updated_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::CapabilitiesUpdated(event.clone()));

        Ok(event)
    }

    pub fn update_import_policy(
        &mut self,
        policy: SourceImportPolicy,
    ) -> Result<ImportPolicyUpdated, BookSourceError> {
        if self.import_policy == policy {
            return Err(BookSourceError::ImportPolicyUnchanged);
        }

        let old_policy = self.import_policy.clone();
        self.import_policy = policy;
        self.touch();

        let event = ImportPolicyUpdated {
            source_id: self.id.clone(),
            old_policy,
            new_policy: self.import_policy.clone(),
            updated_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::ImportPolicyUpdated(event.clone()));

        Ok(event)
    }

    pub fn update_search_profile(
        &mut self,
        profile: Option<SourceSearchProfile>,
    ) -> Result<SearchProfileUpdated, BookSourceError> {
        if self.search_profile == profile {
            return Err(BookSourceError::SearchProfileUnchanged);
        }

        let old_profile = self.search_profile.clone();
        self.search_profile = profile;
        self.touch();

        let event = SearchProfileUpdated {
            source_id: self.id.clone(),
            old_profile,
            new_profile: self.search_profile.clone(),
            updated_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::SearchProfileUpdated(event.clone()));

        Ok(event)
    }

    pub fn add_tag(&mut self, tag: String) -> Result<TagAdded, BookSourceError> {
        let normalized = tag.trim().to_lowercase();
        if normalized.is_empty() {
            return Err(BookSourceError::EmptyTag);
        }
        if normalized.len() > 64 {
            return Err(BookSourceError::TagTooLong);
        }
        if self
            .tags
            .iter()
            .any(|t| t.eq_ignore_ascii_case(&normalized))
        {
            return Err(BookSourceError::TagAlreadyExists);
        }

        self.tags.push(normalized.clone());
        self.touch();

        let event = TagAdded {
            source_id: self.id.clone(),
            tag: normalized.clone(),
            added_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::TagAdded(event.clone()));

        Ok(event)
    }

    pub fn remove_tag(&mut self, tag: &str) -> Result<TagRemoved, BookSourceError> {
        let normalized = tag.trim().to_lowercase();
        let index = self
            .tags
            .iter()
            .position(|t| t.eq_ignore_ascii_case(&normalized))
            .ok_or(BookSourceError::TagNotFound)?;

        let removed = self.tags.remove(index);
        self.touch();

        let event = TagRemoved {
            source_id: self.id.clone(),
            tag: removed.clone(),
            removed_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::TagRemoved(event.clone()));

        Ok(event)
    }

    pub fn set_metadata(
        &mut self,
        key: String,
        value: String,
    ) -> Result<MetadataUpdated, BookSourceError> {
        if key.is_empty() || key.len() > 128 {
            return Err(BookSourceError::InvalidMetadataKey);
        }
        if value.len() > 1024 {
            return Err(BookSourceError::MetadataValueTooLong);
        }

        let old_value = self.metadata.insert(key.clone(), value.clone());
        self.touch();

        let event = MetadataUpdated {
            source_id: self.id.clone(),
            key,
            old_value,
            new_value: value,
            updated_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::MetadataUpdated(event.clone()));

        Ok(event)
    }

    pub fn remove_metadata(&mut self, key: &str) -> Result<MetadataRemoved, BookSourceError> {
        let removed = self
            .metadata
            .remove(key)
            .ok_or(BookSourceError::MetadataKeyNotFound)?;
        self.touch();

        let event = MetadataRemoved {
            source_id: self.id.clone(),
            key: key.to_string(),
            old_value: removed,
            removed_at: current_timestamp(),
        };
        self.pending_events
            .push(BookSourceEvent::MetadataRemoved(event.clone()));

        Ok(event)
    }

    pub fn mark_deleted(&mut self) {
        if self.deleted_at.is_none() {
            self.deleted_at = Some(current_timestamp());
            self.status = SourceStatus::Deprecated;
            self.touch();
        }
    }

    pub fn take_pending_events(&mut self) -> Vec<BookSourceEvent> {
        std::mem::take(&mut self.pending_events)
    }

    pub fn pending_events(&self) -> &[BookSourceEvent] {
        &self.pending_events
    }

    pub fn to_snapshot(&self) -> BookSourceSnapshot {
        BookSourceSnapshot {
            id: self.id.clone(),
            source_type: self.source_type,
            name: self.name.clone(),
            base_url: self.base_url.clone(),
            status: self.status,
            readiness: self.readiness,
            policy: self.policy.clone(),
            health: self.health.clone(),
            validation_report: self.validation_report.clone(),
            readiness_report: self.readiness_report.clone(),
            capabilities: self.capabilities.clone(),
            import_policy: self.import_policy.clone(),
            search_profile: self.search_profile.clone(),
            tags: self.tags.clone(),
            metadata: self.metadata.clone(),
            version: self.version,
            created_at: self.created_at,
            updated_at: self.updated_at,
            deleted_at: self.deleted_at,
        }
    }

    fn touch(&mut self) {
        self.version += 1;
        self.updated_at = current_timestamp();
    }
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookSourceSnapshot {
    pub id: SourceId,
    pub source_type: SourceType,
    pub name: SourceName,
    pub base_url: SourceUrl,
    pub status: SourceStatus,
    pub readiness: SourceReadinessState,
    pub policy: SourcePolicy,
    pub health: SourceHealthReport,
    pub validation_report: Option<SourceRuleValidationReport>,
    pub readiness_report: SourceReadinessReport,
    pub capabilities: SourceCapabilityMatrix,
    pub import_policy: SourceImportPolicy,
    pub search_profile: Option<SourceSearchProfile>,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, String>,
    pub version: u64,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, thiserror::Error)]
pub enum BookSourceError {
    #[error("source is already active")]
    AlreadyActive,
    #[error("source is already disabled")]
    AlreadyDisabled,
    #[error("source is already blocked")]
    AlreadyBlocked,
    #[error("source is already deprecated")]
    AlreadyDeprecated,
    #[error("cannot activate deprecated source")]
    CannotActivateDeprecated,
    #[error("cannot activate blocked source")]
    CannotActivateBlocked,
    #[error("cannot disable deprecated source")]
    CannotDisableDeprecated,
    #[error("policy unchanged")]
    PolicyUnchanged,
    #[error("validation report unchanged")]
    ValidationReportUnchanged,
    #[error("health unchanged")]
    HealthUnchanged,
    #[error("capabilities unchanged")]
    CapabilitiesUnchanged,
    #[error("import policy unchanged")]
    ImportPolicyUnchanged,
    #[error("search profile unchanged")]
    SearchProfileUnchanged,
    #[error("empty tag")]
    EmptyTag,
    #[error("tag too long (max 64)")]
    TagTooLong,
    #[error("tag already exists")]
    TagAlreadyExists,
    #[error("tag not found")]
    TagNotFound,
    #[error("invalid metadata key (max 128)")]
    InvalidMetadataKey,
    #[error("metadata value too long (max 1024)")]
    MetadataValueTooLong,
    #[error("metadata key not found")]
    MetadataKeyNotFound,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_nxs_source() {
        let id = SourceId::new("test-source").unwrap();
        let name = SourceName::new("Test Source").unwrap();
        let url = SourceUrl::new("https://example.com").unwrap();
        let policy = SourcePolicy::default();

        let source =
            BookSource::new_nxs(id.clone(), name.clone(), url.clone(), policy.clone()).unwrap();

        assert_eq!(source.id(), &id);
        assert_eq!(source.name(), &name);
        assert_eq!(source.base_url(), &url);
        assert_eq!(source.source_type(), SourceType::Nxs);
        assert_eq!(source.status(), SourceStatus::Active);
        assert_eq!(source.readiness(), SourceReadinessState::Draft);
    }

    #[test]
    fn create_legado_source() {
        let id = SourceId::new("legado-source").unwrap();
        let name = SourceName::new("Legado Source").unwrap();
        let url = SourceUrl::new("https://legado.example.com").unwrap();
        let policy = SourcePolicy::default();

        let source =
            BookSource::new_legado(id.clone(), name.clone(), url.clone(), policy.clone()).unwrap();

        assert_eq!(source.source_type(), SourceType::Legado);
    }

    #[test]
    fn status_transitions() {
        let id = SourceId::new("test").unwrap();
        let name = SourceName::new("Test").unwrap();
        let url = SourceUrl::new("https://example.com").unwrap();
        let policy = SourcePolicy::default();

        let mut source = BookSource::new_nxs(id.clone(), name, url, policy).unwrap();

        // Already active
        assert!(source.enable().is_err());

        // Disable
        let result = source.disable(Some("maintenance".to_string())).unwrap();
        assert_eq!(result.old_status, SourceStatus::Active);
        assert_eq!(result.new_status, SourceStatus::Disabled);
        assert_eq!(source.status(), SourceStatus::Disabled);

        // Already disabled
        assert!(source.disable(None).is_err());

        // Enable again
        let result = source.enable().unwrap();
        assert_eq!(result.new_status, SourceStatus::Active);

        // Block
        let result = source.block("spam".to_string()).unwrap();
        assert_eq!(result.new_status, SourceStatus::Blocked);
        assert_eq!(source.status(), SourceStatus::Blocked);

        // Cannot enable blocked
        assert!(source.enable().is_err());

        // Deprecate
        let result = source.deprecate("end of life".to_string()).unwrap();
        assert_eq!(result.new_status, SourceStatus::Deprecated);
        assert_eq!(source.status(), SourceStatus::Deprecated);

        // Cannot activate deprecated
        assert!(source.enable().is_err());
    }

    #[test]
    fn tag_management() {
        let id = SourceId::new("test").unwrap();
        let name = SourceName::new("Test").unwrap();
        let url = SourceUrl::new("https://example.com").unwrap();
        let policy = SourcePolicy::default();

        let mut source = BookSource::new_nxs(id.clone(), name, url, policy).unwrap();

        // Add tag
        let result = source.add_tag("fantasy".to_string()).unwrap();
        assert_eq!(result.tag, "fantasy");
        assert!(source.tags().contains(&"fantasy".to_string()));

        // Add duplicate (case insensitive)
        assert!(source.add_tag("FANTASY".to_string()).is_err());

        // Add empty
        assert!(source.add_tag("  ".to_string()).is_err());

        // Remove tag
        let result = source.remove_tag("fantasy").unwrap();
        assert_eq!(result.tag, "fantasy");
        assert!(!source.tags().contains(&"fantasy".to_string()));

        // Remove non-existent
        assert!(source.remove_tag("nonexistent").is_err());
    }

    #[test]
    fn metadata_management() {
        let id = SourceId::new("test").unwrap();
        let name = SourceName::new("Test").unwrap();
        let url = SourceUrl::new("https://example.com").unwrap();
        let policy = SourcePolicy::default();

        let mut source = BookSource::new_nxs(id.clone(), name, url, policy).unwrap();

        // Set metadata
        let result = source
            .set_metadata("author".to_string(), "John Doe".to_string())
            .unwrap();
        assert_eq!(result.key, "author");
        assert_eq!(result.new_value, "John Doe");
        assert_eq!(result.old_value, None);
        assert_eq!(source.metadata().get("author"), Some(&"John Doe".to_string()));

        // Update metadata
        let result = source
            .set_metadata("author".to_string(), "Jane Doe".to_string())
            .unwrap();
        assert_eq!(result.old_value, Some("John Doe".to_string()));
        assert_eq!(result.new_value, "Jane Doe");

        // Remove metadata
        let result = source.remove_metadata("author").unwrap();
        assert_eq!(result.old_value, "Jane Doe");
        assert!(!source.metadata().contains_key("author"));

        // Remove non-existent
        assert!(source.remove_metadata("nonexistent").is_err());
    }

    #[test]
    fn validation_and_readiness() {
        let id = SourceId::new("test").unwrap();
        let name = SourceName::new("Test").unwrap();
        let url = SourceUrl::new("https://example.com").unwrap();
        let policy = SourcePolicy::default();

        let mut source = BookSource::new_nxs(id.clone(), name, url, policy).unwrap();

        // Initially draft
        assert_eq!(source.readiness(), SourceReadinessState::Draft);

        // Update validation report with search passing
        let mut report = SourceRuleValidationReport::default();
        report.compile_ok = true;
        report.importable = true;
        report.health.search.status = crate::types::SourceHealthStatus::Pass;

        let result = source.update_validation_report(report.clone()).unwrap();
        assert_eq!(source.readiness(), SourceReadinessState::SearchReady);
        assert!(result.readiness_changed);

        // Update with more passing
        report.health.book.status = crate::types::SourceHealthStatus::Pass;
        report.health.toc.status = crate::types::SourceHealthStatus::Pass;

        let result = source.update_validation_report(report.clone()).unwrap();
        assert_eq!(source.readiness(), SourceReadinessState::CatalogReady);

        // Full flow ready
        report.health.content.status = crate::types::SourceHealthStatus::Pass;
        let result = source.update_validation_report(report).unwrap();
        assert_eq!(source.readiness(), SourceReadinessState::FullFlowReady);
    }
}
