//! Login Manager - Handle book source login and session management
//!
//! This module provides:
//! - Login URL parsing
//! - Login check JavaScript execution
//! - Session/cookie persistence

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use anyhow::Result;

use super::cookie::CookieManager;
use super::js_executor::JsExecutor;

/// Login information parsed from loginUrl
#[derive(Debug, Clone, Default)]
pub struct LoginInfo {
    /// Login page URL
    pub url: String,
    /// HTTP method (GET/POST)
    pub method: Option<String>,
    /// Request body for POST
    pub body: Option<String>,
    /// Custom headers
    pub headers: Option<HashMap<String, String>>,
    /// JavaScript to execute after page load
    pub js: Option<String>,
}

impl LoginInfo {
    /// Parse login URL configuration
    /// Format can be:
    /// - Simple URL: "https://example.com/login"
    /// - JSON config: {"url": "...", "method": "POST", "body": "..."}
    pub fn parse(login_url: &str) -> Option<Self> {
        if login_url.is_empty() {
            return None;
        }
        
        // Try JSON parse first
        if login_url.trim().starts_with('{') {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(login_url) {
                return Some(Self {
                    url: parsed.get("url")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    method: parsed.get("method")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    body: parsed.get("body")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    headers: parsed.get("headers")
                        .and_then(|v| v.as_object())
                        .map(|obj| {
                            obj.iter()
                                .filter_map(|(k, v)| {
                                    v.as_str().map(|s| (k.clone(), s.to_string()))
                                })
                                .collect()
                        }),
                    js: parsed.get("js")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                });
            }
        }
        
        // Simple URL
        Some(Self {
            url: login_url.to_string(),
            ..Default::default()
        })
    }
}

/// Login status for a book source
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoginStatus {
    /// Not checked yet
    Unknown,
    /// Logged in
    LoggedIn,
    /// Not logged in
    NotLoggedIn,
    /// No login required (no loginCheckJs defined)
    NotRequired,
}

/// Login session manager
pub struct LoginManager {
    /// Login status cache: source_url -> status
    status_cache: Arc<RwLock<HashMap<String, LoginStatus>>>,
    /// Cookie manager (shared with HttpClient)
    cookie_manager: CookieManager,
}

impl LoginManager {
    /// Create a new login manager
    pub fn new() -> Self {
        Self {
            status_cache: Arc::new(RwLock::new(HashMap::new())),
            cookie_manager: CookieManager::new(),
        }
    }
    
    /// Create with shared cookie manager
    pub fn with_cookie_manager(cookie_manager: CookieManager) -> Self {
        Self {
            status_cache: Arc::new(RwLock::new(HashMap::new())),
            cookie_manager,
        }
    }
    
    /// Get cookie manager reference
    pub fn cookie_manager(&self) -> &CookieManager {
        &self.cookie_manager
    }
    
    /// Check login status using loginCheckJs
    /// 
    /// The JS should return "true" or "1" if logged in
    pub fn check_login(
        &self,
        source_url: &str,
        login_check_js: Option<&str>,
        js_executor: &JsExecutor,
    ) -> Result<LoginStatus> {
        // No check script = no login required
        let check_js = match login_check_js {
            Some(js) if !js.trim().is_empty() => js,
            _ => {
                self.set_status(source_url, LoginStatus::NotRequired);
                return Ok(LoginStatus::NotRequired);
            }
        };
        
        // Execute check JS
        let result = js_executor.eval(check_js)?;
        let result_lower = result.to_lowercase();
        
        let status = if result_lower == "true" || result == "1" {
            LoginStatus::LoggedIn
        } else {
            LoginStatus::NotLoggedIn
        };
        
        self.set_status(source_url, status);
        Ok(status)
    }
    
    /// Get cached login status
    pub fn get_status(&self, source_url: &str) -> LoginStatus {
        self.status_cache
            .read()
            .ok()
            .and_then(|cache| cache.get(source_url).copied())
            .unwrap_or(LoginStatus::Unknown)
    }
    
    /// Set login status
    pub fn set_status(&self, source_url: &str, status: LoginStatus) {
        if let Ok(mut cache) = self.status_cache.write() {
            cache.insert(source_url.to_string(), status);
        }
    }
    
    /// Clear all login status cache
    pub fn clear_status_cache(&self) {
        if let Ok(mut cache) = self.status_cache.write() {
            cache.clear();
        }
    }
    
    /// Parse login URL configuration
    pub fn parse_login_url(login_url: Option<&str>) -> Option<LoginInfo> {
        login_url.and_then(LoginInfo::parse)
    }
    
    /// Check if login is required before request
    pub fn require_login(
        &self,
        source_url: &str,
        login_check_js: Option<&str>,
        js_executor: &JsExecutor,
    ) -> Result<bool> {
        let status = self.check_login(source_url, login_check_js, js_executor)?;
        
        match status {
            LoginStatus::NotLoggedIn => Ok(true),
            LoginStatus::LoggedIn | LoginStatus::NotRequired => Ok(false),
            LoginStatus::Unknown => Ok(false), // Shouldn't happen after check
        }
    }
}

impl Default for LoginManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_simple_url() {
        let info = LoginInfo::parse("https://example.com/login").unwrap();
        assert_eq!(info.url, "https://example.com/login");
        assert!(info.method.is_none());
    }
    
    #[test]
    fn test_parse_json_config() {
        let json = r#"{"url": "https://example.com/api/login", "method": "POST", "body": "user=test"}"#;
        let info = LoginInfo::parse(json).unwrap();
        assert_eq!(info.url, "https://example.com/api/login");
        assert_eq!(info.method.as_deref(), Some("POST"));
        assert_eq!(info.body.as_deref(), Some("user=test"));
    }
    
    #[test]
    fn test_parse_empty() {
        assert!(LoginInfo::parse("").is_none());
    }
    
    #[test]
    fn test_login_manager_default() {
        let manager = LoginManager::new();
        assert_eq!(manager.get_status("http://example.com"), LoginStatus::Unknown);
    }
    
    #[test]
    fn test_set_get_status() {
        let manager = LoginManager::new();
        manager.set_status("http://test.com", LoginStatus::LoggedIn);
        assert_eq!(manager.get_status("http://test.com"), LoginStatus::LoggedIn);
    }
}
