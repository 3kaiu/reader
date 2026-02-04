//! Unified error types for NexusLite with standardized error codes
//! Implements cross-language error protocol compatible with CF Bypass and Nexus Reader

use serde::{Deserialize, Serialize};

/// Standardized error codes across all Nexus components
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    // Network Layer (1000-1999)
    NetworkError = 1000,
    Timeout = 1001,
    DnsResolutionFailed = 1002,
    ConnectionRefused = 1003,
    TlsHandshakeFailed = 1004,

    // Anti-Crawl Layer (2000-2999)
    CloudflareChallenge = 2000,
    CloudflareChallengeFailed = 2001,
    RateLimited = 2002,
    IpBanned = 2003,
    AllStrategiesFailed = 2004,
    CircuitOpen = 2005,
    StrategyDisabled = 2006,

    // Parse Layer (3000-3999)
    HtmlParseError = 3000,
    RuleMismatch = 3001,
    JsonParseError = 3002,
    InvalidSelector = 3003,
    ContentExtractionFailed = 3004,

    // Script Layer (4000-4999)
    ScriptExecutionError = 4000,
    ScriptTimeout = 4001,
    ScriptMemoryExceeded = 4002,

    // Storage Layer (5000-5999)
    SourceNotFound = 5000,
    DatabaseError = 5001,
    FileIoError = 5002,
    CacheMiss = 5003,
    StorageQuotaExceeded = 5004,

    // Business Layer (6000-6999)
    BookNotFound = 6000,
    ChapterNotFound = 6001,
    EmptyContent = 6002,
    InvalidBookFormat = 6003,
    UnsupportedBookType = 6004,

    // Authentication Layer (7000-7999)
    Unauthorized = 7000,
    Forbidden = 7001,
    InvalidToken = 7002,
    TokenExpired = 7003,
    InsufficientPermissions = 7004,

    // Configuration Layer (8000-8999)
    InvalidConfig = 8000,
    ConfigNotFound = 8001,
    ConfigValidationFailed = 8002,

    // AI/ML Layer (9000-9999)
    ModelLoadFailed = 9000,
    InferenceFailed = 9001,
    UnsupportedModelType = 9002,
    ModelTimeout = 9003,
    InsufficientResources = 9004,

    // Generic (0000-0999)
    InternalError = 0,
    UnknownError = 1,
    ValidationError = 2,
    SerializationError = 3,
    DeserializationError = 4,
}

/// Error severity levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ErrorSeverity {
    Low,
    Medium,
    High,
    Critical,
}

/// Standardized error response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub code: ErrorCode,
    pub severity: ErrorSeverity,
    pub message: String,
    pub details: Option<String>,
    pub timestamp: i64,
    pub request_id: Option<String>,
    pub context: Option<serde_json::Value>,
}

