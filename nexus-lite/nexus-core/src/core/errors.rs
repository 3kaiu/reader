//! NexusLite 核心错误定义
//!
//! 这是简化后的核心错误定义，统一所有错误类型。

use std::fmt;

/// 引擎错误类型
#[derive(Debug, Clone)]
pub enum EngineError {
    /// 网络错误
    Network(String),
    /// 解析错误
    Parse(String),
    /// 缓存错误
    Cache(String),
    /// 存储错误
    Storage(String),
    /// 验证错误
    Validation(String),
    /// 配置错误
    Config(String),
    /// IO 错误
    Io(String),
    /// 超时错误
    Timeout(String),
    /// 未找到
    NotFound(String),
    /// 权限错误
    Permission(String),
    /// 其他错误
    Other(String),
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EngineError::Network(msg) => write!(f, "Network error: {}", msg),
            EngineError::Parse(msg) => write!(f, "Parse error: {}", msg),
            EngineError::Cache(msg) => write!(f, "Cache error: {}", msg),
            EngineError::Storage(msg) => write!(f, "Storage error: {}", msg),
            EngineError::Validation(msg) => write!(f, "Validation error: {}", msg),
            EngineError::Config(msg) => write!(f, "Config error: {}", msg),
            EngineError::Io(msg) => write!(f, "IO error: {}", msg),
            EngineError::Timeout(msg) => write!(f, "Timeout error: {}", msg),
            EngineError::NotFound(msg) => write!(f, "Not found: {}", msg),
            EngineError::Permission(msg) => write!(f, "Permission error: {}", msg),
            EngineError::Other(msg) => write!(f, "Error: {}", msg),
        }
    }
}

impl std::error::Error for EngineError {}

impl From<serde_json::Error> for EngineError {
    fn from(err: serde_json::Error) -> Self {
        EngineError::Parse(err.to_string())
    }
}

impl From<std::io::Error> for EngineError {
    fn from(err: std::io::Error) -> Self {
        EngineError::Io(err.to_string())
    }
}

impl From<String> for EngineError {
    fn from(msg: String) -> Self {
        EngineError::Other(msg)
    }
}

impl From<&str> for EngineError {
    fn from(msg: &str) -> Self {
        EngineError::Other(msg.to_string())
    }
}
