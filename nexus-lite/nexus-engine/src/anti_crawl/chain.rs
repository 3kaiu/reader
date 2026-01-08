//! Fallback chain for anti-crawl strategies with circuit breaker support

use crate::circuit_breaker::{CircuitBreaker, CircuitBreakerConfig};
use dashmap::DashMap;
use nexus_core::{AntiCrawlStrategy, EngineError, FetchContext, FetchResponse};
use reqwest::Client;
use std::sync::Arc;
use tracing::{debug, warn};

/// Fallback chain that tries strategies in order until one succeeds
/// Now with per-source circuit breaker for fault tolerance
pub struct FallbackChain {
    strategies: Vec<Arc<dyn AntiCrawlStrategy>>,
    /// Per-source circuit breakers
    breakers: DashMap<String, CircuitBreaker>,
    /// Circuit breaker configuration
    breaker_config: CircuitBreakerConfig,
}

impl FallbackChain {
    /// Create a new fallback chain with default strategies
    pub fn new() -> Self {
        let client = Arc::new(
            Client::builder()
                .timeout(std::time::Duration::from_secs(90))
                .build()
                .unwrap_or_default(),
        );

        Self {
            strategies: vec![Arc::new(super::L1BasicStrategy::new(client))],
            breakers: DashMap::new(),
            breaker_config: CircuitBreakerConfig::default(),
        }
    }

    /// Create with custom strategies
    pub fn with_strategies(strategies: Vec<Arc<dyn AntiCrawlStrategy>>) -> Self {
        Self {
            strategies,
            breakers: DashMap::new(),
            breaker_config: CircuitBreakerConfig::default(),
        }
    }

    /// Create with custom strategies and circuit breaker config
    pub fn with_strategies_and_config(
        strategies: Vec<Arc<dyn AntiCrawlStrategy>>,
        breaker_config: CircuitBreakerConfig,
    ) -> Self {
        Self {
            strategies,
            breakers: DashMap::new(),
            breaker_config,
        }
    }

    /// Get or create circuit breaker for a source
    fn get_breaker(&self, source_id: &str) -> dashmap::mapref::one::Ref<'_, String, CircuitBreaker> {
        if !self.breakers.contains_key(source_id) {
            self.breakers
                .insert(source_id.to_string(), CircuitBreaker::new(self.breaker_config.clone()));
        }
        self.breakers.get(source_id).unwrap()
    }

    /// Execute fetch with fallback chain and circuit breaker
    pub async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        // Check circuit breaker first
        let breaker = self.get_breaker(&ctx.source_id);
        if !breaker.should_allow() {
            debug!("Circuit OPEN for source {}, rejecting request", ctx.source_id);
            return Err(EngineError::CircuitOpen(ctx.source_id.clone()));
        }
        drop(breaker); // Release lock before async operation

        // Execute the actual fetch
        let result = self.execute_inner(ctx).await;

        // Record result in circuit breaker
        let breaker = self.get_breaker(&ctx.source_id);
        match &result {
            Ok(_) => {
                breaker.record_success();
            }
            Err(e) if e.is_retryable() => {
                breaker.record_failure();
            }
            _ => {} // Non-retryable errors don't affect circuit
        }

        result
    }

    /// Inner execution without circuit breaker logic
    async fn execute_inner(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        let mut last_error = EngineError::AllStrategiesFailed;

        for strategy in &self.strategies {
            // Skip strategies below min level (for sources that require higher-level bypass)
            if strategy.level() < ctx.min_level {
                debug!(
                    "Skipping {} (level {} < min {})",
                    strategy.name(),
                    strategy.level(),
                    ctx.min_level
                );
                continue;
            }

            // Skip strategies above max level
            if strategy.level() > ctx.max_level {
                debug!(
                    "Skipping {} (level {} > max {})",
                    strategy.name(),
                    strategy.level(),
                    ctx.max_level
                );
                continue;
            }

            // If a script is provided, only use strategies that support it
            if ctx.js_script.is_some() && !strategy.supports_script() {
                debug!("Skipping {} (does not support js_script)", strategy.name());
                continue;
            }

            debug!(
                "Trying strategy: {} (level {})",
                strategy.name(),
                strategy.level()
            );

            match strategy.execute(ctx).await {
                Ok(response) => {
                    if response.is_success() {
                        debug!("Strategy {} succeeded", strategy.name());
                        return Ok(response);
                    }

                    // Check for Cloudflare challenge
                    if response.is_cloudflare_challenge() {
                        debug!("Cloudflare challenge detected, trying next strategy");
                        ctx.last_response = Some(response);
                        continue;
                    }

                    // Check for rate limiting
                    if response.status == 429 || response.status == 503 {
                        debug!("Rate limited ({}), trying next strategy", response.status);
                        ctx.last_response = Some(response);
                        continue;
                    }

                    // Other non-success status
                    debug!(
                        "Strategy {} got status {}",
                        strategy.name(),
                        response.status
                    );
                    ctx.last_response = Some(response);
                }
                Err(e) => {
                    if e.is_retryable() {
                        debug!(
                            "Strategy {} failed with retryable error: {}",
                            strategy.name(),
                            e
                        );
                        last_error = e;
                        continue;
                    }
                    // Non-retryable error, return immediately
                    return Err(e);
                }
            }
        }

        warn!("All strategies exhausted for {}", ctx.url);
        Err(last_error)
    }

    /// Get number of strategies
    pub fn len(&self) -> usize {
        self.strategies.len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.strategies.is_empty()
    }

    /// Get circuit breaker state for a source
    pub fn circuit_state(&self, source_id: &str) -> Option<crate::circuit_breaker::CircuitState> {
        self.breakers.get(source_id).map(|b| b.state())
    }

    /// Reset circuit breaker for a source
    pub fn reset_circuit(&self, source_id: &str) {
        if let Some(breaker) = self.breakers.get(source_id) {
            breaker.reset();
        }
    }
}

impl Default for FallbackChain {
    fn default() -> Self {
        Self::new()
    }
}

