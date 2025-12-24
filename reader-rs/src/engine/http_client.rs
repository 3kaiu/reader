//! HTTP Client for book source requests
//!
//! Features:
//! - URL template parsing ({{key}})
//! - Request config parsing (URL,{JSON})
//! - Custom headers, charset, proxy support
//! - Cookie management

use anyhow::Result;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use std::collections::HashMap;
use std::time::Duration;
use super::utils::resolve_absolute_url;

/// Request configuration parsed from URL,{JSON} format
#[derive(Debug, Clone)]
pub struct RequestConfig {
    pub url: String,
    pub method: String,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub charset: String,
    pub timeout: Duration,
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
        }
    }
}

/// HTTP Client for making requests
pub struct HttpClient {
    client: reqwest::blocking::Client,
    base_url: String,
    default_headers: HashMap<String, String>,
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
        })
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
                    config.method = json.get("method")
                        .and_then(|v| v.as_str())
                        .unwrap_or("GET")
                        .to_string();
                    config.body = json.get("body")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    config.charset = json.get("charset")
                        .and_then(|v| v.as_str())
                        .unwrap_or("UTF-8")
                        .to_string();
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
                config.method = json.get("method")
                    .and_then(|v| v.as_str())
                    .unwrap_or("GET")
                    .to_string();
                config.body = json.get("body")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                config.charset = json.get("charset")
                    .and_then(|v| v.as_str())
                    .unwrap_or("UTF-8")
                    .to_string();
                self.parse_headers_from_json(&json, &mut config);
                return config;
            }
        }
        
        // Simple URL
        config.url = self.absolute_url(url_str);
        config
    }
    
    /// Make a request based on config
    pub fn request(&self, config: &RequestConfig) -> Result<String> {
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
        
        if !header_map.is_empty() {
            tracing::debug!("Request headers for {}: {:?}", config.url, header_map);
            request = request.headers(header_map);
        } else {
            tracing::debug!("No headers for {}", config.url);
        }
        
        // Add body for POST
        if let Some(ref body) = config.body {
            request = request.body(body.clone());
        }
        
        // Set timeout
        request = request.timeout(config.timeout);
        
        let response = request.send()?;
        
        // Decode response with specified charset
        let bytes = response.bytes()?;
        let text = decode_with_charset(&bytes, &config.charset);
        
        Ok(text)
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
    
    /// Request with retry on failure
    pub fn request_with_retry(&self, config: &RequestConfig, max_retries: u32) -> Result<String> {
        let mut last_error = None;
        
        for i in 0..=max_retries {
            match self.request(config) {
                Ok(result) => return Ok(result),
                Err(e) => {
                    last_error = Some(e);
                    if i < max_retries {
                        let delay = Duration::from_millis(500 * (i as u64 + 1));
                        tracing::warn!("Request failed, retry {}/{} after {:?}", i + 1, max_retries, delay);
                        std::thread::sleep(delay);
                    }
                }
            }
        }
        
        Err(last_error.unwrap_or_else(|| anyhow::anyhow!("Request failed")))
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
    use encoding_rs::{GBK, GB18030, UTF_8};
    
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
            // Try UTF-8 first, fallback to lossy conversion
            match std::str::from_utf8(bytes) {
                Ok(s) => s.to_string(),
                Err(_) => {
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
            r#"https://api.example.com/search,{"method":"POST","body":"q=test"}"#
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
        
        assert_eq!(
            client.parse_request_config("chapter/1").url,
            "https://example.com/books/chapter/1"
        );
    }
}
