//! Configuration structures for Nexus

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Global engine configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(Default)]
pub struct EngineConfig {
    /// Server configuration
    #[serde(default)]
    pub server: ServerConfig,

    /// Resource limits for NAS optimization
    #[serde(default)]
    pub limits: ResourceLimits,

    /// Storage paths
    #[serde(default)]
    pub storage: StorageConfig,

    /// Logging configuration
    #[serde(default)]
    pub logging: LoggingConfig,

    /// Cloudflare bypass service configuration
    #[serde(default)]
    pub cf_bypass: CloudflareBypassConfig,

    /// Optional feature switches
    #[serde(default)]
    pub features: FeatureConfig,
}

/// Server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    /// Server host
    #[serde(default = "default_host")]
    pub host: String,

    /// Server port
    #[serde(default = "default_port")]
    pub port: u16,

    /// Enable CORS
    #[serde(default = "default_true")]
    pub enable_cors: bool,

    /// Allowed CORS origins (empty = permissive/allow all)
    /// Example: ["https://example.com", "https://app.example.com"]
    #[serde(default)]
    pub allowed_origins: Vec<String>,

    /// API Key for authentication (optional, None = no auth required)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,

    /// Rate limiting configuration
    #[serde(default)]
    pub rate_limit: RateLimitConfig,
}

fn default_host() -> String {
    "0.0.0.0".to_string()
}
fn default_port() -> u16 {
    8080
}
fn default_true() -> bool {
    true
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: default_host(),
            port: default_port(),
            enable_cors: true,
            allowed_origins: vec![],
            api_key: None, // Default: no authentication
            rate_limit: RateLimitConfig::default(),
        }
    }
}

/// Rate limiting configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitConfig {
    /// Requests per second per client
    #[serde(default = "default_rate_per_second")]
    pub per_second: u64,

    /// Burst size (maximum number of requests allowed in a short burst)
    #[serde(default = "default_burst_size")]
    pub burst_size: u32,
}

fn default_rate_per_second() -> u64 {
    20
}
fn default_burst_size() -> u32 {
    50
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            per_second: default_rate_per_second(),
            burst_size: default_burst_size(),
        }
    }
}

/// Resource limits for NAS-optimized deployment
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceLimits {
    /// Maximum concurrent searches
    #[serde(default = "default_concurrent_searches")]
    pub max_concurrent_searches: usize,

    /// Maximum concurrent fetches per source
    #[serde(default = "default_concurrent_fetches")]
    pub max_concurrent_fetches_per_source: usize,

    /// Parser cache size (number of compiled selectors)
    #[serde(default = "default_parser_cache")]
    pub parser_cache_size: usize,

    /// Chapter cache size in MB
    #[serde(default = "default_chapter_cache")]
    pub chapter_cache_mb: usize,

    /// HTTP request timeout in seconds
    #[serde(default = "default_http_timeout")]
    pub http_timeout_seconds: u64,

    /// Maximum URLs accepted by `/api/batch/content` in a single request
    #[serde(default = "default_max_batch_content_urls")]
    pub max_batch_content_urls: usize,

    /// Maximum number of source IDs tracked in extraction quality counters
    #[serde(default = "default_max_extraction_metrics_sources")]
    pub max_extraction_metrics_sources: usize,

    /// HTTP connection pool — max idle connections per host
    #[serde(default = "default_pool_max_idle_per_host")]
    pub pool_max_idle_per_host: usize,

    /// HTTP connection pool — idle timeout in seconds
    #[serde(default = "default_pool_idle_timeout_secs")]
    pub pool_idle_timeout_secs: u64,

    /// TCP keepalive in seconds
    #[serde(default = "default_tcp_keepalive_secs")]
    pub tcp_keepalive_secs: u64,

    /// Maximum concurrent HTTP requests across all sources
    #[serde(default = "default_http_max_concurrent")]
    pub http_max_concurrent: usize,
}

