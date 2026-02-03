//! HTTP client implementation

use async_trait::async_trait;
use nexus_core::{EngineError, FetchResponse, Fetcher};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client,
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tracing::debug;

/// HTTP fetcher using reqwest with optimized async handling
pub struct HttpFetcher {
    client: Arc<Client>,
    #[allow(dead_code)]
    timeout: Duration,
    max_concurrent_requests: usize,
    semaphore: Arc<tokio::sync::Semaphore>,
}

impl HttpFetcher {
    /// Create a new HTTP fetcher with optimized connection pool and concurrency control
    pub fn new(timeout_seconds: u64) -> Result<Self, EngineError> {
        Self::with_concurrency(timeout_seconds, 10) // Default 10 concurrent requests
    }

    /// Create with custom concurrency limit
    pub fn with_concurrency(timeout_seconds: u64, max_concurrent: usize) -> Result<Self, EngineError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_seconds))
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(timeout_seconds))
            .write_timeout(Duration::from_secs(30))
            // Enhanced connection pool optimization
            .pool_max_idle_per_host(50) // Further increased for high concurrency
            .pool_idle_timeout(Duration::from_secs(120)) // Keep connections alive longer
            .pool_max_idle_per_host(100) // Allow more idle connections
            // Advanced TCP optimization
            .tcp_keepalive(Duration::from_secs(60))
            .tcp_nodelay(true)
            .tcp_user_timeout(Duration::from_secs(timeout_seconds * 1000))
            // Enhanced compression
            .gzip(true)
            .brotli(true)
            .deflate(true)
            // Session management
            .cookie_store(true)
            .user_agent("Mozilla/5.0 (compatible; NexusLite/1.0)")
            .build()
            .map_err(|e| EngineError::Network(e.to_string()))?;

        Ok(Self {
            client: Arc::new(client),
            timeout: Duration::from_secs(timeout_seconds),
            max_concurrent_requests: max_concurrent,
            semaphore: Arc::new(tokio::sync::Semaphore::new(max_concurrent)),
        })
    }

    /// Access the internal client
    pub fn client(&self) -> &Arc<Client> {
        &self.client
    }

    /// Create with custom client
    pub fn with_client(client: Arc<Client>, timeout_seconds: u64) -> Self {
        Self {
            client,
            timeout: Duration::from_secs(timeout_seconds),
            max_concurrent_requests: 10, // Default concurrency
            semaphore: Arc::new(tokio::sync::Semaphore::new(10)),
        }
    }

    /// Convert HashMap to HeaderMap
    fn build_headers(&self, headers: Option<HashMap<String, String>>) -> HeaderMap {
        let mut header_map = HeaderMap::new();

        if let Some(h) = headers {
            for (key, value) in h {
                if let (Ok(name), Ok(val)) = (
                    HeaderName::try_from(key.as_str()),
                    HeaderValue::from_str(&value),
                ) {
                    header_map.insert(name, val);
                }
            }
        }

        // Default headers
        if !header_map.contains_key("Accept") {
            header_map.insert(
                reqwest::header::ACCEPT,
                HeaderValue::from_static(
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                ),
            );
        }
        if !header_map.contains_key("Accept-Language") {
            header_map.insert(
                reqwest::header::ACCEPT_LANGUAGE,
                HeaderValue::from_static("zh-CN,zh;q=0.9,en;q=0.8"),
            );
        }

        // Random User-Agent if not provided
        if !header_map.contains_key("User-Agent") {
            let ua = crate::fetcher::user_agents::get_random_user_agent();
            if let Ok(val) = HeaderValue::from_str(ua) {
                header_map.insert(reqwest::header::USER_AGENT, val);
            }
        }

        header_map
    }

    /// Convert reqwest response to FetchResponse
    async fn convert_response(
        &self,
        resp: reqwest::Response,
    ) -> Result<FetchResponse, EngineError> {
        let status = resp.status().as_u16();
        let url = resp.url().to_string();

        let mut headers = HashMap::new();
        for (key, value) in resp.headers() {
            if let Ok(v) = value.to_str() {
                headers.insert(key.to_string(), v.to_string());
            }
        }

        let body = resp
            .text()
            .await
            .map_err(|e| EngineError::Network(e.to_string()))?;

        Ok(FetchResponse {
            status,
            headers,
            body,
            url,
        })
    }
}

#[async_trait]
impl Fetcher for HttpFetcher {
    async fn get(
        &self,
        url: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, EngineError> {
        debug!("GET {} (concurrency: {}/{})", url, self.max_concurrent_requests - self.semaphore.available_permits(), self.max_concurrent_requests);

        // Acquire semaphore permit for concurrency control
        let _permit = self.semaphore.acquire().await
            .map_err(|e| EngineError::Network(format!("Semaphore acquire failed: {}", e)))?;

        let header_map = self.build_headers(headers);

        let resp = self
            .client
            .get(url)
            .headers(header_map)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    EngineError::Timeout
                } else if e.is_connect() {
                    EngineError::ConnectionRefused(e.to_string())
                } else {
                    EngineError::Network(e.to_string())
                }
            })?;

        self.convert_response(resp).await
    }

    async fn post(
        &self,
        url: &str,
        body: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, EngineError> {
        debug!("POST {} (concurrency: {}/{})", url, self.max_concurrent_requests - self.semaphore.available_permits(), self.max_concurrent_requests);

        // Acquire semaphore permit for concurrency control
        let _permit = self.semaphore.acquire().await
            .map_err(|e| EngineError::Network(format!("Semaphore acquire failed: {}", e)))?;

        let header_map = self.build_headers(headers);

        let resp = self
            .client
            .post(url)
            .headers(header_map)
            .body(body.to_string())
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    EngineError::Timeout
                } else if e.is_connect() {
                    EngineError::ConnectionRefused(e.to_string())
                } else {
                    EngineError::Network(e.to_string())
                }
            })?;

        self.convert_response(resp).await
    }

    /// Execute request with retry logic
    pub async fn execute_with_retry<F, Fut>(
        &self,
        operation: F,
        max_retries: usize,
        base_delay_ms: u64,
    ) -> Result<FetchResponse, EngineError>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<FetchResponse, EngineError>>,
    {
        let mut last_error = None;

        for attempt in 0..=max_retries {
            match operation().await {
                Ok(response) => return Ok(response),
                Err(e) => {
                    last_error = Some(e.clone());

                    // Don't retry on certain errors
                    if matches!(e, EngineError::Unauthorized | EngineError::InvalidConfig(_)) {
                        return Err(e);
                    }

                    // Don't retry on the last attempt
                    if attempt == max_retries {
                        break;
                    }

                    // Exponential backoff
                    let delay_ms = base_delay_ms * (2_u64.pow(attempt as u32));
                    debug!("Request failed (attempt {}), retrying in {}ms: {:?}", attempt + 1, delay_ms, e);
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                }
            }
        }

        Err(last_error.unwrap_or_else(|| EngineError::Network("Max retries exceeded".to_string())))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetcher_creation() {
        let fetcher = HttpFetcher::new(30);
        assert!(fetcher.is_ok());
    }
}
