//! Execution Statistics - Monitor native vs JS execution ratio
//!
//! This module tracks execution statistics to help optimize the engine
//! by identifying which patterns are most commonly used.

use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;

/// Global execution statistics
pub static STATS: Lazy<ExecutionStats> = Lazy::new(ExecutionStats::new);

/// Execution statistics tracker
pub struct ExecutionStats {
    /// Number of native API executions
    pub native_calls: AtomicU64,
    /// Number of JavaScript executions
    pub js_calls: AtomicU64,
    /// Number of successful native pattern matches
    pub pattern_matches: AtomicU64,
    /// Number of pattern match failures (fallback to JS)
    pub pattern_misses: AtomicU64,
    /// Per-API call counts
    api_counts: RwLock<HashMap<String, u64>>,
}

impl ExecutionStats {
    pub fn new() -> Self {
        Self {
            native_calls: AtomicU64::new(0),
            js_calls: AtomicU64::new(0),
            pattern_matches: AtomicU64::new(0),
            pattern_misses: AtomicU64::new(0),
            api_counts: RwLock::new(HashMap::new()),
        }
    }

    /// Record a native API call
    pub fn record_native(&self, api_name: &str) {
        self.native_calls.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut counts) = self.api_counts.write() {
            *counts.entry(api_name.to_string()).or_insert(0) += 1;
        }
    }

    /// Record a JavaScript execution
    pub fn record_js(&self) {
        self.js_calls.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a successful pattern match
    pub fn record_pattern_match(&self) {
        self.pattern_matches.fetch_add(1, Ordering::Relaxed);
    }

    /// Record a pattern match failure
    pub fn record_pattern_miss(&self) {
        self.pattern_misses.fetch_add(1, Ordering::Relaxed);
    }

    /// Get current statistics snapshot
    pub fn snapshot(&self) -> StatsSnapshot {
        let native = self.native_calls.load(Ordering::Relaxed);
        let js = self.js_calls.load(Ordering::Relaxed);
        let matches = self.pattern_matches.load(Ordering::Relaxed);
        let misses = self.pattern_misses.load(Ordering::Relaxed);

        let total = native + js;
        let native_ratio = if total > 0 {
            (native as f64 / total as f64 * 100.0).round() / 100.0
        } else {
            0.0
        };

        let pattern_total = matches + misses;
        let pattern_match_ratio = if pattern_total > 0 {
            (matches as f64 / pattern_total as f64 * 100.0).round() / 100.0
        } else {
            0.0
        };

        let top_apis = self
            .api_counts
            .read()
            .map(|counts| {
                let mut sorted: Vec<_> = counts.iter().map(|(k, v)| (k.clone(), *v)).collect();
                sorted.sort_by(|a, b| b.1.cmp(&a.1));
                sorted.into_iter().take(10).collect()
            })
            .unwrap_or_default();

        StatsSnapshot {
            native_calls: native,
            js_calls: js,
            total_calls: total,
            native_ratio,
            pattern_matches: matches,
            pattern_misses: misses,
            pattern_match_ratio,
            top_apis,
        }
    }

    /// Reset all statistics
    pub fn reset(&self) {
        self.native_calls.store(0, Ordering::Relaxed);
        self.js_calls.store(0, Ordering::Relaxed);
        self.pattern_matches.store(0, Ordering::Relaxed);
        self.pattern_misses.store(0, Ordering::Relaxed);
        if let Ok(mut counts) = self.api_counts.write() {
            counts.clear();
        }
    }
}

/// Statistics snapshot for API response
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsSnapshot {
    /// Number of native API calls
    pub native_calls: u64,
    /// Number of JavaScript executions
    pub js_calls: u64,
    /// Total calls (native + JS)
    pub total_calls: u64,
    /// Ratio of native calls (0.0 - 1.0)
    pub native_ratio: f64,
    /// Number of successful pattern matches
    pub pattern_matches: u64,
    /// Number of pattern match failures
    pub pattern_misses: u64,
    /// Pattern match success ratio (0.0 - 1.0)
    pub pattern_match_ratio: f64,
    /// Top 10 most called APIs
    pub top_apis: Vec<(String, u64)>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stats_recording() {
        let stats = ExecutionStats::new();

        stats.record_native("base64Encode");
        stats.record_native("base64Encode");
        stats.record_native("md5");
        stats.record_js();

        let snapshot = stats.snapshot();
        assert_eq!(snapshot.native_calls, 3);
        assert_eq!(snapshot.js_calls, 1);
        assert_eq!(snapshot.total_calls, 4);
    }

    #[test]
    fn test_stats_reset() {
        let stats = ExecutionStats::new();

        stats.record_native("test");
        stats.record_js();
        stats.reset();

        let snapshot = stats.snapshot();
        assert_eq!(snapshot.native_calls, 0);
        assert_eq!(snapshot.js_calls, 0);
    }
}
