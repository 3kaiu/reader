//! Executor Factory - Manages and coordinates executors
//!
//! This module provides a factory pattern for managing different execution
//! strategies, allowing transparent switching between native and JS execution.

use anyhow::Result;
use std::sync::Arc;

use super::executor_trait::ExecutionContext;
use crate::engine::analysis::UnifiedJsAnalyzer;
use crate::engine::js_analyzer::AnalysisResult;
use crate::engine::js_executor::JsExecutor;
use crate::engine::native_api::NativeApiProvider;
use crate::engine::native_executor::NativeExecutor;

/// Executor Factory - Creates and manages executor instances
///
/// The factory coordinates between different execution strategies:
/// 1. Try regex-based pattern matching (fastest)
/// 2. Try AST-based analysis (accurate native execution)
/// 3. Fall back to QuickJS (full JS support)
pub struct ExecutorFactory {
    /// Unified JS analyzer (combines regex and AST analysis)
    unified_analyzer: UnifiedJsAnalyzer,

    /// Native executor for Rust-native execution
    native_executor: Arc<NativeExecutor>,

    /// QuickJS executor for full JS support
    js_executor: JsExecutor,

    /// Native API provider
    native_api: Arc<NativeApiProvider>,
}

impl ExecutorFactory {
    /// Create a new ExecutorFactory
    pub fn new(native_api: Arc<NativeApiProvider>) -> Result<Self> {
        let native_executor = Arc::new(NativeExecutor::new(native_api.clone()));
        let js_executor = JsExecutor::new(native_api.clone())?;

        Ok(Self {
            unified_analyzer: UnifiedJsAnalyzer::new(),
            native_executor,
            js_executor,
            native_api,
        })
    }

    /// Execute JavaScript code using the best available strategy
    ///
    /// This method uses the unified analyzer to try:
    /// 1. Regex pattern matching → Native execution
    /// 2. AST analysis → Native execution
    /// 3. QuickJS execution (fallback)
    pub fn execute_js(&self, code: &str, context: &ExecutionContext) -> Result<String> {
        // Use unified analyzer (combines regex and AST analysis)
        let analysis = self.unified_analyzer.analyze_readonly(code);

        match analysis {
            AnalysisResult::Native(exec) => {
                // Execute natively
                self.execute_native(&exec, context)
            }
            AnalysisResult::NativeChain(chain) => {
                // Execute chain natively
                self.execute_native_chain(&chain, context)
            }
            AnalysisResult::RequiresJs(_) => {
                // Fall back to QuickJS
                self.execute_quickjs(code, context)
            }
        }
    }

    /// Execute using native Rust implementation
    fn execute_native(
        &self,
        exec: &crate::engine::js_analyzer::NativeExecution,
        context: &ExecutionContext,
    ) -> Result<String> {
        use std::collections::HashMap;
        
        // Convert ExecutionContext to NativeApiProvider's ExecutionContext
        let native_context = crate::engine::native_api::ExecutionContext {
            base_url: context.base_url.clone(),
        };
        
        // Convert variables
        let vars: HashMap<String, String> = context.variables.clone();
        
        self.native_executor.execute(exec, &native_context, &vars, Some(&context.content))
    }

    /// Execute a chain of native operations
    fn execute_native_chain(
        &self,
        chain: &[crate::engine::js_analyzer::NativeExecution],
        context: &ExecutionContext,
    ) -> Result<String> {
        use std::collections::HashMap;
        
        let native_context = crate::engine::native_api::ExecutionContext {
            base_url: context.base_url.clone(),
        };
        let vars: HashMap<String, String> = context.variables.clone();
        
        let mut result = context.content.clone();
        for exec in chain {
            result = self.native_executor.execute(exec, &native_context, &vars, Some(&result))?;
        }
        Ok(result)
    }

    /// Execute using QuickJS
    fn execute_quickjs(&self, code: &str, context: &ExecutionContext) -> Result<String> {
        self.js_executor.set_current_content(&context.content);

        // Set variables
        for (key, value) in &context.variables {
            self.js_executor.put_variable(key, value);
        }

        self.js_executor.eval(code)
    }

    /// Analyze JS code without executing
    pub fn analyze(&self, code: &str) -> AnalysisResult {
        self.unified_analyzer.analyze_readonly(code)
    }

    /// Get the native API provider
    pub fn native_api(&self) -> &Arc<NativeApiProvider> {
        &self.native_api
    }

    /// Get the JS executor (for direct access when needed)
    pub fn js_executor(&self) -> &JsExecutor {
        &self.js_executor
    }

    /// Preload JavaScript library code
    pub fn preload_lib(&self, js_lib: &str) -> Result<()> {
        self.js_executor.eval(js_lib)?;
        Ok(())
    }

    /// Set the current content in JS executor
    pub fn set_current_content(&self, content: &str) {
        self.js_executor.set_current_content(content);
    }

    /// Set a variable in JS executor
    pub fn put_variable(&self, name: &str, value: &str) {
        self.js_executor.put_variable(name, value);
    }
}

/// Thread-safe shared ExecutorFactory
pub type SharedExecutorFactory = Arc<ExecutorFactory>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::cookie::CookieManager;
    use crate::storage::kv::KvStore;
    use crate::storage::FileStorage;

    fn create_test_factory() -> ExecutorFactory {
        let cookie_manager = Arc::new(CookieManager::new());
        let storage = FileStorage::new("/tmp/reader_test");
        let kv_store = Arc::new(KvStore::new(storage, "test_kv.json"));
        let native_api = Arc::new(NativeApiProvider::new(cookie_manager, kv_store));
        ExecutorFactory::new(native_api).unwrap()
    }

    #[test]
    fn test_executor_factory_native() {
        let factory = create_test_factory();
        let context = ExecutionContext::new("  hello world  ");

        let result = factory.execute_js("result.trim()", &context);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "hello world");
    }

    #[test]
    fn test_executor_factory_base64() {
        let factory = create_test_factory();
        let context = ExecutionContext::new("test");

        let result = factory.execute_js("java.base64Encode(result)", &context);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "dGVzdA==");
    }

    #[test]
    fn test_executor_factory_analyze() {
        let factory = create_test_factory();

        let analysis = factory.analyze("result.trim()");
        assert!(matches!(analysis, AnalysisResult::Native(_)));

        let analysis = factory.analyze("someComplexFunction()");
        assert!(matches!(analysis, AnalysisResult::RequiresJs(_)));
    }
}
