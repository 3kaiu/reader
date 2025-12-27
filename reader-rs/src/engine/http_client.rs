//! HTTP Client for book source requests
//!
//! Features:
//! - URL template parsing ({{key}})
//! - Request config parsing (URL,{JSON})
//! - Custom headers, charset, proxy support
//! - Cookie management with CookieManager
//! - Configurable retry with exponential backoff

use super::cookie::CookieManager;
use super::flaresolverr::{is_cloudflare_challenge, FlareSolverrClient};

use super::utils::resolve_absolute_url;
use anyhow::Result;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, COOKIE, SET_COOKIE};
use std::collections::HashMap;
use std::time::Duration;
use std::sync::OnceLock;

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

/// Rate limiter for controlling request frequency
/// Format: "count/milliseconds" e.g. "1/1000" = 1 request per 1000ms
#[derive(Debug)]
pub struct RateLimiter {
    last_request: std::sync::Mutex<std::time::Instant>,
    interval: Duration,
}

impl RateLimiter {
    /// Create a new rate limiter from concurrentRate string
    /// Format: "count/milliseconds" e.g. "1/1000"
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

    /// Wait for rate limit if needed
    pub fn wait(&self) {
        let mut last = self.last_request.lock().unwrap();
        let elapsed = last.elapsed();
        if elapsed < self.interval {
            std::thread::sleep(self.interval - elapsed);
        }
        *last = std::time::Instant::now();
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
        Self::with_headers(base_url, None)
    }

    /// Create a new HTTP client with source-level default headers
    pub fn with_headers(base_url: &str, headers_json: Option<&str>) -> Result<Self> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .cookie_store(true)
            .gzip(true)
            .build()?;

        // Parse source-level headers from JSON string
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
        let mut client = Self::with_headers(base_url, headers_json)?;
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

    /// Set rate limiter from concurrentRate string
    pub fn set_rate_limit(&mut self, rate_str: &str) {
        self.rate_limiter = RateLimiter::new(rate_str);
    }

    /// Parse URL with template variables
    pub fn parse_url_template(&self, template: &str, vars: &HashMap<String, String>) -> String {
        let mut result = template.to_string();

        for (key, value) in vars {
            // Replace {{key}} with value
            let placeholder = format!("{{{{{}}}}}", key);
            result = result.replace(&placeholder, value);

            // Also handle {{key-1}} for page-1
            if let Ok(num) = value.parse::<i32>() {
                let placeholder_minus = format!("{{{{{}-1}}}}", key);
                let value_minus = (num - 1).to_string();
                result = result.replace(&placeholder_minus, &value_minus);

                let placeholder_plus = format!("{{{{{}+1}}}}", key);
                let value_plus = (num + 1).to_string();
                result = result.replace(&placeholder_plus, &value_plus);
            }
        }

        result
    }

    /// Parse request config from URL string
    /// Supports formats:
    /// - Simple URL: "http://example.com"
    /// - URL with config: "http://example.com,{\"method\":\"POST\",\"body\":\"...\"}"
    /// - Pure JSON: "{\"url\":\"...\",\"method\":\"...\"}"
    pub fn parse_request_config(&self, url_str: &str) -> RequestConfig {
        let url_str = url_str.trim();
        let mut config = RequestConfig::default();

        // Try pure JSON format: {"url": "...", "method": "...", "body": "..."}
        if url_str.starts_with('{') {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(url_str) {
                if let Some(url) = json.get("url").and_then(|v| v.as_str()) {
                    config.url = self.absolute_url(url);
                    config.method = json
                        .get("method")
                        .and_then(|v| v.as_str())
                        .unwrap_or("GET")
                        .to_string();
                    config.body = json
                        .get("body")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    config.charset = json
                        .get("charset")
                        .and_then(|v| v.as_str())
                        .unwrap_or("UTF-8")
                        .to_string();
                    config.web_view = json
                        .get("webView")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    config.web_js = json
                        .get("js")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    self.parse_headers_from_json(&json, &mut config);
                    return config;
                }
            }
        }

        // Try Legado format: http://xxx.com,{"method": "POST", "body": "..."}
        if let Some(pos) = url_str.rfind(",{") {
            let url_part = &url_str[..pos];
            let json_part = &url_str[pos + 1..];

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_part) {
                config.url = self.absolute_url(url_part);
                config.method = json
                    .get("method")
                    .and_then(|v| v.as_str())
                    .unwrap_or("GET")
                    .to_string();
                config.body = json
                    .get("body")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                config.charset = json
                    .get("charset")
                    .and_then(|v| v.as_str())
                    .unwrap_or("UTF-8")
                    .to_string();
                config.web_view = json
                    .get("webView")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                config.web_js = json
                    .get("js")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                self.parse_headers_from_json(&json, &mut config);
                return config;
            }
        }

