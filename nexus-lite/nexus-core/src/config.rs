//! Configuration structures for NexusLite

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Global engine configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            limits: ResourceLimits::default(),
            storage: StorageConfig::default(),
            logging: LoggingConfig::default(),
            cf_bypass: CloudflareBypassConfig::default(),
        }
    }
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

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_concurrent_searches: default_concurrent_searches(),
            max_concurrent_fetches_per_source: default_concurrent_fetches(),
            parser_cache_size: default_parser_cache(),
            chapter_cache_mb: default_chapter_cache(),
            http_timeout_seconds: default_http_timeout(),
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

    /// Request timeout in seconds
    #[serde(default = "default_cf_timeout")]
    pub timeout_seconds: u64,
}

fn default_cf_service_url() -> String {
    "http://localhost:8000".to_string()
}

fn default_cf_timeout() -> u64 {
    35 // Slightly longer than Python service's 30s
}

impl Default for CloudflareBypassConfig {
    fn default() -> Self {
        Self {
            service_url: default_cf_service_url(),
            api_key: None,
            enabled: true,
            timeout_seconds: default_cf_timeout(),
        }
    }
}
