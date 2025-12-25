//! Native HTTP Operations - Pure Rust HTTP API implementations
//!
//! This module provides Rust-native implementations of java.ajax/post/get APIs,
//! reusing the existing HttpClient infrastructure.

use anyhow::Result;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

/// HTTP Response from native API
#[derive(Debug, Clone)]
pub struct NativeHttpResponse {
    /// Response body as string
    pub body: String,
    /// Response headers
    pub headers: HashMap<String, String>,
    /// HTTP status code
    pub status_code: u16,
    /// Final URL (after redirects)
    pub url: String,
}

impl NativeHttpResponse {
    /// Convert to JSON string for JS compatibility
    pub fn to_json(&self) -> String {
        serde_json::json!({
            "body": self.body,
            "headers": self.headers,
            "code": self.status_code,
            "url": self.url
        }).to_string()
    }
}

/// Native HTTP Client for direct Rust execution
pub struct NativeHttpClient {
    client: reqwest::blocking::Client,
    cache_dir: PathBuf,
    default_headers: HashMap<String, String>,
}

impl NativeHttpClient {
    /// Create a new NativeHttpClient
    pub fn new(cache_dir: PathBuf) -> Result<Self> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .danger_accept_invalid_certs(true)
            .gzip(true)
            .build()?;
        
        Ok(Self {
            client,
            cache_dir,
            default_headers: HashMap::new(),
        })
    }
    
    /// Create with default headers
    pub fn with_headers(cache_dir: PathBuf, headers: HashMap<String, String>) -> Result<Self> {
        let mut client = Self::new(cache_dir)?;
        client.default_headers = headers;
        Ok(client)
    }
    
    /// Execute HTTP GET request
    pub fn get(&self, url: &str, headers: &HashMap<String, String>) -> Result<NativeHttpResponse> {
        self.request("GET", url, None, headers)
    }
    
    /// Execute HTTP POST request
    pub fn post(&self, url: &str, body: &str, headers: &HashMap<String, String>) -> Result<NativeHttpResponse> {
        self.request("POST", url, Some(body), headers)
    }
    
    /// Execute generic HTTP request
    pub fn request(
        &self, 
        method: &str, 
        url: &str, 
        body: Option<&str>, 
        headers: &HashMap<String, String>
    ) -> Result<NativeHttpResponse> {
        let method = match method.to_uppercase().as_str() {
            "POST" => reqwest::Method::POST,
            "PUT" => reqwest::Method::PUT,
            "DELETE" => reqwest::Method::DELETE,
            "PATCH" => reqwest::Method::PATCH,
            "HEAD" => reqwest::Method::HEAD,
            _ => reqwest::Method::GET,
        };
        
        let mut request = self.client.request(method, url);
        
        // Add default headers first
        for (key, value) in &self.default_headers {
            request = request.header(key.as_str(), value.as_str());
        }
        
        // Add request-specific headers (override defaults)
        for (key, value) in headers {
            request = request.header(key.as_str(), value.as_str());
        }
        
        // Add body for POST/PUT
        if let Some(body_str) = body {
            request = request
                .header("Content-Type", "application/x-www-form-urlencoded")
                .body(body_str.to_string());
        }
        
        let response = request.send()?;
        
        let status_code = response.status().as_u16();
        let final_url = response.url().to_string();
        
        // Collect headers
        let mut resp_headers = HashMap::new();
        for (name, value) in response.headers().iter() {
            if let Ok(val_str) = value.to_str() {
                resp_headers.insert(name.as_str().to_string(), val_str.to_string());
            }
        }
        
        let body = response.text().unwrap_or_default();
        
        Ok(NativeHttpResponse {
            body,
            headers: resp_headers,
            status_code,
            url: final_url,
        })
    }
    
    /// Execute concurrent GET requests
    pub fn get_all(&self, urls: &[String]) -> Vec<NativeHttpResponse> {
        use std::thread;
        
        let handles: Vec<_> = urls.iter().map(|url| {
            let url = url.clone();
            let client = self.client.clone();
            
            thread::spawn(move || {
                let response = client
                    .get(&url)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    .send()
                    .ok()?;
                
                let status_code = response.status().as_u16();
                let final_url = response.url().to_string();
                
                let mut headers = HashMap::new();
                for (name, value) in response.headers().iter() {
                    if let Ok(val_str) = value.to_str() {
                        headers.insert(name.as_str().to_string(), val_str.to_string());
                    }
                }
                
                let body = response.text().unwrap_or_default();
                
                Some(NativeHttpResponse {
                    body,
                    headers,
                    status_code,
                    url: final_url,
                })
            })
        }).collect();
        
        handles.into_iter()
            .filter_map(|h| h.join().ok().flatten())
            .collect()
    }
    
    /// Cache file from URL with expiry time
    pub fn cache_file(&self, url: &str, save_time: i32) -> Result<String> {
        use std::fs;
        use std::time::SystemTime;
        
        // Create cache directory if needed
        fs::create_dir_all(&self.cache_dir)?;
        
        // Generate cache key from URL
        let cache_key = format!("{:x}", md5::compute(url));
        let cache_path = self.cache_dir.join(&cache_key);
        
        // Check if cache is valid
        if cache_path.exists() {
            if save_time == 0 {
                // No expiry, use cached
                if let Ok(content) = fs::read_to_string(&cache_path) {
                    return Ok(content);
                }
            } else if let Ok(metadata) = fs::metadata(&cache_path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(elapsed) = SystemTime::now().duration_since(modified) {
                        if elapsed.as_secs() < save_time as u64 {
                            if let Ok(content) = fs::read_to_string(&cache_path) {
                                return Ok(content);
                            }
                        }
                    }
                }
            }
        }
        
        // Download and cache
        let response = self.get(url, &HashMap::new())?;
        
        // Save to cache
        if !response.body.is_empty() {
            let _ = fs::write(&cache_path, &response.body);
        }
        
        Ok(response.body)
    }
    
    /// Import external script (with caching)
    pub fn import_script(&self, path: &str) -> Result<String> {
        use std::fs;
        
        if path.starts_with("http://") || path.starts_with("https://") {
            // Download with permanent cache
            self.cache_file(path, 0)
        } else {
            // Local file
            Ok(fs::read_to_string(path)?)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    
    fn create_test_client() -> NativeHttpClient {
        let cache_dir = env::temp_dir().join("reader_rs_test_cache");
        NativeHttpClient::new(cache_dir).unwrap()
    }
    
    #[test]
    fn test_response_to_json() {
        let resp = NativeHttpResponse {
            body: "test body".to_string(),
            headers: HashMap::from([("content-type".to_string(), "text/html".to_string())]),
            status_code: 200,
            url: "https://example.com".to_string(),
        };
        
        let json = resp.to_json();
        assert!(json.contains("\"body\":\"test body\""));
        assert!(json.contains("\"code\":200"));
    }
    
    // HTTP tests would require network access, skip in unit tests
}
