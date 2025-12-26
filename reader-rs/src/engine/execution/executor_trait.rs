//! Executor Trait - Defines the execution abstraction
//!
//! This trait provides a unified interface for different execution strategies:
//! - Native Rust execution (fastest)
//! - QuickJS execution (full JS support)
//! - Hybrid execution (native with JS fallback)

use anyhow::Result;
use std::collections::HashMap;

/// Execution context containing all state needed for rule execution
#[derive(Debug, Clone, Default)]
pub struct ExecutionContext {
    /// Current content being processed
    pub content: String,

    /// Base URL for the current source
    pub base_url: String,

    /// Variables available during execution
    pub variables: HashMap<String, String>,

    /// Result from previous rule execution
    pub previous_result: Option<String>,
}

impl ExecutionContext {
    /// Create a new execution context with content
    pub fn new(content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            ..Default::default()
        }
    }

    /// Create context with base URL
    pub fn with_base_url(mut self, base_url: impl Into<String>) -> Self {
        self.base_url = base_url.into();
        self
    }

    /// Add a variable to the context
    pub fn with_variable(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.variables.insert(key.into(), value.into());
        self
    }

    /// Set multiple variables
    pub fn with_variables(mut self, vars: HashMap<String, String>) -> Self {
        self.variables.extend(vars);
        self
    }

    /// Set previous result
    pub fn with_previous_result(mut self, result: impl Into<String>) -> Self {
        self.previous_result = Some(result.into());
        self
    }

    /// Get a variable value
    pub fn get_variable(&self, key: &str) -> Option<&String> {
        self.variables.get(key)
    }

    /// Get content reference
    pub fn content(&self) -> &str {
        &self.content
    }
}

/// Result of execution
#[derive(Debug, Clone)]
pub enum ExecutionResult {
    /// Single string result
    String(String),

    /// List of strings
    List(Vec<String>),

    /// No result (void operation)
    None,
}

impl ExecutionResult {
    /// Convert to string, joining list with newlines if necessary
    pub fn into_string(self) -> String {
        match self {
            ExecutionResult::String(s) => s,
            ExecutionResult::List(list) => list.join("\n"),
            ExecutionResult::None => String::new(),
        }
    }

    /// Convert to list, wrapping single string if necessary
    pub fn into_list(self) -> Vec<String> {
        match self {
            ExecutionResult::String(s) => vec![s],
            ExecutionResult::List(list) => list,
            ExecutionResult::None => vec![],
        }
    }

    /// Check if result is empty
    pub fn is_empty(&self) -> bool {
        match self {
            ExecutionResult::String(s) => s.is_empty(),
            ExecutionResult::List(list) => list.is_empty(),
            ExecutionResult::None => true,
        }
    }
}

impl From<String> for ExecutionResult {
    fn from(s: String) -> Self {
        ExecutionResult::String(s)
    }
}

impl From<Vec<String>> for ExecutionResult {
    fn from(list: Vec<String>) -> Self {
        ExecutionResult::List(list)
    }
}

impl From<()> for ExecutionResult {
    fn from(_: ()) -> Self {
        ExecutionResult::None
    }
}

/// Executor trait for different execution strategies
///
/// Implementors of this trait can execute rules/code using different
/// strategies (native Rust, QuickJS, AST-based, etc.)
pub trait Executor: Send + Sync {
    /// Execute a rule/code and return the result
    fn execute(&self, code: &str, context: &ExecutionContext) -> Result<ExecutionResult>;

    /// Execute and return a single string
    fn execute_string(&self, code: &str, context: &ExecutionContext) -> Result<String> {
        self.execute(code, context).map(|r| r.into_string())
    }

    /// Execute and return a list of strings
    fn execute_list(&self, code: &str, context: &ExecutionContext) -> Result<Vec<String>> {
        self.execute(code, context).map(|r| r.into_list())
    }

    /// Check if this executor can handle the given code
    ///
    /// Returns true if this executor is suitable for the code,
    /// false if another executor should be tried.
    fn can_handle(&self, code: &str) -> bool;

    /// Get the executor type name (for debugging/logging)
    fn name(&self) -> &'static str;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_context() {
        let ctx = ExecutionContext::new("test content")
            .with_base_url("https://example.com")
            .with_variable("key", "value");

        assert_eq!(ctx.content(), "test content");
        assert_eq!(ctx.base_url, "https://example.com");
        assert_eq!(ctx.get_variable("key"), Some(&"value".to_string()));
    }

    #[test]
    fn test_execution_result() {
        let result = ExecutionResult::String("hello".to_string());
        assert_eq!(result.clone().into_string(), "hello");
        assert_eq!(result.into_list(), vec!["hello"]);

        let result = ExecutionResult::List(vec!["a".to_string(), "b".to_string()]);
        assert_eq!(result.clone().into_string(), "a\nb");
        assert_eq!(result.into_list(), vec!["a", "b"]);
    }
}
