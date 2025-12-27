//! WebView Module - Headless browser for dynamic page rendering
//!
//! This module provides WebView rendering capabilities using headless Chrome.
//! It is compiled conditionally with the "webview" feature flag.
//!
//! Usage:
//! ```toml
//! reader-rs = { features = ["webview"] }
//! ```

use anyhow::{anyhow, Result};

#[cfg(feature = "webview")]
use std::sync::{Arc, Mutex};

/// Global browser pool for reusing Chrome instance
#[cfg(feature = "webview")]
static BROWSER_POOL: Mutex<Option<Arc<WebViewPool>>> = Mutex::new(None);

/// WebView pool for managing a shared Chrome browser instance
#[cfg(feature = "webview")]
pub struct WebViewPool {
    browser: headless_chrome::Browser,
}

#[cfg(feature = "webview")]
impl WebViewPool {
    /// Get or create the global browser pool (lazy singleton)
    pub fn global() -> Result<Arc<Self>> {
        let mut lock = BROWSER_POOL.lock().map_err(|e| anyhow!("Failed to lock browser pool: {}", e))?;
        
        if let Some(pool) = lock.as_ref() {
            return Ok(pool.clone());
        }

        let pool = Arc::new(Self::new_internal()?);
        *lock = Some(pool.clone());
        Ok(pool)
    }

    /// Internal: Create a new browser instance with stealth mode enabled
    fn new_internal() -> Result<Self> {
        use headless_chrome::{Browser, LaunchOptions};
        use std::ffi::OsStr;
        use std::time::Duration;

        tracing::info!("Initializing WebView browser pool with stealth mode (one-time startup)");

        // Stealth mode arguments to bypass bot detection (e.g., Cloudflare)
        let stealth_args = vec![
            // Disable automation detection flags
            OsStr::new("--disable-blink-features=AutomationControlled"),
            // Disable infobars that reveal automation
            OsStr::new("--disable-infobars"),
            // Standard performance flags
            OsStr::new("--disable-dev-shm-usage"),
            OsStr::new("--no-first-run"),
            OsStr::new("--no-default-browser-check"),
            // Reduce fingerprinting surface
            OsStr::new("--disable-extensions"),
            OsStr::new("--disable-popup-blocking"),
            // Use realistic window size
            OsStr::new("--window-size=1920,1080"),
            // Set User-Agent to realistic Chrome
            OsStr::new("--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
        ];

        let browser = Browser::new(LaunchOptions {
            headless: true,
            sandbox: false,
            enable_gpu: false,
            enable_logging: false,
            idle_browser_timeout: Duration::from_secs(300), // 5 minutes idle
            args: stealth_args,
            ..Default::default()
        })?;

        Ok(Self { browser })
    }

    /// Create a new tab for a request
    pub fn new_tab(&self) -> Result<std::sync::Arc<headless_chrome::Tab>> {
        self.browser
            .new_tab()
            .map_err(|e| anyhow!("Failed to create tab: {}", e))
    }
}

/// WebView executor for rendering dynamic pages
///
/// This uses headless Chrome to render JavaScript-heavy pages
/// that cannot be parsed with simple HTTP requests.
#[cfg(feature = "webview")]
pub struct WebViewExecutor {
    pool: Arc<WebViewPool>,
}

#[cfg(feature = "webview")]
impl WebViewExecutor {
    /// Create a new WebView executor (uses global pool)
    ///
    /// This reuses the shared Chrome browser instance.
    pub fn new() -> Result<Self> {
        Ok(Self {
            pool: WebViewPool::global()?,
        })
    }

