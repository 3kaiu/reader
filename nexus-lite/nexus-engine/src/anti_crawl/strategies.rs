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

impl CfBypassStrategy {
    pub fn new(config: CloudflareBypassConfig) -> Result<Self, EngineError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .map_err(|e| {
                EngineError::InvalidConfig { message: format!("Failed to build HTTP client: {}", e) }
            })?;

        debug!(
            "CfBypassStrategy initialized: service_url={}",
            config.service_url
        );

        Ok(Self { config, client })
    }

    fn fetch_url(&self) -> String {
        format!("{}/fetch", self.config.service_url.trim_end_matches('/'))
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
            EngineError::Network { message: format!("CF bypass service error: {}", e) }
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            warn!("CF Bypass: Service returned error: {} - {}", status, text);
            return Err(EngineError::Network { message: format!(
                "CF bypass service returned {}",
                status
            ) });
        }

        let body: CfFetchResponse = response.json().await.map_err(|e| {
            warn!("CF Bypass: Failed to parse response: {}", e);
            EngineError::JsonParse { message: format!("Invalid response from CF bypass service: {}", e) }
        })?;

        if let Some(error) = body.error {
            warn!("CF Bypass: Service error: {}", error);
            return Err(EngineError::Network { message: error });
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
            return Err(EngineError::Network(format!(
                "HTTP {} for {}",
                status, ctx.url
            )));
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
