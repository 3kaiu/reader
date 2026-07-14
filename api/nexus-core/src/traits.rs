//! Core trait definitions for Nexus
//!
//! These traits define the plugin interfaces for the engine.

use crate::error::EngineError;
use crate::{FetchResponse, FetchContext};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
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

    /// Runtime statistics for the fetcher implementation.
    fn statistics(&self) -> FetcherStatistics;
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

/// Fetcher statistics shared by engine/server observability paths.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetcherStatistics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub total_bytes_downloaded: u64,
    pub average_response_time_ms: f64,
    pub active_connections: u32,
}
