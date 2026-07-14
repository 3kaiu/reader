//! CF Bypass Strategy
//!
//! Direct Cloudflare bypass via HTTP REST API (bypass service)

use crate::fetcher::cookie_cache::{self, CookieCache};
use async_trait::async_trait;
use nexus_core::{
    AntiCrawlStrategy, CloudflareBypassConfig, EngineError, FetchContext, FetchResponse,
};
use primp::imp::Impersonate;
use primp::Client as PrimpClient;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
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
    cookie_cache: Arc<CookieCache>,
    concurrency_limiter: Semaphore,
}

/// Direct HTTP strategy used as a fallback.
/// Optionally backed by CookieCache: when cached CF cookies exist for a domain,
/// they are injected into the request to avoid re-triggering challenges.
pub struct DirectHttpStrategy {
    client: Client,
    cookie_cache: Option<Arc<CookieCache>>,
}

/// TLS-impersonated HTTP strategy using primp.
/// Mimics a real browser's TLS fingerprint (JA3/JA4) to bypass Cloudflare edge
/// detection without requiring the external bypass service or a browser.
/// Tried FIRST before falling back to CfBypassStrategy.
pub struct PrimpHttpStrategy {
    client: PrimpClient,
    _impersonate: Impersonate,
    cookie_cache: Option<Arc<CookieCache>>,
}

impl CfBypassStrategy {
    pub fn new(
        config: CloudflareBypassConfig,
        cookie_cache: Arc<CookieCache>,
    ) -> Result<Self, EngineError> {
        let max_concurrent = config.max_concurrent.max(1);
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .map_err(|e| EngineError::InvalidConfig {
                message: format!("Failed to build HTTP client: {}", e),
            })?;

        debug!("CfBypassStrategy initialized: service_url={}", config.service_url);

        Ok(Self {
            config,
            client,
            cookie_cache,
            concurrency_limiter: Semaphore::new(max_concurrent),
        })
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
        Ok(Self {
            client,
            cookie_cache: None,
        })
    }

