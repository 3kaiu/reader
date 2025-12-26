//! Template Executor - Execute {{...}} template expressions
//!
//! This module executes preprocessed template expressions, prioritizing Rust-native
//! execution over JS where possible.

use super::js_executor::JsExecutor;
use super::native_api::NativeApiProvider;
use super::preprocessor::{NativeApi, PreprocessedUrl, TemplateExpr};
use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;

/// Context for template execution
#[derive(Debug, Clone, Default)]
pub struct TemplateContext {
    /// Variables available for substitution
    pub variables: HashMap<String, String>,
}

impl TemplateContext {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_var(mut self, key: &str, value: &str) -> Self {
        self.variables.insert(key.to_string(), value.to_string());
        self
    }

    pub fn set(&mut self, key: &str, value: &str) {
        self.variables.insert(key.to_string(), value.to_string());
    }

    pub fn get(&self, key: &str) -> Option<&String> {
        self.variables.get(key)
    }
}

/// Template Executor - executes preprocessed template expressions
pub struct TemplateExecutor {
    /// Native API provider for Rust-native execution
    native_api: Arc<NativeApiProvider>,
    /// JS executor for fallback (lazy initialized)
    js_executor: Option<Arc<JsExecutor>>,
}

impl TemplateExecutor {
    /// Create a new TemplateExecutor with native API provider
    pub fn new(native_api: Arc<NativeApiProvider>) -> Self {
        Self {
            native_api,
            js_executor: None,
        }
    }

    /// Create with both native API and JS executor
    pub fn with_js(native_api: Arc<NativeApiProvider>, js_executor: Arc<JsExecutor>) -> Self {
        Self {
            native_api,
            js_executor: Some(js_executor),
        }
    }

    /// Execute a preprocessed URL
    pub fn execute_url(&self, url: &PreprocessedUrl, ctx: &TemplateContext) -> Result<String> {
        let url_str = self.execute_parts(&url.parts, ctx)?;

        // Re-append options if present
        if let Some(ref opts) = url.options {
            let opts_json = serde_json::to_string(opts)?;
            Ok(format!("{},{}", url_str, opts_json))
        } else {
            Ok(url_str)
        }
    }

    /// Execute template parts
    pub fn execute_parts(&self, parts: &[TemplateExpr], ctx: &TemplateContext) -> Result<String> {
        let mut result = String::new();

        for part in parts {
            result.push_str(&self.execute_expr(part, ctx)?);
        }

        Ok(result)
    }

    /// Execute a single template expression
    pub fn execute_expr(&self, expr: &TemplateExpr, ctx: &TemplateContext) -> Result<String> {
        match expr {
            TemplateExpr::Literal(s) => Ok(s.clone()),

            TemplateExpr::Variable(name) => Ok(ctx.get(name).cloned().unwrap_or_default()),

            TemplateExpr::NativeCall { api, args } => {
                // Evaluate arguments first
                let arg_values: Vec<String> = args
                    .iter()
                    .map(|a| self.execute_expr(a, ctx))
                    .collect::<Result<_>>()?;

                // Check if this is an Unknown API that needs JS fallback
                if let NativeApi::Unknown(name) = api {
                    return self.execute_js_fallback(name, &arg_values, ctx);
                }

                // Execute natively
                // Execute natively
                self.native_api.execute(
                    api,
                    &arg_values,
                    &crate::engine::native_api::ExecutionContext::default(),
                )
            }

            TemplateExpr::JsExpr(code) => self.execute_js(code, ctx),
        }
    }

    /// Execute JS expression (fallback)
    fn execute_js(&self, code: &str, ctx: &TemplateContext) -> Result<String> {
        if let Some(ref js) = self.js_executor {
            js.eval_with_context(code, &ctx.variables)
        } else {
            // No JS executor, try to evaluate simple expressions
            self.evaluate_simple_expr(code, ctx)
        }
    }

    /// Fallback for unknown java.xxx() calls
    fn execute_js_fallback(
        &self,
        method: &str,
        args: &[String],
        ctx: &TemplateContext,
    ) -> Result<String> {
        if let Some(ref js) = self.js_executor {
            // Build JS call
            let args_str = args
                .iter()
                .map(|a| format!("\"{}\"", a.replace('"', "\\\"")))
                .collect::<Vec<_>>()
                .join(", ");
            let code = format!("java.{}({})", method, args_str);
            js.eval_with_context(&code, &ctx.variables)
        } else {
            Err(anyhow::anyhow!("No JS executor for java.{}", method))
        }
    }

