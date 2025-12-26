//! Engine Configuration - Centralized settings for the engine
//!
//! This module provides configuration options for the engine,
//! allowing fine-grained control over behavior and performance.

use std::time::Duration;

/// Engine Configuration
#[derive(Debug, Clone)]
pub struct EngineConfig {
    // Cache settings
    /// Maximum cache size for analysis results
    pub analysis_cache_size: usize,
    /// Cache TTL (time to live)
    pub cache_ttl: Duration,

    // HTTP settings
    /// HTTP request timeout
    pub http_timeout: Duration,
    /// Maximum concurrent HTTP requests
    pub max_concurrent_requests: usize,
    /// User agent string
    pub user_agent: String,

    // JS execution settings
    /// Maximum JS execution time
    pub js_timeout: Duration,
    /// Enable JS execution (fallback when native fails)
    pub js_enabled: bool,

    // Analysis settings
    /// Enable AST analysis
    pub ast_enabled: bool,
    /// Enable regex analysis
    pub regex_enabled: bool,

    // Debug settings
    /// Enable debug logging
    pub debug_logging: bool,
    /// Enable performance metrics
    pub metrics_enabled: bool,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            // Cache defaults
            analysis_cache_size: 256,
            cache_ttl: Duration::from_secs(3600), // 1 hour

            // HTTP defaults
            http_timeout: Duration::from_secs(30),
            max_concurrent_requests: 5,
            user_agent: "Reader/1.0".to_string(),

            // JS defaults
            js_timeout: Duration::from_secs(10),
            js_enabled: true,

            // Analysis defaults
            ast_enabled: true,
            regex_enabled: true,

            // Debug defaults
            debug_logging: false,
            metrics_enabled: true,
        }
    }
}

impl EngineConfig {
    /// Create a new config with default settings
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a config optimized for performance
    pub fn performance() -> Self {
        Self {
            analysis_cache_size: 512,
            http_timeout: Duration::from_secs(15),
            max_concurrent_requests: 10,
            js_timeout: Duration::from_secs(5),
            ..Self::default()
        }
    }

    /// Create a config optimized for debugging
    pub fn debug() -> Self {
        Self {
            debug_logging: true,
            metrics_enabled: true,
            ..Self::default()
        }
    }

    /// Builder: set cache size
    pub fn with_cache_size(mut self, size: usize) -> Self {
        self.analysis_cache_size = size;
        self
    }

    /// Builder: set HTTP timeout
    pub fn with_http_timeout(mut self, timeout: Duration) -> Self {
        self.http_timeout = timeout;
        self
    }

    /// Builder: set JS timeout
    pub fn with_js_timeout(mut self, timeout: Duration) -> Self {
        self.js_timeout = timeout;
        self
    }

    /// Builder: enable/disable JS
    pub fn with_js_enabled(mut self, enabled: bool) -> Self {
        self.js_enabled = enabled;
        self
    }

    /// Builder: set user agent
    pub fn with_user_agent(mut self, ua: impl Into<String>) -> Self {
        self.user_agent = ua.into();
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = EngineConfig::default();
        assert_eq!(config.analysis_cache_size, 256);
        assert!(config.js_enabled);
        assert!(config.ast_enabled);
    }

    #[test]
    fn test_performance_config() {
        let config = EngineConfig::performance();
        assert_eq!(config.analysis_cache_size, 512);
        assert_eq!(config.max_concurrent_requests, 10);
    }

    #[test]
    fn test_builder_pattern() {
        let config = EngineConfig::new()
            .with_cache_size(1024)
            .with_js_enabled(false)
            .with_user_agent("CustomAgent/2.0");

        assert_eq!(config.analysis_cache_size, 1024);
        assert!(!config.js_enabled);
        assert_eq!(config.user_agent, "CustomAgent/2.0");
    }
}