        // Simple URL
        config.url = self.absolute_url(url_str);
        config
    }

    /// Make a request based on config (internal, without retry)
    fn request_internal(&self, config: &RequestConfig) -> Result<String> {
        // println!("DEBUG: request_internal called for {}", config.url);
        // Apply rate limiting if configured
        if let Some(ref limiter) = self.rate_limiter {
            limiter.wait();
        }

        let mut request = if config.method.to_uppercase() == "POST" {
            self.client.post(&config.url)
        } else {
            self.client.get(&config.url)
        };

        // Add headers - merge default headers with request-specific headers
        let mut header_map = HeaderMap::new();

        // Apply default headers first
        for (key, value) in &self.default_headers {
            if let (Ok(name), Ok(val)) = (
                HeaderName::try_from(key.as_str()),
                HeaderValue::from_str(value),
            ) {
                header_map.insert(name, val);
            }
        }

        // Then apply request-specific headers (can override defaults)
        if let Some(ref headers) = config.headers {
            for (key, value) in headers {
                if let (Ok(name), Ok(val)) = (
                    HeaderName::try_from(key.as_str()),
                    HeaderValue::from_str(value),
                ) {
                    header_map.insert(name, val);
                }
            }
        }

        // Add cookies from cookie manager
        let domain = extract_domain(&config.url);
        if let Some(cookie_header) = self.cookie_manager.get_cookie_header(&domain) {
            if let Ok(val) = HeaderValue::from_str(&cookie_header) {
                header_map.insert(COOKIE, val);
            }
        }

        if !header_map.is_empty() {
            tracing::debug!("Request headers for {}: {:?}", config.url, header_map);
            request = request.headers(header_map);
        } else {
            tracing::debug!("No headers for {}", config.url);
        }

        // Add body for POST - URL-encode form values if needed
        if let Some(ref body) = config.body {
            // Check if this looks like form data (key=value&key2=value2)
            // and encode the values appropriately for non-ASCII characters
            println!("DEBUG: Processing POST body: {}", body);
            let encoded_body = if body.contains('=') && !body.starts_with('{') {
                // This looks like form-urlencoded data, encode the values
                body.split('&')
                    .map(|pair| {
                        if let Some(eq_pos) = pair.find('=') {
                            let key = &pair[..eq_pos];
                            let value = &pair[eq_pos + 1..];
                            // Only encode if value contains non-ASCII or needs encoding
                            let encoded_value = urlencoding::encode(value);
                            format!("{}={}", key, encoded_value)
                        } else {
                            pair.to_string()
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("&")
            } else {
                body.clone()
            };
            
            tracing::debug!("POST body (encoded): {}", &encoded_body.chars().take(200).collect::<String>());
            request = request.body(encoded_body);
        }

        // Set timeout
        request = request.timeout(config.timeout);

        let response = request.send()?;

        // Parse Set-Cookie headers and store in cookie manager
        for cookie in response.headers().get_all(SET_COOKIE) {
            if let Ok(cookie_str) = cookie.to_str() {
                self.cookie_manager.parse_set_cookie(&domain, cookie_str);
            }
        }

        // Extract charset from Content-Type header BEFORE consuming response
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
                            tracing::debug!(
                                "Detected charset from response header: {}",
                                final_charset
                            );
                        }
                    }
                }
            }
        }

        // Decode response with specified charset (consumes response)
        let bytes = response.bytes()?;

        let text = decode_with_charset(&bytes, &final_charset);

        // Check for Cloudflare challenge and try Flaresolverr as fallback
        if is_cloudflare_challenge(&text) {
            tracing::info!("Cloudflare challenge detected for {}, trying Flaresolverr", config.url);
            return self.request_with_flaresolverr(config);
        }

        Ok(text)
    }

    /// Make a request using Flaresolverr to bypass Cloudflare
    fn request_with_flaresolverr(&self, config: &RequestConfig) -> Result<String> {
        let client = get_flaresolverr();
        
        // Use tokio runtime for async call
        let rt = tokio::runtime::Runtime::new()?;
        
        let result = rt.block_on(async {
            if config.method.to_uppercase() == "POST" {
                let body = config.body.clone().unwrap_or_default();
                client.solve_post(&config.url, &body).await
            } else {
                client.solve_get(&config.url).await
            }
        });
        
        match result {
            Ok(solution) => {
                // Save cookies from Flaresolverr to our cookie manager
                let domain = extract_domain(&config.url);
                for cookie in &solution.cookies {
                    let cookie_str = format!("{}={}; Path=/", cookie.name, cookie.value);
                    self.cookie_manager.parse_set_cookie(&domain, &cookie_str);
                }
                tracing::info!("Flaresolverr succeeded, got {} cookies", solution.cookies.len());
                Ok(solution.response)
            }
            Err(e) => {
                tracing::warn!("Flaresolverr failed: {}", e);
                Err(e)
            }
        }
    }

    /// Make a request based on config (with automatic retry)
    /// If web_view is true, uses headless browser for JavaScript-heavy pages
    pub fn request(&self, config: &RequestConfig) -> Result<String> {
        // Check if webView mode is requested
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
                        let delay = self.retry_config.delay_for_attempt(attempt);
                        tracing::warn!(
                            "Request to {} failed, retry {}/{} after {:?}",
                            config.url,
                            attempt + 1,
                            max_retries,
                            delay
                        );
                        std::thread::sleep(delay);
                    }
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Request failed")))
    }

    /// Make a request using WebView (headless browser)
    fn request_webview(&self, config: &RequestConfig) -> Result<String> {
        use super::webview::WebViewExecutor;

        tracing::info!("Using WebView for request to: {}", config.url);

        // Try to create WebView executor
        let executor = match WebViewExecutor::new() {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("WebView not available: {}, falling back to HTTP", e);
                // Fallback to normal HTTP request
                return self.request_internal(config);
            }
        };

        // For POST requests with webView, we need to handle them differently
        // WebView doesn't directly support POST, so we use JavaScript to submit
        if config.method.to_uppercase() == "POST" {
            let body = config.body.clone().unwrap_or_default();

            // Actually, for search pages, we might need to do this differently
            // Let's try navigating directly and see what happens
            let result = executor.render(
                None,
                Some(&config.url),
                Some("document.documentElement.outerHTML"),
            )?;

            // If we got a result but it looks like a placeholder page, try submitting via fetch
            if result.len() < 1000 || !result.contains("dl") {
                // Try using fetch API to do POST
                let fetch_js = format!(
                    r#"
                    (async function() {{
                        try {{
                            const response = await fetch('{}', {{
                                method: 'POST',
                                headers: {{'Content-Type': 'application/x-www-form-urlencoded'}},
                                body: '{}'
                            }});
                            const text = await response.text();
                            return text;
                        }} catch(e) {{
                            return 'Error: ' + e.message;
                        }}
                    }})()
                "#,
                    config.url,
                    body.replace("'", "\\'")
                );

                match executor.render(None, Some(&config.url), Some(&fetch_js)) {
                    Ok(r) if !r.is_empty() && !r.starts_with("Error:") => return Ok(r),
                    _ => {}
                }
            }

            return Ok(result);
        }

        // For GET requests, simply navigate and get content
        let js = config
            .web_js
            .clone()
            .unwrap_or_else(|| "document.documentElement.outerHTML".to_string());
        executor.render(None, Some(&config.url), Some(&js))
    }

    /// Simple GET request
    pub fn get(&self, url: &str) -> Result<String> {
        let config = self.parse_request_config(url);
        self.request(&config)
    }

    /// Simple POST request
    pub fn post(&self, url: &str, body: &str) -> Result<String> {
        let mut config = self.parse_request_config(url);
        config.method = "POST".to_string();
        config.body = Some(body.to_string());
        self.request(&config)
    }

    /// GET request without following redirects
    /// Returns RedirectResponse with status code, headers, and body
    pub fn get_no_redirect(
        &self,
        url: &str,
        headers: HashMap<String, String>,
    ) -> Result<RedirectResponse> {
        self.request_no_redirect(url, "GET", None, headers)
    }

    /// POST request without following redirects
    /// Returns RedirectResponse with status code, headers, and body
    pub fn post_no_redirect(
        &self,
        url: &str,
        body: &str,
        headers: HashMap<String, String>,
    ) -> Result<RedirectResponse> {
        self.request_no_redirect(url, "POST", Some(body), headers)
    }

    /// Internal method for requests without redirect following
    fn request_no_redirect(
        &self,
        url: &str,
        method: &str,
        body: Option<&str>,
        mut headers: HashMap<String, String>,
    ) -> Result<RedirectResponse> {
        // Create a client that doesn't follow redirects
        let client = reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .build()?;

        // Merge default headers
        for (k, v) in &self.default_headers {
            headers.entry(k.clone()).or_insert_with(|| v.clone());
        }

        // Build request
        let mut request = if method == "POST" {
            client.post(url)
        } else {
            client.get(url)
        };

        // Add headers
        let mut header_map = HeaderMap::new();
        for (key, value) in &headers {
            if let (Ok(name), Ok(val)) = (
                HeaderName::try_from(key.as_str()),
                HeaderValue::from_str(value),
            ) {
                header_map.insert(name, val);
            }
        }

        // Add cookies
        let domain = extract_domain(url);
        if let Some(cookie_header) = self.cookie_manager.get_cookie_header(&domain) {
            if let Ok(val) = HeaderValue::from_str(&cookie_header) {
                header_map.insert(COOKIE, val);
            }
        }

        request = request.headers(header_map);

        // Add body for POST
        if let Some(body_str) = body {
            request = request.body(body_str.to_string());
        }

        let response = request.send()?;

        // Extract response data
        let status = response.status().as_u16();
        let location = response
            .headers()
            .get("location")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        // Extract all headers
        let mut resp_headers = HashMap::new();
        for (key, value) in response.headers() {
            if let Ok(v) = value.to_str() {
                resp_headers.insert(key.as_str().to_string(), v.to_string());
            }
        }

        // Store cookies
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

    // === Private methods ===

    /// Convert relative URL to absolute
    pub fn absolute_url(&self, url: &str) -> String {
        resolve_absolute_url(&self.base_url, url)
    }

    /// Parse headers from JSON config
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

/// Decode bytes with specified charset
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
            // Try UTF-8 first
            match std::str::from_utf8(bytes) {
                Ok(s) => s.to_string(),
                Err(_) => {
                    // If UTF-8 fails, check if we can find a meta tag suggesting GBK
                    // Convert prefix to lossy string to search for meta tags
                    let prefix_len = bytes.len().min(1024);
                    let prefix = String::from_utf8_lossy(&bytes[..prefix_len]).to_lowercase();
                    
                    if prefix.contains("charset=gb") || prefix.contains("charset=\"gb") || prefix.contains("charset=\'gb") {
                         tracing::debug!("Detected GBK charset from meta tag in body");
                         let (result, _, _) = GB18030.decode(bytes);
                         return result.into_owned();
                    }
                
                    // Fallback to UTF-8 with replacement
                    let (result, _, _) = UTF_8.decode(bytes);
                    result.into_owned()
                }
            }
        }
        _ => {
            // Unknown charset, try UTF-8
            String::from_utf8_lossy(bytes).into_owned()
        }
    }
}