    /// Try to evaluate simple expressions without JS
    fn evaluate_simple_expr(&self, expr: &str, ctx: &TemplateContext) -> Result<String> {
        let expr = expr.trim();

        // Simple arithmetic: (page-1)*20
        if expr.contains("page") && (expr.contains('+') || expr.contains('-') || expr.contains('*'))
        {
            if let Some(page) = ctx.get("page").and_then(|s| s.parse::<i64>().ok()) {
                // Very simple evaluation
                let expr = expr.replace("page", &page.to_string());
                if let Ok(result) = self.eval_simple_math(&expr) {
                    return Ok(result.to_string());
                }
            }
        }

        // Ternary: page - 1 == 0 ? "" : page
        if expr.contains('?') && expr.contains(':') {
            // Extract condition and branches
            if let Some(q_pos) = expr.find('?') {
                let _condition = expr[..q_pos].trim();
                let rest = &expr[q_pos + 1..];
                if let Some(c_pos) = rest.find(':') {
                    let _true_val = rest[..c_pos].trim();
                    let _false_val = rest[c_pos + 1..].trim();
                    // For now, just return the variable if it exists
                    if let Some(page) = ctx.get("page") {
                        return Ok(page.clone());
                    }
                }
            }
        }

        // If we can't evaluate, return empty or the expression itself
        tracing::debug!("Cannot evaluate simple expr: {}", expr);
        Ok(String::new())
    }

    /// Evaluate simple math expression
    fn eval_simple_math(&self, expr: &str) -> Result<i64> {
        // Very basic: only handles (a-b)*c or a*b patterns
        let expr = expr.replace(' ', "");

        // Handle parentheses
        if expr.starts_with('(') {
            if let Some(close) = expr.find(')') {
                let inner = &expr[1..close];
                let inner_result = self.eval_simple_math(inner)?;
                let rest = &expr[close + 1..];

                if rest.starts_with('*') {
                    let multiplier: i64 = rest[1..].parse()?;
                    return Ok(inner_result * multiplier);
                } else if rest.is_empty() {
                    return Ok(inner_result);
                }
            }
        }

        // Simple subtraction
        if let Some(pos) = expr.find('-') {
            if pos > 0 {
                let a: i64 = expr[..pos].parse()?;
                let b: i64 = expr[pos + 1..].parse()?;
                return Ok(a - b);
            }
        }

        // Simple addition
        if let Some(pos) = expr.find('+') {
            let a: i64 = expr[..pos].parse()?;
            let b: i64 = expr[pos + 1..].parse()?;
            return Ok(a + b);
        }

        // Simple multiplication
        if let Some(pos) = expr.find('*') {
            let a: i64 = expr[..pos].parse()?;
            let b: i64 = expr[pos + 1..].parse()?;
            return Ok(a * b);
        }

        // Just a number
        expr.parse()
            .map_err(|e| anyhow::anyhow!("Parse error: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::cookie::CookieManager;
    use crate::engine::native_api::NativeApiProvider;
    use crate::storage::kv::KvStore;
    use crate::storage::FileStorage;
    use std::sync::Arc;

    fn create_test_kv() -> Arc<KvStore> {
        let fs = FileStorage::new("/tmp/reader_tests_tmpl");
        Arc::new(KvStore::new(fs, "test_kv_tmpl.json"))
    }

    fn create_executor() -> TemplateExecutor {
        let cm = Arc::new(CookieManager::new());
        let native_api = Arc::new(NativeApiProvider::new(cm, create_test_kv()));
        TemplateExecutor::new(native_api)
    }

    #[test]
    fn test_literal() {
        let exec = create_executor();
        let ctx = TemplateContext::new();

        let result = exec
            .execute_expr(&TemplateExpr::Literal("hello".to_string()), &ctx)
            .unwrap();
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_variable() {
        let exec = create_executor();
        let ctx = TemplateContext::new().with_var("key", "test_value");

        let result = exec
            .execute_expr(&TemplateExpr::Variable("key".to_string()), &ctx)
            .unwrap();
        assert_eq!(result, "test_value");
    }

    #[test]
    fn test_native_call_base64() {
        let exec = create_executor();
        let ctx = TemplateContext::new().with_var("key", "hello");

        let result = exec
            .execute_expr(
                &TemplateExpr::NativeCall {
                    api: NativeApi::Base64Encode,
                    args: vec![Box::new(TemplateExpr::Variable("key".to_string()))],
                },
                &ctx,
            )
            .unwrap();

        assert_eq!(result, "aGVsbG8=");
    }

    #[test]
    fn test_simple_math() {
        let exec = create_executor();

        assert_eq!(exec.eval_simple_math("5-1").unwrap(), 4);
        assert_eq!(exec.eval_simple_math("(5-1)*20").unwrap(), 80);
        assert_eq!(exec.eval_simple_math("3+7").unwrap(), 10);
        assert_eq!(exec.eval_simple_math("3*5").unwrap(), 15);
    }

    #[test]
    fn test_page_calculation() {
        let exec = create_executor();
        let ctx = TemplateContext::new().with_var("page", "3");

        let result = exec
            .execute_expr(&TemplateExpr::JsExpr("(page-1)*20".to_string()), &ctx)
            .unwrap();

        assert_eq!(result, "40");
    }
}
