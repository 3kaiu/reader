use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// HTTP fetch response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub url: String,
}

impl FetchResponse {
    pub fn is_success(&self) -> bool {
        self.status >= 200 && self.status < 300
    }

    pub fn is_cloudflare_challenge(&self) -> bool {
        self.status == 403
            || self.status == 503
            || self.body.contains("cf-browser-verification")
            || self.body.contains("Just a moment")
    }
}

/// Fetch context — complete request descriptor (formerly split across FetchContext + FetchJob)
///
/// Combines the HTTP-level context (url, method, headers, body) with orchestration
/// metadata (trace_id, chapter_id) that was previously on a separate FetchJob struct.
/// This eliminates the dual-construction pattern where the same function created both
/// a FetchJob and a FetchContext with zero information flow between them.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchContext {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub source_id: String,
    pub last_response: Option<FetchResponse>,
    pub cookies: HashMap<String, String>,
    /// Timeout in seconds for this request
    pub timeout_secs: u64,
    /// Orchestration trace id for request correlation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    /// Target chapter id when fetching chapter content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_id: Option<String>,
}

impl FetchContext {
    pub fn new(url: &str, source_id: &str) -> Self {
        Self {
            url: url.to_string(),
            method: "GET".to_string(),
            headers: HashMap::new(),
            body: None,
            source_id: source_id.to_string(),
            last_response: None,
            cookies: HashMap::new(),
            timeout_secs: 30,
            trace_id: None,
            chapter_id: None,
        }
    }

    pub fn with_timeout(url: &str, source_id: &str, timeout_secs: u64) -> Self {
        let mut ctx = Self::new(url, source_id);
        ctx.timeout_secs = timeout_secs;
        ctx
    }
}

/// Runtime policy profile per source.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuntimeProfile {
    #[serde(default)]
    pub strategy_chain: Vec<String>,
    pub timeout_ms: u64,
    pub retry_budget: u32,
    pub concurrency_limit: usize,
}

impl Default for SourceRuntimeProfile {
    fn default() -> Self {
        Self {
            strategy_chain: vec!["CF-Bypass".to_string(), "DirectHTTP".to_string()],
            timeout_ms: 30_000,
            retry_budget: 2,
            concurrency_limit: 4,
        }
    }
}

