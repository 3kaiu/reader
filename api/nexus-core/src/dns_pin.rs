//! DNS Pinning Module
//!
//! Provides DNS resolution with IP pinning to prevent DNS rebinding attacks.
//! Once a hostname is resolved, the IP address is pinned and reused for
//! subsequent requests within the TTL period.

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::RwLock;
use thiserror::Error;

/// DNS resolution error
#[derive(Debug, Error)]
pub enum DnsError {
    #[error("No DNS records found for host")]
    NoRecords,
    #[error("DNS resolution failed: {0}")]
    ResolutionFailed(String),
    #[error("IP address is private/reserved")]
    PrivateIp,
}

/// Pinned DNS resolution result
#[derive(Debug, Clone)]
pub struct PinnedDns {
    /// Resolved IP address
    pub ip: IpAddr,
    /// Port number
    pub port: u16,
    /// Original hostname
    pub hostname: String,
    /// Resolution timestamp
    pub resolved_at: Instant,
    /// Time-to-live
    pub ttl: Duration,
}

impl PinnedDns {
    /// Check if the pinned DNS entry has expired
    pub fn is_expired(&self) -> bool {
        self.resolved_at.elapsed() > self.ttl
    }

    /// Get the socket address for connection
    pub fn socket_addr(&self) -> SocketAddr {
        SocketAddr::new(self.ip, self.port)
    }
}

/// DNS cache with pinning support
#[derive(Debug, Default)]
pub struct DnsCache {
    cache: RwLock<HashMap<String, Arc<PinnedDns>>>,
    default_ttl: Duration,
}

impl DnsCache {
    /// Create a new DNS cache with default TTL
    pub fn new(ttl: Duration) -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            default_ttl: ttl,
        }
    }

    /// Create a DNS cache with 5-minute TTL
    pub fn with_default_ttl() -> Self {
        Self::new(Duration::from_secs(300))
    }

    /// Get a pinned DNS entry from cache
    pub fn get(&self, hostname: &str, port: u16) -> Option<Arc<PinnedDns>> {
        let key = format!("{}:{}", hostname, port);
        let cache = self.cache.read();

        if let Some(pinned) = cache.get(&key) {
            if !pinned.is_expired() {
                return Some(pinned.clone());
            }
        }
        None
    }

    /// Insert a pinned DNS entry into cache
    pub fn insert(&self, pinned: Arc<PinnedDns>) {
        let key = format!("{}:{}", pinned.hostname, pinned.port);
        let mut cache = self.cache.write();
        cache.insert(key, pinned);
    }

    /// Remove expired entries from cache
    pub fn cleanup(&self) {
        let mut cache = self.cache.write();
        cache.retain(|_, pinned| !pinned.is_expired());
    }

    /// Get the number of cached entries
    pub fn len(&self) -> usize {
        self.cache.read().len()
    }

    /// Check if cache is empty
    pub fn is_empty(&self) -> bool {
        self.cache.read().is_empty()
    }
}

/// Resolve a hostname and pin the IP address (synchronous version)
///
/// This function performs DNS resolution once and returns a pinned result
/// that can be reused for subsequent requests within the TTL period.
///
/// # Arguments
/// * `hostname` - The hostname to resolve
/// * `port` - The port number
/// * `ttl` - Time-to-live for the pinned entry
///
/// # Returns
/// A pinned DNS resolution result
pub fn resolve_and_pin_sync(
    hostname: &str,
    port: u16,
    ttl: Duration,
) -> Result<PinnedDns, DnsError> {
    // Resolve DNS using std::net::ToSocketAddrs
    let addr_str = format!("{}:{}", hostname, port);
    let mut addrs = addr_str
        .to_socket_addrs()
        .map_err(|e| DnsError::ResolutionFailed(e.to_string()))?;

    // Take first valid IP
    let addr = addrs.next().ok_or(DnsError::NoRecords)?;

    Ok(PinnedDns {
        ip: addr.ip(),
        port: addr.port(),
        hostname: hostname.to_string(),
        resolved_at: Instant::now(),
        ttl,
    })
}

/// Resolve a hostname using the cache, or perform fresh resolution if not cached
///
/// # Arguments
/// * `cache` - The DNS cache to use
/// * `hostname` - The hostname to resolve
/// * `port` - The port number
///
/// # Returns
/// A pinned DNS resolution result (from cache or fresh resolution)
pub fn resolve_with_cache_sync(
    cache: &DnsCache,
    hostname: &str,
    port: u16,
) -> Result<Arc<PinnedDns>, DnsError> {
    // Check cache first
    if let Some(pinned) = cache.get(hostname, port) {
        return Ok(pinned);
    }

    // Perform fresh resolution
    let pinned = resolve_and_pin_sync(hostname, port, cache.default_ttl)?;
    let pinned = Arc::new(pinned);

    // Cache the result
    cache.insert(pinned.clone());

    Ok(pinned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pinned_dns_expiry() {
        let pinned = PinnedDns {
            ip: "127.0.0.1".parse().unwrap(),
            port: 80,
            hostname: "example.com".to_string(),
            resolved_at: Instant::now() - Duration::from_secs(1), // Resolved 1 second ago
            ttl: Duration::from_secs(0), // TTL is 0, so expired
        };

        assert!(pinned.is_expired());
    }

    #[test]
    fn test_pinned_dns_socket_addr() {
        let pinned = PinnedDns {
            ip: "127.0.0.1".parse().unwrap(),
            port: 8080,
            hostname: "example.com".to_string(),
            resolved_at: Instant::now(),
            ttl: Duration::from_secs(300),
        };

        let addr = pinned.socket_addr();
        assert_eq!(addr.ip().to_string(), "127.0.0.1");
        assert_eq!(addr.port(), 8080);
    }

    #[test]
    fn test_dns_cache_operations() {
        let cache = DnsCache::with_default_ttl();

        assert!(cache.is_empty());
        assert_eq!(cache.len(), 0);

        let pinned = Arc::new(PinnedDns {
            ip: "127.0.0.1".parse().unwrap(),
            port: 80,
            hostname: "example.com".to_string(),
            resolved_at: Instant::now(),
            ttl: Duration::from_secs(300),
        });

        cache.insert(pinned.clone());

        assert!(!cache.is_empty());
        assert_eq!(cache.len(), 1);

        // Retrieve from cache
        let cached = cache.get("example.com", 80);
        assert!(cached.is_some());
        assert_eq!(cached.unwrap().ip.to_string(), "127.0.0.1");
    }

    #[test]
    fn test_resolve_and_pin_sync() {
        // Test with a well-known hostname
        let result = resolve_and_pin_sync("localhost", 80, Duration::from_secs(300));

        // Should succeed or fail gracefully
        match result {
            Ok(pinned) => {
                assert_eq!(pinned.hostname, "localhost");
                assert_eq!(pinned.port, 80);
            }
            Err(DnsError::NoRecords) => {
                // Some systems may not resolve localhost
            }
            Err(e) => {
                panic!("Unexpected error: {}", e);
            }
        }
    }
}