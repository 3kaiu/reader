//! HTTP client implementation

use async_trait::async_trait;
use nexus_core::{EngineError, FetchResponse, Fetcher, FetcherStatistics};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tracing::debug;

/// HTTP fetcher using reqwest with optimized async handling
pub struct HttpFetcher {
    client: Arc<Client>,
    max_concurrent_requests: usize,
    semaphore: Arc<tokio::sync::Semaphore>,
    // Lock-free statistics counters
    total_requests: AtomicU64,
    successful_requests: AtomicU64,
    failed_requests: AtomicU64,
    total_bytes_downloaded: AtomicU64,
    // Response time tracking (lock-free, approximate)
    response_time_min_ns: AtomicU64,
    response_time_max_ns: AtomicU64,
    response_time_sum_ns: AtomicU64,
    response_time_count: AtomicU64,
}

impl HttpFetcher {
    /// Create a new HTTP fetcher with optimized connection pool and concurrency control
    pub fn new(timeout_seconds: u64) -> Result<Self, EngineError> {
        Self::with_concurrency(timeout_seconds, 10) // Default 10 concurrent requests
    }

    /// Create from `ResourceLimits` configuration (all params externalized)
    pub fn from_config(limits: &nexus_core::config::ResourceLimits) -> Result<Self, EngineError> {
        let max_concurrent = limits.http_max_concurrent;
        let client = Client::builder()
            .timeout(Duration::from_secs(limits.http_timeout_seconds))
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(limits.http_timeout_seconds))
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(limits.pool_max_idle_per_host)
            .pool_idle_timeout(Duration::from_secs(limits.pool_idle_timeout_secs))
            .tcp_keepalive(Duration::from_secs(limits.tcp_keepalive_secs))
            .tcp_nodelay(true)
            .cookie_store(true)
            .user_agent("Mozilla/5.0 (compatible; Nexus/1.0)")
            .build()
            .map_err(|e: reqwest::Error| EngineError::Network {
                message: e.to_string(),
            })?;

