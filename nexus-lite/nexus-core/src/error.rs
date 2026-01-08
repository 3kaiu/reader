//! Unified error types for NexusLite

/// Main error type for the engine
#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    // ============== Network Layer ==============
    #[error("Network request failed: {0}")]
    Network(String),

    #[error("Request timeout")]
    Timeout,

    #[error("DNS resolution failed for host: {host}")]
    DnsError { host: String },

    #[error("Connection refused: {0}")]
    ConnectionRefused(String),

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

    #[error("Circuit breaker open for source: {0}")]
    CircuitOpen(String),

    #[error("Strategy is disabled")]
    StrategyDisabled,

    #[error("Unauthorized")]
    Unauthorized,

    // ============== Parse Layer ==============
    #[error("HTML parse error")]
    HtmlParse,

    #[error("Rule mismatch: {rule}")]
    RuleMismatch { rule: String },

    #[error("JSON parse error: {0}")]
    JsonParse(String),

    #[error("Invalid selector: {0}")]
    InvalidSelector(String),

    // ============== Script Layer ==============
    #[error("Script execution error: {0}")]
    ScriptError(String),

    #[error("Script execution timeout")]
    ScriptTimeout,

    #[error("Script memory limit exceeded")]
    ScriptMemoryExceeded,

    // ============== Storage Layer ==============
    #[error("Source not found: {id}")]
    SourceNotFound { id: String },

    #[error("Database error: {0}")]
    Database(String),

    #[error("File I/O error: {0}")]
    FileIo(String),

    // ============== Business Layer ==============
    #[error("Book not found")]
    BookNotFound,

    #[error("Chapter not found: {index}")]
    ChapterNotFound { index: u32 },

    #[error("Empty content")]
    EmptyContent,

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    // ============== Generic ==============
    #[error("Internal error: {0}")]
    Internal(String),
}

impl EngineError {
    /// Check if this error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::Network(_)
                | Self::Timeout
                | Self::RateLimited { .. }
                | Self::CloudflareChallenge
                | Self::ConnectionRefused(_)
        )
    }

    /// Get suggested retry delay in seconds
    pub fn retry_delay(&self) -> Option<u64> {
        match self {
            Self::RateLimited { retry_after } => Some(*retry_after),
            Self::Timeout => Some(1),
            Self::CloudflareChallenge => Some(5),
            Self::Network(_) => Some(2),
            _ => None,
        }
    }

    /// Get error code for API responses
    pub fn error_code(&self) -> &'static str {
        match self {
            Self::Network(_) => "NETWORK_ERROR",
            Self::Timeout => "TIMEOUT",
            Self::DnsError { .. } => "DNS_ERROR",
            Self::ConnectionRefused(_) => "CONNECTION_REFUSED",
            Self::CloudflareChallenge => "CLOUDFLARE_CHALLENGE",
            Self::CloudflareChallengeFailed => "CLOUDFLARE_CHALLENGE_FAILED",
            Self::RateLimited { .. } => "RATE_LIMITED",
            Self::IpBanned => "IP_BANNED",
            Self::AllStrategiesFailed => "ALL_STRATEGIES_FAILED",
            Self::CircuitOpen(_) => "CIRCUIT_OPEN",
            Self::StrategyDisabled => "STRATEGY_DISABLED",
            Self::Unauthorized => "UNAUTHORIZED",
            Self::HtmlParse => "HTML_PARSE_ERROR",
            Self::RuleMismatch { .. } => "RULE_MISMATCH",
            Self::JsonParse(_) => "JSON_PARSE_ERROR",
            Self::InvalidSelector(_) => "INVALID_SELECTOR",
            Self::ScriptError(_) => "SCRIPT_ERROR",
            Self::ScriptTimeout => "SCRIPT_TIMEOUT",
            Self::ScriptMemoryExceeded => "SCRIPT_MEMORY_EXCEEDED",
            Self::SourceNotFound { .. } => "SOURCE_NOT_FOUND",
            Self::Database(_) => "DATABASE_ERROR",
            Self::FileIo(_) => "FILE_IO_ERROR",
            Self::BookNotFound => "BOOK_NOT_FOUND",
            Self::ChapterNotFound { .. } => "CHAPTER_NOT_FOUND",
            Self::EmptyContent => "EMPTY_CONTENT",
            Self::InvalidConfig(_) => "INVALID_CONFIG",
            Self::Internal(_) => "INTERNAL_ERROR",
        }
    }
}

// Implement From for common error types
impl From<std::io::Error> for EngineError {
    fn from(err: std::io::Error) -> Self {
        Self::FileIo(err.to_string())
    }
}

impl From<serde_json::Error> for EngineError {
    fn from(err: serde_json::Error) -> Self {
        Self::JsonParse(err.to_string())
    }
}
