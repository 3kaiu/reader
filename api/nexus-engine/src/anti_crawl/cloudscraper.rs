//! CloudScraper Strategy - Unified Cloudflare Bypass
//!
//! Handles all Cloudflare challenge types (v1/v2/v3/Turnstile) using cloudscraper-rs.
//! No layering - treats all CF protection as maximum level bypass.

use async_trait::async_trait;
use http::Method;
use nexus_core::{AntiCrawlStrategy, EngineError, FetchContext, FetchResponse};
use std::collections::HashMap;
use tracing::{debug, info, warn};

/// CloudScraper Strategy - Unified CF bypass for all challenge types
///
/// Note: CloudScraper is not Send+Sync, so we use spawn_blocking for async execution
pub struct CloudScraperStrategy;

impl CloudScraperStrategy {
    /// Create a new CloudScraper strategy
    pub fn new() -> Result<Self, EngineError> {
        debug!("CloudScraperStrategy initialized successfully");
        Ok(Self)
    }

    /// Create a FallbackChain with CloudScraper strategy
    /// This is the recommended way to use CloudScraper in NxsEngine
    pub fn create_chain() -> Result<crate::anti_crawl::FallbackChain, EngineError> {
        let strategy = std::sync::Arc::new(Self::new()?);
        Ok(crate::anti_crawl::FallbackChain::new(strategy))
    }

    /// Check if response indicates CF protection
    pub fn is_cf_protected(status: u16, body: &str, headers: &HashMap<String, String>) -> bool {
        // Status code indicators
        if status == 403 || status == 429 {
            return true;
        }

        // Header indicators
        if headers.contains_key("cf-ray") || headers.contains_key("cf-cache-status") {
            // Check for challenge in body
            if body.contains("challenge") || body.contains("Just a moment") {
                return true;
            }
        }

        // Body indicators
        if body.contains("Checking your browser")
            || body.contains("Just a moment")
            || body.contains("Please Wait...")
            || body.contains("cf-browser-verify")
            || body.contains("cf_chl_opt")
            || body.contains("turnstile")
        {
            return true;
        }

        false
    }
}

impl Default for CloudScraperStrategy {
    fn default() -> Self {
        Self::new().expect("CloudScraperStrategy initialization failed")
    }
}

#[async_trait]
impl AntiCrawlStrategy for CloudScraperStrategy {
    fn name(&self) -> &str {
        "CloudScraper"
    }

    fn level(&self) -> u8 {
        6 // Maximum level - handles all CF challenges
    }

    fn should_apply(&self, response: &FetchResponse) -> bool {
        Self::is_cf_protected(response.status, &response.body, &response.headers)
    }

    fn supports_script(&self) -> bool {
        false // CloudScraper handles JS internally
    }

    async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        info!("CloudScraper: Bypassing CF protection for {}", ctx.url);

        let url = ctx.url.clone();
        let method = ctx.method.clone();
        let body = ctx.body.clone();

        // Use spawn_blocking to handle non-Send CloudScraper
        let result = tokio::task::spawn_blocking(move || {
            // Create CloudScraper on-demand (not Send+Sync)
            let scraper =
                cloudscraper_rs::CloudScraper::new().map_err(|e| EngineError::InvalidConfig {
                    message: format!("CloudScraper creation failed: {}", e),
                })?;

            // Parse URL
            let parsed_url = url.parse::<url::Url>().map_err(|e| EngineError::Network {
                message: format!("Invalid URL: {}", e),
            })?;

            // Build runtime for blocking execution
            let rt = tokio::runtime::Handle::current();

            let response = rt.block_on(async {
                match method.to_uppercase().as_str() {
                    "GET" => scraper.get(&url).await,
                    "POST" => {
                        let body_bytes = body.unwrap_or_default().into_bytes();
                        scraper
                            .request(Method::POST, parsed_url, Some(body_bytes))
                            .await
                    },
                    _ => scraper.get(&url).await,
                }
            });

            response.map_err(|_| EngineError::CloudflareChallenge)
        });

        let response = result.await.map_err(|e| EngineError::Internal {
            message: e.to_string(),
        })??;

        let status = response.status();

        // Get response body (blocking)
        let rt = tokio::runtime::Handle::current();
        let body = rt
            .block_on(response.text())
            .map_err(|e| EngineError::Network {
                message: format!("Failed to read response body: {}", e),
            })?;

        // Extract headers
        let headers: HashMap<String, String> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or_default().to_string()))
            .collect();

        // Check if CF bypass was successful
        if Self::is_cf_protected(status, &body, &headers) {
            warn!("CloudScraper: CF bypass failed for {}", ctx.url);
            return Err(EngineError::CloudflareChallengeFailed);
        }

        info!("CloudScraper: Successfully bypassed CF for {} (status={})", ctx.url, status);

        Ok(FetchResponse {
            status,
            headers,
            body,
            url: ctx.url.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_cf_protected() {
        // Test status code detection
        assert!(CloudScraperStrategy::is_cf_protected(403, "", &Default::default()));
        assert!(CloudScraperStrategy::is_cf_protected(429, "", &Default::default()));

        // Test body detection
        assert!(CloudScraperStrategy::is_cf_protected(
            200,
            "Just a moment...",
            &Default::default()
        ));
        assert!(CloudScraperStrategy::is_cf_protected(
            200,
            "Checking your browser",
            &Default::default()
        ));

        // Test normal response
        assert!(!CloudScraperStrategy::is_cf_protected(
            200,
            "Normal content",
            &Default::default()
        ));
    }
}
