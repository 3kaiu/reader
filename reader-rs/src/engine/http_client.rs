//! HTTP Client for book source requests
//!
//! Features:
//! - URL template parsing ({{key}})
//! - Request config parsing (URL,{JSON})
//! - Custom headers, charset, proxy support
//! - Cookie management with CookieManager
//! - Configurable retry with exponential backoff
//! - Blocking Request (using reqwest::blocking)

use super::cookie::CookieManager;
use super::flaresolverr::{is_cloudflare_challenge, FlareSolverrClient};
use super::utils::resolve_absolute_url;
use anyhow::{Context, Result};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, COOKIE, SET_COOKIE};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

/// Global Flaresolverr client (lazily initialized)
static FLARESOLVERR_CLIENT: OnceLock<FlareSolverrClient> = OnceLock::new();

/// Get or create the global Flaresolverr client
fn get_flaresolverr() -> &'static FlareSolverrClient {
    FLARESOLVERR_CLIENT.get_or_init(FlareSolverrClient::new)
}

/// Request configuration parsed from URL,{JSON} format
#[derive(Debug, Clone)]
pub struct RequestConfig {
    pub url: String,
    pub method: String,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub charset: String,
    pub timeout: Duration,
    pub retry: u32,
    /// Whether to use WebView (headless browser) for rendering
    pub web_view: bool,
    /// JavaScript to execute after page load (for webView)
    pub web_js: Option<String>,
}

impl Default for RequestConfig {
    fn default() -> Self {
        Self {
            url: String::new(),
            method: "GET".to_string(),
            headers: None,
            body: None,
            charset: "UTF-8".to_string(),
            timeout: Duration::from_secs(10),
            retry: 3,
            web_view: false,
            web_js: None,
        }
    }
}

/// Response from a request that doesn't follow redirects
#[derive(Debug, Clone)]
pub struct RedirectResponse {
    /// Original request URL
    pub url: String,
    /// HTTP status code
    pub status_code: u16,
    /// Response headers
    pub headers: HashMap<String, String>,
    /// Response body
    pub body: String,
    /// Location header (redirect target) if present
    pub location: Option<String>,
}

impl RedirectResponse {
    /// Get a specific header value
    pub fn header(&self, name: &str) -> Option<&String> {
        self.headers.get(&name.to_lowercase())
    }

    /// Check if response is a redirect (3xx status)
    pub fn is_redirect(&self) -> bool {
        (300..400).contains(&self.status_code)
    }

    /// Get cookie from Set-Cookie header
    pub fn cookie(&self, name: &str) -> Option<String> {
        self.headers.get("set-cookie").and_then(|cookie_str| {
            for part in cookie_str.split(';') {
                let part = part.trim();
                if part.starts_with(&format!("{}=", name)) {
                    return Some(part[name.len() + 1..].to_string());
                }
            }
            None
        })
    }
}

/// Retry configuration with exponential backoff
#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
    pub exponential: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_delay_ms: 500,
            max_delay_ms: 5000,
            exponential: true,
        }
    }
}

impl RetryConfig {
    /// Calculate delay for a given retry attempt
    pub fn delay_for_attempt(&self, attempt: u32) -> Duration {
        if self.exponential {
            let delay = self.base_delay_ms * (2_u64.pow(attempt));
            Duration::from_millis(delay.min(self.max_delay_ms))
        } else {
            Duration::from_millis(self.base_delay_ms)
        }
    }
}

/// Rate limiter for controlling request frequency(Blocking)
#[derive(Debug)]
pub struct RateLimiter {
    last_request: std::sync::Mutex<std::time::Instant>,
    interval: Duration,
}

impl RateLimiter {
    pub fn new(rate_str: &str) -> Option<Self> {
        let parts: Vec<&str> = rate_str.split('/').collect();
        if parts.len() == 2 {
            if let (Ok(_count), Ok(ms)) = (parts[0].parse::<u32>(), parts[1].parse::<u64>()) {
                return Some(Self {
                    last_request: std::sync::Mutex::new(std::time::Instant::now()),
                    interval: Duration::from_millis(ms),
                });
            }
        }
        None
    }

