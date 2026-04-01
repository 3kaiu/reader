//! Cloudflare Cookie Fetcher
//! 
//! Uses headless Chrome to bypass CF challenges and extract cf_clearance cookie.
//! The cookie can then be reused for subsequent requests.

use headless_chrome::{Browser, LaunchOptions};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use parking_lot::RwLock;
use tracing::{info, warn, debug};

/// CF clearance cookie with metadata
#[derive(Debug, Clone)]
pub struct CfCookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub expires: Option<f64>,
    pub fetched_at: Instant,
}

impl CfCookie {
    /// Check if cookie is still valid (default 15 minutes)
    pub fn is_valid(&self) -> bool {
        let age = self.fetched_at.elapsed();
        // CF clearance cookies typically valid for 15-30 minutes
        age < Duration::from_secs(15 * 60)
    }
    
    /// Convert to reqwest cookie format
    pub fn to_cookie_string(&self) -> String {
        format!("{}={}", self.name, self.value)
    }
}

/// Cookie cache for a domain
#[derive(Debug, Default)]
struct DomainCookieCache {
    cookies: HashMap<String, CfCookie>,
    last_fetch: Option<Instant>,
}

/// Global cookie cache for CF bypass
pub struct CfCookieManager {
    caches: RwLock<HashMap<String, DomainCookieCache>>,
    browser_timeout: Duration,
    wait_timeout: Duration,
}

impl CfCookieManager {
    /// Create a new cookie manager
    pub fn new() -> Self {
        Self {
            caches: RwLock::new(HashMap::new()),
            browser_timeout: Duration::from_secs(30),
            wait_timeout: Duration::from_secs(15),
        }
    }
    
    /// Get valid cookies for a domain, fetching if needed
    pub async fn get_cookies(&self, url: &str) -> Result<Vec<CfCookie>, CfCookieError> {
        let domain = extract_domain(url)?;
        
        // Check cache first
        {
            let caches = self.caches.read();
            if let Some(cache) = caches.get(&domain) {
                let valid_cookies: Vec<CfCookie> = cache.cookies.values()
                    .filter(|c| c.is_valid())
                    .cloned()
                    .collect();
                    
                if !valid_cookies.is_empty() {
                    info!("Using cached CF cookies for {}", domain);
                    return Ok(valid_cookies);
                }
            }
        }
        
        // Need to fetch new cookies
        info!("Fetching fresh CF cookies for {}", domain);
        let cookies = self.fetch_cookies_headless(url).await?;
        
        // Update cache
        {
            let mut caches = self.caches.write();
            let cache = caches.entry(domain).or_default();
            for cookie in &cookies {
                cache.cookies.insert(cookie.name.clone(), cookie.clone());
            }
            cache.last_fetch = Some(Instant::now());
        }
        
        Ok(cookies)
    }
    
    /// Fetch cookies using headless Chrome
    async fn fetch_cookies_headless(&self, url: &str) -> Result<Vec<CfCookie>, CfCookieError> {
        // Run in blocking task since headless_chrome is not async
        let url = url.to_string();
        let timeout = self.browser_timeout;
        let wait_timeout = self.wait_timeout;
        
        tokio::task::spawn_blocking(move || {
            Self::fetch_with_browser(&url, timeout, wait_timeout)
        }).await.map_err(|e| CfCookieError::BrowserError(e.to_string()))?
    }
    
