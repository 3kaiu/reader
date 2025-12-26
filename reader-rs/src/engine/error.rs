//! Engine Error Types - Structured error handling
//!
//! This module provides custom error types for the engine,
//! enabling better error categorization and handling.

use thiserror::Error;

/// Engine Error - Main error type for engine operations
#[derive(Error, Debug)]
pub enum EngineError {
    // Parsing errors
    #[error("Rule parsing error: {0}")]
    RuleParse(String),

    #[error("Invalid rule type: {0}")]
    InvalidRuleType(String),

    #[error("CSS selector error: {0}")]
    CssSelector(String),

    #[error("JSONPath error: {0}")]
    JsonPath(String),

    #[error("XPath error: {0}")]
    XPath(String),

    #[error("Regex error: {0}")]
    Regex(String),

    // JS execution errors
    #[error("JavaScript error: {0}")]
    JavaScript(String),

    #[error("JS analysis failed: {0}")]
    JsAnalysis(String),

    // HTTP errors
    #[error("HTTP request failed: {0}")]
    Http(String),

    #[error("URL parse error: {0}")]
    UrlParse(String),

    // Crypto errors
    #[error("Encryption error: {0}")]
    Encryption(String),

    #[error("Decryption error: {0}")]
    Decryption(String),

    // Storage errors
    #[error("Storage error: {0}")]
    Storage(String),

    // API errors
    #[error("Unknown API: {0}")]
    UnknownApi(String),

    #[error("API execution error: {0}")]
    ApiExecution(String),

    // Book source errors
    #[error("Book source error: {0}")]
    BookSource(String),

    #[error("No results found")]
    NoResults,

    // Generic errors
    #[error("Internal error: {0}")]
    Internal(String),

    #[error("{0}")]
    Other(#[from] anyhow::Error),
}

/// Result type alias for engine operations
pub type EngineResult<T> = Result<T, EngineError>;

impl EngineError {
    /// Create a rule parse error
    pub fn rule_parse(msg: impl Into<String>) -> Self {
        Self::RuleParse(msg.into())
    }

    /// Create a JavaScript error
    pub fn javascript(msg: impl Into<String>) -> Self {
        Self::JavaScript(msg.into())
    }

    /// Create an HTTP error
    pub fn http(msg: impl Into<String>) -> Self {
        Self::Http(msg.into())
    }

    /// Create an API execution error
    pub fn api_execution(msg: impl Into<String>) -> Self {
        Self::ApiExecution(msg.into())
    }

    /// Create a book source error
    pub fn book_source(msg: impl Into<String>) -> Self {
        Self::BookSource(msg.into())
    }

    /// Check if error is recoverable
    pub fn is_recoverable(&self) -> bool {
        matches!(
            self,
            Self::NoResults | Self::Http(_) | Self::JavaScript(_)
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = EngineError::rule_parse("invalid selector");
        assert_eq!(err.to_string(), "Rule parsing error: invalid selector");
    }

    #[test]
    fn test_is_recoverable() {
        assert!(EngineError::NoResults.is_recoverable());
        assert!(EngineError::http("timeout").is_recoverable());
        assert!(!EngineError::Internal("crash".into()).is_recoverable());
    }
}
