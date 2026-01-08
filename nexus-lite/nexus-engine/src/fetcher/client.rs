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

/// HTTP fetcher using reqwest
pub struct HttpFetcher {
    client: Arc<Client>,
    #[allow(dead_code)]
    timeout: Duration,
}

impl HttpFetcher {
    /// Create a new HTTP fetcher with optimized connection pool
    pub fn new(timeout_seconds: u64) -> Result<Self, EngineError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_seconds))
            .connect_timeout(Duration::from_secs(10))
            // Connection pool optimization
            .pool_max_idle_per_host(20)           // Increased from 5 for high concurrency
            .pool_idle_timeout(Duration::from_secs(90))  // Keep connections alive longer
            // TCP optimization
            .tcp_keepalive(Duration::from_secs(60))  // Prevent connection drops
            .tcp_nodelay(true)                       // Reduce latency
            // Compression
            .gzip(true)
            .brotli(true)
            // Session
            .cookie_store(true)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| EngineError::Network(e.to_string()))?;

        Ok(Self {
            client: Arc::new(client),
            timeout: Duration::from_secs(timeout_seconds),
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
        debug!("GET {}", url);

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
        debug!("POST {}", url);

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
