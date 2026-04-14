//! CF Bypass Strategy
//!
//! Direct Cloudflare bypass via HTTP REST API (cf-bypass-service)

use async_trait::async_trait;
use nexus_core::{
    AntiCrawlStrategy, CloudflareBypassConfig, EngineError, FetchContext, FetchResponse,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, info, warn};

/// Jina Reader Strategy: fetch HTML via r.jina.ai
///
/// Useful as a best-effort fallback for targets behind anti-bot protections.
pub struct JinaReaderStrategy {
    client: Client,
}

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

impl JinaReaderStrategy {
    pub fn new(timeout_seconds: u64) -> Result<Self, EngineError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_seconds))
            .build()
            .map_err(|e| EngineError::InvalidConfig {
                message: format!("Failed to build Jina Reader HTTP client: {}", e),
            })?;
        Ok(Self { client })
    }

    fn jina_url(&self, url: &str) -> String {
        format!("https://r.jina.ai/{}", url)
    }
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
impl AntiCrawlStrategy for JinaReaderStrategy {
    fn name(&self) -> &str {
        "JinaReader"
    }

    fn level(&self) -> u8 {
        2
    }

    fn should_apply(&self, _response: &FetchResponse) -> bool {
        true
    }

    fn supports_script(&self) -> bool {
        false
    }

    async fn execute(&self, ctx: &mut FetchContext) -> Result<FetchResponse, EngineError> {
        // Jina Reader is effectively GET-only for our use; for other methods, fall back.
        if !ctx.method.eq_ignore_ascii_case("GET") {
            return Err(EngineError::Network {
                message: "JinaReader only supports GET".to_string(),
            });
        }

        let url = self.jina_url(&ctx.url);
        let mut req = self.client.get(url).header("x-respond-with", "html");
        // Preserve UA if provided by the source; Jina may use it for upstream fetch.
        if let Some(ua) = ctx
            .headers
            .get("user-agent")
            .or_else(|| ctx.headers.get("User-Agent"))
        {
            req = req.header(reqwest::header::USER_AGENT, ua);
        }

        let response = req.send().await.map_err(|e| EngineError::Network {
            message: format!("Jina reader request failed: {}", e),
        })?;

        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();

        Ok(FetchResponse {
            status,
            headers: HashMap::new(),
            body,
            url: ctx.url.clone(),
        })
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
