//! Source health tracking module
//!
//! Tracks success/failure rates and latency for book sources
//! to enable smart source prioritization

use dashmap::DashMap;
use std::time::{Duration, Instant};

/// Health statistics for a single source
#[derive(Debug, Clone)]
pub struct SourceHealth {
    pub source_id: String,
    pub success_count: u64,
    pub failure_count: u64,
    pub total_latency_ms: u64,
    pub last_success: Option<Instant>,
    pub last_failure: Option<Instant>,
}

impl SourceHealth {
    pub fn new(source_id: String) -> Self {
        Self {
            source_id,
            success_count: 0,
            failure_count: 0,
            total_latency_ms: 0,
            last_success: None,
            last_failure: None,
        }
    }

    /// Calculate health score (0.0 - 1.0)
    pub fn score(&self) -> f64 {
        let total = self.success_count + self.failure_count;
        if total == 0 {
            return 0.5; // Unknown, neutral score
        }

        // Base success rate
        let success_rate = self.success_count as f64 / total as f64;

        // Recency bonus: prefer recently successful sources
        let recency_bonus = match (self.last_success, self.last_failure) {
            (Some(success), Some(failure)) if success > failure => 0.1,
            (Some(_), None) => 0.1,
            (None, Some(_)) => -0.1,
            _ => 0.0,
        };

        // Latency penalty: prefer faster sources
        let avg_latency_ms = if self.success_count > 0 {
            self.total_latency_ms / self.success_count
        } else {
            5000 // Default high latency
        };
        let latency_penalty = if avg_latency_ms > 3000 { -0.1 } else { 0.0 };

        (success_rate + recency_bonus + latency_penalty).clamp(0.0, 1.0)
    }

    /// Average latency in milliseconds
    pub fn avg_latency_ms(&self) -> u64 {
        if self.success_count > 0 {
            self.total_latency_ms / self.success_count
        } else {
            0
        }
    }
}

/// Thread-safe health tracker for all sources
pub struct HealthTracker {
    stats: DashMap<String, SourceHealth>,
}

impl HealthTracker {
    pub fn new() -> Self {
        Self {
            stats: DashMap::new(),
        }
    }

    /// Record a successful request
    pub fn record_success(&self, source_id: &str, latency: Duration) {
        let latency_ms = latency.as_millis() as u64;

        self.stats
            .entry(source_id.to_string())
            .and_modify(|h| {
                h.success_count += 1;
                h.total_latency_ms += latency_ms;
                h.last_success = Some(Instant::now());
            })
            .or_insert_with(|| {
                let mut h = SourceHealth::new(source_id.to_string());
                h.success_count = 1;
                h.total_latency_ms = latency_ms;
                h.last_success = Some(Instant::now());
                h
            });
    }

    /// Record a failed request
    pub fn record_failure(&self, source_id: &str) {
        self.stats
            .entry(source_id.to_string())
            .and_modify(|h| {
                h.failure_count += 1;
                h.last_failure = Some(Instant::now());
            })
            .or_insert_with(|| {
                let mut h = SourceHealth::new(source_id.to_string());
                h.failure_count = 1;
                h.last_failure = Some(Instant::now());
                h
            });
    }

    /// Get health for a specific source
    pub fn get(&self, source_id: &str) -> Option<SourceHealth> {
        self.stats.get(source_id).map(|h| h.clone())
    }

    /// Get all health stats
    pub fn get_all(&self) -> Vec<SourceHealth> {
        self.stats.iter().map(|r| r.value().clone()).collect()
    }

    /// Sort source IDs by health score (best first)
    pub fn sort_by_health(&self, source_ids: &mut [String]) {
        source_ids.sort_by(|a, b| {
            let score_a = self.stats.get(a).map(|h| h.score()).unwrap_or(0.5);
            let score_b = self.stats.get(b).map(|h| h.score()).unwrap_or(0.5);
            score_b
                .partial_cmp(&score_a)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }
}

impl Default for HealthTracker {
    fn default() -> Self {
        Self::new()
    }
}
