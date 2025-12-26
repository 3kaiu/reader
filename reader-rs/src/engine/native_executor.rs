use super::js_analyzer::{ExprValue, NativeExecution};
use super::native_api::{ExecutionContext, NativeApiProvider};
use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;

/// Executor for compiled NativeExecution plans
pub struct NativeExecutor {
    provider: Arc<NativeApiProvider>,
}

impl NativeExecutor {
    pub fn new(provider: Arc<NativeApiProvider>) -> Self {
        Self { provider }
    }

    /// Execute a native execution plan
    pub fn execute(
        &self,
        exec: &NativeExecution,
        context: &ExecutionContext,
        vars: &HashMap<String, String>,
        input: Option<&str>,
    ) -> Result<String> {
        let mut string_args = Vec::new();
        for arg in &exec.args {
            let val = self.eval_expr(arg, context, vars, input)?;
            string_args.push(val);
        }
        self.provider.execute(&exec.api, &string_args, context)
    }

    fn eval_expr(
        &self,
        expr: &ExprValue,
        context: &ExecutionContext,
        vars: &HashMap<String, String>,
        input: Option<&str>,
    ) -> Result<String> {
        match expr {
            ExprValue::Literal(s) => Ok(s.clone()),
            ExprValue::Variable(name) => {
                // Check vars map first
                if let Some(val) = vars.get(name) {
                    return Ok(val.clone());
                }
                // Handle special variables
                match name.as_str() {
                    "result" => Ok(input.unwrap_or("").to_string()),
                    "baseUrl" => Ok(context.base_url.clone()),
                    _ => Ok(String::new()), // Return empty for unknown vars to avoid crash?
                }
            }
            ExprValue::CurrentContent => Ok(input.unwrap_or("").to_string()),
            ExprValue::NativeCall(inner) => self.execute(inner, context, vars, input),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::cookie::CookieManager;
    use crate::engine::preprocessor::NativeApi;
    use crate::storage::kv::KvStore;
    use crate::storage::FileStorage;
    use std::sync::Arc;

    fn create_test_executor() -> NativeExecutor {
        let fs = FileStorage::new("/tmp/reader_tests_native_exec");
        let kv = Arc::new(KvStore::new(fs, "test_kv.json"));
        let cm = Arc::new(CookieManager::new());
        let provider = Arc::new(NativeApiProvider::new(cm, kv));
        NativeExecutor::new(provider)
    }

    #[test]
    fn test_recursive_execution() {
        let executor = create_test_executor();
        let context = ExecutionContext::default();
        let vars = HashMap::new();

        // md5(base64('hello'))
        // base64('hello') -> 'aGVsbG8='
        // md5('aGVsbG8=') -> 5d41402abc4b2a76b9719d911017c592

        let inner_exec = NativeExecution {
            api: NativeApi::Base64Encode,
            args: vec![ExprValue::Literal("hello".to_string())],
        };

        let outer_exec = NativeExecution {
            api: NativeApi::Md5Encode,
            args: vec![ExprValue::NativeCall(Box::new(inner_exec))],
        };

        let result = executor
            .execute(&outer_exec, &context, &vars, None)
            .unwrap();
        assert_eq!(result, "0733351879b2fa9bd05c7ca3061529c0");
    }

    #[test]
    fn test_vars_execution() {
        let executor = create_test_executor();
        let context = ExecutionContext {
            base_url: "http://test.com".to_string(),
        };
        let mut vars = HashMap::new();
        vars.insert("key".to_string(), "hello".to_string());

        let exec = NativeExecution {
            api: NativeApi::Base64Encode,
            args: vec![ExprValue::Variable("key".to_string())],
        };

        let result = executor.execute(&exec, &context, &vars, None).unwrap();
        assert_eq!(result, "aGVsbG8=");
    }
}
