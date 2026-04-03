//! NexusLite 核心配置模块
//!
//! 这是简化后的核心配置模块，提供统一的配置管理。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 引擎配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    /// 引擎名称
    pub name: String,
    /// 引擎版本
    pub version: String,
    /// 是否启用
    pub enabled: bool,
    /// 超时时间（毫秒）
    pub timeout_ms: u64,
    /// 重试次数
    pub retry_count: u32,
    /// 速率限制
    pub rate_limit: Option<u32>,
    /// Cloudflare 绕过配置
    pub cf_bypass: CloudflareBypassConfig,
    /// 自定义配置
    pub custom_config: HashMap<String, serde_json::Value>,
}

/// Cloudflare 绕过配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudflareBypassConfig {
    /// 是否启用
    pub enabled: bool,
    /// API 地址
    pub api_url: Option<String>,
    /// API 密钥
    pub api_key: Option<String>,
    /// 超时时间（毫秒）
    pub timeout_ms: u64,
}

impl Default for CloudflareBypassConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            api_url: None,
            api_key: None,
            timeout_ms: 10000,
        }
    }
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
            version: "0.1.0".to_string(),
            enabled: true,
            timeout_ms: 30000,
            retry_count: 3,
            rate_limit: None,
            cf_bypass: CloudflareBypassConfig::default(),
            custom_config: HashMap::new(),
        }
    }
}

/// 缓存配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    /// 内存缓存大小
    pub memory_cache_size: usize,
    /// 磁盘缓存大小
    pub disk_cache_size: usize,
    /// 默认 TTL（秒）
    pub default_ttl_seconds: u64,
    /// 是否启用 Redis
    pub enable_redis: bool,
    /// Redis URL
    pub redis_url: Option<String>,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            memory_cache_size: 1000,
            disk_cache_size: 10000,
            default_ttl_seconds: 3600,
            enable_redis: false,
            redis_url: None,
        }
    }
}

/// 全局配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalConfig {
    /// 引擎配置
    pub engines: HashMap<String, EngineConfig>,
    /// 缓存配置
    pub cache: CacheConfig,
    /// 日志级别
    pub log_level: String,
    /// 是否启用指标
    pub enable_metrics: bool,
    /// 是否启用追踪
    pub enable_tracing: bool,
}

impl Default for GlobalConfig {
    fn default() -> Self {
        Self {
            engines: HashMap::new(),
            cache: CacheConfig::default(),
            log_level: "info".to_string(),
            enable_metrics: true,
            enable_tracing: false,
        }
    }
}

/// 配置加载器
pub struct ConfigLoader;

impl ConfigLoader {
    /// 从文件加载配置
    pub fn load_from_file(path: &str) -> Result<GlobalConfig, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;

        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))
    }

    /// 从环境变量加载配置
    pub fn load_from_env() -> Result<GlobalConfig, String> {
        let mut config = GlobalConfig::default();

        // 从环境变量读取配置
        if let Ok(log_level) = std::env::var("NEXUS_LOG_LEVEL") {
            config.log_level = log_level;
        }

        if let Ok(enable_metrics) = std::env::var("NEXUS_ENABLE_METRICS") {
            config.enable_metrics = enable_metrics.parse().unwrap_or(true);
        }

        if let Ok(enable_tracing) = std::env::var("NEXUS_ENABLE_TRACING") {
            config.enable_tracing = enable_tracing.parse().unwrap_or(false);
        }

        Ok(config)
    }

    /// 保存配置到文件
    pub fn save_to_file(config: &GlobalConfig, path: &str) -> Result<(), String> {
        let content = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        std::fs::write(path, content).map_err(|e| format!("Failed to write config file: {}", e))
    }
}