/// Main error type for the engine with standardized codes and severity
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    // ============== Network Layer ==============
    #[error("Network request failed: {message}")]
    Network { message: String },

    #[error("Request timeout")]
    Timeout,

    #[error("DNS resolution failed for host: {host}")]
    DnsError { host: String },

    #[error("Connection refused: {message}")]
    ConnectionRefused { message: String },

    #[error("TLS handshake failed: {message}")]
    TlsHandshakeFailed { message: String },

    // ============== Anti-Crawl Layer ==============
    #[error("Cloudflare challenge detected")]
    CloudflareChallenge,

    #[error("Cloudflare challenge failed after bypass attempt")]
    CloudflareChallengeFailed,

    #[error("Rate limited, retry after {retry_after}s")]
    RateLimited { retry_after: u64 },

    #[error("IP banned by target site")]
    IpBanned,

    #[error("All anti-crawl strategies exhausted")]
    AllStrategiesFailed,

    #[error("Circuit breaker open: {message}")]
    CircuitOpen { message: String },

    #[error("Strategy is disabled")]
    StrategyDisabled,

    #[error("Unauthorized access")]
    Unauthorized,

    #[error("Access forbidden")]
    Forbidden,

    // ============== Parse Layer ==============
    #[error("HTML parse error: {message}")]
    HtmlParse { message: String },

    #[error("Rule mismatch: {rule}")]
    RuleMismatch { rule: String },

    #[error("JSON parse error: {message}")]
    JsonParse { message: String },

    #[error("Invalid selector: {selector}")]
    InvalidSelector { selector: String },

    #[error("Content extraction failed: {reason}")]
    ContentExtractionFailed { reason: String },

    // ============== Script Layer ==============
    #[error("Script execution error: {message}")]
    ScriptError { message: String },

    #[error("Script execution timeout")]
    ScriptTimeout,

    #[error("Script memory limit exceeded")]
    ScriptMemoryExceeded,

    // ============== Storage Layer ==============
    #[error("Source not found: {id}")]
    SourceNotFound { id: String },

    #[error("Database error: {message}")]
    Database { message: String },

    #[error("File I/O error: {message}")]
    FileIo { message: String },

    #[error("Cache miss for key: {key}")]
    CacheMiss { key: String },

    #[error("Storage quota exceeded")]
    StorageQuotaExceeded,

    // ============== Business Layer ==============
    #[error("Book not found")]
    BookNotFound,

    #[error("Chapter not found: {index}")]
    ChapterNotFound { index: u32 },

    #[error("Empty content")]
    EmptyContent,

    #[error("Invalid book format: {format}")]
    InvalidBookFormat { format: String },

    #[error("Unsupported book type: {book_type}")]
    UnsupportedBookType { book_type: String },

    // ============== Configuration Layer ==============
    #[error("Invalid configuration: {message}")]
    InvalidConfig { message: String },

    #[error("Configuration not found: {key}")]
    ConfigNotFound { key: String },

    #[error("Configuration validation failed: {details}")]
    ConfigValidationFailed { details: String },

    // ============== AI/ML Layer ==============
    #[error("Model load failed: {model_id}")]
    ModelLoadFailed { model_id: String },

    #[error("AI inference failed: {reason}")]
    InferenceFailed { reason: String },

    #[error("Unsupported model type: {model_type}")]
    UnsupportedModelType { model_type: String },

    #[error("Model inference timeout")]
    ModelTimeout,

    #[error("Insufficient resources for AI processing")]
    InsufficientResources,

    // ============== Generic ==============
    #[error("Internal error: {message}")]
    Internal { message: String },

    #[error("Unknown error: {message}")]
    Unknown { message: String },

    #[error("Validation error: {field} - {message}")]
    Validation { field: String, message: String },

    #[error("Serialization error: {message}")]
    Serialization { message: String },

    #[error("Deserialization error: {message}")]
    Deserialization { message: String },
}

