//! JavaScript Executor using rquickjs (QuickJS)
//!
//! Provides ES2023 JavaScript execution with custom utils.* API

use super::native_api::NativeApiProvider;
use anyhow::Result;
use rquickjs::{Context, Ctx, Function, IntoJs, Object, Runtime, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Cache for JavaScript context data
pub type JsCache = Arc<Mutex<HashMap<String, String>>>;

/// JavaScript executor using QuickJS engine
pub struct JsExecutor {
    runtime: Runtime,
    context: Context,
    cache: JsCache,
    base_url: String,
    /// Flag to track if utils have been registered (to avoid re-registering and losing jsLib)
    initialized: AtomicBool,
    /// Source JSON for `source` binding (book source info)
    source_json: std::cell::RefCell<String>,
    /// Book JSON for `book` binding
    book_json: std::cell::RefCell<String>,
    /// Chapter JSON for `chapter` binding
    /// Chapter JSON for `chapter` binding
    chapter_json: std::cell::RefCell<String>,
    /// Native API provider for delegated execution
    native_api: Arc<NativeApiProvider>,
}

impl JsExecutor {
    /// Create a new JavaScript executor
    pub fn new(native_api: Arc<NativeApiProvider>) -> Result<Self> {
        let runtime = Runtime::new()?;
        let context = Context::full(&runtime)?;

        Ok(Self {
            runtime,
            context,
            cache: Arc::new(Mutex::new(HashMap::new())),
            base_url: String::new(),
            initialized: AtomicBool::new(false),
            source_json: std::cell::RefCell::new(String::new()),
            book_json: std::cell::RefCell::new(String::new()),
            chapter_json: std::cell::RefCell::new(String::new()),
            native_api,
        })
    }

    /// Set base URL for relative URL resolution
    pub fn set_base_url(&mut self, url: &str) {
        self.base_url = url.to_string();
    }

    /// Set source JSON for JS `source` binding
    pub fn set_source(&self, source_json: &str) {
        *self.source_json.borrow_mut() = source_json.to_string();
    }

    /// Set book JSON for JS `book` binding
    pub fn set_book(&self, book_json: &str) {
        *self.book_json.borrow_mut() = book_json.to_string();
    }

    /// Set chapter JSON for JS `chapter` binding
    pub fn set_chapter(&self, chapter_json: &str) {
        *self.chapter_json.borrow_mut() = chapter_json.to_string();
    }

    /// Preload JavaScript library code (jsLib from book source)
    /// This executes the code once to define global functions/variables
    ///
    /// Book sources often use `const { java } = this` to access the java object.
    /// In global scope, `this` refers to `globalThis`, so we need to ensure
    /// `globalThis.java` is set (which register_utils already does).
    pub fn preload_lib(&self, js_lib: &str) -> Result<()> {
        tracing::debug!("preload_lib called with {} bytes of jsLib", js_lib.len());

        if js_lib.trim().is_empty() {
            tracing::debug!("preload_lib: jsLib is empty, skipping");
            return Ok(());
        }

        self.context.with(|ctx| {
            // Register utils first so jsLib can use them
            self.register_universal_bridge(&ctx)?;

            // Mark as initialized so subsequent evals don't overwrite jsLib globals
            self.initialized.store(true, Ordering::SeqCst);

            // Ensure java is accessible via globalThis for `const { java } = this` pattern
            // When jsLib functions are called, they may use `this` which defaults to globalThis
            ctx.eval::<(), _>(
                r#"
                if (typeof globalThis !== 'undefined') {
                    globalThis.java = java;
                }
            "#,
            )?;

            // Preprocess jsLib to fix `const { java } = this` pattern which fails in strict mode
            // and ensure global variables like 'time' are declared
            let mut processed_js_lib = js_lib
                .replace("const { java } = this", "var java = globalThis.java")
                .replace("const {java} = this", "var java = globalThis.java")
                .replace("let { java } = this", "var java = globalThis.java")
                .replace("var { java } = this", "var java = globalThis.java");

            // Ensure java and time are declared at top level if they look like they are used globally
            if !processed_js_lib.contains("var java")
                && !processed_js_lib.contains("const java")
                && !processed_js_lib.contains("let java")
            {
                processed_js_lib = format!("var java = globalThis.java;\n{}", processed_js_lib);
            }
            if processed_js_lib.contains("time =")
                && !processed_js_lib.contains("var time")
                && !processed_js_lib.contains("let time")
                && !processed_js_lib.contains("const time")
            {
                processed_js_lib = format!("var time;\n{}", processed_js_lib);
            }

            // Execute processed jsLib to define global functions
            match ctx.eval::<Value, _>(processed_js_lib.as_str()) {
                Ok(_) => {
                    tracing::debug!("Successfully loaded jsLib ({} bytes)", js_lib.len());
                    Ok(())
                }
                Err(e) => {
                    // Extract detailed exception if possible
                    let exception = ctx.catch();
                    let exception_msg = if exception.is_object() {
                        let obj = exception.as_object().unwrap();
                        let msg: String = obj
                            .get("message")
                            .unwrap_or_else(|_| "No message".to_string());
                        let stack: String =
                            obj.get("stack").unwrap_or_else(|_| "No stack".to_string());
                        format!("{} - {}", msg, stack)
                    } else {
                        value_to_string(&ctx, exception).unwrap_or_else(|_| format!("{:?}", e))
                    };

                    tracing::error!("CRITICAL: Failed to load jsLib: {}", exception_msg);
                    Ok(())
                }
            }
        })
    }

    /// Set current content in the JS context (for java.getString)
    pub fn set_current_content(&self, content: &str) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert("__current_content__".to_string(), content.to_string());
        }
    }

    /// Put a variable into the JS session cache
    pub fn put_variable(&self, key: &str, value: &str) {
        if let Ok(mut c) = self.cache.lock() {
            c.insert(key.to_string(), value.to_string());
        }
    }

    /// Evaluate a JS rule within the engine context
    pub fn eval(&self, code: &str) -> Result<String> {
        self.context.with(|ctx| {
            // Register utils object only if not already initialized
            if !self.initialized.load(Ordering::SeqCst) {
                self.register_universal_bridge(&ctx)?;
                self.initialized.store(true, Ordering::SeqCst);
            }

            // Evaluate code
            let result: Value = ctx.eval(code)?;

            // Convert to string
            value_to_string(&ctx, result)
        })
    }

    /// Evaluate with context variables
    pub fn eval_with_context(&self, code: &str, vars: &HashMap<String, String>) -> Result<String> {
        let base_url = self.base_url.clone();

        tracing::debug!(
            "eval_with_context called, initialized={}",
            self.initialized.load(Ordering::SeqCst)
        );

        self.context.with(|ctx| {
            // Register utils object only if not already initialized
            if !self.initialized.load(Ordering::SeqCst) {
                tracing::debug!("Registering utils (first time)");
                self.register_universal_bridge(&ctx)?;
                self.initialized.store(true, Ordering::SeqCst);
            }

            // Set context variables
            let globals = ctx.globals();
            tracing::debug!("Setting {} context variables", vars.len());
            for (key, value) in vars {
                if key == "result" {
                    tracing::debug!("Setting JS var result len={}", value.len());
                }
                let js_val = if (value.starts_with('{') && value.ends_with('}'))
                    || (value.starts_with('[') && value.ends_with(']'))
                {
                    // Try to parse as JSON for discovery result objects/lists
                    match ctx.json_parse(value.as_str()) {
                        Ok(v) => v,
                        Err(_) => value
                            .as_str()
                            .into_js(&ctx)
                            .unwrap_or(Value::new_null(ctx.clone())),
                    }
                } else {
                    value
                        .as_str()
                        .into_js(&ctx)
                        .unwrap_or(Value::new_null(ctx.clone()))
                };

                if let Err(e) = globals.set(key.as_str(), js_val) {
                    tracing::error!("Failed to set var '{}': {:?}", key, e);
                    return Err(anyhow::anyhow!("Failed to set var '{}': {}", key, e));
                }
            }

            // Set baseUrl
            globals.set("baseUrl", base_url.as_str())?;

            // Set source/book/chapter bindings for Java parity
            let source_json = self.source_json.borrow();
            if !source_json.is_empty() {
                if let Ok(v) = ctx.json_parse(source_json.as_str()) {
                    let _ = globals.set("source", v);
                }
            }

            let book_json = self.book_json.borrow();
            if !book_json.is_empty() {
                if let Ok(v) = ctx.json_parse(book_json.as_str()) {
                    let _ = globals.set("book", v);
                }
            }

            let chapter_json = self.chapter_json.borrow();
            if !chapter_json.is_empty() {
                if let Ok(v) = ctx.json_parse(chapter_json.as_str()) {
                    let _ = globals.set("chapter", v);
                    // Also extract title for convenience
                    if let Ok(parsed) =
                        serde_json::from_str::<serde_json::Value>(chapter_json.as_str())
                    {
                        if let Some(title) = parsed.get("title").and_then(|t| t.as_str()) {
                            let _ = globals.set("title", title);
                        }
                    }
                }
            }

            // Evaluate code with detailed error logging
            tracing::debug!(
                "JS eval code (first 200 chars): {}",
                code.chars().take(200).collect::<String>()
            );
            match ctx.eval::<Value, _>(code) {
                Ok(result) => {
                    tracing::debug!("JS eval succeeded");
                    // Record JS execution for stats
                    crate::engine::stats::STATS.record_js();
                    value_to_string(&ctx, result)
                }
                Err(e) => {
                    // Extract detailed exception if possible
                    let exception = ctx.catch();
                    let exception_msg = if exception.is_object() {
                        let obj = exception.as_object().unwrap();
                        let msg: String = obj
                            .get("message")
                            .unwrap_or_else(|_| "No message".to_string());
                        let stack: String =
                            obj.get("stack").unwrap_or_else(|_| "No stack".to_string());
                        format!("{} - {}", msg, stack)
                    } else {
                        value_to_string(&ctx, exception).unwrap_or_else(|_| format!("{:?}", e))
                    };

                    tracing::error!("JS eval error: {}", exception_msg);
                    tracing::error!(
                        "JS code that failed: {}",
                        code.chars().take(500).collect::<String>()
                    );
                    Err(anyhow::anyhow!("JS eval error: {}", exception_msg))
                }
            }
        })
    }

    /// Register utils.* and java.* global objects via Universal Bridge
    fn register_universal_bridge(&self, ctx: &Ctx) -> Result<()> {
        let api_provider = self.native_api.clone();

        // Register the core bridge function: _rust_native_call
        // signature: (namespace, method, args) -> string
        ctx.globals().set(
            "_rust_native_call",
            Function::new(
                ctx.clone(),
                move |ctx: Ctx, ns: String, method: String, args: Vec<String>| -> String {
                    // 1. Map string call to strong-typed NativeApi enum
                    let api_enum = super::js::bridge_mapper::map_to_api(&ns, &method, &args);

                    // 2. Build Context
                    let globals = ctx.globals();
                    let base_url: String = globals.get("baseUrl").unwrap_or_default();
                    let execution_context =
                        crate::engine::native_api::ExecutionContext { base_url };

                    // 3. Execute via provider
                    api_provider
                        .execute(&api_enum, &args, &execution_context)
                        .unwrap_or_default()
                },
            )?,
        )?;

        // Inject the JS Shim to create proxies
        ctx.eval::<(), _>(include_str!("js/shim.js"))?;

        Ok(())
    }
}