    pub fn with_cookie_cache(mut self, cache: Arc<CookieCache>) -> Self {
        self.cookie_cache = Some(cache);
        self
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

        let domain = cookie_cache::extract_domain(&ctx.url);
        let user_agent = ctx.headers.get("User-Agent").cloned().unwrap_or_default();

        // Check cookie cache before calling the bypass service
        if let Some(cached) = self.cookie_cache.get(&domain, &user_agent, "") {
            debug!("CF Bypass: Using cached cookies for {}", domain);
            let cookie_header = cached
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join("; ");
            ctx.headers.insert("Cookie".to_string(), cookie_header);

            // Try direct fetch with cached cookies first
            let method = ctx.method.to_ascii_uppercase();
            let client = Client::builder()
                .timeout(Duration::from_secs(ctx.timeout_secs))
                .build()
                .map_err(|e| EngineError::Network {
                    message: format!("Failed to build direct client: {}", e),
                })?;
            let mut req = match method.as_str() {
                "POST" => client
                    .post(&ctx.url)
                    .body(ctx.body.clone().unwrap_or_default()),
                _ => client.get(&ctx.url),
            };
            for (k, v) in &ctx.headers {
                req = req.header(k, v);
            }
            let resp = req.send().await.map_err(|e| EngineError::Network {
                message: format!("Cached cookie request failed: {}", e),
            })?;
            let resp_status = resp.status().as_u16();
            if resp_status != 403 && resp_status != 429 {
                let mut headers = HashMap::new();
                for (k, v) in resp.headers() {
                    if let Ok(s) = v.to_str() {
                        headers.insert(k.to_string(), s.to_string());
                    }
                }
                let body = resp.text().await.map_err(|e| EngineError::Network {
                    message: format!("Failed to read cached response body: {}", e),
                })?;
                if body.len() > 200
                    && !body.contains("cf-browser-verification")
                    && !body.contains("Just a moment")
                {
                    info!("CF Bypass: Cached cookies valid for {}, skipping bypass", domain);
                    return Ok(FetchResponse {
                        status: resp_status,
                        headers,
                        body,
                        url: ctx.url.clone(),
                    });
                }
            }
            debug!("CF Bypass: Cached cookies expired/invalid for {}, re-solving", domain);
            self.cookie_cache.invalidate(&domain);
        }

        info!("CF Bypass: Fetching {}", ctx.url);

        // Try to acquire a concurrency permit. If the bypass service is saturated,
        // skip this strategy and let the chain fall through.
        let _permit = match self.concurrency_limiter.try_acquire() {
            Ok(permit) => permit,
            Err(_) => {
                debug!("CF Bypass: Concurrency limit reached, skipping");
                return Err(EngineError::StrategyDisabled);
            },
        };

        let request_headers = if ctx.headers.is_empty() {
            None
        } else {
            Some(ctx.headers.clone())
        };

        let request_body = CfFetchRequest {
            url: ctx.url.clone(),
            method: ctx.method.clone(),
            headers: request_headers,
            body: ctx.body.clone(),
            timeout: ctx.timeout_secs as u32,
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

        // Store returned cookies in cache after successful bypass
        if body.cf_bypassed && !body.cookies.is_empty() {
            let cookies_vec: Vec<(String, String)> = body
                .cookies
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            self.cookie_cache
                .set(&domain, cookies_vec, &ctx.url, &user_agent, "");
            debug!("CF Bypass: Stored {} cookies for {}", body.cookies.len(), domain);
        }

        if let Some(error) = body.error {
            warn!("CF Bypass: Service error: {}", error);
            return Err(EngineError::CloudflareChallengeFailed);
        }

        let status = if body.status == 0 && body.cf_bypassed {
            info!("CF Bypass: Normalizing status 0 to 200 OK");
            200
        } else {
            body.status
        };

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

impl PrimpHttpStrategy {
    pub fn new(timeout_seconds: u64) -> Result<Self, EngineError> {
        let client = PrimpClient::builder()
            .impersonate(Impersonate::ChromeV146)
            .timeout(Duration::from_secs(timeout_seconds))
            .pool_max_idle_per_host(100)
            .pool_idle_timeout(Duration::from_secs(120))
            .tcp_keepalive(Duration::from_secs(60))
            .tcp_nodelay(true)
            .build()
            .map_err(|e| EngineError::InvalidConfig {
                message: format!("Failed to build primp HTTP client: {}", e),
            })?;
        info!("PrimpHttpStrategy initialized (impersonate=ChromeV146)");
        Ok(Self {
            client,
            _impersonate: Impersonate::ChromeV146,
            cookie_cache: None,
        })
    }

    pub fn with_cookie_cache(mut self, cache: Arc<CookieCache>) -> Self {
        self.cookie_cache = Some(cache);
        self
    }
}

#[async_trait]
impl AntiCrawlStrategy for PrimpHttpStrategy {
    fn name(&self) -> &str {
        "PrimpHTTP"
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
        if let Some(ref cache) = self.cookie_cache {
            let domain = cookie_cache::extract_domain(&ctx.url);
            let user_agent = ctx.headers.get("User-Agent").cloned().unwrap_or_default();
            if let Some(cached) = cache.get(&domain, &user_agent, "") {
                let cookie_header = cached
                    .iter()
                    .map(|(k, v)| format!("{}={}", k, v))
                    .collect::<Vec<_>>()
                    .join("; ");
                ctx.headers.insert("Cookie".to_string(), cookie_header);
            }
        }

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
            message: format!("Primp request failed: {}", e),
        })?;
        let status = resp.status().as_u16();

        // Single pass: build headers HashMap + extract Set-Cookie
        let mut headers = HashMap::new();
        let mut response_cookies: Vec<(String, String)> = Vec::new();
        for (k, v) in resp.headers() {
            if let Ok(s) = v.to_str() {
                headers.insert(k.to_string(), s.to_string());
                if k.as_str().eq_ignore_ascii_case("set-cookie") {
                    if let Some(eq_pos) = s.find('=') {
                        let semi_pos = s.find(';').unwrap_or(s.len());
                        response_cookies
                            .push((s[..eq_pos].to_string(), s[eq_pos + 1..semi_pos].to_string()));
                    }
                }
            }
        }

        let body = resp.text().await.map_err(|e| EngineError::Network {
            message: format!("Failed to read primp response body: {}", e),
        })?;

        // Store cookies in cache for other strategies to reuse
        if !response_cookies.is_empty() {
            if let Some(ref cache) = self.cookie_cache {
                let domain = cookie_cache::extract_domain(&ctx.url);
                let user_agent = ctx.headers.get("User-Agent").cloned().unwrap_or_default();
                cache.set(&domain, response_cookies, &ctx.url, &user_agent, "");
            }
        }

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
        // Inject cached cookies if available
        if let Some(ref cache) = self.cookie_cache {
            let domain = cookie_cache::extract_domain(&ctx.url);
            let user_agent = ctx.headers.get("User-Agent").cloned().unwrap_or_default();
            if let Some(cached) = cache.get(&domain, &user_agent, "") {
                let cookie_header = cached
                    .iter()
                    .map(|(k, v)| format!("{}={}", k, v))
                    .collect::<Vec<_>>()
                    .join("; ");
                ctx.headers.insert("Cookie".to_string(), cookie_header);
            }
        }

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
    cookie_cache: Arc<CookieCache>,
    concurrency_limiter: Semaphore,
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
    cookies: HashMap<String, String>,
    cf_bypassed: bool,
    #[serde(default)]
    error: Option<String>,
}

impl BrowserProbeStrategy {
    pub fn new(
        config: CloudflareBypassConfig,
        cookie_cache: Arc<CookieCache>,
    ) -> Result<Self, EngineError> {
        let max_concurrent = config.max_concurrent.max(1);
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds * 2)) // browser probe can be slower
            .build()
            .map_err(|e| EngineError::InvalidConfig {
                message: format!("Failed to build HTTP client: {}", e),
            })?;
        debug!("BrowserProbeStrategy initialized: service_url={}", config.service_url);
        Ok(Self {
            config,
            client,
            cookie_cache,
            concurrency_limiter: Semaphore::new(max_concurrent),
        })
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

        // Try to acquire a concurrency permit. If the bypass service is saturated,
        // skip this strategy and let the chain fall through.
        let _permit = match self.concurrency_limiter.try_acquire() {
            Ok(permit) => permit,
            Err(_) => {
                debug!("BrowserProbe: Concurrency limit reached, skipping");
                return Err(EngineError::StrategyDisabled);
            },
        };

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

        // Store returned cookies in cache after successful probe
        if body.cf_bypassed && !body.cookies.is_empty() {
            let domain = cookie_cache::extract_domain(&ctx.url);
            let user_agent = ctx.headers.get("User-Agent").cloned().unwrap_or_default();
            let cookies_vec: Vec<(String, String)> = body
                .cookies
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            self.cookie_cache
                .set(&domain, cookies_vec, &ctx.url, &user_agent, "");
            debug!("BrowserProbe: Stored {} cookies for {}", body.cookies.len(), domain);
        }

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

        info!(
            "BrowserProbe: {} status={}",
            if body.cf_bypassed {
                "success"
            } else {
                "partial"
            },
            status
        );

        Ok(FetchResponse {
            status,
            headers: HashMap::new(),
            body: body.html,
            url: ctx.url.clone(),
        })
    }
}
