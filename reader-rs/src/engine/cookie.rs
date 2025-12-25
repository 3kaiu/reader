//! Cookie Manager for HTTP requests
//!
//! Provides centralized cookie storage and management across book sources.
//! Supports manual read/write and integration with JS environment.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Cookie storage: domain -> (cookie_name -> cookie_value)
pub type CookieStore = Arc<RwLock<HashMap<String, HashMap<String, String>>>>;

/// Cookie manager for handling cookies across requests
#[derive(Clone)]
pub struct CookieManager {
    store: CookieStore,
}

impl Default for CookieManager {
    fn default() -> Self {
        Self::new()
    }
}

impl CookieManager {
    /// Create a new cookie manager
    pub fn new() -> Self {
        Self {
            store: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create with shared store (for sharing across components)
    pub fn with_store(store: CookieStore) -> Self {
        Self { store }
    }

    /// Get the underlying store for sharing
    pub fn get_store(&self) -> CookieStore {
        self.store.clone()
    }

    /// Set a cookie value for a domain
    pub fn set_cookie(&self, domain: &str, name: &str, value: &str) {
        if let Ok(mut store) = self.store.write() {
            let domain_cookies = store.entry(domain.to_string()).or_insert_with(HashMap::new);
            domain_cookies.insert(name.to_string(), value.to_string());
        }
    }

    /// Get a specific cookie value, or all cookies for a domain if key is None
    pub fn get_cookie(&self, domain: &str, key: Option<&str>) -> String {
        if let Ok(store) = self.store.read() {
            if let Some(domain_cookies) = store.get(domain) {
                if let Some(key) = key {
                    // Return specific cookie
                    return domain_cookies.get(key).cloned().unwrap_or_default();
                } else {
                    // Return all cookies as "key=value; key2=value2" format
                    return domain_cookies
                        .iter()
                        .map(|(k, v)| format!("{}={}", k, v))
                        .collect::<Vec<_>>()
                        .join("; ");
                }
            }
        }
        String::new()
    }

    /// Set multiple cookies from a cookie string "key1=value1; key2=value2"
    pub fn set_cookies_from_string(&self, domain: &str, cookie_string: &str) {
        for part in cookie_string.split(';') {
            let part = part.trim();
            if let Some(eq_pos) = part.find('=') {
                let name = part[..eq_pos].trim();
                let value = part[eq_pos + 1..].trim();
                if !name.is_empty() {
                    self.set_cookie(domain, name, value);
                }
            }
        }
    }

    /// Parse Set-Cookie header and store cookies
    /// Format: "name=value; Path=/; Domain=.example.com; HttpOnly"
    pub fn parse_set_cookie(&self, domain: &str, set_cookie_header: &str) {
        // Split by semicolon, first part is the cookie value
        let parts: Vec<&str> = set_cookie_header.split(';').collect();
        if let Some(cookie_part) = parts.first() {
            let cookie_part = cookie_part.trim();
            if let Some(eq_pos) = cookie_part.find('=') {
                let name = cookie_part[..eq_pos].trim();
                let value = cookie_part[eq_pos + 1..].trim();
                
                // Extract domain from attributes if present, otherwise use provided domain
                let mut cookie_domain = domain.to_string();
                for part in parts.iter().skip(1) {
                    let part = part.trim().to_lowercase();
                    if part.starts_with("domain=") {
                        cookie_domain = part[7..].trim_start_matches('.').to_string();
                        break;
                    }
                }
                
                if !name.is_empty() {
                    self.set_cookie(&cookie_domain, name, value);
                }
            }
        }
    }

    /// Parse multiple Set-Cookie headers from response
    pub fn parse_set_cookie_headers(&self, domain: &str, headers: &[String]) {
        for header in headers {
            self.parse_set_cookie(domain, header);
        }
    }

    /// Generate Cookie header value for a request to the given domain
    pub fn get_cookie_header(&self, domain: &str) -> Option<String> {
        let cookie_string = self.get_cookie(domain, None);
        if cookie_string.is_empty() {
            None
        } else {
            Some(cookie_string)
        }
    }

    /// Clear all cookies for a domain
    pub fn clear_cookies(&self, domain: &str) {
        if let Ok(mut store) = self.store.write() {
            store.remove(domain);
        }
    }

    /// Clear all cookies
    pub fn clear_all(&self) {
        if let Ok(mut store) = self.store.write() {
            store.clear();
        }
    }

    /// Get all domains that have cookies
    pub fn get_domains(&self) -> Vec<String> {
        if let Ok(store) = self.store.read() {
            store.keys().cloned().collect()
        } else {
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_get_cookie() {
        let manager = CookieManager::new();
        
        manager.set_cookie("example.com", "session", "abc123");
        manager.set_cookie("example.com", "user", "john");
        
        assert_eq!(manager.get_cookie("example.com", Some("session")), "abc123");
        assert_eq!(manager.get_cookie("example.com", Some("user")), "john");
        assert_eq!(manager.get_cookie("example.com", Some("nonexistent")), "");
    }

    #[test]
    fn test_get_all_cookies() {
        let manager = CookieManager::new();
        
        manager.set_cookie("example.com", "a", "1");
        manager.set_cookie("example.com", "b", "2");
        
        let all = manager.get_cookie("example.com", None);
        assert!(all.contains("a=1"));
        assert!(all.contains("b=2"));
        assert!(all.contains("; "));
    }

    #[test]
    fn test_set_cookies_from_string() {
        let manager = CookieManager::new();
        
        manager.set_cookies_from_string("example.com", "session=xyz; token=abc123");
        
        assert_eq!(manager.get_cookie("example.com", Some("session")), "xyz");
        assert_eq!(manager.get_cookie("example.com", Some("token")), "abc123");
    }

    #[test]
    fn test_parse_set_cookie() {
        let manager = CookieManager::new();
        
        manager.parse_set_cookie(
            "example.com",
            "session=abc123; Path=/; HttpOnly; Secure"
        );
        
        assert_eq!(manager.get_cookie("example.com", Some("session")), "abc123");
    }

    #[test]
    fn test_parse_set_cookie_with_domain() {
        let manager = CookieManager::new();
        
        manager.parse_set_cookie(
            "www.example.com",
            "session=abc123; Domain=.example.com; Path=/"
        );
        
        // Cookie should be stored under the domain from the header
        assert_eq!(manager.get_cookie("example.com", Some("session")), "abc123");
    }

    #[test]
    fn test_get_cookie_header() {
        let manager = CookieManager::new();
        
        manager.set_cookie("example.com", "a", "1");
        manager.set_cookie("example.com", "b", "2");
        
        let header = manager.get_cookie_header("example.com");
        assert!(header.is_some());
        
        let header = header.unwrap();
        assert!(header.contains("a=1"));
        assert!(header.contains("b=2"));
    }

    #[test]
    fn test_clear_cookies() {
        let manager = CookieManager::new();
        
        manager.set_cookie("example.com", "session", "abc");
        manager.set_cookie("other.com", "token", "xyz");
        
        manager.clear_cookies("example.com");
        
        assert_eq!(manager.get_cookie("example.com", Some("session")), "");
        assert_eq!(manager.get_cookie("other.com", Some("token")), "xyz");
    }

    #[test]
    fn test_shared_store() {
        let manager1 = CookieManager::new();
        let store = manager1.get_store();
        let manager2 = CookieManager::with_store(store);
        
        manager1.set_cookie("example.com", "shared", "value");
        
        assert_eq!(manager2.get_cookie("example.com", Some("shared")), "value");
    }
}