/// Convert JS value to string
fn value_to_string<'js>(ctx: &Ctx<'js>, value: Value<'js>) -> Result<String> {
    if value.is_null() || value.is_undefined() {
        return Ok(String::new());
    }

    if let Some(s) = value.as_string() {
        return Ok(s.to_string().unwrap_or_default());
    }

    if let Some(i) = value.as_int() {
        return Ok(i.to_string());
    }

    if let Some(f) = value.as_float() {
        return Ok(f.to_string());
    }

    if let Some(b) = value.as_bool() {
        return Ok(b.to_string());
    }

    if value.is_object() {
        // Try to stringify using JSON.stringify
        if let Ok(json) = ctx.globals().get::<_, Object>("JSON") {
            if let Ok(stringify) = json.get::<_, Function>("stringify") {
                if let Ok(result) = stringify.call::<_, String>((value,)) {
                    return Ok(result);
                }
            }
        }
    }

    Ok(String::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::cookie::CookieManager;
    use crate::engine::native_api::NativeApiProvider;
    use crate::storage::kv::KvStore;
    use crate::storage::FileStorage;

    fn create_test_native_api() -> Arc<NativeApiProvider> {
        let fs = FileStorage::new("/tmp/reader_tests_js_exec");
        let kv = Arc::new(KvStore::new(fs, "test_kv_js.json"));
        let cm = Arc::new(CookieManager::new());
        Arc::new(NativeApiProvider::new(cm, kv))
    }

    #[test]
    fn test_js_eval_simple() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        let result = executor.eval("1 + 2").unwrap();
        assert_eq!(result, "3");
    }

    #[test]
    fn test_js_utils_base64() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        let result = executor.eval("utils.base64.encode('hello')").unwrap();
        assert_eq!(result, "aGVsbG8=");
    }

    #[test]
    fn test_js_utils_md5() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        let result = executor.eval("utils.md5('test')").unwrap();
        assert_eq!(result, "098f6bcd4621d373cade4e832627b4f6");
    }

    // === Tests for java.* APIs ===

    #[test]
    fn test_java_base64_encode() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        let result = executor.eval("java.base64Encode('hello')").unwrap();
        assert_eq!(result, "aGVsbG8=");
    }

    #[test]
    fn test_java_base64_decode() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        let result = executor.eval("java.base64Decode('aGVsbG8=')").unwrap();
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_java_md5_encode() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        let result = executor.eval("java.md5Encode('test')").unwrap();
        assert_eq!(result, "098f6bcd4621d373cade4e832627b4f6");
    }

    #[test]
    fn test_java_md5_encode16() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        let result = executor.eval("java.md5Encode16('test')").unwrap();
        // Middle 16 chars of the full MD5
        assert_eq!(result.len(), 16);
    }

    #[test]
    fn test_java_encode_uri() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        let result = executor.eval("java.encodeURI('hello world')").unwrap();
        assert_eq!(result, "hello%20world");
    }

    #[test]
    fn test_java_hex_encode_decode() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        let encoded = executor.eval("java.hexEncodeToString('test')").unwrap();
        assert_eq!(encoded, "74657374");

        let decoded = executor.eval("java.hexDecodeToString('74657374')").unwrap();
        assert_eq!(decoded, "test");
    }

    #[test]
    fn test_java_put_get() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        executor.eval("java.put('mykey', 'myvalue')").unwrap();
        let result = executor.eval("java.get('mykey')").unwrap();
        assert_eq!(result, "myvalue");
    }

    #[test]
    fn test_java_random_uuid() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        let result = executor.eval("java.randomUUID()").unwrap();
        // UUID format: 8-4-4-4-12
        assert_eq!(result.len(), 36);
        assert!(result.contains('-'));
    }

    #[test]
    fn test_java_hex_string_byte_conversions() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        // test -> 74657374
        let hex = executor.eval("java.byteToHexString('test')").unwrap();
        assert_eq!(hex, "74657374");

        let bytes = executor.eval("java.hexStringToByte('74657374')").unwrap();
        assert_eq!(bytes, "test");
    }

    #[test]
    fn test_java_des_crypto() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        // DES-CBC
        let key = "12345678";
        let iv = "12345678";
        let data = "hello world";

        let encoded = executor
            .eval(&format!(
                "java.desEncode('{}', '{}', '', '{}')",
                data, key, iv
            ))
            .unwrap();
        assert!(!encoded.is_empty());

        let decoded = executor
            .eval(&format!(
                "java.desDecode('{}', '{}', '', '{}')",
                encoded, key, iv
            ))
            .unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_java_cookies() {
        let mut executor = JsExecutor::new(create_test_native_api()).unwrap();
        executor.set_base_url("http://example.com");

        // Set cookies using API
        executor
            .eval("java.setCookie('http://example.com', 'k1=v1')")
            .unwrap();
        executor
            .eval("java.setCookie('http://example.com', 'k2=v2')")
            .unwrap();

        // Test java.getCookie with key
        let k1 = executor
            .eval("java.getCookie('http://example.com', 'k1')")
            .unwrap();
        assert_eq!(k1, "v1");

        let k2 = executor
            .eval("java.getCookie('http://example.com', 'k2')")
            .unwrap();
        assert_eq!(k2, "v2");
    }

    #[test]
    fn test_java_overloaded_get() {
        let executor = JsExecutor::new(create_test_native_api()).unwrap();
        // Test cache get
        executor.eval("java.put('k1', 'v1')").unwrap();
        assert_eq!(executor.eval("java.get('k1')").unwrap(), "v1");

        // Test HTTP get (it should at least return a result string even if it fails)
        let result = executor
            .eval("typeof java.get('http://example.com')")
            .unwrap();
        // Universal Bridge returns JSON string, not object
        assert_eq!(result, "string");
    }
}

/// Ensure bytes array is exactly 16 bytes (for AES-128)
fn ensure_16_bytes(input: &[u8]) -> [u8; 16] {
    let mut result = [0u8; 16];
    let copy_len = input.len().min(16);
    result[..copy_len].copy_from_slice(&input[..copy_len]);
    result
}
/// Ensure bytes array is exactly 8 bytes (for DES)
fn ensure_8_bytes(input: &[u8]) -> [u8; 8] {
    let mut result = [0u8; 8];
    let copy_len = input.len().min(8);
    result[..copy_len].copy_from_slice(&input[..copy_len]);
    result
}
