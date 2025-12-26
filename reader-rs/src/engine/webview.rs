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
use std::sync::{Arc, OnceLock};

/// Global browser pool for reusing Chrome instance
#[cfg(feature = "webview")]
static BROWSER_POOL: OnceLock<Arc<WebViewPool>> = OnceLock::new();

/// WebView pool for managing a shared Chrome browser instance
#[cfg(feature = "webview")]
pub struct WebViewPool {
    browser: headless_chrome::Browser,
}

#[cfg(feature = "webview")]
impl WebViewPool {
    /// Get or create the global browser pool (lazy singleton)
    pub fn global() -> Arc<Self> {
        BROWSER_POOL
            .get_or_init(|| {
                Arc::new(Self::new_internal().expect("Failed to initialize browser pool"))
            })
            .clone()
    }

    /// Internal: Create a new browser instance
    fn new_internal() -> Result<Self> {
        use headless_chrome::{Browser, LaunchOptions};
        use std::time::Duration;

        tracing::info!("Initializing WebView browser pool (one-time startup)");

        let browser = Browser::new(LaunchOptions {
            headless: true,
            sandbox: false,
            enable_gpu: false,
            enable_logging: false,
            idle_browser_timeout: Duration::from_secs(300), // 5 minutes idle
            ..Default::default()
        })?;

        Ok(Self { browser })
    }

    /// Create a new tab for a request
    pub fn new_tab(&self) -> Result<headless_chrome::Tab> {
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
            pool: WebViewPool::global(),
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
        use std::time::Duration;

        let tab = self.pool.new_tab()?;

        // Set a reasonable timeout
        tab.set_default_timeout(Duration::from_secs(30));

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

        // Wait for page to load
        tab.wait_until_navigated()?;

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
