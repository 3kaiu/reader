//! Core trait definitions for NexusLite
//!
//! These traits define the plugin interfaces for the engine.

use crate::error::EngineError;
use crate::types::*;
use async_trait::async_trait;
use std::collections::HashMap;

/// HTTP fetcher interface
#[async_trait]
pub trait Fetcher: Send + Sync {
    /// Perform GET request
    async fn get(
        &self,
        url: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, EngineError>;

    /// Perform POST request
    async fn post(
        &self,
        url: &str,
        body: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, EngineError>;
}

/// Anti-crawl strategy interface (simplified - CF bypass only)
#[async_trait]
pub trait AntiCrawlStrategy: Send + Sync {
    /// Strategy name
    fn name(&self) -> &str;

    /// Strategy level (kept for compatibility)
    fn level(&self) -> u8 {
        6
    }

    /// Check if this strategy should be applied
    fn should_apply(&self, response: &FetchResponse) -> bool;

    /// Check if this strategy supports executing custom JavaScript
    fn supports_script(&self) -> bool {
        false
    }

    /// Execute the strategy
    async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError>;
}
