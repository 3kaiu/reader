//! Domain-aware connection pooling for HTTP fetches
//!
//! Maintains separate connection pools per domain for better
//! connection reuse and reduced latency.

use dashmap::DashMap;
use reqwest::Client;
use std::sync::Arc;
use std::time::Duration;
use tracing::debug;
use url::Url;

/// Domain-aware HTTP client pool
///
/// Each domain gets its own connection pool, improving connection reuse
/// and isolation between different book sources.
pub struct DomainPooledClient {
    /// Per-domain clients
    pools: DashMap<String, Arc<Client>>,
    /// Default client config
    timeout: Duration,
    /// Maximum connections per domain
    max_connections_per_host: usize,
    /// Maximum idle time for connections
    pool_idle_timeout: Duration,
}

impl DomainPooledClient {
    /// Create a new domain-aware client pool with optimized defaults
    pub fn new() -> Self {
        Self {
            pools: DashMap::new(),
            timeout: Duration::from_secs(30),
            max_connections_per_host: 50, // Increased for better concurrency
            pool_idle_timeout: Duration::from_secs(30), // Reduced for better resource management
        }
    }

    /// Create with custom configuration
    pub fn with_config(timeout: Duration, max_connections_per_host: usize) -> Self {
        Self {
            pools: DashMap::new(),
            timeout,
            max_connections_per_host,
            pool_idle_timeout: Duration::from_secs(30), // Default idle timeout
        }
    }

    /// Create with full configuration
    pub fn with_full_config(
        timeout: Duration,
        max_connections_per_host: usize,
        pool_idle_timeout: Duration
    ) -> Self {
        Self {
            pools: DashMap::new(),
            timeout,
            max_connections_per_host,
            pool_idle_timeout,
        }
    }

    /// Extract domain from URL
    fn get_domain(url: &str) -> Option<String> {
        Url::parse(url)
            .ok()
            .and_then(|u| u.host_str().map(|h: &str| h.to_string()))
    }

    /// Get or create client for a domain
    pub fn get_client(&self, url: &str) -> Arc<Client> {
        let domain = Self::get_domain(url).unwrap_or_else(|| "default".to_string());
        self.get_client_by_domain(&domain)
    }

    /// Get client using a pre-parsed domain (Performance optimization)
    pub fn get_client_by_domain(&self, domain: &str) -> Arc<Client> {
        if let Some(client) = self.pools.get(domain) {
            return Arc::clone(&client);
        }

        // Create new client for this domain with optimized settings
        let client = Arc::new(
            Client::builder()
                .timeout(self.timeout)
                .pool_max_idle_per_host(self.max_connections_per_host)
                .pool_idle_timeout(self.pool_idle_timeout)
                .tcp_keepalive(Duration::from_secs(60))
                .tcp_nodelay(true)
                .gzip(true)  // Enable compression
                .deflate(true)
                .brotli(true)
                .build()
                .unwrap_or_default(),
        );

        debug!("Created new connection pool for domain: {}", domain);
        self.pools.insert(domain.to_string(), Arc::clone(&client));
        client
    }

    /// Get statistics about connection pools
    pub fn stats(&self) -> PoolStats {
        PoolStats {
            domain_count: self.pools.len(),
            domains: self.pools.iter().map(|e| e.key().clone()).collect(),
        }
    }

    /// Clear all connection pools
    pub fn clear(&self) {
        self.pools.clear();
    }
}

impl Default for DomainPooledClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Connection pool statistics
#[derive(Debug, Clone)]
pub struct PoolStats {
    pub domain_count: usize,
    pub domains: Vec<String>,
}
