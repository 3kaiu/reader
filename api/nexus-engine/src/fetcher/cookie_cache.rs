use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const DEFAULT_MAX_ENTRIES: usize = 2000;
const SOLVE_LOCK_TIMEOUT: Duration = Duration::from_secs(120);

struct CookieEntry {
    cookies: Vec<(String, String)>,
    expires_at: Instant,
    created_at: Instant,
    user_agent: String,
    ip_address: String,
}

struct SolveState {
    in_progress: bool,
    locked_at: Instant,
}

pub struct CookieCache {
    cache: DashMap<String, CookieEntry>,
    solve_locks: DashMap<String, Arc<Mutex<SolveState>>>,
    cf_ttl: Duration,
    max_entries: usize,
}

impl CookieCache {
    pub fn new() -> Self {
        Self {
            cache: DashMap::new(),
            solve_locks: DashMap::new(),
            cf_ttl: Duration::from_secs(25 * 60),
            max_entries: DEFAULT_MAX_ENTRIES,
        }
    }

    pub fn with_ttl(ttl_secs: u64) -> Self {
        Self {
            cache: DashMap::new(),
            solve_locks: DashMap::new(),
            cf_ttl: Duration::from_secs(ttl_secs),
            max_entries: DEFAULT_MAX_ENTRIES,
        }
    }

    pub fn with_max_entries(mut self, max: usize) -> Self {
        self.max_entries = max;
        self
    }

    pub fn get(
        &self,
        domain: &str,
        user_agent: &str,
        ip_address: &str,
    ) -> Option<Vec<(String, String)>> {
        let entry = self.cache.get(domain)?;
        if entry.expires_at > Instant::now()
            && entry.user_agent == user_agent
            && entry.ip_address == ip_address
        {
            Some(entry.cookies.clone())
        } else {
            drop(entry);
            self.cache.remove(domain);
            None
        }
    }

    pub fn set(
        &self,
        domain: &str,
        cookies: Vec<(String, String)>,
        _source_url: &str,
        user_agent: &str,
        ip_address: &str,
    ) {
        // Periodic cleanup of stale solve locks (every ~1000 set calls)
        self.cleanup_stale_solve_locks();

        // Evict oldest entries if at capacity
        if self.cache.len() >= self.max_entries {
            let to_remove: Vec<String> = self
                .cache
                .iter()
                .min_by(|a, b| a.created_at.cmp(&b.created_at))
                .map(|e| e.key().clone())
                .into_iter()
                .collect();
            for key in to_remove {
                self.cache.remove(&key);
            }
        }

        let now = Instant::now();
        self.cache.insert(
            domain.to_string(),
            CookieEntry {
                cookies,
                expires_at: now + self.cf_ttl,
                created_at: now,
                user_agent: user_agent.to_string(),
                ip_address: ip_address.to_string(),
            },
        );
    }

    pub fn has_valid(&self, domain: &str, user_agent: &str, ip_address: &str) -> bool {
        self.get(domain, user_agent, ip_address).is_some()
    }

    /// Try to acquire solve lock. Returns true if caller should perform the solve.
    /// Auto-releases stale locks older than SOLVE_LOCK_TIMEOUT.
    pub async fn try_acquire_solve_lock(&self, domain: &str) -> bool {
        let lock = self
            .solve_locks
            .entry(domain.to_string())
            .or_insert_with(|| {
                Arc::new(Mutex::new(SolveState {
                    in_progress: false,
                    locked_at: Instant::now(),
                }))
            })
            .value()
            .clone();

        let mut state = lock.lock().await;
        if state.in_progress {
            // Check for stale lock (e.g., if the holder panicked)
            if state.locked_at.elapsed() > SOLVE_LOCK_TIMEOUT {
                state.in_progress = true;
                state.locked_at = Instant::now();
                return true;
            }
            false
        } else {
            state.in_progress = true;
            state.locked_at = Instant::now();
            true
        }
    }

    pub async fn release_solve_lock(&self, domain: &str) {
        if let Some(lock) = self.solve_locks.get(domain) {
            let mut state = lock.lock().await;
            state.in_progress = false;
        }
    }

