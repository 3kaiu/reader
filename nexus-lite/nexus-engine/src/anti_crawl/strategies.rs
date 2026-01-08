//! Anti-crawl strategies for NexusLite
//!
//! Strategy Levels:
//! - L1: Basic HTTP (Standard reqwest with headers)
//! - L6: Cloudflare bypass via HTTP REST API (cf-bypass-service v4.0)

use async_trait::async_trait;
use nexus_core::{
    AntiCrawlStrategy, CloudflareBypassConfig, EngineError, FetchContext, FetchResponse,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, info, warn};

// ============================================================================
// Common Types
// ============================================================================

/// Anti-crawl capability levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AntiCrawlLevel {
    /// Level 0: No protection (Direct fetch)
    None = 0,
    /// Level 1: Basic HTTP (Standard headers)
    Basic = 1,
    /// Level 6: HTTP-based Cloudflare bypass
    CloudflareBypass = 6,
}

impl AntiCrawlLevel {
    pub fn from_u8(level: u8) -> Self {
        match level {
            1 => Self::Basic,
            6 => Self::CloudflareBypass,
            _ => Self::None,
        }
    }
}

// ============================================================================
// L1: Basic HTTP Strategy
// ============================================================================

/// L1: Basic HTTP Fetcher strategy using reqwest
pub struct L1BasicStrategy {
    client: Arc<Client>,
}

impl L1BasicStrategy {
    pub fn new(client: Arc<Client>) -> Self {
        Self { client }
    }
}

#[async_trait]
impl AntiCrawlStrategy for L1BasicStrategy {
    fn name(&self) -> &str {
        "L1-Basic"
    }

    fn level(&self) -> u8 {
        1
    }

    fn should_apply(&self, _response: &FetchResponse) -> bool {
        true // Always try first
    }

    async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        debug!("L1 Basic: {} {}", ctx.method, ctx.url);

        let mut request = if ctx.method == "POST" {
            self.client.post(&ctx.url)
        } else {
            self.client.get(&ctx.url)
        };

        // Apply headers
        for (key, value) in &ctx.headers {
            request = request.header(key.as_str(), value.as_str());
        }

        // Apply body if present
        if let Some(body) = &ctx.body {
            request = request.body(body.clone());
        }

        let response = request
            .send()
            .await
            .map_err(|e| EngineError::Network(e.to_string()))?;

        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .map(|(k, v)| {
                (
                    k.to_string(),
                    v.to_owned().to_str().unwrap_or_default().to_string(),
                )
            })
            .collect();
        let body = response
            .text()
            .await
            .map_err(|e| EngineError::Network(e.to_string()))?;

        Ok(FetchResponse {
            status,
            headers,
            body,
            url: ctx.url.clone(),
        })
    }
}

// ============================================================================
// L6: Cloudflare Bypass via HTTP REST API
// ============================================================================

/// Request body for /fetch endpoint
#[derive(Debug, Serialize)]
struct CfFetchRequest {
    url: String,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    headers: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
    timeout: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy: Option<String>,
}

/// Response from /fetch endpoint
#[derive(Debug, Deserialize)]
struct CfFetchResponse {
    status: u16,
    html: String,
    #[allow(dead_code)]
    cookies: HashMap<String, String>,
    headers: HashMap<String, String>,
    cf_bypassed: bool,
    #[serde(default)]
    error: Option<String>,
}

/// L6 Strategy: Cloudflare bypass via HTTP REST API
///
/// Connects to cf-bypass-core using HTTP POST /fetch endpoint.
pub struct L6HttpStrategy {
    config: CloudflareBypassConfig,
    client: Client,
}

impl L6HttpStrategy {
    pub fn new(config: CloudflareBypassConfig) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .expect("Failed to build HTTP client");

        debug!(
            "L6HttpStrategy initialized: service_url={}",
            config.service_url
        );

        Self { config, client }
    }

    fn fetch_url(&self) -> String {
        format!("{}/fetch", self.config.service_url.trim_end_matches('/'))
    }
}

#[async_trait]
impl AntiCrawlStrategy for L6HttpStrategy {
    fn name(&self) -> &str {
        "L6-HTTP-Stealth"
    }

    fn level(&self) -> u8 {
        6
    }

    fn should_apply(&self, response: &FetchResponse) -> bool {
        if !self.config.enabled {
            return false;
        }
        response.is_cloudflare_challenge() || response.status == 403
    }

    fn supports_script(&self) -> bool {
        false
    }

    async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        if !self.config.enabled {
            return Err(EngineError::StrategyDisabled);
        }

        info!("L6 (HTTP): Attempting CF bypass for {}", ctx.url);

        let request_body = CfFetchRequest {
            url: ctx.url.clone(),
            method: ctx.method.clone(),
            headers: if ctx.headers.is_empty() {
                None
            } else {
                Some(ctx.headers.clone())
            },
            body: ctx.body.clone(),
            timeout: 45,
            proxy: None,
        };

        let mut req = self.client.post(self.fetch_url()).json(&request_body);

        if let Some(ref api_key) = self.config.api_key {
            req = req.header("X-API-Key", api_key);
        }

        let response = req.send().await.map_err(|e| {
            warn!("L6 (HTTP): Request failed: {}", e);
            EngineError::Network(format!("CF bypass service error: {}", e))
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            warn!("L6 (HTTP): Service returned error: {} - {}", status, text);
            return Err(EngineError::Network(format!(
                "CF bypass service returned {}",
                status
            )));
        }

        let body: CfFetchResponse = response.json().await.map_err(|e| {
            warn!("L6 (HTTP): Failed to parse response: {}", e);
            EngineError::JsonParse(format!("Invalid response from CF bypass service: {}", e))
        })?;

        if let Some(error) = body.error {
            warn!("L6 (HTTP): Service error: {}", error);
            return Err(EngineError::Network(error));
        }

        // Normalize status 0 to 200 if CF bypass succeeded
        let status = if body.status == 0 && body.cf_bypassed {
            info!("L6 (HTTP): Normalizing status 0 to 200 OK");
            200
        } else {
            body.status
        };

        info!(
            "L6 (HTTP): CF bypass {}, status={}",
            if body.cf_bypassed {
                "successful"
            } else {
                "partial"
            },
            status
        );

        Ok(FetchResponse {
            status,
            headers: body.headers,
            body: body.html,
            url: ctx.url.clone(),
        })
    }
}
