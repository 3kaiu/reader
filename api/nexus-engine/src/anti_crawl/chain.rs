//! Simplified fetch chain with circuit breaker support

use crate::circuit_breaker::{CircuitBreaker, CircuitBreakerConfig};
use dashmap::DashMap;
use nexus_core::{AntiCrawlStrategy, EngineError, FetchContext, FetchResponse};
use std::collections::HashSet;
use std::sync::Arc;
use tracing::debug;

/// Fetch chain with circuit breaker for fault tolerance
pub struct FallbackChain {
    strategies: Vec<Arc<dyn AntiCrawlStrategy>>,
    /// Per-source circuit breakers
    breakers: DashMap<String, CircuitBreaker>,
    breaker_config: CircuitBreakerConfig,
}

impl FallbackChain {
    fn normalize_name(name: &str) -> String {
        name.trim().to_ascii_lowercase()
    }

    fn resolve_strategy_chain(&self, order: &[String]) -> Vec<Arc<dyn AntiCrawlStrategy>> {
        let mut resolved = Vec::new();
        let mut used = HashSet::new();

        for preferred in order {
            let key = Self::normalize_name(preferred);
            if key.is_empty() || !used.insert(key.clone()) {
                continue;
            }
            if let Some(strategy) = self
                .strategies
                .iter()
                .find(|it| Self::normalize_name(it.name()) == key)
            {
                resolved.push(Arc::clone(strategy));
            }
        }

        for strategy in &self.strategies {
            let key = Self::normalize_name(strategy.name());
            if used.insert(key) {
                resolved.push(Arc::clone(strategy));
            }
        }

        resolved
    }

    async fn execute_with_chain(
        &self,
        ctx: &mut FetchContext,
        chain: Vec<Arc<dyn AntiCrawlStrategy>>,
    ) -> Result<FetchResponse, EngineError> {
        let mut last_err: Option<EngineError> = None;
        let mut last_response: Option<FetchResponse> = None;
        for (idx, strategy) in chain.iter().enumerate() {
            // Check should_apply with the previous response (if available)
            if idx > 0 {
                if let Some(ref prev_resp) = last_response {
                    if !strategy.should_apply(prev_resp) {
                        debug!(
                            "Strategy {} skipped (should_apply=false) for source {}",
                            strategy.name(),
                            ctx.source_id
                        );
                        continue;
                    }
                }
            }

            match strategy.execute(ctx).await {
                Ok(response) => {
                    if idx > 0 {
                        debug!(
                            "Fallback strategy {} succeeded for source {} after {} prior failures",
                            strategy.name(),
                            ctx.source_id,
                            idx
                        );
                    }
                    return Ok(response);
                },
                Err(err) => {
                    debug!(
                        "Strategy {} failed for source {}: {}",
                        strategy.name(),
                        ctx.source_id,
                        err
                    );
                    // Capture the error response for should_apply checks on subsequent strategies
                    if let EngineError::CloudflareChallenge = &err {
                        last_response = Some(FetchResponse {
                            status: 403,
                            headers: std::collections::HashMap::new(),
                            body: String::new(),
                            url: ctx.url.clone(),
                        });
                    }
                    last_err = Some(err);
                },
            }
        }

        Err(last_err.unwrap_or(EngineError::AllStrategiesFailed))
    }

    /// Create with CF bypass strategy
    pub fn new(strategy: Arc<dyn AntiCrawlStrategy>) -> Self {
        Self {
            strategies: vec![strategy],
            breakers: DashMap::new(),
            breaker_config: CircuitBreakerConfig::default(),
        }
    }

    /// Create with primary + fallback strategies (in order).
    pub fn with_fallbacks(
        primary: Arc<dyn AntiCrawlStrategy>,
        fallbacks: Vec<Arc<dyn AntiCrawlStrategy>>,
    ) -> Self {
        let mut strategies = Vec::with_capacity(1 + fallbacks.len());
        strategies.push(primary);
        strategies.extend(fallbacks);
        Self {
            strategies,
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
            strategies: vec![strategy],
            breakers: DashMap::new(),
            breaker_config,
        }
    }

    /// Get or create circuit breaker for a source
    fn get_breaker(
        &self,
        source_id: &str,
    ) -> dashmap::mapref::one::RefMut<'_, String, CircuitBreaker> {
        self.breakers
            .entry(source_id.to_string())
            .or_insert_with(|| CircuitBreaker::new(self.breaker_config.clone()))
    }

    /// Execute fetch with circuit breaker
    pub async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        // Check circuit breaker
        let breaker = self.get_breaker(&ctx.source_id);
        if !breaker.should_allow() {
            debug!("Circuit OPEN for source {}, rejecting", ctx.source_id);
            return Err(EngineError::CircuitOpen {
                message: ctx.source_id.clone(),
            });
        }
        drop(breaker);

        // Execute fetch with strategy chain
        let result = self
            .execute_with_chain(ctx, self.resolve_strategy_chain(&[]))
            .await;

        // Update circuit breaker
        let breaker = self.get_breaker(&ctx.source_id);
        match &result {
            Ok(_) => breaker.record_success(),
            Err(e) if e.is_retryable() => breaker.record_failure(),
            _ => {},
        }

        result
    }

    /// Execute with preferred strategy order by strategy name.
    /// Unknown strategy names are ignored, and remaining registered strategies
    /// are appended to preserve fallback behavior.
    pub async fn execute_with_strategy_order(
        &self,
        ctx: &mut FetchContext,
        order: &[String],
    ) -> Result<FetchResponse, EngineError> {
        let breaker = self.get_breaker(&ctx.source_id);
        if !breaker.should_allow() {
            debug!("Circuit OPEN for source {}, rejecting", ctx.source_id);
            return Err(EngineError::CircuitOpen {
                message: ctx.source_id.clone(),
            });
        }
        drop(breaker);

        let result = self
            .execute_with_chain(ctx, self.resolve_strategy_chain(order))
            .await;

        // Update circuit breaker
        let breaker = self.get_breaker(&ctx.source_id);
        match &result {
            Ok(_) => breaker.record_success(),
            Err(e) if e.is_retryable() => breaker.record_failure(),
            _ => {},
        }

        result
    }

    /// Whether the underlying anti-crawl strategy supports executing
    /// custom `content.script` blocks during fetch.
    ///
    /// Note: current implementations may always return `false`.
    pub fn supports_script(&self) -> bool {
        self.strategies.iter().any(|s| s.supports_script())
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

    /// Remove circuit breaker for a source (frees memory)
    pub fn remove_breaker(&self, source_id: &str) {
        self.breakers.remove(source_id);
    }

    /// Number of active circuit breakers
    pub fn breaker_count(&self) -> usize {
        self.breakers.len()
    }
}
