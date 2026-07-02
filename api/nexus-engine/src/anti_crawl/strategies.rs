//! CF Bypass Strategy
//!
//! Direct Cloudflare bypass via HTTP REST API (bypass service)

use async_trait::async_trait;
use nexus_core::{
    AntiCrawlStrategy, CloudflareBypassConfig, EngineError, FetchContext, FetchResponse,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, info, warn};

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

/// CF Bypass Strategy via HTTP REST API
pub struct CfBypassStrategy {
    config: CloudflareBypassConfig,
    client: Client,
}

/// Direct HTTP strategy used as a fallback when external bypass service is unavailable.
pub struct DirectHttpStrategy {
    client: Client,
}

impl CfBypassStrategy {
    pub fn new(config: CloudflareBypassConfig) -> Result<Self, EngineError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .map_err(|e| EngineError::InvalidConfig {
                message: format!("Failed to build HTTP client: {}", e),
            })?;

        debug!("CfBypassStrategy initialized: service_url={}", config.service_url);

        Ok(Self { config, client })
    }

    fn fetch_url(&self) -> String {
        format!("{}/fetch", self.config.service_url.trim_end_matches('/'))
    }
}

impl DirectHttpStrategy {
    pub fn new(timeout_seconds: u64) -> Result<Self, EngineError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_seconds))
            .build()
            .map_err(|e| EngineError::InvalidConfig {
                message: format!("Failed to build direct HTTP client: {}", e),
            })?;
        Ok(Self { client })
    }
}

#[async_trait]
impl AntiCrawlStrategy for CfBypassStrategy {
    fn name(&self) -> &str {
        "CF-Bypass"
    }

    fn level(&self) -> u8 {
        6
    }

    fn should_apply(&self, _response: &FetchResponse) -> bool {
        self.config.enabled
    }

    fn supports_script(&self) -> bool {
        false
    }

    async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        if !self.config.enabled {
            return Err(EngineError::StrategyDisabled);
        }

        info!("CF Bypass: Fetching {}", ctx.url);

        let request_body = CfFetchRequest {
            url: ctx.url.clone(),
            method: ctx.method.clone(),
            headers: if ctx.headers.is_empty() {
                None
            } else {
                Some(ctx.headers.clone())
            },
            body: ctx.body.clone(),
            timeout: ctx.timeout_secs as u32, // Use context timeout instead of hardcoded value
            proxy: self.config.proxy.clone(),
        };

        let mut req = self.client.post(self.fetch_url()).json(&request_body);

        if let Some(ref api_key) = self.config.api_key {
            req = req.header("X-API-Key", api_key);
        }

        let response = req.send().await.map_err(|e| {
            warn!("CF Bypass: Request failed: {}", e);
            EngineError::Network {
                message: format!("CF bypass service error: {}", e),
            }
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            warn!("CF Bypass: Service returned error: {} - {}", status, text);
            return Err(EngineError::Network {
                message: format!("CF bypass service returned {}", status),
            });
        }

        let body: CfFetchResponse = response.json().await.map_err(|e| {
            warn!("CF Bypass: Failed to parse response: {}", e);
            EngineError::JsonParse {
                message: format!("Invalid response from CF bypass service: {}", e),
            }
        })?;

        if let Some(error) = body.error {
            warn!("CF Bypass: Service error: {}", error);
            // Service explicitly failed to bypass (or got blocked).
            return Err(EngineError::CloudflareChallengeFailed);
        }

        // Normalize status 0 to 200 if CF bypass succeeded
        let status = if body.status == 0 && body.cf_bypassed {
            info!("CF Bypass: Normalizing status 0 to 200 OK");
            200
        } else {
            body.status
        };

        // If we got blocked (403/429) and CF bypass didn't succeed, return error
        if (status == 403 || status == 429) && !body.cf_bypassed {
            warn!("CF Bypass: Target blocked with status {}", status);
            return Err(EngineError::CloudflareChallenge);
        }

        info!(
            "CF Bypass: {} status={}",
            if body.cf_bypassed {
                "success"
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

#[async_trait]
impl AntiCrawlStrategy for DirectHttpStrategy {
    fn name(&self) -> &str {
        "DirectHTTP"
    }

    fn level(&self) -> u8 {
        1
    }

    fn should_apply(&self, _response: &FetchResponse) -> bool {
        true
    }

    fn supports_script(&self) -> bool {
        false
    }

    async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        let method = ctx.method.to_ascii_uppercase();
        let mut req = match method.as_str() {
            "POST" => self
                .client
                .post(&ctx.url)
                .body(ctx.body.clone().unwrap_or_default()),
            _ => self.client.get(&ctx.url),
        };

        for (k, v) in &ctx.headers {
            req = req.header(k, v);
        }

        let resp = req.send().await.map_err(|e| EngineError::Network {
            message: format!("Direct request failed: {}", e),
        })?;
        let status = resp.status().as_u16();
        let mut headers = HashMap::new();
        for (k, v) in resp.headers() {
            if let Ok(s) = v.to_str() {
                headers.insert(k.to_string(), s.to_string());
            }
        }
        let body = resp.text().await.map_err(|e| EngineError::Network {
            message: format!("Failed to read response body: {}", e),
        })?;

        if status == 403 || status == 429 {
            return Err(EngineError::CloudflareChallenge);
        }

        Ok(FetchResponse {
            status,
            headers,
            body,
            url: ctx.url.clone(),
        })
    }
}

/// Browser Probe Strategy — delegates to the Python bypass service's
/// headless Chromium endpoint for CF challenge resolution and JS rendering.
///
/// Called as the final fallback when the regular CF-Bypass and DirectHTTP
/// strategies are both blocked by Cloudflare challenges.
pub struct BrowserProbeStrategy {
    config: CloudflareBypassConfig,
    client: Client,
}

/// Request body for /api/browser-probe endpoint
#[derive(Debug, Serialize)]
struct BrowserProbeRequest {
    url: String,
    poll_cf: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    js_code: Option<String>,
    wait_until: String,
    timeout_ms: u32,
}

/// Response from /api/browser-probe endpoint
#[derive(Debug, Deserialize)]
struct BrowserProbeResponse {
    status: u16,
    html: String,
    #[allow(dead_code)]
    cookies: HashMap<String, String>,
    cf_bypassed: bool,
    #[serde(default)]
    error: Option<String>,
}

impl BrowserProbeStrategy {
    pub fn new(config: CloudflareBypassConfig) -> Result<Self, EngineError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds * 2)) // browser probe can be slower
            .build()
            .map_err(|e| EngineError::InvalidConfig {
                message: format!("Failed to build HTTP client: {}", e),
            })?;
        debug!("BrowserProbeStrategy initialized: service_url={}", config.service_url);
        Ok(Self { config, client })
    }