    pub fn wait(&self) {
        let wait_time = {
            let mut last = self.last_request.lock().unwrap();
            let elapsed = last.elapsed();
            if elapsed < self.interval {
                Some(self.interval - elapsed)
            } else {
                *last = std::time::Instant::now();
                None
            }
        };

        if let Some(duration) = wait_time {
            std::thread::sleep(duration);
            let mut last = self.last_request.lock().unwrap();
            *last = std::time::Instant::now();
        }
    }
}

/// HTTP Client for making requests
pub struct HttpClient {
    client: reqwest::blocking::Client,
    base_url: String,
    default_headers: HashMap<String, String>,
    rate_limiter: Option<RateLimiter>,
    cookie_manager: CookieManager,
    retry_config: RetryConfig,
}

impl HttpClient {
    /// Create a new HTTP client with optional default headers
    pub fn new(base_url: &str) -> Result<Self> {
        Self::with_config(base_url, None, None)
    }

    /// Create a new HTTP client with source-level config
    pub fn with_config(
        base_url: &str,
        headers_json: Option<&str>,
        _fingerprint: Option<&str>,
    ) -> Result<Self> {
        // Build blocking client
        let client = reqwest::blocking::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
            .timeout(Duration::from_secs(30))
            .cookie_store(true)
            .gzip(true)
            .brotli(true)
            .build()
            .context("Failed to build HTTP client")?;

        // Parse source-level headers
        let default_headers = if let Some(json_str) = headers_json {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(obj) = json.as_object() {
                    obj.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect()
                } else {
                    HashMap::new()
                }
            } else {
                HashMap::new()
            }
        } else {
            HashMap::new()
        };

