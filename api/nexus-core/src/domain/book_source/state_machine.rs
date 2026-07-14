use crate::domain::book_source::value_objects::{SourceReadinessState, SourceStatus};
use crate::types::SourceCapabilityMatrix;
use crate::types::SourceHealthReport;
use crate::types::SourcePolicy;
use crate::types::SourceRuleValidationReport;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatusTransition {
    Enable,
    Disable,
    Block,
    Deprecate,
}

impl StatusTransition {
    pub fn is_valid(&self, from: SourceStatus) -> bool {
        use SourceStatus::*;
        match (from, self) {
            (Disabled, StatusTransition::Enable) => true,
            (Active, StatusTransition::Disable) => true,
            (Active, StatusTransition::Block) => true,
            (Active, StatusTransition::Deprecate) => true,
            (Blocked, StatusTransition::Disable) => true,
            (Blocked, StatusTransition::Deprecate) => true,
            (Deprecated, _) => false,
            _ => false,
        }
    }

    pub fn target_status(&self, from: SourceStatus) -> Option<SourceStatus> {
        if self.is_valid(from) {
            match self {
                StatusTransition::Enable => Some(SourceStatus::Active),
                StatusTransition::Disable => Some(SourceStatus::Disabled),
                StatusTransition::Block => Some(SourceStatus::Blocked),
                StatusTransition::Deprecate => Some(SourceStatus::Deprecated),
            }
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReadinessTransition {
    ToSearchReady,
    ToCatalogReady,
    ToReadingReady,
    ToFullFlowReady,
    ToBlocked,
    ToDraft,
}

impl ReadinessTransition {
    pub fn is_valid(&self, from: SourceReadinessState) -> bool {
        use SourceReadinessState::*;
        match (from, self) {
            (Draft, ReadinessTransition::ToSearchReady) => true,
            (Draft, ReadinessTransition::ToBlocked) => true,
            (SearchReady, ReadinessTransition::ToCatalogReady) => true,
            (SearchReady, ReadinessTransition::ToBlocked) => true,
            (CatalogReady, ReadinessTransition::ToReadingReady) => true,
            (CatalogReady, ReadinessTransition::ToBlocked) => true,
            (ReadingReady, ReadinessTransition::ToFullFlowReady) => true,
            (ReadingReady, ReadinessTransition::ToBlocked) => true,
            (FullFlowReady, ReadinessTransition::ToBlocked) => true,
            (Blocked, ReadinessTransition::ToDraft) => true,
            _ => false,
        }
    }

    pub fn target_readiness(&self, from: SourceReadinessState) -> Option<SourceReadinessState> {
        if self.is_valid(from) {
            use SourceReadinessState::*;
            match self {
                ReadinessTransition::ToSearchReady => Some(SearchReady),
                ReadinessTransition::ToCatalogReady => Some(CatalogReady),
                ReadinessTransition::ToReadingReady => Some(ReadingReady),
                ReadinessTransition::ToFullFlowReady => Some(FullFlowReady),
                ReadinessTransition::ToBlocked => Some(Blocked),
                ReadinessTransition::ToDraft => Some(Draft),
            }
        } else {
            None
        }
    }
}

pub struct ReadinessCalculator;

impl ReadinessCalculator {
    pub fn calculate(report: &SourceRuleValidationReport) -> SourceReadinessState {
        let searchable = matches!(
            report.health.search.status,
            crate::types::SourceHealthStatus::Pass | crate::types::SourceHealthStatus::Warn
        );
        let detail_ready = matches!(
            report.health.book.status,
            crate::types::SourceHealthStatus::Pass | crate::types::SourceHealthStatus::Warn
        );
        let toc_ready = matches!(
            report.health.toc.status,
            crate::types::SourceHealthStatus::Pass | crate::types::SourceHealthStatus::Warn
        );
        let readable = matches!(
            report.health.content.status,
            crate::types::SourceHealthStatus::Pass | crate::types::SourceHealthStatus::Warn
        );
        let importable = report.importable && report.compile_ok;

        if !importable {
            return SourceReadinessState::Blocked;
        }
        if searchable && detail_ready && toc_ready && readable {
            return SourceReadinessState::FullFlowReady;
        }
        if detail_ready && toc_ready && readable {
            return SourceReadinessState::ReadingReady;
        }
        if searchable && detail_ready && toc_ready {
            return SourceReadinessState::CatalogReady;
        }
        if searchable {
            return SourceReadinessState::SearchReady;
        }
        SourceReadinessState::Blocked
    }

    pub fn from_capabilities(capabilities: &SourceCapabilityMatrix) -> SourceReadinessState {
        if capabilities.content_supported
            && capabilities.toc_supported
            && capabilities.book_supported
            && capabilities.search_supported
        {
            SourceReadinessState::FullFlowReady
        } else if capabilities.content_supported
            && capabilities.toc_supported
            && capabilities.book_supported
        {
            SourceReadinessState::ReadingReady
        } else if capabilities.search_supported
            && capabilities.book_supported
            && capabilities.toc_supported
        {
            SourceReadinessState::CatalogReady
        } else if capabilities.search_supported {
            SourceReadinessState::SearchReady
        } else {
            SourceReadinessState::Draft
        }
    }

    pub fn from_policy(policy: &SourcePolicy) -> SourceReadinessState {
        if policy.allows_public_access() {
            SourceReadinessState::SearchReady
        } else {
            SourceReadinessState::Blocked
        }
    }
}

pub struct HealthScoreCalculator;

impl HealthScoreCalculator {
    pub fn calculate(
        success_count: u64,
        failure_count: u64,
        consecutive_failures: u64,
        extraction_score: Option<f64>,
    ) -> f64 {
        let total = success_count + failure_count;
        if total == 0 {
            return 1.0;
        }

        let base_rate = success_count as f64 / total as f64;

        let failure_penalty = (consecutive_failures as f64 * 0.1).min(0.5);

        let extraction_bonus = extraction_score.unwrap_or(0.0) * 0.2;

        (base_rate - failure_penalty + extraction_bonus).clamp(0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_transitions() {
        assert!(StatusTransition::Enable.is_valid(SourceStatus::Disabled));
        assert!(!StatusTransition::Enable.is_valid(SourceStatus::Active));
        assert!(!StatusTransition::Enable.is_valid(SourceStatus::Deprecated));

        assert!(StatusTransition::Disable.is_valid(SourceStatus::Active));
        assert!(!StatusTransition::Disable.is_valid(SourceStatus::Disabled));

        assert!(StatusTransition::Block.is_valid(SourceStatus::Active));
        assert!(!StatusTransition::Block.is_valid(SourceStatus::Blocked));
    }

    #[test]
    fn status_transition_targets() {
        assert_eq!(
            StatusTransition::Enable.target_status(SourceStatus::Disabled),
            Some(SourceStatus::Active)
        );
        assert_eq!(
            StatusTransition::Disable.target_status(SourceStatus::Active),
            Some(SourceStatus::Disabled)
        );
    }

    #[test]
    fn readiness_transitions() {
        assert!(ReadinessTransition::ToSearchReady.is_valid(SourceReadinessState::Draft));
        assert!(!ReadinessTransition::ToCatalogReady.is_valid(SourceReadinessState::Draft));

        assert!(ReadinessTransition::ToCatalogReady.is_valid(SourceReadinessState::SearchReady));
        assert!(!ReadinessTransition::ToReadingReady.is_valid(SourceReadinessState::SearchReady));
    }

    #[test]
    fn readiness_calculator_from_validation() {
        let mut report = SourceRuleValidationReport::default();
        report.compile_ok = true;
        report.importable = true;
        report.health.search.status = crate::types::SourceHealthStatus::Pass;

        let readiness = ReadinessCalculator::calculate(&report);
        assert_eq!(readiness, SourceReadinessState::SearchReady);
    }

    #[test]
    fn health_score_calculator() {
        let score = HealthScoreCalculator::calculate(100, 0, 0, Some(1.0));
        assert!((score - 1.0).abs() < 0.01);

        let score = HealthScoreCalculator::calculate(50, 50, 0, None);
        assert!((score - 0.5).abs() < 0.01);

        let score = HealthScoreCalculator::calculate(10, 90, 5, None);
        assert!(score < 0.2);
    }
}
