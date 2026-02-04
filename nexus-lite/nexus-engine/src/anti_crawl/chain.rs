//! Simplified fetch chain with circuit breaker support

use crate::circuit_breaker::{CircuitBreaker, CircuitBreakerConfig};
use dashmap::DashMap;
use nexus_core::{AntiCrawlStrategy, EngineError, FetchContext, FetchResponse};
use std::sync::Arc;
use tracing::debug;

/// Fetch chain with circuit breaker for fault tolerance
pub struct FallbackChain {
    strategy: Arc<dyn AntiCrawlStrategy>,
    /// Per-source circuit breakers
    breakers: DashMap<String, CircuitBreaker>,
    breaker_config: CircuitBreakerConfig,
}

impl FallbackChain {
    /// Create with CF bypass strategy
    pub fn new(strategy: Arc<dyn AntiCrawlStrategy>) -> Self {
        Self {
            strategy,
            breakers: DashMap::new(),
            breaker_config: CircuitBreakerConfig::default(),
        }
    }

    /// Create with custom circuit breaker config
    pub fn with_config(
        strategy: Arc<dyn AntiCrawlStrategy>,
        breaker_config: CircuitBreakerConfig,
    ) -> Self {
        Self {
            strategy,
            breakers: DashMap::new(),
            breaker_config,
        }
    }

    /// Get or create circuit breaker for a source
    fn get_breaker(
        &self,
        source_id: &str,
    ) -> dashmap::mapref::one::Ref<'_, String, CircuitBreaker> {
        // Use entry API to avoid TOCTOU race condition
        self.breakers
            .entry(source_id.to_string())
            .or_insert_with(|| CircuitBreaker::new(self.breaker_config.clone()));
        // Safe: entry above guarantees key exists
        self.breakers.get(source_id).expect("breaker just inserted")
    }

    /// Execute fetch with circuit breaker
    pub async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        // Check circuit breaker
        let breaker = self.get_breaker(&ctx.source_id);
        if !breaker.should_allow() {
            debug!("Circuit OPEN for source {}, rejecting", ctx.source_id);
            return Err(EngineError::CircuitOpen { message: ctx.source_id.clone() });
        }
        drop(breaker);

        // Execute fetch
        let result = self.strategy.execute(ctx).await;

        // Update circuit breaker
        let breaker = self.get_breaker(&ctx.source_id);
        match &result {
            Ok(_) => breaker.record_success(),
            Err(e) if e.is_retryable() => breaker.record_failure(),
            _ => {}
        }

        result
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