    fn probe_url(&self) -> String {
        format!("{}/api/browser-probe", self.config.service_url.trim_end_matches('/'))
    }
}

#[async_trait]
impl AntiCrawlStrategy for BrowserProbeStrategy {
    fn name(&self) -> &str {
        "BrowserProbe"
    }

    fn level(&self) -> u8 {
        10 // highest level, last resort
    }

    fn should_apply(&self, response: &FetchResponse) -> bool {
        // Only apply when the previous strategy was blocked by CF
        response.is_cloudflare_challenge() || response.status == 429
    }

    fn supports_script(&self) -> bool {
        true // browser probe can execute JS
    }

    async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        if !self.config.enabled {
            return Err(EngineError::StrategyDisabled);
        }

        info!("BrowserProbe: Launching headless browser for {}", ctx.url);

        let request_body = BrowserProbeRequest {
            url: ctx.url.clone(),
            poll_cf: true, // run ensureCfPassed flow
            js_code: None,
            wait_until: "load".to_string(),
            timeout_ms: (ctx.timeout_secs * 1000) as u32,
        };

        let mut req = self.client.post(self.probe_url()).json(&request_body);

        if let Some(ref api_key) = self.config.api_key {
            req = req.header("X-API-Key", api_key);
        }

        let response = req.send().await.map_err(|e| {
            warn!("BrowserProbe: Request failed: {}", e);
            EngineError::Network {
                message: format!("Browser probe service error: {}", e),
            }
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            warn!("BrowserProbe: Service returned error: {} - {}", status, text);
            return Err(EngineError::Network {
                message: format!("Browser probe service returned {}", status),
            });
        }

        let body: BrowserProbeResponse = response.json().await.map_err(|e| {
            warn!("BrowserProbe: Failed to parse response: {}", e);
            EngineError::JsonParse {
                message: format!("Invalid response from browser probe service: {}", e),
            }
        })?;

        if let Some(error) = body.error {
            warn!("BrowserProbe: Service error: {}", error);
            return Err(EngineError::CloudflareChallengeFailed);
        }

        let status = if body.status == 0 && body.cf_bypassed {
            200
        } else {
            body.status
        };

        if (status == 403 || status == 429) && !body.cf_bypassed {
            warn!("BrowserProbe: Still blocked after browser probe: {}", status);
            return Err(EngineError::CloudflareChallenge);
        }

        info!("BrowserProbe: {} status={}", if body.cf_bypassed { "success" } else { "partial" }, status);

        Ok(FetchResponse {
            status,
            headers: HashMap::new(),
            body: body.html,
            url: ctx.url.clone(),
        })
    }
}
