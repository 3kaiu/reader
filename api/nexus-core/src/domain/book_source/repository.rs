use crate::domain::book_source::aggregate::{BookSource, BookSourceSnapshot};
use crate::domain::book_source::value_objects::*;
use crate::types::SourceReadinessState;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[async_trait]
pub trait BookSourceRepository: Send + Sync {
    async fn save(&self, source: &BookSource) -> Result<(), BookSourceRepositoryError>;

    async fn find_by_id(
        &self,
        id: &SourceId,
    ) -> Result<Option<BookSource>, BookSourceRepositoryError>;

    async fn find_all(&self) -> Result<Vec<BookSource>, BookSourceRepositoryError>;

    async fn find_by_status(
        &self,
        status: SourceStatus,
    ) -> Result<Vec<BookSource>, BookSourceRepositoryError>;

    async fn find_by_type(
        &self,
        source_type: SourceType,
    ) -> Result<Vec<BookSource>, BookSourceRepositoryError>;

    async fn delete(&self, id: &SourceId) -> Result<bool, BookSourceRepositoryError>;

    async fn exists(&self, id: &SourceId) -> Result<bool, BookSourceRepositoryError>;

    async fn count(&self) -> Result<usize, BookSourceRepositoryError>;
}

#[derive(Debug, thiserror::Error)]
pub enum BookSourceRepositoryError {
    #[error("source not found: {0}")]
    NotFound(String),
    #[error("concurrency conflict: version {expected} but found {actual}")]
    ConcurrencyConflict { expected: u64, actual: u64 },
    #[error("storage error: {0}")]
    Storage(String),
    #[error("invalid argument: {0}")]
    InvalidArgument(String),
}

impl From<std::io::Error> for BookSourceRepositoryError {
    fn from(e: std::io::Error) -> Self {
        Self::Storage(e.to_string())
    }
}

#[async_trait]
pub trait BookSourceReadModel: Send + Sync {
    async fn get_summary(
        &self,
        id: &SourceId,
    ) -> Result<Option<BookSourceSummary>, BookSourceReadModelError>;

    async fn list_summaries(
        &self,
        filter: Option<BookSourceFilter>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<BookSourceSummary>, BookSourceReadModelError>;

    async fn count(
        &self,
        filter: Option<BookSourceFilter>,
    ) -> Result<usize, BookSourceReadModelError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookSourceSummary {
    pub id: SourceId,
    pub name: SourceName,
    pub source_type: SourceType,
    pub base_url: SourceUrl,
    pub status: SourceStatus,
    pub readiness: SourceReadinessState,
    pub is_healthy: bool,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BookSourceFilter {
    pub status: Option<SourceStatus>,
    pub source_type: Option<SourceType>,
    pub readiness: Option<SourceReadinessState>,
    pub tags: Vec<String>,
    pub search_query: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum BookSourceReadModelError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("storage error: {0}")]
    Storage(String),
}

pub trait BookSourceEventPublisher: Send + Sync {
    fn publish_created(&self, source: &BookSourceSnapshot);
    fn publish_updated(&self, source: &BookSourceSnapshot, changed_fields: Vec<String>);
    fn publish_deleted(&self, id: &SourceId);
    fn publish_status_changed(
        &self,
        id: &SourceId,
        old_status: SourceStatus,
        new_status: SourceStatus,
    );
    fn publish_readiness_changed(
        &self,
        id: &SourceId,
        old_readiness: SourceReadinessState,
        new_readiness: SourceReadinessState,
    );
    fn publish_validation_completed(
        &self,
        id: &SourceId,
        report: &crate::types::SourceRuleValidationReport,
    );
}

impl<T: BookSourceEventPublisher + ?Sized> BookSourceEventPublisher for Box<T> {
    fn publish_created(&self, source: &BookSourceSnapshot) {
        (**self).publish_created(source)
    }
    fn publish_updated(&self, source: &BookSourceSnapshot, changed_fields: Vec<String>) {
        (**self).publish_updated(source, changed_fields)
    }
    fn publish_deleted(&self, id: &SourceId) {
        (**self).publish_deleted(id)
    }
    fn publish_status_changed(
        &self,
        id: &SourceId,
        old_status: SourceStatus,
        new_status: SourceStatus,
    ) {
        (**self).publish_status_changed(id, old_status, new_status)
    }
    fn publish_readiness_changed(
        &self,
        id: &SourceId,
        old_readiness: SourceReadinessState,
        new_readiness: SourceReadinessState,
    ) {
        (**self).publish_readiness_changed(id, old_readiness, new_readiness)
    }
    fn publish_validation_completed(
        &self,
        id: &SourceId,
        report: &crate::types::SourceRuleValidationReport,
    ) {
        (**self).publish_validation_completed(id, report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filter_defaults() {
        let filter = BookSourceFilter::default();
        assert!(filter.status.is_none());
        assert!(filter.source_type.is_none());
        assert!(filter.readiness.is_none());
        assert!(filter.tags.is_empty());
        assert!(filter.search_query.is_none());
    }
}