impl EngineError {
    /// Get standardized error code
    pub fn error_code(&self) -> ErrorCode {
        match self {
            // Network Layer
            Self::Network { .. } => ErrorCode::NetworkError,
            Self::Timeout => ErrorCode::Timeout,
            Self::DnsError { .. } => ErrorCode::DnsResolutionFailed,
            Self::ConnectionRefused { .. } => ErrorCode::ConnectionRefused,
            Self::TlsHandshakeFailed { .. } => ErrorCode::TlsHandshakeFailed,

            // Anti-Crawl Layer
            Self::CloudflareChallenge => ErrorCode::CloudflareChallenge,
            Self::CloudflareChallengeFailed => ErrorCode::CloudflareChallengeFailed,
            Self::RateLimited { .. } => ErrorCode::RateLimited,
            Self::IpBanned => ErrorCode::IpBanned,
            Self::AllStrategiesFailed => ErrorCode::AllStrategiesFailed,
            Self::CircuitOpen { .. } => ErrorCode::CircuitOpen,
            Self::StrategyDisabled => ErrorCode::StrategyDisabled,
            Self::Unauthorized => ErrorCode::Unauthorized,
            Self::Forbidden => ErrorCode::Forbidden,

            // Parse Layer
            Self::HtmlParse { .. } => ErrorCode::HtmlParseError,
            Self::RuleMismatch { .. } => ErrorCode::RuleMismatch,
            Self::JsonParse { .. } => ErrorCode::JsonParseError,
            Self::InvalidSelector { .. } => ErrorCode::InvalidSelector,
            Self::ContentExtractionFailed { .. } => ErrorCode::ContentExtractionFailed,

            // Script Layer
            Self::ScriptError { .. } => ErrorCode::ScriptExecutionError,
            Self::ScriptTimeout => ErrorCode::ScriptTimeout,
            Self::ScriptMemoryExceeded => ErrorCode::ScriptMemoryExceeded,

            // Storage Layer
            Self::SourceNotFound { .. } => ErrorCode::SourceNotFound,
            Self::Database { .. } => ErrorCode::DatabaseError,
            Self::FileIo { .. } => ErrorCode::FileIoError,
            Self::CacheMiss { .. } => ErrorCode::CacheMiss,
            Self::StorageQuotaExceeded => ErrorCode::StorageQuotaExceeded,

            // Business Layer
            Self::BookNotFound => ErrorCode::BookNotFound,
            Self::ChapterNotFound { .. } => ErrorCode::ChapterNotFound,
            Self::EmptyContent => ErrorCode::EmptyContent,
            Self::InvalidBookFormat { .. } => ErrorCode::InvalidBookFormat,
            Self::UnsupportedBookType { .. } => ErrorCode::UnsupportedBookType,

            // Configuration Layer
            Self::InvalidConfig { .. } => ErrorCode::InvalidConfig,
            Self::ConfigNotFound { .. } => ErrorCode::ConfigNotFound,
            Self::ConfigValidationFailed { .. } => ErrorCode::ConfigValidationFailed,

            // AI/ML Layer
            Self::ModelLoadFailed { .. } => ErrorCode::ModelLoadFailed,
            Self::InferenceFailed { .. } => ErrorCode::InferenceFailed,
            Self::UnsupportedModelType { .. } => ErrorCode::UnsupportedModelType,
            Self::ModelTimeout => ErrorCode::ModelTimeout,
            Self::InsufficientResources => ErrorCode::InsufficientResources,

            // Generic
            Self::Internal { .. } => ErrorCode::InternalError,
            Self::Unknown { .. } => ErrorCode::UnknownError,
            Self::Validation { .. } => ErrorCode::ValidationError,
            Self::Serialization { .. } => ErrorCode::SerializationError,
            Self::Deserialization { .. } => ErrorCode::DeserializationError,
        }
    }

    /// Get error severity level
    pub fn severity(&self) -> ErrorSeverity {
        match self {
            // Critical errors that require immediate attention
            Self::CircuitOpen { .. } | Self::AllStrategiesFailed | Self::StorageQuotaExceeded => ErrorSeverity::Critical,
            Self::IpBanned | Self::CloudflareChallengeFailed | Self::InsufficientResources => ErrorSeverity::High,

            // High impact errors
            Self::RateLimited { .. } | Self::Unauthorized | Self::Forbidden | Self::ModelTimeout => ErrorSeverity::High,
            Self::Database { .. } | Self::FileIo { .. } | Self::Internal { .. } => ErrorSeverity::High,

            // Medium impact errors
            Self::Timeout | Self::ConnectionRefused { .. } | Self::TlsHandshakeFailed { .. } => ErrorSeverity::Medium,
            Self::CloudflareChallenge | Self::ScriptTimeout | Self::ScriptMemoryExceeded => ErrorSeverity::Medium,
            Self::InvalidConfig { .. } | Self::ConfigValidationFailed { .. } => ErrorSeverity::Medium,

            // Low impact errors
            _ => ErrorSeverity::Low,
        }
    }

