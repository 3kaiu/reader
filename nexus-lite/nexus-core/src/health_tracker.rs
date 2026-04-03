//! Source health tracking module
//!
//! Tracks success/failure rates and latency for book sources
//! to enable smart source prioritization

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HealthFailureKind {
    Timeout,
    Network,
    RuleMismatch,
    EmptyContent,
    LowQuality,
    CircuitOpen,
    Unknown,
}

impl HealthFailureKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Timeout => "timeout",
            Self::Network => "network",
            Self::RuleMismatch => "rule_mismatch",
            Self::EmptyContent => "empty_content",
            Self::LowQuality => "low_quality",
            Self::CircuitOpen => "circuit_open",
            Self::Unknown => "unknown",
        }
    }

    fn penalty(&self) -> i32 {
        match self {
            Self::Timeout => 10,
            Self::Network => 8,
            Self::RuleMismatch => 12,
            Self::EmptyContent => 15,
            Self::LowQuality => 10,
            Self::CircuitOpen => 20,
            Self::Unknown => 6,
        }
    }
}

/// Health statistics for a single source
#[derive(Debug, Clone)]
pub struct SourceHealth {
    pub source_id: String,
    pub success_count: u64,
    pub failure_count: u64,
    pub total_latency_ms: u64,
    pub last_success: Option<Instant>,
    pub last_failure: Option<Instant>,
    pub health_points: i32,
    pub consecutive_successes: u32,
    pub consecutive_failures: u32,
    pub timeout_failures: u64,
    pub network_failures: u64,
    pub rule_mismatch_failures: u64,
    pub empty_content_failures: u64,
    pub low_quality_failures: u64,
    pub circuit_open_failures: u64,
    pub unknown_failures: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedSourceHealth {
    pub source_id: String,
    pub success_count: u64,
    pub failure_count: u64,
    pub total_latency_ms: u64,
    pub health_points: i32,
    pub consecutive_successes: u32,
    pub consecutive_failures: u32,
    pub timeout_failures: u64,
    pub network_failures: u64,
    pub rule_mismatch_failures: u64,
    pub empty_content_failures: u64,
    pub low_quality_failures: u64,
    pub circuit_open_failures: u64,
    pub unknown_failures: u64,
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
            health_points: 100,
            consecutive_successes: 0,
            consecutive_failures: 0,
            timeout_failures: 0,
            network_failures: 0,
            rule_mismatch_failures: 0,
            empty_content_failures: 0,
            low_quality_failures: 0,
            circuit_open_failures: 0,
            unknown_failures: 0,
        }
    }

    /// Calculate health score (0.0 - 1.0)
    pub fn score(&self) -> f64 {
        let base = (self.health_points as f64 / 100.0).clamp(0.0, 1.0);
        let avg_latency_ms = if self.success_count > 0 {
            self.total_latency_ms / self.success_count
        } else {
            5000
        };
        let latency_penalty = if avg_latency_ms > 3000 {
            -0.08
        } else if avg_latency_ms > 1500 {
            -0.04
        } else {
            0.0
        };
        let streak_bonus = (self.consecutive_successes.min(10) as f64) * 0.005;
        let streak_penalty = (self.consecutive_failures.min(10) as f64) * 0.01;

        (base + streak_bonus - streak_penalty + latency_penalty).clamp(0.0, 1.0)
    }

    /// Average latency in milliseconds
    pub fn avg_latency_ms(&self) -> u64 {
        if self.success_count > 0 {
            self.total_latency_ms / self.success_count
        } else {
            0
        }
    }

    pub fn primary_failure(&self) -> &'static str {
        let ranked = [
            (HealthFailureKind::Timeout, self.timeout_failures),
            (HealthFailureKind::Network, self.network_failures),
            (HealthFailureKind::RuleMismatch, self.rule_mismatch_failures),
            (HealthFailureKind::EmptyContent, self.empty_content_failures),
            (HealthFailureKind::LowQuality, self.low_quality_failures),
            (HealthFailureKind::CircuitOpen, self.circuit_open_failures),
            (HealthFailureKind::Unknown, self.unknown_failures),
        ];

        ranked
            .into_iter()
            .max_by(|a, b| a.1.cmp(&b.1))
            .filter(|(_, count)| *count > 0)
            .map(|(kind, _)| kind.as_str())
            .unwrap_or("none")
    }

    pub fn to_persisted(&self) -> PersistedSourceHealth {
        PersistedSourceHealth {
            source_id: self.source_id.clone(),
            success_count: self.success_count,
            failure_count: self.failure_count,
            total_latency_ms: self.total_latency_ms,
            health_points: self.health_points,
            consecutive_successes: self.consecutive_successes,
            consecutive_failures: self.consecutive_failures,
            timeout_failures: self.timeout_failures,
            network_failures: self.network_failures,
            rule_mismatch_failures: self.rule_mismatch_failures,
            empty_content_failures: self.empty_content_failures,
            low_quality_failures: self.low_quality_failures,
            circuit_open_failures: self.circuit_open_failures,
            unknown_failures: self.unknown_failures,
        }
    }
}