    /// Internal: fetch cookies with browser
    fn fetch_with_browser(
        url: &str, 
        _timeout: Duration,
        wait_timeout: Duration,
    ) -> Result<Vec<CfCookie>, CfCookieError> {
        debug!("Launching headless Chrome for {}", url);
        
        // Launch browser with stealth options
        let browser = Browser::new(LaunchOptions {
            headless: true,
            sandbox: false, // Disable sandbox for better compatibility
            window_size: Some((1920, 1080)),
            user_data_dir: None,
            ..Default::default()
        }).map_err(|e| CfCookieError::BrowserLaunch(e.to_string()))?;
        
        let tab = browser.new_tab().map_err(|e| CfCookieError::BrowserError(e.to_string()))?;
        
        // Navigate to URL
        debug!("Navigating to {}", url);
        tab.navigate_to(url).map_err(|e| CfCookieError::Navigation(e.to_string()))?;
        
        // Wait for CF challenge to complete
        let start = Instant::now();
        let mut cf_challenge_detected = false;
        
        while start.elapsed() < wait_timeout {
            // Check if we're still on CF challenge page
            let url = tab.get_url();
            
            if url.contains("challenge") || url.contains("cdn-cgi") {
                cf_challenge_detected = true;
                debug!("CF challenge detected, waiting...");
                std::thread::sleep(Duration::from_millis(500));
                continue;
            }
            
            // Check page content for CF indicators
            if let Ok(content) = tab.get_content() {
                if content.contains("Just a moment") || content.contains("Checking your browser") {
                    cf_challenge_detected = true;
                    debug!("CF challenge page detected, waiting...");
                    std::thread::sleep(Duration::from_millis(500));
                    continue;
                }
                
                // If we got actual content, CF challenge is complete
                if cf_challenge_detected || !content.contains("cf-") {
                    debug!("CF challenge appears complete");
                    break;
                }
            }
            
            std::thread::sleep(Duration::from_millis(200));
        }
        
        // Give a bit more time for cookies to be set
        std::thread::sleep(Duration::from_millis(500));
        
        // Get cookies
        let cookies = tab.get_cookies().map_err(|e| CfCookieError::BrowserError(e.to_string()))?;
        
        debug!("Found {} cookies", cookies.len());
        
        // Filter CF-related cookies
        let cf_cookies: Vec<CfCookie> = cookies.into_iter()
            .filter(|c| {
                c.name.starts_with("cf_") || 
                c.name == "__cf_bm" ||
                c.name.contains("cloudflare")
            })
            .map(|c| CfCookie {
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: if c.path.is_empty() { "/".to_string() } else { c.path },
                expires: Some(c.expires),
                fetched_at: Instant::now(),
            })
            .collect();
        
        if cf_cookies.is_empty() {
            warn!("No CF cookies found after navigation");
        } else {
            info!("Extracted {} CF cookies", cf_cookies.len());
        }
        
        // Close browser
        drop(tab);
        drop(browser);
        
        Ok(cf_cookies)
    }
    
    /// Clear cached cookies for a domain
    pub fn clear_cache(&self, domain: &str) {
        let mut caches = self.caches.write();
        caches.remove(domain);
    }
    
    /// Clear all cached cookies
    pub fn clear_all(&self) {
        let mut caches = self.caches.write();
        caches.clear();
    }
}

impl Default for CfCookieManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Extract domain from URL
fn extract_domain(url: &str) -> Result<String, CfCookieError> {
    let parsed = url::Url::parse(url).map_err(|e| CfCookieError::InvalidUrl(e.to_string()))?;
    let domain = parsed.host_str()
        .ok_or_else(|| CfCookieError::InvalidUrl("No host in URL".to_string()))?;
    Ok(domain.to_string())
}

#[derive(Debug, thiserror::Error)]
pub enum CfCookieError {
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    
    #[error("Failed to launch browser: {0}")]
    BrowserLaunch(String),
    
    #[error("Browser error: {0}")]
    BrowserError(String),
    
    #[error("Navigation error: {0}")]
    Navigation(String),
    
    #[error("No CF cookies found")]
    NoCookies,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_cookie_validity() {
        let cookie = CfCookie {
            name: "cf_clearance".to_string(),
            value: "test_value".to_string(),
            domain: "example.com".to_string(),
            path: "/".to_string(),
            expires: None,
            fetched_at: Instant::now(),
        };
        
        assert!(cookie.is_valid());
    }
    
    #[test]
    fn test_cookie_string() {
        let cookie = CfCookie {
            name: "cf_clearance".to_string(),
            value: "abc123".to_string(),
            domain: "example.com".to_string(),
            path: "/".to_string(),
            expires: None,
            fetched_at: Instant::now(),
        };
        
        assert_eq!(cookie.to_cookie_string(), "cf_clearance=abc123");
    }
}
