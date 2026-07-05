//! Circuit breaker pattern for reliable fetch operations
//!
//! Prevents cascade failures by temporarily blocking requests
//! to failing sources.

use parking_lot::RwLock;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::{Duration, Instant};

const MAX_BACKOFF_MULTIPLIER: u32 = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    pub failure_threshold: u32,
    pub reset_timeout: Duration,
    pub success_threshold: u32,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            reset_timeout: Duration::from_secs(60),
            success_threshold: 2,
        }
    }
}

pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    failure_count: AtomicU32,
    success_count: AtomicU32,
    is_open: AtomicBool,
    last_failure: RwLock<Option<Instant>>,
    open_count: AtomicU32,
}

impl CircuitBreaker {
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            failure_count: AtomicU32::new(0),
            success_count: AtomicU32::new(0),
            is_open: AtomicBool::new(false),
            last_failure: RwLock::new(None),
            open_count: AtomicU32::new(0),
        }
    }

    fn effective_reset_timeout(&self) -> Duration {
        let multiplier = 1u64 << self.open_count.load(Ordering::Relaxed).min(MAX_BACKOFF_MULTIPLIER);
        Duration::from_millis(self.config.reset_timeout.as_millis() as u64 * multiplier)
    }

    pub fn should_allow(&self) -> bool {
        if !self.is_open.load(Ordering::Relaxed) {
            return true;
        }

        if let Some(last) = *self.last_failure.read() {
            if last.elapsed() > self.effective_reset_timeout() {
                return true;
            }
        }

        false
    }

    pub fn state(&self) -> CircuitState {
        if !self.is_open.load(Ordering::Relaxed) {
            CircuitState::Closed
        } else if let Some(last) = *self.last_failure.read() {
            if last.elapsed() > self.effective_reset_timeout() {
                CircuitState::HalfOpen
            } else {
                CircuitState::Open
            }
        } else {
            CircuitState::Open
        }
    }

    pub fn record_success(&self) {
        self.failure_count.store(0, Ordering::Relaxed);

        if self.is_open.load(Ordering::Relaxed) {
            let count = self.success_count.fetch_add(1, Ordering::Relaxed) + 1;
            if count >= self.config.success_threshold {
                self.is_open.store(false, Ordering::Relaxed);
                self.success_count.store(0, Ordering::Relaxed);
            }
        }
    }

    pub fn record_failure(&self) {
        self.success_count.store(0, Ordering::Relaxed);
        let count = self.failure_count.fetch_add(1, Ordering::Relaxed) + 1;

        if count >= self.config.failure_threshold {
            let was_open = self.is_open.swap(true, Ordering::Relaxed);
            if !was_open {
                // First time opening — start with base timeout
                self.open_count.store(0, Ordering::Relaxed);
            } else {
                // Repeated open — increase backoff
                self.open_count.fetch_add(1, Ordering::Relaxed);
            }
            *self.last_failure.write() = Some(Instant::now());
        }
    }

    pub fn reset(&self) {
        self.failure_count.store(0, Ordering::Relaxed);
        self.success_count.store(0, Ordering::Relaxed);
        self.is_open.store(false, Ordering::Relaxed);
        self.open_count.store(0, Ordering::Relaxed);
        *self.last_failure.write() = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_breaker_opens_on_failures() {
        let config = CircuitBreakerConfig {
            failure_threshold: 3,
            reset_timeout: Duration::from_secs(1),
            success_threshold: 1,
        };
        let cb = CircuitBreaker::new(config);

        assert!(cb.should_allow());
        assert_eq!(cb.state(), CircuitState::Closed);

        // Record failures
        cb.record_failure();
        cb.record_failure();
        assert!(cb.should_allow()); // Still under threshold

        cb.record_failure(); // This should open the circuit
        assert!(!cb.should_allow());
        assert_eq!(cb.state(), CircuitState::Open);
    }

    #[test]
    fn test_circuit_breaker_closes_on_success() {
        let config = CircuitBreakerConfig {
            failure_threshold: 2,
            reset_timeout: Duration::from_millis(10),
            success_threshold: 1,
        };
        let cb = CircuitBreaker::new(config);

        cb.record_failure();
        cb.record_failure();
        assert!(!cb.should_allow());

        // Wait for timeout
        std::thread::sleep(Duration::from_millis(20));
        assert!(cb.should_allow()); // Half-open

        cb.record_success();
        assert_eq!(cb.state(), CircuitState::Closed);
    }
}