    /// Render a page and optionally execute JavaScript
    ///
    /// # Arguments
    /// * `html` - Optional HTML content to load directly (data: URL)
    /// * `url` - URL to navigate to (used if html is None, or as base for relative resources)
    /// * `js` - Optional JavaScript to execute after page load
    ///
    /// # Returns
    /// The result of the JavaScript execution, or the page HTML if no JS provided
    pub fn render(
        &self,
        html: Option<&str>,
        url: Option<&str>,
        js: Option<&str>,
    ) -> Result<String> {
        use std::thread;
        use std::time::Duration;

        let tab = self.pool.new_tab()?;

        // Set a longer timeout for Cloudflare-protected sites
        tab.set_default_timeout(Duration::from_secs(60));

        // Inject stealth JavaScript to hide automation markers
        // This runs before any page navigation to set up the environment
        let stealth_js = r#"
            // Hide navigator.webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
                configurable: true
            });
            // Hide automation-related properties
            if (window.chrome) {
                window.chrome.runtime = undefined;
            }
            // Spoof plugins to look like real browser
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
                configurable: true
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh', 'en'],
                configurable: true
            });
        "#;

        // Navigate to URL or load HTML directly
        if let Some(html_content) = html {
            // Load HTML as data URL
            let encoded = urlencoding::encode(html_content);
            let data_url = format!("data:text/html;charset=utf-8,{}", encoded);
            tab.navigate_to(&data_url)?;
        } else if let Some(page_url) = url {
            tab.navigate_to(page_url)?;
        } else {
            return Err(anyhow!("Either html or url must be provided"));
        }

        // Wait for initial page load
        tab.wait_until_navigated()?;

        // Inject stealth scripts immediately after navigation
        let _ = tab.evaluate(stealth_js, false);

        // Check if we hit a Cloudflare challenge page
        let title_check = tab.evaluate("document.title", true)?;
        let is_cloudflare = match &title_check.value {
            Some(serde_json::Value::String(s)) => {
                s.contains("Just a moment") || s.contains("请稍候")
            }
            _ => false,
        };

        if is_cloudflare {
            tracing::debug!("Cloudflare challenge detected, waiting for resolution...");
            // Wait for Cloudflare JS challenge to complete (up to 10 seconds)
            for _ in 0..20 {
                thread::sleep(Duration::from_millis(500));
                let title_check = tab.evaluate("document.title", true)?;
                let still_challenging = match &title_check.value {
                    Some(serde_json::Value::String(s)) => {
                        s.contains("Just a moment") || s.contains("请稍候")
                    }
                    _ => false,
                };
                if !still_challenging {
                    tracing::debug!("Cloudflare challenge passed!");
                    break;
                }
            }
            // Re-inject stealth after redirect
            let _ = tab.evaluate(stealth_js, false);
        }

        // Small delay to ensure page is fully rendered
        thread::sleep(Duration::from_millis(500));

        // Execute JavaScript if provided
        let result = if let Some(js_code) = js {
            // Execute the JS and get result
            let eval_result = tab.evaluate(js_code, true)?;

            match eval_result.value {
                Some(serde_json::Value::String(s)) => s,
                Some(v) => v.to_string(),
                None => String::new(),
            }
        } else {
            // Return page source
            tab.get_content()?
        };

        // Close the tab
        drop(tab);

        Ok(result)
    }

    /// Simple fetch with WebView (for pages requiring JavaScript)
    pub fn fetch(&self, url: &str) -> Result<String> {
        self.render(None, Some(url), Some("document.documentElement.outerHTML"))
    }

    /// Execute JavaScript on a page and return result
    pub fn execute_js(&self, url: &str, js: &str) -> Result<String> {
        self.render(None, Some(url), Some(js))
    }
}

/// Stub implementation when webview feature is not enabled
#[cfg(not(feature = "webview"))]
pub struct WebViewExecutor;

#[cfg(not(feature = "webview"))]
impl WebViewExecutor {
    /// Create a stub executor (always returns error)
    pub fn new() -> Result<Self> {
        Err(anyhow!(
            "WebView support not enabled. Compile with --features webview"
        ))
    }

    /// Stub render method
    pub fn render(
        &self,
        _html: Option<&str>,
        _url: Option<&str>,
        _js: Option<&str>,
    ) -> Result<String> {
        Err(anyhow!("WebView support not enabled"))
    }

    /// Stub fetch method
    pub fn fetch(&self, _url: &str) -> Result<String> {
        Err(anyhow!("WebView support not enabled"))
    }

    /// Stub execute_js method  
    pub fn execute_js(&self, _url: &str, _js: &str) -> Result<String> {
        Err(anyhow!("WebView support not enabled"))
    }
}

/// Check if WebView feature is available
pub fn is_webview_available() -> bool {
    cfg!(feature = "webview")
}

/// Try to create a WebView executor, returning None if not available
pub fn try_create_webview() -> Option<WebViewExecutor> {
    WebViewExecutor::new().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_webview_availability() {
        // This test just checks the API compiles
        let _available = is_webview_available();
    }

    #[test]
    #[cfg(not(feature = "webview"))]
    fn test_webview_disabled() {
        // When webview is disabled, new() should fail
        assert!(WebViewExecutor::new().is_err());
    }
}