    pub fn invalidate(&self, domain: &str) {
        self.cache.remove(domain);
    }

    /// Remove all solve locks that are not currently in use.
    /// Called periodically to prevent unbounded solve_locks DashMap growth.
    pub fn cleanup_stale_solve_locks(&self) {
        self.solve_locks.retain(|_, v| {
            match v.try_lock() {
                // Lock acquired: keep only if still in progress
                Ok(state) => state.in_progress,
                // Lock contended: someone is actively solving, keep it
                Err(_) => true,
            }
        });
    }

    pub fn len(&self) -> usize {
        self.cache.len()
    }
}

pub fn extract_domain(url: &str) -> String {
    url.trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_UA: &str = "Mozilla/5.0 Chrome/120.0.0.0";
    const TEST_IP: &str = "192.168.1.1";
    const OTHER_UA: &str = "Mozilla/5.0 Firefox/120.0";
    const OTHER_IP: &str = "10.0.0.1";

    #[test]
    fn test_extract_domain() {
        assert_eq!(extract_domain("https://www.69shuba.com/book/123"), "www.69shuba.com");
        assert_eq!(extract_domain("http://example.com/path"), "example.com");
    }

    #[test]
    fn test_cache_set_get() {
        let cache = CookieCache::new();
        cache.set(
            "www.69shuba.com",
            vec![("cf_clearance".to_string(), "abc123".to_string())],
            "https://www.69shuba.com/search",
            TEST_UA,
            TEST_IP,
        );
        let cookies = cache.get("www.69shuba.com", TEST_UA, TEST_IP);
        assert!(cookies.is_some());
    }

    #[test]
    fn test_cache_expiry() {
        let cache = CookieCache::with_ttl(0);
        cache.set("test.com", vec![], "https://test.com", TEST_UA, TEST_IP);
        std::thread::sleep(Duration::from_millis(10));
        assert!(cache.get("test.com", TEST_UA, TEST_IP).is_none());
    }

    #[test]
    fn test_invalidate() {
        let cache = CookieCache::new();
        cache.set("test.com", vec![], "https://test.com", TEST_UA, TEST_IP);
        assert!(cache.has_valid("test.com", TEST_UA, TEST_IP));
        cache.invalidate("test.com");
        assert!(!cache.has_valid("test.com", TEST_UA, TEST_IP));
    }

    #[test]
    fn test_ip_mismatch_rejected() {
        let cache = CookieCache::new();
        cache.set(
            "test.com",
            vec![("cf_clearance".to_string(), "abc".to_string())],
            "https://test.com",
            TEST_UA,
            TEST_IP,
        );
        // Different IP → should reject
        assert!(cache.get("test.com", TEST_UA, OTHER_IP).is_none());
        // No entry exists anymore (get removed it for mismatch)
        assert!(!cache.has_valid("test.com", TEST_UA, OTHER_IP));
    }

    #[test]
    fn test_ua_mismatch_rejected() {
        let cache = CookieCache::new();
        cache.set(
            "test.com",
            vec![("cf_clearance".to_string(), "abc".to_string())],
            "https://test.com",
            TEST_UA,
            TEST_IP,
        );
        // Different UA → should reject
        assert!(cache.get("test.com", OTHER_UA, TEST_IP).is_none());
        assert!(!cache.has_valid("test.com", OTHER_UA, TEST_IP));
    }

    #[test]
    fn test_both_match_accepted() {
        let cache = CookieCache::new();
        cache.set(
            "test.com",
            vec![("cf_clearance".to_string(), "abc".to_string())],
            "https://test.com",
            TEST_UA,
            TEST_IP,
        );
        assert!(cache.has_valid("test.com", TEST_UA, TEST_IP));
        let cookies = cache.get("test.com", TEST_UA, TEST_IP);
        assert!(cookies.is_some());
        assert_eq!(cookies.unwrap()[0].1, "abc");
    }

    #[tokio::test]
    async fn test_solve_lock() {
        let cache = CookieCache::new();
        let acquired = cache.try_acquire_solve_lock("test.com").await;
        assert!(acquired);
        let acquired2 = cache.try_acquire_solve_lock("test.com").await;
        assert!(!acquired2);
    }
}