        Ok(Self {
            client,
            base_url: base_url.to_string(),
            default_headers,
            rate_limiter: None,
            cookie_manager: CookieManager::new(),
            retry_config: RetryConfig::default(),
        })
    }

    /// Create with shared cookie manager
    pub fn with_cookie_manager(
        base_url: &str,
        headers_json: Option<&str>,
        cookie_manager: CookieManager,
    ) -> Result<Self> {
        let mut client = Self::with_config(base_url, headers_json, None)?;
        client.cookie_manager = cookie_manager;
        Ok(client)
    }

    /// Get reference to cookie manager
    pub fn cookie_manager(&self) -> &CookieManager {
        &self.cookie_manager
    }

    /// Get mutable reference to cookie manager
    pub fn cookie_manager_mut(&mut self) -> &mut CookieManager {
        &mut self.cookie_manager
    }

    /// Set retry configuration
    pub fn set_retry_config(&mut self, config: RetryConfig) {
        self.retry_config = config;
    }

    /// Set rate limiter
    pub fn set_rate_limit(&mut self, rate_str: &str) {
        self.rate_limiter = RateLimiter::new(rate_str);
    }

    /// Parse URL template
    pub fn parse_url_template(&self, template: &str, vars: &HashMap<String, String>) -> String {
        let mut result = template.to_string();
        for (key, value) in vars {
            let placeholder = format!("{{{{{}}}}}", key);
            result = result.replace(&placeholder, value);
            if let Ok(num) = value.parse::<i32>() {
                let placeholder_minus = format!("{{{{{}-1}}}}", key);
                result = result.replace(&placeholder_minus, &(num - 1).to_string());
                let placeholder_plus = format!("{{{{{}+1}}}}", key);
                result = result.replace(&placeholder_plus, &(num + 1).to_string());
            }
        }
        result
    }

    /// Parse request config
    pub fn parse_request_config(&self, url_str: &str) -> RequestConfig {
        let url_str = url_str.trim();
        let mut config = RequestConfig::default();

        if url_str.starts_with('{') {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(url_str) {
                if let Some(url) = json.get("url").and_then(|v| v.as_str()) {
                    config.url = self.absolute_url(url);
                    config.method = json.get("method").and_then(|v| v.as_str()).unwrap_or("GET").to_string();
                    config.body = json.get("body").and_then(|v| v.as_str()).map(|s| s.to_string());
                    config.charset = json.get("charset").and_then(|v| v.as_str()).unwrap_or("UTF-8").to_string();
                    config.web_view = json.get("webView").and_then(|v| v.as_bool()).unwrap_or(false);
                    config.web_js = json.get("js").and_then(|v| v.as_str()).map(|s| s.to_string());
                    self.parse_headers_from_json(&json, &mut config);
                    return config;
                }
            }
        }

        if let Some(pos) = url_str.rfind(",{") {
            let url_part = &url_str[..pos];
            let json_part = &url_str[pos + 1..];
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_part) {
                config.url = self.absolute_url(url_part);
                config.method = json.get("method").and_then(|v| v.as_str()).unwrap_or("GET").to_string();
                config.body = json.get("body").and_then(|v| v.as_str()).map(|s| s.to_string());
                config.charset = json.get("charset").and_then(|v| v.as_str()).unwrap_or("UTF-8").to_string();
                config.web_view = json.get("webView").and_then(|v| v.as_bool()).unwrap_or(false);
                config.web_js = json.get("js").and_then(|v| v.as_str()).map(|s| s.to_string());
                self.parse_headers_from_json(&json, &mut config);
                return config;
            }
        }

        config.url = self.absolute_url(url_str);
        config
    }

    fn request_internal(&self, config: &RequestConfig) -> Result<String> {
        if let Some(ref limiter) = self.rate_limiter {
            limiter.wait();
        }

        let mut request = if config.method.to_uppercase() == "POST" {
            self.client.post(&config.url)
        } else {
            self.client.get(&config.url)
        };

        let mut header_map = HeaderMap::new();
        for (key, value) in &self.default_headers {
            if let (Ok(name), Ok(val)) = (HeaderName::try_from(key.as_str()), HeaderValue::from_str(value)) {
                header_map.insert(name, val);
            }
        }
        if let Some(ref headers) = config.headers {
            for (key, value) in headers {
                if let (Ok(name), Ok(val)) = (HeaderName::try_from(key.as_str()), HeaderValue::from_str(value)) {
                    header_map.insert(name, val);
                }
            }
        }

        let domain = extract_domain(&config.url);
        if let Some(cookie_header) = self.cookie_manager.get_cookie_header(&domain) {
            if let Ok(val) = HeaderValue::from_str(&cookie_header) {
                header_map.insert(COOKIE, val);
            }
        }

        if !header_map.is_empty() {
            tracing::debug!("Request headers for {}: {:?}", config.url, header_map);
            request = request.headers(header_map);
        }

        if let Some(ref body) = config.body {
             let encoded_body = if body.contains('=') && !body.starts_with('{') {
                body.split('&').map(|pair| {
                        if let Some(eq_pos) = pair.find('=') {
                            let key = &pair[..eq_pos];
                            let value = &pair[eq_pos + 1..];
                            let encoded_value = urlencoding::encode(value);
                            format!("{}={}", key, encoded_value)
                        } else {
                            pair.to_string()
                        }
                    }).collect::<Vec<_>>().join("&")
            } else {
                body.clone()
            };
            request = request.body(encoded_body);
        }

        request = request.timeout(config.timeout);

        // Blocking execute
        let response = request.send()?;

        for cookie in response.headers().get_all(SET_COOKIE) {
            if let Ok(cookie_str) = cookie.to_str() {
                self.cookie_manager.parse_set_cookie(&domain, cookie_str);
            }
        }

        let mut final_charset = config.charset.clone();
        if final_charset == "UTF-8" || final_charset.is_empty() {
            if let Some(content_type) = response.headers().get(reqwest::header::CONTENT_TYPE) {
                if let Ok(ct_str) = content_type.to_str() {
                    if let Some(pos) = ct_str.find("charset=") {
                        let charset_part = &ct_str[pos + 8..];
                        let end = charset_part.find(';').unwrap_or(charset_part.len());
                        let detected = charset_part[..end].trim().to_uppercase();
                        if !detected.is_empty() {
                            final_charset = detected;
                        }
                    }
                }
            }
        }

        // Decode
        let bytes = response.bytes()?;
        let text = decode_with_charset(&bytes, &final_charset);

        if is_cloudflare_challenge(&text) {
             tracing::info!("Cloudflare challenge detected for {}, trying Flaresolverr", config.url);
             return self.request_with_flaresolverr(config);
        }

        Ok(text)
    }

    fn request_with_flaresolverr(&self, config: &RequestConfig) -> Result<String> {
        let client = get_flaresolverr();
        let result = if config.method.to_uppercase() == "POST" {
            let body = config.body.clone().unwrap_or_default();
            client.solve_post(&config.url, &body)
        } else {
            client.solve_get(&config.url)
        };

        match result {
            Ok(solution) => {
                let domain = extract_domain(&config.url);
                for cookie in &solution.cookies {
                    let cookie_str = format!("{}={}; Path=/", cookie.name, cookie.value);
                    self.cookie_manager.parse_set_cookie(&domain, &cookie_str);
                }
                tracing::info!("Flaresolverr succeeded");
                Ok(solution.response)
            }
            Err(e) => {
                tracing::warn!("Flaresolverr failed: {}", e);
                Err(e)
            }
        }
    }

    pub fn request(&self, config: &RequestConfig) -> Result<String> {
        if config.web_view {
            return self.request_webview(config);
        }
        let max_retries = config.retry.min(self.retry_config.max_retries);
        if max_retries == 0 {
            return self.request_internal(config);
        }
        let mut last_error = None;
        for attempt in 0..=max_retries {
            match self.request_internal(config) {
                Ok(result) => return Ok(result),
                Err(e) => {
                    last_error = Some(e);
                    if attempt < max_retries {
                        std::thread::sleep(self.retry_config.delay_for_attempt(attempt));
                    }
                }
            }
        }
        Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Request failed")))
    }

    fn request_webview(&self, config: &RequestConfig) -> Result<String> {
        use super::webview::WebViewExecutor;
        tracing::info!("Using WebView for request to: {}", config.url);
        let executor = match WebViewExecutor::new() {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("WebView not available: {}, falling back to HTTP", e);
                return Err(anyhow::anyhow!("WebView not available"));
            }
        };

        if config.method.to_uppercase() == "POST" {
             let body = config.body.clone().unwrap_or_default();
             let fetch_js = format!("(async function() {{ try {{ const response = await fetch('{}', {{ method: 'POST', headers: {{'Content-Type': 'application/x-www-form-urlencoded'}}, body: '{}' }}); const text = await response.text(); return text; }} catch(e) {{ return 'Error: ' + e.message; }} }})()", config.url, body.replace("'", "\\'"));
             return executor.render(None, Some(&config.url), Some(&fetch_js));
        }
        let js = config.web_js.clone().unwrap_or_else(|| "document.documentElement.outerHTML".to_string());
        executor.render(None, Some(&config.url), Some(&js))
    }

    pub fn get(&self, url: &str) -> Result<String> {
        let config = self.parse_request_config(url);
        self.request(&config)
    }

    pub fn post(&self, url: &str, body: &str) -> Result<String> {
        let mut config = self.parse_request_config(url);
        config.method = "POST".to_string();
        config.body = Some(body.to_string());
        self.request(&config)
    }

    pub fn get_no_redirect(&self, url: &str, headers: HashMap<String, String>) -> Result<RedirectResponse> {
        self.request_no_redirect(url, "GET", None, headers)
    }

    pub fn post_no_redirect(&self, url: &str, body: &str, headers: HashMap<String, String>) -> Result<RedirectResponse> {
        self.request_no_redirect(url, "POST", Some(body), headers)
    }

    fn request_no_redirect(
        &self,
        url: &str,
        method: &str,
        body: Option<&str>,
        mut headers: HashMap<String, String>,
    ) -> Result<RedirectResponse> {
        let client = reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .build()?;

        for (k, v) in &self.default_headers {
            headers.entry(k.clone()).or_insert_with(|| v.clone());
        }

        let mut header_map = HeaderMap::new();
        for (key, value) in &headers {
            if let (Ok(name), Ok(val)) = (HeaderName::try_from(key.as_str()), HeaderValue::from_str(value)) {
                header_map.insert(name, val);
            }
        }

        let domain = extract_domain(url);
        if let Some(cookie_header) = self.cookie_manager.get_cookie_header(&domain) {
            if let Ok(val) = HeaderValue::from_str(&cookie_header) {
                header_map.insert(COOKIE, val);
            }
        }

        let mut request = if method == "POST" { client.post(url) } else { client.get(url) };
        request = request.headers(header_map);
        if let Some(body_str) = body {
            request = request.body(body_str.to_string());
        }

        let response = request.send()?;
        let status = response.status().as_u16();
        let location = response.headers().get("location").and_then(|v| v.to_str().ok().map(|s| s.to_string()));
        
        // Headers map
        let mut resp_headers = HashMap::new();
        for (key, value) in response.headers() {
             if let Ok(v) = value.to_str() {
                 resp_headers.insert(key.as_str().to_string(), v.to_string());
             }
        }

        for cookie in response.headers().get_all(SET_COOKIE) {
            if let Ok(cookie_str) = cookie.to_str() {
                self.cookie_manager.parse_set_cookie(&domain, cookie_str);
            }
        }

        let body_text = response.text().unwrap_or_default();

        Ok(RedirectResponse {
            url: url.to_string(),
            status_code: status,
            headers: resp_headers,
            body: body_text,
            location,
        })
    }

    pub fn absolute_url(&self, url: &str) -> String {
        resolve_absolute_url(&self.base_url, url)
    }

    fn parse_headers_from_json(&self, json: &serde_json::Value, config: &mut RequestConfig) {
        if let Some(headers) = json.get("headers") {
            if let Some(obj) = headers.as_object() {
                let mut map = HashMap::new();
                for (key, value) in obj {
                    if let Some(v) = value.as_str() {
                        map.insert(key.clone(), v.to_string());
                    }
                }
                if !map.is_empty() {
                    config.headers = Some(map);
                }
            }
        }
    }
}

fn decode_with_charset(bytes: &[u8], charset: &str) -> String {
    use encoding_rs::{GB18030, GBK, UTF_8};
    match charset.to_lowercase().as_str() {
        "gbk" | "gb2312" => {
            let (result, _, _) = GBK.decode(bytes);
            result.into_owned()
        }
        "gb18030" => {
            let (result, _, _) = GB18030.decode(bytes);
            result.into_owned()
        }
        "utf-8" | "utf8" | "" => {
            match std::str::from_utf8(bytes) {
                Ok(s) => s.to_string(),
                Err(_) => {
                    let (result, _, _) = UTF_8.decode(bytes);
                    result.into_owned()
                }
            }
        }
        _ => String::from_utf8_lossy(bytes).into_owned()
    }
}

fn extract_domain(url: &str) -> String {
    if let Some(start) = url.find("://") {
        let after_scheme = &url[start + 3..];
        let end = after_scheme.find('/').unwrap_or(after_scheme.len());
        let host_port = &after_scheme[..end];
        let host = host_port.split(':').next().unwrap_or(host_port);
        return host.to_string();
    }
    url.to_string()
}