    /// Check if this error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::Network { .. }
                | Self::Timeout
                | Self::RateLimited { .. }
                | Self::CloudflareChallenge
                | Self::ConnectionRefused { .. }
                | Self::TlsHandshakeFailed { .. }
                | Self::ScriptTimeout
        )
    }

    /// Get suggested retry delay in seconds
    pub fn retry_delay(&self) -> Option<u64> {
        match self {
            Self::RateLimited { retry_after } => Some(*retry_after),
            Self::Timeout => Some(1),
            Self::CloudflareChallenge => Some(5),
            Self::Network { .. } | Self::ConnectionRefused { .. } => Some(2),
            Self::ScriptTimeout => Some(3),
            _ => None,
        }
    }

    /// Convert to standardized error response
    pub fn to_error_response(&self, request_id: Option<String>) -> ErrorResponse {
        ErrorResponse {
            code: self.error_code(),
            severity: self.severity(),
            message: self.to_string(),
            details: None, // Can be extended with more context
            timestamp: chrono::Utc::now().timestamp_millis(),
            request_id,
            context: None, // Can be extended with error-specific context
        }
    }

    /// Get legacy string error code for backward compatibility
    pub fn legacy_error_code(&self) -> &'static str {
        match self {
            Self::Network { .. } => "NETWORK_ERROR",
            Self::Timeout => "TIMEOUT",
            Self::DnsError { .. } => "DNS_ERROR",
            Self::ConnectionRefused { .. } => "CONNECTION_REFUSED",
            Self::TlsHandshakeFailed { .. } => "TLS_HANDSHAKE_FAILED",
            Self::CloudflareChallenge => "CLOUDFLARE_CHALLENGE",
            Self::CloudflareChallengeFailed => "CLOUDFLARE_CHALLENGE_FAILED",
            Self::RateLimited { .. } => "RATE_LIMITED",
            Self::IpBanned => "IP_BANNED",
            Self::AllStrategiesFailed => "ALL_STRATEGIES_FAILED",
            Self::CircuitOpen { .. } => "CIRCUIT_OPEN",
            Self::StrategyDisabled => "STRATEGY_DISABLED",
            Self::Unauthorized => "UNAUTHORIZED",
            Self::Forbidden => "FORBIDDEN",
            Self::HtmlParse { .. } => "HTML_PARSE_ERROR",
            Self::RuleMismatch { .. } => "RULE_MISMATCH",
            Self::JsonParse { .. } => "JSON_PARSE_ERROR",
            Self::InvalidSelector { .. } => "INVALID_SELECTOR",
            Self::ContentExtractionFailed { .. } => "CONTENT_EXTRACTION_FAILED",
            Self::ScriptError { .. } => "SCRIPT_ERROR",
            Self::ScriptTimeout => "SCRIPT_TIMEOUT",
            Self::ScriptMemoryExceeded => "SCRIPT_MEMORY_EXCEEDED",
            Self::SourceNotFound { .. } => "SOURCE_NOT_FOUND",
            Self::Database { .. } => "DATABASE_ERROR",
            Self::FileIo { .. } => "FILE_IO_ERROR",
            Self::CacheMiss { .. } => "CACHE_MISS",
            Self::StorageQuotaExceeded => "STORAGE_QUOTA_EXCEEDED",
            Self::BookNotFound => "BOOK_NOT_FOUND",
            Self::ChapterNotFound { .. } => "CHAPTER_NOT_FOUND",
            Self::EmptyContent => "EMPTY_CONTENT",
            Self::InvalidBookFormat { .. } => "INVALID_BOOK_FORMAT",
            Self::UnsupportedBookType { .. } => "UNSUPPORTED_BOOK_TYPE",
            Self::InvalidConfig { .. } => "INVALID_CONFIG",
            Self::ConfigNotFound { .. } => "CONFIG_NOT_FOUND",
            Self::ConfigValidationFailed { .. } => "CONFIG_VALIDATION_FAILED",
            Self::ModelLoadFailed { .. } => "MODEL_LOAD_FAILED",
            Self::InferenceFailed { .. } => "INFERENCE_FAILED",
            Self::UnsupportedModelType { .. } => "UNSUPPORTED_MODEL_TYPE",
            Self::ModelTimeout => "MODEL_TIMEOUT",
            Self::InsufficientResources => "INSUFFICIENT_RESOURCES",
            Self::Internal { .. } => "INTERNAL_ERROR",
            Self::Unknown { .. } => "UNKNOWN_ERROR",
            Self::Validation { .. } => "VALIDATION_ERROR",
            Self::Serialization { .. } => "SERIALIZATION_ERROR",
            Self::Deserialization { .. } => "DESERIALIZATION_ERROR",
        }
    }
}

// Implement From for common error types
impl From<std::io::Error> for EngineError {
    fn from(err: std::io::Error) -> Self {
        Self::FileIo { message: err.to_string() }
    }
}

impl From<serde_json::Error> for EngineError {
    fn from(err: serde_json::Error) -> Self {
        Self::JsonParse { message: err.to_string() }
    }
}