/// Extract domain from URL for cookie management
fn extract_domain(url: &str) -> String {
    // Try to parse URL and extract host
    if let Some(start) = url.find("://") {
        let after_scheme = &url[start + 3..];
        let end = after_scheme.find('/').unwrap_or(after_scheme.len());
        let host_port = &after_scheme[..end];
        // Remove port if present
        let host = host_port.split(':').next().unwrap_or(host_port);
        return host.to_string();
    }
    url.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_url_template() {
        let client = HttpClient::new("https://example.com").unwrap();
        let mut vars = HashMap::new();
        vars.insert("key".to_string(), "test".to_string());
        vars.insert("page".to_string(), "2".to_string());

        let result = client.parse_url_template("/search?q={{key}}&p={{page}}", &vars);
        assert_eq!(result, "/search?q=test&p=2");

        let result = client.parse_url_template("/p/{{page-1}}", &vars);
        assert_eq!(result, "/p/1");
    }

    #[test]
    fn test_parse_request_config_simple() {
        let client = HttpClient::new("https://example.com").unwrap();
        let config = client.parse_request_config("https://api.example.com/search");

        assert_eq!(config.url, "https://api.example.com/search");
        assert_eq!(config.method, "GET");
    }

    #[test]
    fn test_parse_request_config_with_json() {
        let client = HttpClient::new("https://example.com").unwrap();
        let config = client.parse_request_config(
            r#"https://api.example.com/search,{"method":"POST","body":"q=test"}"#,
        );

        assert_eq!(config.url, "https://api.example.com/search");
        assert_eq!(config.method, "POST");
        assert_eq!(config.body, Some("q=test".to_string()));
    }

    #[test]
    fn test_absolute_url() {
        let client = HttpClient::new("https://example.com/books").unwrap();

        assert_eq!(
            client.parse_request_config("/search").url,
            "https://example.com/search"
        );

        // Relative URL without leading slash is resolved relative to the directory
        // Since base is "https://example.com/books", the directory is "https://example.com/"
        assert_eq!(
            client.parse_request_config("chapter/1").url,
            "https://example.com/chapter/1"
        );
    }
    
    #[test]
    fn test_post_body_encoding() {
        let body = "key=斗破苍穹&type=all";
        
        let encoded_body = if body.contains('=') && !body.starts_with('{') {
            body.split('&')
                .map(|pair| {
                    if let Some(eq_pos) = pair.find('=') {
                        let key = &pair[..eq_pos];
                        let value = &pair[eq_pos + 1..];
                        let encoded_value = urlencoding::encode(value);
                        format!("{}={}", key, encoded_value)
                    } else {
                        pair.to_string()
                    }
                })
                .collect::<Vec<_>>()
                .join("&")
        } else {
            body.to_string()
        };
        
        assert_eq!(encoded_body, "key=%E6%96%97%E7%A0%B4%E8%8B%8D%E7%A9%B9&type=all");
    }
}