fn default_concurrent_searches() -> usize {
    3
}
fn default_concurrent_fetches() -> usize {
    2
}
fn default_parser_cache() -> usize {
    64
}
fn default_chapter_cache() -> usize {
    32
}
fn default_http_timeout() -> u64 {
    30
}
fn default_max_batch_content_urls() -> usize {
    128
}
fn default_max_extraction_metrics_sources() -> usize {
    10_000
}
fn default_pool_max_idle_per_host() -> usize {
    100
}
fn default_pool_idle_timeout_secs() -> u64 {
    120
}
fn default_tcp_keepalive_secs() -> u64 {
    60
}
fn default_http_max_concurrent() -> usize {
    10
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_concurrent_searches: default_concurrent_searches(),
            max_concurrent_fetches_per_source: default_concurrent_fetches(),
            parser_cache_size: default_parser_cache(),
            chapter_cache_mb: default_chapter_cache(),
            http_timeout_seconds: default_http_timeout(),
            max_batch_content_urls: default_max_batch_content_urls(),
            max_extraction_metrics_sources: default_max_extraction_metrics_sources(),
            pool_max_idle_per_host: default_pool_max_idle_per_host(),
            pool_idle_timeout_secs: default_pool_idle_timeout_secs(),
            tcp_keepalive_secs: default_tcp_keepalive_secs(),
            http_max_concurrent: default_http_max_concurrent(),
        }
    }
}

/// Storage paths configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageConfig {
    /// Base data directory
    #[serde(default = "default_data_dir")]
    pub data_dir: PathBuf,

    /// Book sources directory
    #[serde(default = "default_sources_dir")]
    pub sources_dir: PathBuf,

    /// Chapter cache directory
    #[serde(default = "default_cache_dir")]
    pub cache_dir: PathBuf,

    /// SQLite database path
    #[serde(default = "default_db_path")]
    pub db_path: PathBuf,
}

fn default_data_dir() -> PathBuf {
    PathBuf::from("./data")
}
fn default_sources_dir() -> PathBuf {
    PathBuf::from("./sources")
}
fn default_cache_dir() -> PathBuf {
    PathBuf::from("./cache")
}
fn default_db_path() -> PathBuf {
    PathBuf::from("./data/nexus.db")
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            data_dir: default_data_dir(),
            sources_dir: default_sources_dir(),
            cache_dir: default_cache_dir(),
            db_path: default_db_path(),
        }
    }
}

/// Logging configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoggingConfig {
    /// Log level (trace, debug, info, warn, error)
    #[serde(default = "default_log_level")]
    pub level: String,

    /// Enable JSON format
    #[serde(default)]
    pub json_format: bool,

    /// Log file path (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<PathBuf>,
}

fn default_log_level() -> String {
    "info".to_string()
}

impl Default for LoggingConfig {
    fn default() -> Self {
        Self {
            level: default_log_level(),
            json_format: false,
            file_path: None,
        }
    }
}

/// Cloudflare bypass service configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudflareBypassConfig {
    /// CF bypass service URL
    #[serde(default = "default_cf_service_url")]
    pub service_url: String,

    /// API Key for authentication (optional)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,

    /// Whether CF bypass is enabled
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// Optional proxy for CF bypass service
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy: Option<String>,

    /// Request timeout in seconds
    #[serde(default = "default_cf_timeout")]
    pub timeout_seconds: u64,

    /// Max concurrent requests to the bypass service
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent: usize,
}

fn default_cf_service_url() -> String {
    "http://localhost:8000".to_string()
}

fn default_cf_timeout() -> u64 {
    35 // Slightly longer than Python service's 30s
}

fn default_max_concurrent() -> usize {
    10 // Max concurrent requests to bypass service
}

impl Default for CloudflareBypassConfig {
    fn default() -> Self {
        Self {
            service_url: default_cf_service_url(),
            api_key: None,
            enabled: true,
            proxy: None,
            timeout_seconds: default_cf_timeout(),
            max_concurrent: default_max_concurrent(),
        }
    }
}

/// Optional platform features that should stay out of the critical reading path
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureConfig {
    /// Include AI mapping rules in chapter content cleaning
    #[serde(default = "default_true")]
    pub enable_ai_content_rules: bool,
}

impl Default for FeatureConfig {
    fn default() -> Self {
        Self {
            enable_ai_content_rules: default_true(),
        }
    }
}
