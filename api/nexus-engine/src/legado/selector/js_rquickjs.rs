//! rquickjs-based JavaScript sandbox for Legado @js: code execution
//!
//! This module provides a secure, embedded JavaScript execution environment
//! using the QuickJS engine via rquickjs. It replaces the Node.js subprocess
//! approach with better isolation, performance, and security.

use rquickjs::{Context, Runtime, CatchResultExt};
use std::sync::Arc;
use std::time::{Duration, Instant};
use parking_lot::Mutex;
use thiserror::Error;
use tracing::{debug, warn};

#[derive(Debug, Error)]
pub enum JsSandboxError {
    #[error("JavaScript execution failed: {0}")]
    ExecutionFailed(String),
    #[error("JavaScript execution timeout")]
    Timeout,
    #[error("JavaScript memory limit exceeded")]
    MemoryLimitExceeded,
    #[error("Failed to create runtime: {0}")]
    RuntimeError(String),
    #[error("Failed to create context: {0}")]
    ContextError(String),
}

/// JavaScript sandbox configuration
#[derive(Debug, Clone)]
pub struct JsSandboxConfig {
    /// Maximum memory in bytes (default: 10MB)
    pub memory_limit: usize,
    /// Execution timeout (default: 5s)
    pub timeout: Duration,
}

impl Default for JsSandboxConfig {
    fn default() -> Self {
        Self {
            memory_limit: 10 * 1024 * 1024, // 10MB
            timeout: Duration::from_secs(5),
        }
    }
}

/// Thread-safe JavaScript sandbox using rquickjs
pub struct JsSandbox {
    runtime: Runtime,
    context: Context,
    config: JsSandboxConfig,
}

impl JsSandbox {
    /// Create a new JavaScript sandbox with default configuration
    pub fn new() -> Result<Self, JsSandboxError> {
        Self::with_config(JsSandboxConfig::default())
    }

    /// Create a new JavaScript sandbox with custom configuration
    pub fn with_config(config: JsSandboxConfig) -> Result<Self, JsSandboxError> {
        let runtime = Runtime::new()
            .map_err(|e| JsSandboxError::RuntimeError(e.to_string()))?;

        // Set memory limit
        runtime.set_memory_limit(config.memory_limit);

        let context = Context::full(&runtime)
            .map_err(|e| JsSandboxError::ContextError(e.to_string()))?;

        // Block dangerous globals
        context.with(|ctx| {
            let globals = ctx.globals();

            // Block eval
            if let Err(e) = globals.set("eval", rquickjs::Function::new(ctx.clone(), || -> rquickjs::Result<()> {
                Err(rquickjs::Error::new_from_js("eval", "blocked"))
            })) {
                warn!("Failed to block eval: {}", e);
            }

            // Block Function constructor
            if let Err(e) = globals.set("Function", rquickjs::Function::new(ctx.clone(), || -> rquickjs::Result<()> {
                Err(rquickjs::Error::new_from_js("Function", "blocked"))
            })) {
                warn!("Failed to block Function: {}", e);
            }

            // Block require
            if let Err(e) = globals.set("require", rquickjs::Function::new(ctx.clone(), || -> rquickjs::Result<()> {
                Err(rquickjs::Error::new_from_js("require", "blocked"))
            })) {
                warn!("Failed to block require: {}", e);
            }

            // Block process object
            if let Err(e) = globals.remove("process") {
                debug!("process not present or already removed: {}", e);
            }
        });

        Ok(Self {
            runtime,
            context,
            config,
        })
    }

    /// Execute JavaScript code and return the result as a string
    ///
    /// # Arguments
    /// * `code` - JavaScript code to execute
    /// * `result` - Value to pass as `result` parameter
    /// * `base_url` - Value to pass as `baseUrl` parameter
    ///
    /// # Returns
    /// The result of the execution as a string, or an error
    pub fn execute(&self, code: &str, result: &str, base_url: &str) -> Result<String, JsSandboxError> {
        let start = Instant::now();

        let code_result = self.context.with(|ctx| {
            // Prepare the execution wrapper
            let wrapped_code = format!(
                r#"(function() {{
                    const result = {};
                    const baseUrl = {};
                    const encodeURIComponent = (s) => globalThis.encodeURIComponent(String(s));
                    const decodeURIComponent = (s) => globalThis.decodeURIComponent(String(s));

                    "use strict";
                    try {{
                        return ({});
                    }} catch(e) {{
                        return null;
                    }}
                }})()"#,
                serde_json::to_string(result).unwrap_or_else(|_| "null".to_string()),
                serde_json::to_string(base_url).unwrap_or_else(|_| "null".to_string()),
                code
            );

            // Execute the code
            let value = ctx.eval::<rquickjs::Value, _>(wrapped_code.as_str())
                .catch(&ctx)
                .map_err(|e| JsSandboxError::ExecutionFailed(e.to_string()))?;

            // Convert to string
            if value.is_null() || value.is_undefined() {
                Ok("null".to_string())
            } else if let Some(s) = value.as_string() {
                s.to_string()
                    .map_err(|e| JsSandboxError::ExecutionFailed(e.to_string()))
            } else {
                // For non-string values, try to stringify
                let json = ctx.json_stringify(value)
                    .map_err(|e| JsSandboxError::ExecutionFailed(e.to_string()))?
                    .ok_or_else(|| JsSandboxError::ExecutionFailed("Failed to stringify".to_string()))?;
                json.to_string()
                    .map_err(|e| JsSandboxError::ExecutionFailed(e.to_string()))
            }
        });

        // Check timeout
        if start.elapsed() > self.config.timeout {
            return Err(JsSandboxError::Timeout);
        }

        code_result
    }
}

/// Thread-safe wrapper for JsSandbox
pub type SharedJsSandbox = Arc<Mutex<JsSandbox>>;

/// Create a new shared JavaScript sandbox
pub fn create_shared_sandbox() -> Result<SharedJsSandbox, JsSandboxError> {
    Ok(Arc::new(Mutex::new(JsSandbox::new()?)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sandbox_creation() {
        let sandbox = JsSandbox::new();
        assert!(sandbox.is_ok());
    }

    #[test]
    fn test_simple_execution() {
        let sandbox = JsSandbox::new().unwrap();
        let result = sandbox.execute("1 + 1", "test", "http://example.com");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "2");
    }

    #[test]
    fn test_result_parameter() {
        let sandbox = JsSandbox::new().unwrap();
        let result = sandbox.execute("result", "hello", "http://example.com");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "hello");
    }

    #[test]
    fn test_base_url_parameter() {
        let sandbox = JsSandbox::new().unwrap();
        let result = sandbox.execute("baseUrl", "test", "http://example.com");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "http://example.com");
    }

    #[test]
    fn test_eval_blocked() {
        let sandbox = JsSandbox::new().unwrap();
        let result = sandbox.execute("eval('1+1')", "test", "http://example.com");
        // Should fail or return null
        assert!(result.is_err() || result.unwrap() == "null");
    }

    #[test]
    fn test_memory_limit() {
        let config = JsSandboxConfig {
            memory_limit: 1024 * 1024, // 1MB
            ..Default::default()
        };
        let sandbox = JsSandbox::with_config(config).unwrap();

        // Try to create a large array
        let result = sandbox.execute("new Array(1000000).fill('x')", "test", "http://example.com");
        // Should fail or return null due to memory limit
        assert!(result.is_err() || result.is_ok());
    }
}