//! Flaresolverr client for bypassing Cloudflare protection
//!
//! Flaresolverr is a service that uses undetected-chromedriver to solve
//! Cloudflare challenges automatically.
//!
//! Deploy: docker run -d --name flaresolverr -p 8191:8191 ghcr.io/flaresolverr/flaresolverr:latest

use anyhow::{Context, Result};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{debug, info};

/// Flaresolverr API endpoint (configurable via env var)
fn get_flaresolverr_url() -> String {
    std::env::var("FLARESOLVERR_URL").unwrap_or_else(|_| "http://localhost:8191/v1".to_string())
}

/// Request payload for Flaresolverr
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlareSolverrRequest {
    pub cmd: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_timeout: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub post_data: Option<String>,
}

/// Cookie from Flaresolverr response
#[derive(Debug, Clone, Deserialize)]
pub struct FlareSolverrCookie {
    pub name: String,
    pub value: String,
    pub domain: Option<String>,
    pub path: Option<String>,
    #[serde(default)]
    pub secure: bool,
    #[serde(default, rename = "httpOnly")]
    pub http_only: bool,
    #[serde(default, rename = "sameSite")]
    pub same_site: Option<String>,
    #[serde(default)]
    pub expiry: Option<f64>,
}

/// Solution from Flaresolverr
#[derive(Debug, Deserialize)]
pub struct FlareSolverrSolution {
    pub url: String,
    pub status: i32,
    pub headers: Option<serde_json::Value>,
    pub response: String,
    pub cookies: Vec<FlareSolverrCookie>,
    #[serde(rename = "userAgent")]
    pub user_agent: Option<String>,
}

/// Response from Flaresolverr API
#[derive(Debug, Deserialize)]
pub struct FlareSolverrResponse {
    pub status: String,
    pub message: String,
    #[serde(rename = "startTimestamp")]
    pub start_timestamp: Option<i64>,
    #[serde(rename = "endTimestamp")]
    pub end_timestamp: Option<i64>,
    pub version: Option<String>,
    pub solution: Option<FlareSolverrSolution>,
}

/// Flaresolverr client
pub struct FlareSolverrClient {
    client: Client,
    base_url: String,
}

impl FlareSolverrClient {
    /// Create a new client
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(120)) // Flaresolverr can take a while
                .build()
                .expect("Failed to build HTTP client"),
            base_url: get_flaresolverr_url(),
        }
    }

    /// Create with custom URL
    pub fn with_url(url: &str) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(120))
                .build()
                .expect("Failed to build HTTP client"),
            base_url: url.to_string(),
        }
    }

    /// Check if Flaresolverr is available
    pub fn is_available(&self) -> bool {
        let health_url = self.base_url.replace("/v1", "/health");
        self.client.get(&health_url).send().is_ok()
    }

    /// Solve Cloudflare challenge for a GET request
    pub fn solve_get(&self, url: &str) -> Result<FlareSolverrSolution> {
        self.solve(url, None)
    }

    /// Solve Cloudflare challenge for a POST request
    pub fn solve_post(&self, url: &str, post_data: &str) -> Result<FlareSolverrSolution> {
        self.solve(url, Some(post_data.to_string()))
    }

    /// Internal solve method
    fn solve(&self, url: &str, post_data: Option<String>) -> Result<FlareSolverrSolution> {
        let cmd = if post_data.is_some() {
            "request.post"
        } else {
            "request.get"
        };

        let request = FlareSolverrRequest {
            cmd: cmd.to_string(),
            url: url.to_string(),
            session: None,
            max_timeout: Some(60000), // 60 seconds
            post_data,
        };

        info!(
            "Sending request to Flaresolverr: {} {}",
            cmd, url
        );

        let response = self
            .client
            .post(&self.base_url)
            .json(&request)
            .send()
            .context("Failed to connect to Flaresolverr. Is it running?")?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().unwrap_or_default();
            anyhow::bail!("Flaresolverr returned error {}: {}", status, body);
        }

        let result: FlareSolverrResponse = response
            .json()
            .context("Failed to parse Flaresolverr response")?;

        debug!("Flaresolverr response status: {}", result.status);

        if result.status != "ok" {
            anyhow::bail!("Flaresolverr failed: {}", result.message);
        }

        result
            .solution
            .ok_or_else(|| anyhow::anyhow!("Flaresolverr returned no solution"))
    }
}

impl Default for FlareSolverrClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Check if HTML content indicates a Cloudflare challenge
pub fn is_cloudflare_challenge(html: &str) -> bool {
    let indicators = [
        "Just a moment",
        "请稍候",
        "Checking your browser",
        "正在检查您的浏览器",
        "cf-browser-verification",
        "challenge-running",
        "_cf_chl_opt",
        "Attention Required",
    ];

    indicators.iter().any(|indicator| html.contains(indicator))
}

/// Check if response status indicates Cloudflare block
pub fn is_cloudflare_blocked(status: u16, html: &str) -> bool {
    // Common Cloudflare block status codes
    let cf_status_codes = [403, 503, 520, 521, 522, 523, 524, 525, 526];

    if cf_status_codes.contains(&status) && is_cloudflare_challenge(html) {
        return true;
    }

    // Also check for challenge in 200 response (interactive challenge)
    if status == 200 && is_cloudflare_challenge(html) {
        return true;
    }

    false
}

/// Convert Flaresolverr cookies to cookie string
pub fn cookies_to_string(cookies: &[FlareSolverrCookie]) -> String {
    cookies
        .iter()
        .map(|c| format!("{}={}", c.name, c.value))
        .collect::<Vec<_>>()
        .join("; ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_cloudflare_challenge() {
        assert!(is_cloudflare_challenge("Just a moment..."));
        assert!(is_cloudflare_challenge("请稍候...正在检查您的浏览器"));
        assert!(is_cloudflare_challenge("<div class=\"cf-browser-verification\">"));
        assert!(!is_cloudflare_challenge("Hello World"));
        assert!(!is_cloudflare_challenge("<html><body>Normal page</body></html>"));
    }

    #[test]
    fn test_cookies_to_string() {
        let cookies = vec![
            FlareSolverrCookie {
                name: "cf_clearance".to_string(),
                value: "abc123".to_string(),
                domain: None,
                path: None,
                secure: false,
                http_only: false,
                same_site: None,
                expiry: None,
            },
            FlareSolverrCookie {
                name: "session".to_string(),
                value: "xyz789".to_string(),
                domain: None,
                path: None,
                secure: false,
                http_only: false,
                same_site: None,
                expiry: None,
            },
        ];

        let result = cookies_to_string(&cookies);
        assert_eq!(result, "cf_clearance=abc123; session=xyz789");
    }
}
