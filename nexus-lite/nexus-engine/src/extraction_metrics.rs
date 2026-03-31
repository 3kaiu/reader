//! Extraction quality metrics (per-source).
//!
//! These counters are process-local and intended for operational visibility.

use dashmap::DashMap;
use serde::Serialize;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::LazyLock;

#[derive(Debug, Default, Clone)]
struct Counters {
    success: u64,
    fallback_hits: u64,
    validation_failures: u64,
    rule_mismatch_failures: u64,
    empty_content_failures: u64,
}

impl Counters {
    fn total_failures(&self) -> u64 {
        self.validation_failures + self.rule_mismatch_failures + self.empty_content_failures
    }

    fn total_events(&self) -> u64 {
        self.success + self.total_failures()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceExtractionStats {
    pub source_id: String,
    pub success: u64,
    pub fallback_hits: u64,
    pub validation_failures: u64,
    pub rule_mismatch_failures: u64,
    pub empty_content_failures: u64,
    pub total_failures: u64,
    pub fallback_hit_rate: f64,
    pub success_rate: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailingSourceSummary {
    pub source_id: String,
    pub total_failures: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionSummary {
    pub tracked_sources: usize,
    pub total_success: u64,
    pub total_failures: u64,
    pub overall_success_rate: f64,
    pub overall_fallback_hit_rate: f64,
    pub top_failing_sources: Vec<FailingSourceSummary>,
}

const DEFAULT_MAX_TRACKED_SOURCES: usize = 10_000;
static EXTRACTION_COUNTERS: LazyLock<DashMap<String, Counters>> = LazyLock::new(DashMap::new);
static MAX_TRACKED_SOURCES: AtomicUsize = AtomicUsize::new(DEFAULT_MAX_TRACKED_SOURCES);

pub fn configure_max_tracked_sources(max_sources: usize) {
    MAX_TRACKED_SOURCES.store(max_sources.max(1), Ordering::Relaxed);
}

fn evict_cold_sources(remove_count: usize) {
    if remove_count == 0 {
        return;
    }

    let mut candidates = EXTRACTION_COUNTERS
        .iter()
        .map(|entry| (entry.key().clone(), entry.value().total_events()))
        .collect::<Vec<_>>();

    candidates.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)));

    for (source_id, _) in candidates.into_iter().take(remove_count) {
        EXTRACTION_COUNTERS.remove(&source_id);
    }
}

fn ensure_capacity_for(source_id: &str) {
    if EXTRACTION_COUNTERS.contains_key(source_id) {
        return;
    }

    let cap = MAX_TRACKED_SOURCES.load(Ordering::Relaxed).max(1);
    let len = EXTRACTION_COUNTERS.len();
    if len < cap {
        return;
    }

    let overflow = len.saturating_add(1).saturating_sub(cap);
    evict_cold_sources(overflow.max(1));
}

fn with_source<F>(source_id: &str, f: F)
where
    F: FnOnce(&mut Counters),
{
    ensure_capacity_for(source_id);
    let mut entry = EXTRACTION_COUNTERS
        .entry(source_id.to_string())
        .or_default();
    f(entry.value_mut());
}

pub fn record_success(source_id: &str, used_fallback: bool) {
    with_source(source_id, |c| {
        c.success += 1;
        if used_fallback {
            c.fallback_hits += 1;
        }
    });
}

pub fn record_validation_failure(source_id: &str) {
    with_source(source_id, |c| {
        c.validation_failures += 1;
    });
}

pub fn record_rule_mismatch_failure(source_id: &str) {
    with_source(source_id, |c| {
        c.rule_mismatch_failures += 1;
    });
}

pub fn record_empty_content_failure(source_id: &str) {
    with_source(source_id, |c| {
        c.empty_content_failures += 1;
    });
}

pub fn snapshot() -> Vec<SourceExtractionStats> {
    let mut items = EXTRACTION_COUNTERS
        .iter()
        .map(|entry| {
            let source_id = entry.key().clone();
            let c = entry.value().clone();
            let total_failures = c.total_failures();
            let total = c.success + total_failures;
            let fallback_hit_rate = if c.success > 0 {
                c.fallback_hits as f64 / c.success as f64
            } else {
                0.0
            };
            let success_rate = if total > 0 {
                c.success as f64 / total as f64
            } else {
                0.0
            };

            SourceExtractionStats {
                source_id,
                success: c.success,
                fallback_hits: c.fallback_hits,
                validation_failures: c.validation_failures,
                rule_mismatch_failures: c.rule_mismatch_failures,
                empty_content_failures: c.empty_content_failures,
                total_failures,
                fallback_hit_rate,
                success_rate,
            }
        })
        .collect::<Vec<_>>();
    items.sort_by(|a, b| a.source_id.cmp(&b.source_id));
    items
}

pub fn summary(top_n: usize) -> ExtractionSummary {
    let stats = snapshot();
    let tracked_sources = stats.len();
    let total_success = stats.iter().map(|s| s.success).sum::<u64>();
    let total_failures = stats.iter().map(|s| s.total_failures).sum::<u64>();
    let total_events = total_success + total_failures;
    let overall_success_rate = if total_events > 0 {
        total_success as f64 / total_events as f64
    } else {
        0.0
    };
    let overall_fallback_hit_rate = if total_success > 0 {
        stats.iter().map(|s| s.fallback_hits).sum::<u64>() as f64 / total_success as f64
    } else {
        0.0
    };

    let mut failing = stats
        .iter()
        .filter(|s| s.total_failures > 0)
        .map(|s| FailingSourceSummary {
            source_id: s.source_id.clone(),
            total_failures: s.total_failures,
        })
        .collect::<Vec<_>>();
    failing.sort_by(|a, b| {
        b.total_failures
            .cmp(&a.total_failures)
            .then_with(|| a.source_id.cmp(&b.source_id))
    });
    failing.truncate(top_n);

    ExtractionSummary {
        tracked_sources,
        total_success,
        total_failures,
        overall_success_rate,
        overall_fallback_hit_rate,
        top_failing_sources: failing,
    }
}

#[cfg(test)]
pub fn reset_for_tests() {
    EXTRACTION_COUNTERS.clear();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{LazyLock, Mutex};

    static TEST_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

    #[test]
    fn test_metrics_record_and_snapshot() {
        let _guard = TEST_LOCK.lock().expect("test lock poisoned");
        reset_for_tests();
        configure_max_tracked_sources(10_000);

        let source_id = "unit_test_source";

        record_success(source_id, false);
        record_success(source_id, true);
        record_validation_failure(source_id);
        record_rule_mismatch_failure(source_id);
        record_empty_content_failure(source_id);

        let stats = snapshot()
            .into_iter()
            .find(|it| it.source_id == source_id)
            .expect("source stats should exist");

        assert_eq!(stats.success, 2);
        assert_eq!(stats.fallback_hits, 1);
        assert_eq!(stats.validation_failures, 1);
        assert_eq!(stats.rule_mismatch_failures, 1);
        assert_eq!(stats.empty_content_failures, 1);
        assert_eq!(stats.total_failures, 3);
        assert!((stats.fallback_hit_rate - 0.5).abs() < f64::EPSILON);
        assert!((stats.success_rate - 0.4).abs() < f64::EPSILON);
    }

    #[test]
    fn test_metrics_cap_evicts_cold_sources() {
        let _guard = TEST_LOCK.lock().expect("test lock poisoned");
        reset_for_tests();
        configure_max_tracked_sources(2);

        record_success("hot_source", false);
        record_success("hot_source", false);
        record_success("cold_source", false);
        record_success("new_source", false);

        let ids = snapshot()
            .into_iter()
            .map(|s| s.source_id)
            .collect::<Vec<_>>();

        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"hot_source".to_string()));
        assert!(ids.contains(&"new_source".to_string()));

        configure_max_tracked_sources(10_000);
        reset_for_tests();
    }
}