        Ok(Self {
            client: Arc::new(client),
            max_concurrent_requests: max_concurrent,
            semaphore: Arc::new(tokio::sync::Semaphore::new(max_concurrent)),
            total_requests: AtomicU64::new(0),
            successful_requests: AtomicU64::new(0),
            failed_requests: AtomicU64::new(0),
            total_bytes_downloaded: AtomicU64::new(0),
            response_time_min_ns: AtomicU64::new(u64::MAX),
            response_time_max_ns: AtomicU64::new(0),
            response_time_sum_ns: AtomicU64::new(0),
            response_time_count: AtomicU64::new(0),
        })
    }

    /// Create with custom concurrency limit
    pub fn with_concurrency(
        timeout_seconds: u64,
        max_concurrent: usize,
    ) -> Result<Self, EngineError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_seconds))
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(timeout_seconds))
            .redirect(reqwest::redirect::Policy::none())
            // Enhanced connection pool optimization
            .pool_max_idle_per_host(100) // Allow more idle connections
            .pool_idle_timeout(Duration::from_secs(120)) // Keep connections alive longer
            // Advanced TCP optimization
            .tcp_keepalive(Duration::from_secs(60))
            .tcp_nodelay(true)
            // Session management
            .cookie_store(true)
            .user_agent("Mozilla/5.0 (compatible; Nexus/1.0)")
            .build()
            .map_err(|e: reqwest::Error| EngineError::Network {
                message: e.to_string(),
            })?;

        Ok(Self {
            client: Arc::new(client),
            max_concurrent_requests: max_concurrent,
            semaphore: Arc::new(tokio::sync::Semaphore::new(max_concurrent)),
            total_requests: AtomicU64::new(0),
            successful_requests: AtomicU64::new(0),
            failed_requests: AtomicU64::new(0),
            total_bytes_downloaded: AtomicU64::new(0),
            response_time_min_ns: AtomicU64::new(u64::MAX),
            response_time_max_ns: AtomicU64::new(0),
            response_time_sum_ns: AtomicU64::new(0),
            response_time_count: AtomicU64::new(0),
        })
    }

    /// Access the internal client
    pub fn client(&self) -> &Arc<Client> {
        &self.client
    }

    /// Create with custom client
    pub fn with_client(client: Arc<Client>) -> Self {
        Self {
            client,
            max_concurrent_requests: 10, // Default concurrency
            semaphore: Arc::new(tokio::sync::Semaphore::new(10)),
            total_requests: AtomicU64::new(0),
            successful_requests: AtomicU64::new(0),
            failed_requests: AtomicU64::new(0),
            total_bytes_downloaded: AtomicU64::new(0),
            response_time_min_ns: AtomicU64::new(u64::MAX),
            response_time_max_ns: AtomicU64::new(0),
            response_time_sum_ns: AtomicU64::new(0),
            response_time_count: AtomicU64::new(0),
        }
    }

    /// Convert HashMap to HeaderMap with dangerous header filtering
    fn build_headers(&self, headers: Option<HashMap<String, String>>) -> HeaderMap {
        let mut header_map = HeaderMap::new();

        if let Some(h) = headers {
            for (key, value) in h {
                let key_lower = key.to_ascii_lowercase();
                // Block dangerous headers that could enable request smuggling or SSRF
                if matches!(
                    key_lower.as_str(),
                    "host"
                        | "transfer-encoding"
                        | "content-length"
                        | "content-encoding"
                        | "upgrade"
                        | "connection"
                        | "proxy-connection"
                        | "keep-alive"
                ) {
                    continue;
                }
                if let (Ok(name), Ok(val)) =
                    (HeaderName::try_from(key.as_str()), HeaderValue::from_str(&value))
                {
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
            .map_err(|e: reqwest::Error| EngineError::Network {
                message: e.to_string(),
            })?;

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
        use std::sync::atomic::Ordering;

        let start_time = std::time::Instant::now();
        self.total_requests.fetch_add(1, Ordering::Relaxed);

        debug!(
            "GET {} (concurrency: {}/{})",
            url,
            self.max_concurrent_requests - self.semaphore.available_permits(),
            self.max_concurrent_requests
        );

        // Acquire semaphore permit for concurrency control
        let _permit = self.semaphore.acquire().await.map_err(|e| {
            self.failed_requests.fetch_add(1, Ordering::Relaxed);
            EngineError::Network {
                message: format!("Semaphore acquire failed: {}", e),
            }
        })?;

        let header_map = self.build_headers(headers);

        let resp = self
            .client
            .get(url)
            .headers(header_map)
            .send()
            .await
            .map_err(|e| {
                self.failed_requests.fetch_add(1, Ordering::Relaxed);
                if e.is_timeout() {
                    EngineError::Timeout
                } else if e.is_connect() {
                    EngineError::ConnectionRefused {
                        message: e.to_string(),
                    }
                } else {
                    EngineError::Network {
                        message: e.to_string(),
                    }
                }
            })?;

        let response = self.convert_response(resp).await?;
        self.successful_requests.fetch_add(1, Ordering::Relaxed);
        self.total_bytes_downloaded
            .fetch_add(response.body.len() as u64, Ordering::Relaxed);

        // Track response time (lock-free)
        let elapsed = start_time.elapsed().as_nanos() as u64;
        // Update min, max, sum, count atomically
        loop {
            let current = self.response_time_min_ns.load(Ordering::Relaxed);
            if elapsed >= current {
                break;
            }
            if self
                .response_time_min_ns
                .compare_exchange_weak(current, elapsed, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
            {
                break;
            }
        }
        loop {
            let current = self.response_time_max_ns.load(Ordering::Relaxed);
            if elapsed <= current {
                break;
            }
            if self
                .response_time_max_ns
                .compare_exchange_weak(current, elapsed, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
            {
                break;
            }
        }
        self.response_time_sum_ns
            .fetch_add(elapsed, Ordering::Relaxed);
        self.response_time_count.fetch_add(1, Ordering::Relaxed);

        Ok(response)
    }

    async fn post(
        &self,
        url: &str,
        body: &str,
        headers: Option<HashMap<String, String>>,
    ) -> Result<FetchResponse, EngineError> {
        use std::sync::atomic::Ordering;

        let start_time = std::time::Instant::now();
        self.total_requests.fetch_add(1, Ordering::Relaxed);

        debug!(
            "POST {} (concurrency: {}/{})",
            url,
            self.max_concurrent_requests - self.semaphore.available_permits(),
            self.max_concurrent_requests
        );

        // Acquire semaphore permit for concurrency control
        let _permit = self.semaphore.acquire().await.map_err(|e| {
            self.failed_requests.fetch_add(1, Ordering::Relaxed);
            EngineError::Network {
                message: format!("Semaphore acquire failed: {}", e),
            }
        })?;

        let header_map = self.build_headers(headers);

        let resp = self
            .client
            .post(url)
            .headers(header_map)
            .body(body.to_string())
            .send()
            .await
            .map_err(|e| {
                self.failed_requests.fetch_add(1, Ordering::Relaxed);
                if e.is_timeout() {
                    EngineError::Timeout
                } else if e.is_connect() {
                    EngineError::ConnectionRefused {
                        message: e.to_string(),
                    }
                } else {
                    EngineError::Network {
                        message: e.to_string(),
                    }
                }
            })?;

        let response = self.convert_response(resp).await?;
        self.successful_requests.fetch_add(1, Ordering::Relaxed);
        self.total_bytes_downloaded
            .fetch_add(response.body.len() as u64, Ordering::Relaxed);

        // Track response time (lock-free)
        let elapsed = start_time.elapsed().as_nanos() as u64;
        loop {
            let current = self.response_time_min_ns.load(Ordering::Relaxed);
            if elapsed >= current {
                break;
            }
            if self
                .response_time_min_ns
                .compare_exchange_weak(current, elapsed, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
            {
                break;
            }
        }
        loop {
            let current = self.response_time_max_ns.load(Ordering::Relaxed);
            if elapsed <= current {
                break;
            }
            if self
                .response_time_max_ns
                .compare_exchange_weak(current, elapsed, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok()
            {
                break;
            }
        }
        self.response_time_sum_ns
            .fetch_add(elapsed, Ordering::Relaxed);
        self.response_time_count.fetch_add(1, Ordering::Relaxed);

        Ok(response)
    }

    fn statistics(&self) -> FetcherStatistics {
        let count = self.response_time_count.load(Ordering::Relaxed);
        let average_response_time_ms = if count > 0 {
            self.response_time_sum_ns.load(Ordering::Relaxed) as f64 / count as f64 / 1_000_000.0
        } else {
            0.0
        };

        FetcherStatistics {
            total_requests: self.total_requests.load(Ordering::Relaxed),
            successful_requests: self.successful_requests.load(Ordering::Relaxed),
            failed_requests: self.failed_requests.load(Ordering::Relaxed),
            total_bytes_downloaded: self.total_bytes_downloaded.load(Ordering::Relaxed),
            average_response_time_ms,
            active_connections: (self.max_concurrent_requests - self.semaphore.available_permits())
                as u32,
        }
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