impl From<PersistedSourceHealth> for SourceHealth {
    fn from(value: PersistedSourceHealth) -> Self {
        Self {
            source_id: value.source_id,
            success_count: value.success_count,
            failure_count: value.failure_count,
            total_latency_ms: value.total_latency_ms,
            last_success: None,
            last_failure: None,
            health_points: value.health_points,
            consecutive_successes: value.consecutive_successes,
            consecutive_failures: value.consecutive_failures,
            timeout_failures: value.timeout_failures,
            network_failures: value.network_failures,
            rule_mismatch_failures: value.rule_mismatch_failures,
            empty_content_failures: value.empty_content_failures,
            low_quality_failures: value.low_quality_failures,
            circuit_open_failures: value.circuit_open_failures,
            unknown_failures: value.unknown_failures,
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
                h.consecutive_successes = h.consecutive_successes.saturating_add(1);
                h.consecutive_failures = 0;
                if h.consecutive_successes >= 3 {
                    h.health_points = (h.health_points + 2).min(100);
                } else {
                    h.health_points = (h.health_points + 1).min(100);
                }
            })
            .or_insert_with(|| {
                let mut h = SourceHealth::new(source_id.to_string());
                h.success_count = 1;
                h.total_latency_ms = latency_ms;
                h.last_success = Some(Instant::now());
                h.consecutive_successes = 1;
                h
            });
    }

    /// Record a failed request
    pub fn record_failure(&self, source_id: &str) {
        self.record_failure_kind(source_id, HealthFailureKind::Unknown);
    }

    pub fn record_failure_kind(&self, source_id: &str, kind: HealthFailureKind) {
        self.stats
            .entry(source_id.to_string())
            .and_modify(|h| {
                h.failure_count += 1;
                h.last_failure = Some(Instant::now());
                h.consecutive_failures = h.consecutive_failures.saturating_add(1);
                h.consecutive_successes = 0;
                h.health_points = (h.health_points - kind.penalty()).max(0);
                match kind {
                    HealthFailureKind::Timeout => h.timeout_failures += 1,
                    HealthFailureKind::Network => h.network_failures += 1,
                    HealthFailureKind::RuleMismatch => h.rule_mismatch_failures += 1,
                    HealthFailureKind::EmptyContent => h.empty_content_failures += 1,
                    HealthFailureKind::LowQuality => h.low_quality_failures += 1,
                    HealthFailureKind::CircuitOpen => h.circuit_open_failures += 1,
                    HealthFailureKind::Unknown => h.unknown_failures += 1,
                }
            })
            .or_insert_with(|| {
                let mut h = SourceHealth::new(source_id.to_string());
                h.failure_count = 1;
                h.last_failure = Some(Instant::now());
                h.consecutive_failures = 1;
                h.health_points = (h.health_points - kind.penalty()).max(0);
                match kind {
                    HealthFailureKind::Timeout => h.timeout_failures = 1,
                    HealthFailureKind::Network => h.network_failures = 1,
                    HealthFailureKind::RuleMismatch => h.rule_mismatch_failures = 1,
                    HealthFailureKind::EmptyContent => h.empty_content_failures = 1,
                    HealthFailureKind::LowQuality => h.low_quality_failures = 1,
                    HealthFailureKind::CircuitOpen => h.circuit_open_failures = 1,
                    HealthFailureKind::Unknown => h.unknown_failures = 1,
                }
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

    pub fn snapshot_persisted(&self) -> Vec<PersistedSourceHealth> {
        self.get_all()
            .into_iter()
            .map(|item| item.to_persisted())
            .collect()
    }

    pub fn restore_from_snapshot(&self, items: Vec<PersistedSourceHealth>) {
        self.stats.clear();
        for item in items {
            self.stats
                .insert(item.source_id.clone(), SourceHealth::from(item));
        }
    }

    /// Reset health statistics for a specific source
    pub fn reset_source(&self, source_id: &str) {
        self.stats.remove(source_id);
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
