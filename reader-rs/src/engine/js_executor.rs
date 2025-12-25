//! JavaScript Executor using rquickjs (QuickJS)
//!
//! Provides ES2023 JavaScript execution with custom utils.* API

use anyhow::Result;
use rquickjs::{Runtime, Context, Value, Object, Function, Ctx, IntoJs};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use super::native_api::NativeApiProvider;
use super::preprocessor::NativeApi;
use super::cookie::CookieManager;

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
    pub fn new() -> Result<Self> {
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
            native_api: Arc::new(NativeApiProvider::new(Arc::new(CookieManager::new()))),
        })
    }
    
    /// Create executor with cache
    pub fn with_cache(cache: JsCache) -> Result<Self> {
        let runtime = Runtime::new()?;
        let context = Context::full(&runtime)?;
        
        let native_api = Arc::new(NativeApiProvider::with_cache(Arc::new(CookieManager::new()), cache.clone()));

        Ok(Self {
            runtime,
            context,
            cache,
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
            self.register_utils(&ctx)?;
            
            // Mark as initialized so subsequent evals don't overwrite jsLib globals
            self.initialized.store(true, Ordering::SeqCst);
            
            // Ensure java is accessible via globalThis for `const { java } = this` pattern
            // When jsLib functions are called, they may use `this` which defaults to globalThis
            ctx.eval::<(), _>(r#"
                if (typeof globalThis !== 'undefined') {
                    globalThis.java = java;
                }
            "#)?;
            
            // Preprocess jsLib to fix `const { java } = this` pattern which fails in strict mode
            // and ensure global variables like 'time' are declared
            let mut processed_js_lib = js_lib
                .replace("const { java } = this", "var java = globalThis.java")
                .replace("const {java} = this", "var java = globalThis.java")
                .replace("let { java } = this", "var java = globalThis.java")
                .replace("var { java } = this", "var java = globalThis.java");
            
            // Ensure java and time are declared at top level if they look like they are used globally
            if !processed_js_lib.contains("var java") && !processed_js_lib.contains("const java") && !processed_js_lib.contains("let java") {
                processed_js_lib = format!("var java = globalThis.java;\n{}", processed_js_lib);
            }
            if processed_js_lib.contains("time =") && !processed_js_lib.contains("var time") && !processed_js_lib.contains("let time") && !processed_js_lib.contains("const time") {
                processed_js_lib = format!("var time;\n{}", processed_js_lib);
            }
            
            // Execute processed jsLib to define global functions
            match ctx.eval::<Value, _>(processed_js_lib.as_str()) {
                Ok(_) => {
                    tracing::debug!("Successfully loaded jsLib ({} bytes)", js_lib.len());
                    Ok(())
                },
                Err(e) => {
                    // Extract detailed exception if possible
                    let exception = ctx.catch();
                    let exception_msg = if exception.is_object() {
                        let obj = exception.as_object().unwrap();
                        let msg: String = obj.get("message").unwrap_or_else(|_| "No message".to_string());
                        let stack: String = obj.get("stack").unwrap_or_else(|_| "No stack".to_string());
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
                self.register_utils(&ctx)?;
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
        
        tracing::debug!("eval_with_context called, initialized={}", self.initialized.load(Ordering::SeqCst));
        
        self.context.with(|ctx| {
            // Register utils object only if not already initialized
            if !self.initialized.load(Ordering::SeqCst) {
                tracing::debug!("Registering utils (first time)");
                self.register_utils(&ctx)?;
                self.initialized.store(true, Ordering::SeqCst);
            }
            
            // Set context variables
            let globals = ctx.globals();
            tracing::debug!("Setting {} context variables", vars.len());
            for (key, value) in vars {
                if key == "result" {
                    tracing::debug!("Setting JS var result len={}", value.len());
                }
                let js_val = if (value.starts_with('{') && value.ends_with('}')) || (value.starts_with('[') && value.ends_with(']')) {
                    // Try to parse as JSON for discovery result objects/lists
                    match ctx.json_parse(value.as_str()) {
                        Ok(v) => v,
                        Err(_) => value.as_str().into_js(&ctx).unwrap_or(Value::new_null(ctx.clone()))
                    }
                } else {
                    value.as_str().into_js(&ctx).unwrap_or(Value::new_null(ctx.clone()))
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
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(chapter_json.as_str()) {
                        if let Some(title) = parsed.get("title").and_then(|t| t.as_str()) {
                            let _ = globals.set("title", title);
                        }
                    }
                }
            }
            

            // Evaluate code with detailed error logging
            tracing::debug!("JS eval code (first 200 chars): {}", code.chars().take(200).collect::<String>());
            match ctx.eval::<Value, _>(code) {
                Ok(result) => {
                    tracing::debug!("JS eval succeeded");
                    value_to_string(&ctx, result)
                },
                Err(e) => {
                    // Extract detailed exception if possible
                    let exception = ctx.catch();
                    let exception_msg = if exception.is_object() {
                        let obj = exception.as_object().unwrap();
                        let msg: String = obj.get("message").unwrap_or_else(|_| "No message".to_string());
                        let stack: String = obj.get("stack").unwrap_or_else(|_| "No stack".to_string());
                        format!("{} - {}", msg, stack)
                    } else {
                        value_to_string(&ctx, exception).unwrap_or_else(|_| format!("{:?}", e))
                    };
                    
                    tracing::error!("JS eval error: {}", exception_msg);
                    tracing::error!("JS code that failed: {}", code.chars().take(500).collect::<String>());
                    Err(anyhow::anyhow!("JS eval error: {}", exception_msg))
                }
            }
        })
    }
    
    /// Register utils.* global object
    fn register_utils(&self, ctx: &Ctx) -> rquickjs::Result<()> {
        let globals = ctx.globals();
        let utils = Object::new(ctx.clone())?;
        
        // utils.log
        utils.set("log", Function::new(ctx.clone(), |msg: String| {
            tracing::info!("JS log: {}", msg);
        })?)?;
        
        // utils.base64
        let base64_obj = Object::new(ctx.clone())?;
        base64_obj.set("encode", Function::new(ctx.clone(), |s: String| -> String {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.encode(s.as_bytes())
        })?)?;
        base64_obj.set("decode", Function::new(ctx.clone(), |s: String| -> String {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD
                .decode(s.as_bytes())
                .ok()
                .and_then(|bytes| String::from_utf8(bytes).ok())
                .unwrap_or_default()
        })?)?;
        utils.set("base64", base64_obj)?;
        
        // utils.md5
        utils.set("md5", Function::new(ctx.clone(), |s: String| -> String {
            format!("{:x}", md5::compute(s.as_bytes()))
        })?)?;
        
        // utils.cache
        let cache_obj = Object::new(ctx.clone())?;
        let cache_get = self.cache.clone();
        let cache_set = self.cache.clone();
        
        cache_obj.set("get", Function::new(ctx.clone(), move |key: String| -> String {
            cache_get.lock()
                .ok()
                .and_then(|c| c.get(&key).cloned())
                .unwrap_or_default()
        })?)?;
        
        cache_obj.set("set", Function::new(ctx.clone(), move |key: String, value: String| {
            if let Ok(mut c) = cache_set.lock() {
                c.insert(key, value);
            }
        })?)?;
        utils.set("cache", cache_obj)?;
        
        // utils.fetch (sync version for now)
        utils.set("fetch", Function::new(ctx.clone(), |url: String| -> String {
            // Run HTTP request in separate thread
            std::thread::spawn(move || {
                let client = reqwest::blocking::Client::builder()
                    .timeout(std::time::Duration::from_secs(10))
                    .build()
                    .ok()?;
                    
                let resp = client.get(&url)
                    .header("User-Agent", "Mozilla/5.0")
                    .send()
                    .ok()?;
                    
                resp.text().ok()
            }).join().ok().flatten().unwrap_or_default()
        })?)?;
        
        // utils.aes (AES-128-CBC encryption/decryption)
        let aes_obj = Object::new(ctx.clone())?;
        
        let api = self.native_api.clone();
        aes_obj.set("encrypt", Function::new(ctx.clone(), move |data: String, key: String, iv: String| -> String {
            api.execute(&NativeApi::AesEncode { transformation: String::new(), iv }, &[data, key]).unwrap_or_default()
        })?)?;
        
        let api = self.native_api.clone();
        aes_obj.set("decrypt", Function::new(ctx.clone(), move |data: String, key: String, iv: String| -> String {
            api.execute(&NativeApi::AesDecode { transformation: String::new(), iv }, &[data, key]).unwrap_or_default()
        })?)?;
        utils.set("aes", aes_obj)?;
        
        globals.set("utils", utils)?;
        
        // source object - book source level variable storage
        // These use the same cache but with "source_" prefix for namespacing
        let source_obj = Object::new(ctx.clone())?;
        let source_cache_get = self.cache.clone();
        let source_cache_set = self.cache.clone();
        
        source_obj.set("putVariable", Function::new(ctx.clone(), move |key: String, value: String| {
            let prefixed_key = format!("source_{}", key);
            if let Ok(mut c) = source_cache_set.lock() {
                c.insert(prefixed_key, value);
            }
        })?)?;
        
        source_obj.set("getVariable", Function::new(ctx.clone(), move |key: String| -> String {
            let prefixed_key = format!("source_{}", key);
            source_cache_get.lock()
                .ok()
                .and_then(|c| c.get(&prefixed_key).cloned())
                .unwrap_or_default()
        })?)?;
        
        // Also add bookSourceUrl for source context
        let base_url = self.base_url.clone();
        source_obj.set("bookSourceUrl", base_url)?;
        
        globals.set("source", source_obj)?;
        
        // java object - compatibility layer for Legado JavaScript
        let java_obj = Object::new(ctx.clone())?;
        let java_cache_get = self.cache.clone();
        let java_cache_set = self.cache.clone();
        java_obj.set("put", Function::new(ctx.clone(), move |key: String, value: Value| {
            let ctx = value.ctx();
            if let Ok(mut c) = java_cache_set.lock() {
                let val_str = value_to_string(ctx, value.clone()).unwrap_or_default();
                c.insert(key, val_str);
            }
        })?)?;
        
        java_obj.set("_cacheGet", Function::new(ctx.clone(), move |key: String| -> String {
            java_cache_get.lock()
                .ok()
                .and_then(|c| c.get(&key).cloned())
                .unwrap_or_default()
        })?)?;

        // Chinese Conversion (placeholder)
        java_obj.set("t2s", Function::new(ctx.clone(), |text: String| -> String {
            text
        })?)?;
        java_obj.set("s2t", Function::new(ctx.clone(), |text: String| -> String {
            text
        })?)?;
        
        // === Encoding Methods ===
        
        // java.base64Encode(val) / java.base64Decode(val)
        // java.base64Encode(val) / java.base64Decode(val)
        let api = self.native_api.clone();
        java_obj.set("base64Encode", Function::new(ctx.clone(), move |val: Value| -> String {
            let s = value_to_string_js(&val);
            api.execute(&NativeApi::Base64Encode, &[s]).unwrap_or_default()
        })?)?;
        
        let api = self.native_api.clone();
        java_obj.set("base64Decode", Function::new(ctx.clone(), move |val: Value| -> String {
            let s = value_to_string_js(&val);
            api.execute(&NativeApi::Base64Decode, &[s]).unwrap_or_default()
        })?)?;
        
        // java.base64DecodeToByteArray(str) - Decode Base64 to hex-encoded bytes
        java_obj.set("base64DecodeToByteArray", Function::new(ctx.clone(), |str: String| -> String {
            use base64::Engine;
            base64::engine::general_purpose::STANDARD
                .decode(str.as_bytes())
                .map(|bytes| hex::encode(&bytes))
                .unwrap_or_default()
        })?)?;
        
        // java.base64EncodeWithFlags(str, flags) - Base64 encode with flags
        // flag 2 = NO_WRAP (no line breaks)
        // java.base64EncodeWithFlags(str, flags)

        java_obj.set("base64EncodeWithFlags", Function::new(ctx.clone(), |str: String, flags: i32| -> String {
             use base64::Engine;
             if flags == 2 {
                 base64::engine::general_purpose::STANDARD_NO_PAD.encode(str.as_bytes())
             } else {
                 base64::engine::general_purpose::STANDARD.encode(str.as_bytes())
             }
        })?)?;
        
        // === Phase 11: Complete Base64 API variants with flags ===
        
        // java.base64DecodeWithFlags(str, flags) - Decode with flags
        java_obj.set("base64DecodeWithFlags", Function::new(ctx.clone(), |str: String, flags: i32| -> String {
            use base64::Engine;
            let engine = if flags & 8 != 0 {
                // URL_SAFE
                &base64::engine::general_purpose::URL_SAFE
            } else {
                &base64::engine::general_purpose::STANDARD
            };
            engine.decode(str.as_bytes())
                .ok()
                .and_then(|bytes| String::from_utf8(bytes).ok())
                .unwrap_or_default()
        })?)?;
        
        // java.base64DecodeToByteArrayWithFlags(str, flags) - Decode to hex with flags
        java_obj.set("base64DecodeToByteArrayWithFlags", Function::new(ctx.clone(), |str: String, flags: i32| -> String {
            use base64::Engine;
            let engine = if flags & 8 != 0 {
                &base64::engine::general_purpose::URL_SAFE
            } else {
                &base64::engine::general_purpose::STANDARD
            };
            engine.decode(str.as_bytes())
                .map(|bytes| hex::encode(&bytes))
                .unwrap_or_default()
        })?)?;

        // java.md5Encode(val) - 32 character hex
        // java.md5Encode(val)
        let api = self.native_api.clone();
        java_obj.set("md5Encode", Function::new(ctx.clone(), move |val: Value| -> String {
            let s = value_to_string_js(&val);
            api.execute(&NativeApi::Md5Encode, &[s]).unwrap_or_default()
        })?)?;
        
        // java.md5Encode16(val) - 16 character hex (middle 16 chars)
        // java.md5Encode16(val)
        let api = self.native_api.clone();
        java_obj.set("md5Encode16", Function::new(ctx.clone(), move |val: Value| -> String {
            let s = value_to_string_js(&val);
            api.execute(&NativeApi::Md5Encode16, &[s]).unwrap_or_default()
        })?)?;
        
        // java.encodeURI(val) / java.decodeURI(val)
        // java.encodeURI(val)
        let api = self.native_api.clone();
        java_obj.set("encodeURI", Function::new(ctx.clone(), move |val: Value| -> String {
            let s = value_to_string_js(&val);
            api.execute(&NativeApi::EncodeUri, &[s]).unwrap_or_default()
        })?)?;
        
        java_obj.set("decodeURI", Function::new(ctx.clone(), |val: Value| -> String {
            let s = value_to_string_js(&val);
            urlencoding::decode(&s).unwrap_or_default().to_string()
        })?)?;
        
        // java.hexEncodeToString(val) - String to Hex
        java_obj.set("hexEncodeToString", Function::new(ctx.clone(), |val: Value| -> String {
            let s = value_to_string_js(&val);
            hex::encode(s.as_bytes())
        })?)?;
        
        // java.hexDecodeToString(val) - Hex to String
        java_obj.set("hexDecodeToString", Function::new(ctx.clone(), |val: Value| -> String {
            let s = value_to_string_js(&val);
            hex::decode(&s)
                .ok()
                .and_then(|bytes| String::from_utf8(bytes).ok())
                .unwrap_or_default()
        })?)?;

        // java.hexStringToByte(hex) - returns byte array equivalent in string
        java_obj.set("hexStringToByte", Function::new(ctx.clone(), |s: String| -> String {
            hex::decode(&s).map(|b| String::from_utf8_lossy(&b).to_string()).unwrap_or_default()
        })?)?;

        // java.byteToHexString(bytes)
        java_obj.set("byteToHexString", Function::new(ctx.clone(), |s: String| -> String {
            hex::encode(s.as_bytes())
        })?)?;
        
        // === Phase 5 Additional APIs ===
        
        // java.encodeURIWithEnc(str, enc) - URL encode with specified encoding
        java_obj.set("encodeURIWithEnc", Function::new(ctx.clone(), |str: String, enc: String| -> String {
            use encoding_rs::{GBK, GB18030};
            
            match enc.to_uppercase().as_str() {
                "GBK" | "GB2312" => {
                    let (encoded, _, _) = GBK.encode(&str);
                    // URL encode the GBK bytes
                    encoded.iter()
                        .map(|&b| {
                            if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
                                (b as char).to_string()
                            } else {
                                format!("%{:02X}", b)
                            }
                        })
                        .collect()
                },
                "GB18030" => {
                    let (encoded, _, _) = GB18030.encode(&str);
                    encoded.iter()
                        .map(|&b| {
                            if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
                                (b as char).to_string()
                            } else {
                                format!("%{:02X}", b)
                            }
                        })
                        .collect()
                },
                _ => urlencoding::encode(&str).to_string(),
            }
        })?)?;
        
        // java.utf8ToGbk(str)
        let api = self.native_api.clone();
        java_obj.set("utf8ToGbk", Function::new(ctx.clone(), move |str: String| -> String {
            api.execute(&NativeApi::Utf8ToGbk, &[str]).unwrap_or_default()
        })?)?;
        
        // java.htmlFormat(str) - Format HTML content
        java_obj.set("htmlFormat", Function::new(ctx.clone(), |str: String| -> String {
            // Remove extra whitespace and format
            str.replace("\r\n", "\n")
               .replace("\r", "\n")
               .split('\n')
               .map(|line| line.trim())
               .filter(|line| !line.is_empty())
               .collect::<Vec<_>>()
               .join("\n")
        })?)?;
        
        // java.androidId() - Return empty string (not on Android)
        java_obj.set("androidId", Function::new(ctx.clone(), || -> String {
            String::new()
        })?)?;
        
        // java.logType(any) - Log the type of value
        java_obj.set("logType", Function::new(ctx.clone(), |val: Value| {
            let type_name = if val.is_undefined() { "undefined" }
                else if val.is_null() { "null" }
                else if val.is_bool() { "boolean" }
                else if val.is_int() || val.is_float() { "number" }
                else if val.is_string() { "string" }
                else if val.is_array() { "array" }
                else if val.is_object() { "object" }
                else if val.is_function() { "function" }
                else { "unknown" };
            tracing::info!("[logType] {}", type_name);
        })?)?;
        
        // java.getSource() - Get current source (returns empty for now)
        java_obj.set("getSource", Function::new(ctx.clone(), || -> String {
            // Would need source context to be passed in
            String::new()
        })?)?;
        
        // === WebView Methods ===
        
        // java.webView(html, url, js) - Render page using headless browser
        // Returns the result of JS execution, or page HTML if no JS provided
        java_obj.set("webView", Function::new(ctx.clone(), |html: Option<String>, url: Option<String>, js: Option<String>| -> String {
            use super::webview::WebViewExecutor;
            
            // Try to create WebView executor
            match WebViewExecutor::new() {
                Ok(executor) => {
                    executor.render(
                        html.as_deref(),
                        url.as_deref(),
                        js.as_deref()
                    ).unwrap_or_else(|e| {
                        tracing::warn!("WebView render failed: {}", e);
                        String::new()
                    })
                },
                Err(e) => {
                    // WebView not available, try fallback to simple HTTP
                    tracing::debug!("WebView not available: {}, falling back to HTTP", e);
                    
                    if let Some(page_url) = url.as_ref() {
                        // Simple HTTP fallback
                        std::thread::spawn({
                            let page_url = page_url.clone();
                            move || {
                                let client = reqwest::blocking::Client::builder()
                                    .timeout(std::time::Duration::from_secs(30))
                                    .danger_accept_invalid_certs(true)
                                    .build()
                                    .ok()?;
                                    
                                let resp = client.get(&page_url)
                                    .header("User-Agent", "Mozilla/5.0")
                                    .send()
                                    .ok()?;
                                
                                resp.text().ok()
                            }
                        }).join().ok().flatten().unwrap_or_default()
                    } else if let Some(html_content) = html {
                        // Return the HTML directly
                        html_content
                    } else {
                        String::new()
                    }
                }
            }
        })?)?;

        // === HTTP Methods ===

        
        // java.ajax(url) - Simple GET request
        java_obj.set("ajax", Function::new(ctx.clone(), |url: String| -> String {
            std::thread::spawn(move || {
                let client = reqwest::blocking::Client::builder()
                    .timeout(std::time::Duration::from_secs(30))
                    .danger_accept_invalid_certs(true)
                    .build()
                    .ok()?;
                    
                let resp = client.get(&url)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    .send()
                    .ok()?;
                
                resp.text().ok()
            }).join().ok().flatten().unwrap_or_default()
        })?)?;
        
        // java.ajaxAll(urlList) - Concurrent GET requests
        java_obj.set("ajaxAll", Function::new(ctx.clone(), |urls: Value| -> Vec<String> {
            let _ctx = urls.ctx();
            
            // Extract URLs from the Value (could be array)
            let url_list: Vec<String> = if urls.is_array() {
                let arr = urls.as_array().unwrap();
                let len = arr.len();
                (0..len)
                    .filter_map(|i| arr.get::<String>(i).ok())
                    .collect()
            } else if urls.is_string() {
                vec![urls.as_string().unwrap().to_string().unwrap_or_default()]
            } else {
                vec![]
            };
            
            if url_list.is_empty() {
                return vec![];
            }
            
            // Spawn threads for concurrent requests
            let handles: Vec<_> = url_list.into_iter().map(|url| {
                std::thread::spawn(move || {
                    let client = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(30))
                        .danger_accept_invalid_certs(true)
                        .build()
                        .ok()?;
                        
                    let resp = client.get(&url)
                        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                        .send()
                        .ok()?;
                    
                    resp.text().ok()
                })
            }).collect();
            
            handles.into_iter()
                .map(|h| h.join().ok().flatten().unwrap_or_default())
                .collect()
        })?)?;
        
        // === File Operations ===
        
        // java.cacheFile(url, saveTime) - Download and cache file
        let cache_dir = std::env::current_dir()
            .unwrap_or_default()
            .join("data")
            .join("cache");
        let cache_dir_clone = cache_dir.clone();
        
        java_obj.set("cacheFile", Function::new(ctx.clone(), move |url: String, save_time: i32| -> String {
            use std::fs;
            use std::time::SystemTime;
            
            // Create cache directory if needed
            let _ = fs::create_dir_all(&cache_dir_clone);
            
            // Generate cache key from URL
            let cache_key = format!("{:x}", md5::compute(&url));
            let cache_path = cache_dir_clone.join(&cache_key);
            
            // Check if cache is valid
            if cache_path.exists() {
                if save_time == 0 {
                    // No expiry, use cached
                    if let Ok(content) = fs::read_to_string(&cache_path) {
                        return content;
                    }
                } else if let Ok(metadata) = fs::metadata(&cache_path) {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(elapsed) = SystemTime::now().duration_since(modified) {
                            if elapsed.as_secs() < save_time as u64 {
                                if let Ok(content) = fs::read_to_string(&cache_path) {
                                    return content;
                                }
                            }
                        }
                    }
                }
            }
            
            // Download and cache
            let content = std::thread::spawn(move || {
                let client = reqwest::blocking::Client::builder()
                    .timeout(std::time::Duration::from_secs(30))
                    .danger_accept_invalid_certs(true)
                    .build()
                    .ok()?;
                    
                let resp = client.get(&url)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    .send()
                    .ok()?;
                
                resp.text().ok()
            }).join().ok().flatten().unwrap_or_default();
            
            // Save to cache
            if !content.is_empty() {
                let _ = fs::write(&cache_path, &content);
            }
            
            content
        })?)?;
        
        // java.importScript(path) - Import external JS script
        let cache_for_import = cache_dir.clone();
        java_obj.set("importScript", Function::new(ctx.clone(), move |path: String| -> String {
            use std::fs;
            
            if path.starts_with("http://") || path.starts_with("https://") {
                // Download from URL (with caching)
                let cache_key = format!("{:x}", md5::compute(&path));
                let cache_path = cache_for_import.join(&cache_key);
                
                // Check cache first
                if cache_path.exists() {
                    if let Ok(content) = fs::read_to_string(&cache_path) {
                        return content;
                    }
                }
                
                // Download
                let content = std::thread::spawn(move || {
                    let client = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(30))
                        .danger_accept_invalid_certs(true)
                        .build()
                        .ok()?;
                        
                    let resp = client.get(&path)
                        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                        .send()
                        .ok()?;
                    
                    resp.text().ok()
                }).join().ok().flatten().unwrap_or_default();
                
                // Cache
                if !content.is_empty() {
                    let _ = fs::create_dir_all(&cache_for_import);
                    let _ = fs::write(&cache_path, &content);
                }
                
                content
            } else {
                // Local file
                fs::read_to_string(&path).unwrap_or_default()
            }
        })?)?;
        
        // java.readFile(path) - Read local file as bytes (hex encoded)
        java_obj.set("readFile", Function::new(ctx.clone(), |path: String| -> String {
            use std::fs;
            fs::read(&path)
                .map(|bytes| hex::encode(&bytes))
                .unwrap_or_default()
        })?)?;
        
        // java.readTxtFile(path) - Read local text file
        java_obj.set("readTxtFile", Function::new(ctx.clone(), |path: String| -> String {
            use std::fs;
            fs::read_to_string(&path).unwrap_or_default()
        })?)?;
        
        // java.readTxtFileWithCharset(path, charsetName) - Read with specific encoding
        java_obj.set("readTxtFileWithCharset", Function::new(ctx.clone(), |path: String, charset: String| -> String {
            use std::fs;
            use encoding_rs::{GBK, GB18030, UTF_8};
            
            let bytes = fs::read(&path).unwrap_or_default();
            if bytes.is_empty() { return String::new(); }
            
            let (result, _, _) = match charset.to_uppercase().as_str() {
                "GBK" | "GB2312" => GBK.decode(&bytes),
                "GB18030" => GB18030.decode(&bytes),
                _ => UTF_8.decode(&bytes),
            };
            result.to_string()
        })?)?;
        
        // java.deleteFile(path) - Delete local file
        java_obj.set("deleteFile", Function::new(ctx.clone(), |path: String| -> bool {
            use std::fs;
            fs::remove_file(&path).is_ok()
        })?)?;
        
        // java.getFile(path) - Get file path (returns full path)
        let cache_base = std::env::current_dir()
            .unwrap_or_default()
            .join("data")
            .join("cache");
            
        java_obj.set("getFile", Function::new(ctx.clone(), move |path: String| -> String {
            if path.starts_with('/') || path.starts_with("\\") {
                cache_base.join(&path[1..]).to_string_lossy().to_string()
            } else {
                cache_base.join(&path).to_string_lossy().to_string()
            }
        })?)?;
        
        // === ZIP File Operations ===
        
        // java.getZipStringContent(url, path) - Get text content from ZIP file
        java_obj.set("getZipStringContent", Function::new(ctx.clone(), |url: String, path: String| -> String {
            use std::io::Read;
            use zip::ZipArchive;
            
            // Get ZIP bytes
            let bytes: Vec<u8> = if url.starts_with("http://") || url.starts_with("https://") {
                std::thread::spawn(move || {
                    let client = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(30))
                        .danger_accept_invalid_certs(true)
                        .build()
                        .ok()?;
                        
                    let resp = client.get(&url)
                        .header("User-Agent", "Mozilla/5.0")
                        .send()
                        .ok()?;
                    
                    resp.bytes().ok().map(|b| b.to_vec())
                }).join().ok().flatten().unwrap_or_default()
            } else {
                // Hex string
                hex::decode(&url).unwrap_or_default()
            };
            
            if bytes.is_empty() { return String::new(); }
            
            // Open ZIP and read file
            let cursor = std::io::Cursor::new(bytes);
            let mut archive = match ZipArchive::new(cursor) {
                Ok(a) => a,
                Err(_) => return String::new(),
            };
            
            let mut file = match archive.by_name(&path) {
                Ok(f) => f,
                Err(_) => return String::new(),
            };
            
            let mut content = String::new();
            file.read_to_string(&mut content).unwrap_or_default();
            
            content
        })?)?;
        
        // java.getZipStringContentWithCharset(url, path, charsetName) - Get text with encoding
        java_obj.set("getZipStringContentWithCharset", Function::new(ctx.clone(), |url: String, path: String, charset: String| -> String {
            use std::io::Read;
            use zip::ZipArchive;
            use encoding_rs::{GBK, GB18030, UTF_8};
            
            // Get ZIP bytes
            let bytes: Vec<u8> = if url.starts_with("http://") || url.starts_with("https://") {
                std::thread::spawn(move || {
                    let client = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(30))
                        .danger_accept_invalid_certs(true)
                        .build()
                        .ok()?;
                        
                    let resp = client.get(&url)
                        .header("User-Agent", "Mozilla/5.0")
                        .send()
                        .ok()?;
                    
                    resp.bytes().ok().map(|b| b.to_vec())
                }).join().ok().flatten().unwrap_or_default()
            } else {
                hex::decode(&url).unwrap_or_default()
            };
            
            if bytes.is_empty() { return String::new(); }
            
            let cursor = std::io::Cursor::new(bytes);
            let mut archive = match ZipArchive::new(cursor) {
                Ok(a) => a,
                Err(_) => return String::new(),
            };
            
            let mut file = match archive.by_name(&path) {
                Ok(f) => f,
                Err(_) => return String::new(),
            };
            
            let mut content_bytes = Vec::new();
            file.read_to_end(&mut content_bytes).unwrap_or_default();
            
            let (result, _, _) = match charset.to_uppercase().as_str() {
                "GBK" | "GB2312" => GBK.decode(&content_bytes),
                "GB18030" => GB18030.decode(&content_bytes),
                _ => UTF_8.decode(&content_bytes),
            };
            result.to_string()
        })?)?;
        

        // java.getZipByteArrayContent(url, path) - Get bytes from ZIP file (hex encoded)
        java_obj.set("getZipByteArrayContent", Function::new(ctx.clone(), |url: String, path: String| -> String {
            use std::io::Read;
            use zip::ZipArchive;
            
            // Get ZIP bytes
            let bytes: Vec<u8> = if url.starts_with("http://") || url.starts_with("https://") {
                std::thread::spawn(move || {
                    let client = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(30))
                        .danger_accept_invalid_certs(true)
                        .build()
                        .ok()?;
                        
                    let resp = client.get(&url)
                        .header("User-Agent", "Mozilla/5.0")
                        .send()
                        .ok()?;
                    
                    resp.bytes().ok().map(|b| b.to_vec())
                }).join().ok().flatten().unwrap_or_default()
            } else {
                hex::decode(&url).unwrap_or_default()
            };
            
            if bytes.is_empty() { return String::new(); }
            
            let cursor = std::io::Cursor::new(bytes);
            let mut archive = match ZipArchive::new(cursor) {
                Ok(a) => a,
                Err(_) => return String::new(),
            };
            
            let mut file = match archive.by_name(&path) {
                Ok(f) => f,
                Err(_) => return String::new(),
            };
            
            let mut content = Vec::new();
            file.read_to_end(&mut content).unwrap_or_default();
            
            hex::encode(&content)
        })?)?;
        
        // java.unzipFile(zipPath) - Unzip file to cache directory
        let unzip_cache_dir = std::env::current_dir()
            .unwrap_or_default()
            .join("data")
            .join("cache");
        
        java_obj.set("unzipFile", Function::new(ctx.clone(), move |zip_path: String| -> String {
            use std::fs;
            use zip::ZipArchive;
            
            if zip_path.is_empty() { return String::new(); }
            
            let zip_file = match fs::File::open(&zip_path) {
                Ok(f) => f,
                Err(_) => return String::new(),
            };
            
            let mut archive = match ZipArchive::new(zip_file) {
                Ok(a) => a,
                Err(_) => return String::new(),
            };
            
            // Create extraction directory
            let zip_name = std::path::Path::new(&zip_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unzipped");
            let extract_dir = unzip_cache_dir.join(zip_name);
            let _ = fs::create_dir_all(&extract_dir);
            
            // Extract all files
            for i in 0..archive.len() {
                if let Ok(mut file) = archive.by_index(i) {
                    let file_path = extract_dir.join(file.name());
                    
                    if file.is_dir() {
                        let _ = fs::create_dir_all(&file_path);
                    } else {
                        if let Some(parent) = file_path.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                        if let Ok(mut out_file) = fs::File::create(&file_path) {
                            let _ = std::io::copy(&mut file, &mut out_file);
                        }
                    }
                }
            }
            
            // Return relative path
            extract_dir.strip_prefix(&unzip_cache_dir)
                .ok()
                .and_then(|p| p.to_str())
                .map(|s| format!("/{}", s))
                .unwrap_or_default()
        })?)?;


        // java._httpRaw(method, url, body, headers) - Universal HTTP request (native implementation)
        // Returns standardized JSON: { "body": string, "headers": object, "code": int, "url": string }
        java_obj.set("_httpRaw", Function::new(ctx.clone(), |method: String, url: String, body: String, headers: String| -> String {
            let url_for_fallback = url.clone();
            std::thread::spawn(move || -> Option<String> {
                let client = reqwest::blocking::Client::builder()
                    .timeout(std::time::Duration::from_secs(30))
                    .danger_accept_invalid_certs(true)
                    .build()
                    .ok()?;
                
                let method = match method.to_uppercase().as_str() {
                    "POST" => reqwest::Method::POST,
                    "PUT" => reqwest::Method::PUT,
                    "DELETE" => reqwest::Method::DELETE,
                    _ => reqwest::Method::GET,
                };

                let mut request = client.request(method, &url)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
                
                if !body.is_empty() {
                    request = request.header("Content-Type", "application/x-www-form-urlencoded")
                                     .body(body);
                }
                
                // Parse headers JSON if provided
                if !headers.is_empty() && headers != "{}" {
                    if let Ok(header_map) = serde_json::from_str::<std::collections::HashMap<String, String>>(&headers) {
                        for (k, v) in header_map {
                            request = request.header(k.as_str(), v.as_str());
                        }
                    }
                }
                
                let resp = request.send().ok()?;
                
                let code = resp.status().as_u16();
                let actual_url = resp.url().to_string();
                let mut resp_headers = std::collections::HashMap::new();
                for (name, value) in resp.headers().iter() {
                    if let Ok(val_str) = value.to_str() {
                        resp_headers.insert(name.as_str().to_string(), val_str.to_string());
                    }
                }
                
                let text = resp.text().unwrap_or_default();
                
                let result = serde_json::json!({
                    "body": text,
                    "headers": resp_headers,
                    "code": code,
                    "url": actual_url
                });
                
                Some(result.to_string())
            }).join().ok().flatten().unwrap_or_else(|| {
                serde_json::json!({
                    "body": "",
                    "headers": {},
                    "code": 500,
                    "url": url_for_fallback
                }).to_string()
            })
        })?)?;

        // IMPORTANT: Set java object to globals BEFORE running JS wrappers
        globals.set("java", java_obj.clone())?;

        // Create JS logic for Response objects and HTTP methods
        ctx.eval::<(), _>(r#"
            (function() {
                // Helper to create Response-like object from JSON string
                function createResponse(dataStr) {
                    var data = JSON.parse(dataStr);
                    return {
                        _body: data.body,
                        _headers: data.headers,
                        _code: data.code,
                        _url: data.url,
                        body: function() { return this._body; },
                        text: function() { return this._body; },
                        headers: function() { return this._headers; },
                        statusCode: function() { return this._code; },
                        code: function() { return this._code; },
                        url: function() { return this._url; }
                    };
                }

                java.post = function(url, body, headers) {
                    var respStr = java._httpRaw("POST", url, body || '', JSON.stringify(headers || {}));
                    return createResponse(respStr);
                };

                java.connect = function(url) {
                    var respStr = java._httpRaw("GET", url, '', '{}');
                    return createResponse(respStr);
                };

                java.get = function(arg1, arg2) {
                    // Check if arg1 is URL (starts with http) or cache key
                    if (arg1 && (arg1.startsWith("http://") || arg1.startsWith("https://"))) {
                        var respStr = java._httpRaw("GET", arg1, '', JSON.stringify(arg2 || {}));
                        return createResponse(respStr);
                    }
                    // Default to cache get
                    return java._cacheGet(arg1);
                };
            })();
        "#)?;
        
        // === JSON Methods ===
        
        // java.getString(jsonpath) - Extract from current context
        // Note: This needs access to current content, so we pass it via cache
        let json_cache = self.cache.clone();
        java_obj.set("getString", Function::new(ctx.clone(), move |path: String| -> String {
            // Get current content from cache (set by caller)
            let content = json_cache.lock()
                .ok()
                .and_then(|c| c.get("__current_content__").cloned())
                .unwrap_or_default();
            
            if content.is_empty() {
                return String::new();
            }
            
            // Use jsonpath to extract
            use jsonpath_rust::JsonPath;
            if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&content) {
                // Parse JSONPath - handle $. prefix
                let path = if path.starts_with("$.") { &path } else { &format!("$.{}", path) };
                if let Ok(json_path) = JsonPath::try_from(path.as_str()) {
                    let result = json_path.find(&json_value);
                    // result is a Value - could be array or single value
                    match result {
                        serde_json::Value::Array(arr) => {
                            if let Some(first) = arr.first() {
                                return match first {
                                    serde_json::Value::String(s) => s.clone(),
                                    v => v.to_string().trim_matches('"').to_string(),
                                };
                            }
                        }
                        serde_json::Value::String(s) => return s.clone(),
                        serde_json::Value::Null => return String::new(),
                        v => return v.to_string().trim_matches('"').to_string(),
                    }
                }
            }
            String::new()
        })?)?;
        
        // === Utility Methods ===
        
        // java.log(msg) - Debug logging
        java_obj.set("log", Function::new(ctx.clone(), |msg: String| {
            tracing::info!("JS log: {}", msg);
        })?)?;
        
        // java.toast(msg) - Same as log for server
        java_obj.set("toast", Function::new(ctx.clone(), |msg: String| {
            tracing::info!("JS toast: {}", msg);
        })?)?;
        
        // java.longToast(msg) - Same as log for server  
        java_obj.set("longToast", Function::new(ctx.clone(), |msg: String| {
            tracing::info!("JS longToast: {}", msg);
        })?)?;
        
        // java.randomUUID()
        java_obj.set("randomUUID", Function::new(ctx.clone(), || -> String {
            uuid::Uuid::new_v4().to_string()
        })?)?;
        
        // java.timeFormat(timestamp)
        let api = self.native_api.clone();
        java_obj.set("timeFormat", Function::new(ctx.clone(), move |time: i64| -> String {
            api.execute(&NativeApi::TimeFormat(None), &[time.to_string()]).unwrap_or_default()
        })?)?;
        
        // === Crypto Methods (AES) ===
        // Reuse existing AES implementation
        
        java_obj.set("aesDecodeToString", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            // Simple AES-128-CBC decryption
            use aes::Aes128;
            use cbc::{Decryptor, cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7}};
            use base64::Engine;
            
            type Aes128CbcDec = Decryptor<Aes128>;
            
            let encrypted = match base64::engine::general_purpose::STANDARD.decode(data.as_bytes()) {
                Ok(bytes) => bytes,
                Err(_) => return String::new(),
            };
            
            let key_bytes = ensure_16_bytes(key.as_bytes());
            let iv_bytes = ensure_16_bytes(iv.as_bytes());
            
            let cipher = Aes128CbcDec::new(&key_bytes.into(), &iv_bytes.into());
            
            let mut buf = encrypted.clone();
            match cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                Ok(decrypted) => String::from_utf8_lossy(decrypted).to_string(),
                Err(_) => String::new(),
            }
        })?)?;
        
        java_obj.set("aesEncodeToString", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use aes::Aes128;
            use cbc::{Encryptor, cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7}};
            use base64::Engine;
            
            type Aes128CbcEnc = Encryptor<Aes128>;
            
            let key_bytes = ensure_16_bytes(key.as_bytes());
            let iv_bytes = ensure_16_bytes(iv.as_bytes());
            
            let cipher = Aes128CbcEnc::new(&key_bytes.into(), &iv_bytes.into());
            
            let data_bytes = data.as_bytes();
            let buf_len = ((data_bytes.len() / 16) + 1) * 16;
            let mut buf = vec![0u8; buf_len];
            buf[..data_bytes.len()].copy_from_slice(data_bytes);
            
            match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
                Ok(encrypted) => base64::engine::general_purpose::STANDARD.encode(encrypted),
                Err(_) => String::new(),
            }
        })?)?;

        // === Phase 10: Complete AES API variants ===
        
        // java.aesDecodeToByteArray - returns hex encoded bytes
        java_obj.set("aesDecodeToByteArray", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use aes::Aes128;
            use cbc::{Decryptor, cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7}};
            use base64::Engine;
            
            type Aes128CbcDec = Decryptor<Aes128>;
            
            let encrypted = base64::engine::general_purpose::STANDARD
                .decode(data.as_bytes())
                .unwrap_or_default();
            if encrypted.is_empty() { return String::new(); }
            
            let key_bytes = ensure_16_bytes(key.as_bytes());
            let iv_bytes = ensure_16_bytes(iv.as_bytes());
            
            let cipher = Aes128CbcDec::new(&key_bytes.into(), &iv_bytes.into());
            
            let mut buf = encrypted.clone();
            match cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                Ok(decrypted) => hex::encode(decrypted),
                Err(_) => String::new(),
            }
        })?)?;
        
        // java.aesBase64DecodeToByteArray - Base64 input, hex output
        java_obj.set("aesBase64DecodeToByteArray", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use aes::Aes128;
            use cbc::{Decryptor, cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7}};
            use base64::Engine;
            
            type Aes128CbcDec = Decryptor<Aes128>;
            
            let encrypted = base64::engine::general_purpose::STANDARD
                .decode(data.as_bytes())
                .unwrap_or_default();
            if encrypted.is_empty() { return String::new(); }
            
            let key_bytes = ensure_16_bytes(key.as_bytes());
            let iv_bytes = ensure_16_bytes(iv.as_bytes());
            
            let cipher = Aes128CbcDec::new(&key_bytes.into(), &iv_bytes.into());
            
            let mut buf = encrypted.clone();
            match cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                Ok(decrypted) => hex::encode(decrypted),
                Err(_) => String::new(),
            }
        })?)?;
        
        // java.aesBase64DecodeToString
        let api = self.native_api.clone();
        java_obj.set("aesBase64DecodeToString", Function::new(ctx.clone(), move |data: String, key: String, _transformation: String, iv: String| -> String {
            api.execute(&NativeApi::AesDecode { transformation: String::new(), iv }, &[data, key]).unwrap_or_default()
        })?)?;
        
        // java.aesEncodeToByteArray - returns hex encoded bytes
        java_obj.set("aesEncodeToByteArray", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use aes::Aes128;
            use cbc::{Encryptor, cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7}};
            
            type Aes128CbcEnc = Encryptor<Aes128>;
            
            let key_bytes = ensure_16_bytes(key.as_bytes());
            let iv_bytes = ensure_16_bytes(iv.as_bytes());
            
            let cipher = Aes128CbcEnc::new(&key_bytes.into(), &iv_bytes.into());
            
            let data_bytes = data.as_bytes();
            let buf_len = ((data_bytes.len() / 16) + 1) * 16;
            let mut buf = vec![0u8; buf_len];
            buf[..data_bytes.len()].copy_from_slice(data_bytes);
            
            match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
                Ok(encrypted) => hex::encode(encrypted),
                Err(_) => String::new(),
            }
        })?)?;
        
        // java.aesEncodeToBase64ByteArray - returns base64 as "bytes"
        java_obj.set("aesEncodeToBase64ByteArray", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use aes::Aes128;
            use cbc::{Encryptor, cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7}};
            use base64::Engine;
            
            type Aes128CbcEnc = Encryptor<Aes128>;
            
            let key_bytes = ensure_16_bytes(key.as_bytes());
            let iv_bytes = ensure_16_bytes(iv.as_bytes());
            
            let cipher = Aes128CbcEnc::new(&key_bytes.into(), &iv_bytes.into());
            
            let data_bytes = data.as_bytes();
            let buf_len = ((data_bytes.len() / 16) + 1) * 16;
            let mut buf = vec![0u8; buf_len];
            buf[..data_bytes.len()].copy_from_slice(data_bytes);
            
            match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
                Ok(encrypted) => base64::engine::general_purpose::STANDARD.encode(encrypted),
                Err(_) => String::new(),
            }
        })?)?;
        
        // java.aesEncodeToBase64String
        let api = self.native_api.clone();
        java_obj.set("aesEncodeToBase64String", Function::new(ctx.clone(), move |data: String, key: String, _transformation: String, iv: String| -> String {
            api.execute(&NativeApi::AesEncode { transformation: String::new(), iv }, &[data, key]).unwrap_or_default()
        })?)?;


        // java.desDecode(data, key, _transformation, iv)
        java_obj.set("desDecode", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use des::Des;
            use cbc::{Decryptor, cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7}};
            
            type DesCbcDec = Decryptor<Des>;
            
            let encrypted = hex::decode(data).unwrap_or_default();
            if encrypted.is_empty() { return String::new(); }

            let key_bytes = ensure_8_bytes(key.as_bytes());
            let iv_bytes = ensure_8_bytes(iv.as_bytes());
            
            let cipher = DesCbcDec::new(&key_bytes.into(), &iv_bytes.into());
            
            let mut buf = encrypted.clone();
            match cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                Ok(decrypted) => String::from_utf8_lossy(decrypted).to_string(),
                Err(_) => String::new(),
            }
        })?)?;

        // java.desEncode(data, key, _transformation, iv)
        java_obj.set("desEncode", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use des::Des;
            use cbc::{Encryptor, cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7}};
            
            type DesCbcEnc = Encryptor<Des>;
            
            let key_bytes = ensure_8_bytes(key.as_bytes());
            let iv_bytes = ensure_8_bytes(iv.as_bytes());
            
            let cipher = DesCbcEnc::new(&key_bytes.into(), &iv_bytes.into());
            
            let data_bytes = data.as_bytes();
            let buf_len = ((data_bytes.len() / 8) + 1) * 8;
            let mut buf = vec![0u8; buf_len];
            buf[..data_bytes.len()].copy_from_slice(data_bytes);
            
            match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
                Ok(encrypted) => hex::encode(encrypted),
                Err(_) => String::new(),
            }
        })?)?;
        
        // java.desDecodeToString - same as desDecode but different name
        java_obj.set("desDecodeToString", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use des::Des;
            use cbc::{Decryptor, cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7}};
            
            type DesCbcDec = Decryptor<Des>;
            
            // Try hex decode first, then base64
            let encrypted = hex::decode(&data)
                .or_else(|_| {
                    use base64::Engine;
                    base64::engine::general_purpose::STANDARD.decode(data.as_bytes())
                })
                .unwrap_or_default();
            if encrypted.is_empty() { return String::new(); }

            let key_bytes = ensure_8_bytes(key.as_bytes());
            let iv_bytes = ensure_8_bytes(iv.as_bytes());
            
            let cipher = DesCbcDec::new(&key_bytes.into(), &iv_bytes.into());
            
            let mut buf = encrypted.clone();
            match cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                Ok(decrypted) => String::from_utf8_lossy(decrypted).to_string(),
                Err(_) => String::new(),
            }
        })?)?;
        
        // java.desEncodeToString - returns hex encoded
        java_obj.set("desEncodeToString", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use des::Des;
            use cbc::{Encryptor, cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7}};
            
            type DesCbcEnc = Encryptor<Des>;
            
            let key_bytes = ensure_8_bytes(key.as_bytes());
            let iv_bytes = ensure_8_bytes(iv.as_bytes());
            
            let cipher = DesCbcEnc::new(&key_bytes.into(), &iv_bytes.into());
            
            let data_bytes = data.as_bytes();
            let buf_len = ((data_bytes.len() / 8) + 1) * 8;
            let mut buf = vec![0u8; buf_len];
            buf[..data_bytes.len()].copy_from_slice(data_bytes);
            
            match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
                Ok(encrypted) => hex::encode(encrypted),
                Err(_) => String::new(),
            }
        })?)?;
        

        // === Phase 6: DES Base64 APIs ===
        
        // java.desBase64DecodeToString(data, key, transformation, iv) - DES decrypt Base64 encoded data
        java_obj.set("desBase64DecodeToString", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use des::Des;
            use cbc::{Decryptor, cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7}};
            use base64::Engine;
            
            type DesCbcDec = Decryptor<Des>;
            
            // Decode Base64 input
            let encrypted = base64::engine::general_purpose::STANDARD
                .decode(data.as_bytes())
                .unwrap_or_default();
            if encrypted.is_empty() { return String::new(); }

            let key_bytes = ensure_8_bytes(key.as_bytes());
            let iv_bytes = ensure_8_bytes(iv.as_bytes());
            
            let cipher = DesCbcDec::new(&key_bytes.into(), &iv_bytes.into());
            
            let mut buf = encrypted.clone();
            match cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                Ok(decrypted) => String::from_utf8_lossy(decrypted).to_string(),
                Err(_) => String::new(),
            }
        })?)?;
        
        // java.desEncodeToBase64String(data, key, transformation, iv) - DES encrypt to Base64
        java_obj.set("desEncodeToBase64String", Function::new(ctx.clone(), |data: String, key: String, _transformation: String, iv: String| -> String {
            use des::Des;
            use cbc::{Encryptor, cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7}};
            use base64::Engine;
            
            type DesCbcEnc = Encryptor<Des>;
            
            let key_bytes = ensure_8_bytes(key.as_bytes());
            let iv_bytes = ensure_8_bytes(iv.as_bytes());
            
            let cipher = DesCbcEnc::new(&key_bytes.into(), &iv_bytes.into());
            
            let data_bytes = data.as_bytes();
            let buf_len = ((data_bytes.len() / 8) + 1) * 8;
            let mut buf = vec![0u8; buf_len];
            buf[..data_bytes.len()].copy_from_slice(data_bytes);
            
            match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
                Ok(encrypted) => base64::engine::general_purpose::STANDARD.encode(encrypted),
                Err(_) => String::new(),
            }
        })?)?;
        
        // === Font Parsing (Anti-Crawl) ===
        
        // java.queryTTF(fontData) - Parse TTF font from URL, path, or base64
        // Returns a font object identifier that can be used with replaceFont
        let font_cache = std::sync::Arc::new(std::sync::Mutex::new(HashMap::<String, super::query_ttf::QueryTTF>::new()));
        let font_cache_for_query = font_cache.clone();
        
        java_obj.set("queryTTF", Function::new(ctx.clone(), move |font_data: String| -> String {
            use super::query_ttf::QueryTTF;
            use base64::Engine;
            
            if font_data.is_empty() { return String::new(); }
            
            // Get font bytes from URL, path, or base64
            let bytes: Vec<u8> = if font_data.starts_with("http://") || font_data.starts_with("https://") {
                // Download from URL
                std::thread::spawn(move || {
                    let client = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(30))
                        .danger_accept_invalid_certs(true)
                        .build()
                        .ok()?;
                        
                    let resp = client.get(&font_data)
                        .header("User-Agent", "Mozilla/5.0")
                        .send()
                        .ok()?;
                    
                    resp.bytes().ok().map(|b| b.to_vec())
                }).join().ok().flatten().unwrap_or_default()
            } else if font_data.starts_with('/') || font_data.contains(':') {
                // Local file path
                std::fs::read(&font_data).unwrap_or_default()
            } else {
                // Try base64 decode
                base64::engine::general_purpose::STANDARD
                    .decode(font_data.as_bytes())
                    .unwrap_or_default()
            };
            
            if bytes.is_empty() { return String::new(); }
            
            // Parse font
            match QueryTTF::new(&bytes) {
                Some(font) => {
                    // Generate a unique ID for this font
                    let font_id = format!("font_{:x}", md5::compute(&bytes));
                    
                    // Store in cache
                    if let Ok(mut cache) = font_cache_for_query.lock() {
                        cache.insert(font_id.clone(), font);
                    }
                    
                    font_id
                },
                None => String::new(),
            }
        })?)?;
        
        // java.replaceFont(text, fontId1, fontId2) - Decode text using font mapping
        let font_cache_for_replace = font_cache.clone();
        
        java_obj.set("replaceFont", Function::new(ctx.clone(), move |text: String, font_id1: String, font_id2: String| -> String {
            use super::query_ttf::replace_font;
            
            if text.is_empty() || font_id1.is_empty() || font_id2.is_empty() {
                return text;
            }
            
            let cache = match font_cache_for_replace.lock() {
                Ok(c) => c,
                Err(_) => return text,
            };
            
            let font1 = match cache.get(&font_id1) {
                Some(f) => f,
                None => return text,
            };
            
            let font2 = match cache.get(&font_id2) {
                Some(f) => f,
                None => return text,
            };
            
            replace_font(&text, font1, font2)
        })?)?;
        
        // java.queryBase64TTF(base64) - Parse TTF from Base64 string only
        let font_cache_for_b64 = font_cache.clone();
        
        java_obj.set("queryBase64TTF", Function::new(ctx.clone(), move |base64_data: String| -> String {
            use super::query_ttf::QueryTTF;
            use base64::Engine;
            
            if base64_data.is_empty() { return String::new(); }
            
            // Decode base64
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(base64_data.as_bytes())
                .unwrap_or_default();
            
            if bytes.is_empty() { return String::new(); }
            
            // Parse font
            match QueryTTF::new(&bytes) {
                Some(font) => {
                    let font_id = format!("font_{:x}", md5::compute(&bytes));
                    
                    if let Ok(mut cache) = font_cache_for_b64.lock() {
                        cache.insert(font_id.clone(), font);
                    }
                    
                    font_id
                },
                None => String::new(),
            }
        })?)?;
        
        // === Hash/Digest Methods ===
        
        // java.digestHex(data, algorithm) - Generate hash in hex format
        java_obj.set("digestHex", Function::new(ctx.clone(), |data: String, algorithm: String| -> String {
            use sha1::Sha1;
            use sha2::{Sha256, Sha512, Digest};
            
            let data_bytes = data.as_bytes();
            
            match algorithm.to_uppercase().as_str() {
                "MD5" => format!("{:x}", md5::compute(data_bytes)),
                "SHA1" | "SHA-1" => {
                    let mut hasher = Sha1::new();
                    hasher.update(data_bytes);
                    format!("{:x}", hasher.finalize())
                },
                "SHA256" | "SHA-256" => {
                    let mut hasher = Sha256::new();
                    hasher.update(data_bytes);
                    format!("{:x}", hasher.finalize())
                },
                "SHA512" | "SHA-512" => {
                    let mut hasher = Sha512::new();
                    hasher.update(data_bytes);
                    format!("{:x}", hasher.finalize())
                },
                _ => format!("{:x}", md5::compute(data_bytes)), // Default to MD5
            }
        })?)?;
        
        // java.digestBase64Str(data, algorithm) - Generate hash in Base64 format
        java_obj.set("digestBase64Str", Function::new(ctx.clone(), |data: String, algorithm: String| -> String {
            use sha1::Sha1;
            use sha2::{Sha256, Sha512, Digest};
            use base64::Engine;
            
            let data_bytes = data.as_bytes();
            
            let hash_bytes: Vec<u8> = match algorithm.to_uppercase().as_str() {
                "MD5" => md5::compute(data_bytes).0.to_vec(),
                "SHA1" | "SHA-1" => {
                    let mut hasher = Sha1::new();
                    hasher.update(data_bytes);
                    hasher.finalize().to_vec()
                },
                "SHA256" | "SHA-256" => {
                    let mut hasher = Sha256::new();
                    hasher.update(data_bytes);
                    hasher.finalize().to_vec()
                },
                "SHA512" | "SHA-512" => {
                    let mut hasher = Sha512::new();
                    hasher.update(data_bytes);
                    hasher.finalize().to_vec()
                },
                _ => md5::compute(data_bytes).0.to_vec(),
            };
            
            base64::engine::general_purpose::STANDARD.encode(&hash_bytes)
        })?)?;
        
        // java.tripleDESDecodeStr(data, key, mode, padding, iv) - 3DES decrypt
        // java.tripleDESDecodeStr
        let api = self.native_api.clone();
        java_obj.set("tripleDESDecodeStr", Function::new(ctx.clone(), move |data: String, key: String, mode: String, padding: String, iv: String| -> String {
            api.execute(&NativeApi::TripleDesDecodeStr { mode, padding }, &[data, key, iv]).unwrap_or_default()
        })?)?;

        
        // java.tripleDESEncodeBase64Str(data, key, mode, padding, iv) - 3DES encrypt to Base64
        // java.tripleDESEncodeBase64Str
        let api = self.native_api.clone();
        java_obj.set("tripleDESEncodeBase64Str", Function::new(ctx.clone(), move |data: String, key: String, mode: String, padding: String, iv: String| -> String {
            api.execute(&NativeApi::TripleDesEncodeBase64 { mode, padding }, &[data, key, iv]).unwrap_or_default()
        })?)?;

        
        // === Phase 5.3: Base64 parameter encryption APIs ===
        
        // java.aesDecodeArgsBase64Str(data, key, mode, padding, iv) - AES decrypt with Base64 encoded params
        java_obj.set("aesDecodeArgsBase64Str", Function::new(ctx.clone(), |data: String, key: String, _mode: String, _padding: String, iv: String| -> String {
            use aes::Aes128;
            use cbc::{Decryptor, cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7}};
            use base64::Engine;
            
            type Aes128CbcDec = Decryptor<Aes128>;
            
            // Decode Base64 encoded key and iv
            let key_bytes_raw = base64::engine::general_purpose::STANDARD
                .decode(key.as_bytes())
                .unwrap_or_default();
            let iv_bytes_raw = base64::engine::general_purpose::STANDARD
                .decode(iv.as_bytes())
                .unwrap_or_default();
            
            // Decode Base64 encoded data
            let encrypted = base64::engine::general_purpose::STANDARD
                .decode(data.as_bytes())
                .unwrap_or_default();
            if encrypted.is_empty() { return String::new(); }
            
            let key_bytes = ensure_16_bytes(&key_bytes_raw);
            let iv_bytes = ensure_16_bytes(&iv_bytes_raw);
            
            let cipher = Aes128CbcDec::new(&key_bytes.into(), &iv_bytes.into());
            
            let mut buf = encrypted.clone();
            match cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                Ok(decrypted) => String::from_utf8_lossy(decrypted).to_string(),
                Err(_) => String::new(),
            }
        })?)?;
        
        // java.aesEncodeArgsBase64Str(data, key, mode, padding, iv) - AES encrypt with Base64 encoded params
        // java.aesEncodeArgsBase64Str
        let api = self.native_api.clone();
        java_obj.set("aesEncodeArgsBase64Str", Function::new(ctx.clone(), move |data: String, key: String, mode: String, padding: String, iv: String| -> String {
            api.execute(&NativeApi::AesEncodeArgsBase64 { mode, padding }, &[data, key, iv]).unwrap_or_default()
        })?)?;
        
        // java.tripleDESDecodeArgsBase64Str(data, key, mode, padding, iv) - 3DES decrypt with Base64 params
        // java.tripleDESDecodeArgsBase64Str
        let api = self.native_api.clone();
        java_obj.set("tripleDESDecodeArgsBase64Str", Function::new(ctx.clone(), move |data: String, key: String, mode: String, padding: String, iv: String| -> String {
            api.execute(&NativeApi::TripleDesDecodeArgsBase64 { mode, padding }, &[data, key, iv]).unwrap_or_default()
        })?)?;

        
        // java.tripleDESEncodeArgsBase64Str(data, key, mode, padding, iv) - 3DES encrypt with Base64 params
        // java.tripleDESEncodeArgsBase64Str
        let api = self.native_api.clone();
        java_obj.set("tripleDESEncodeArgsBase64Str", Function::new(ctx.clone(), move |data: String, key: String, mode: String, padding: String, iv: String| -> String {
            api.execute(&NativeApi::TripleDesEncodeArgsBase64 { mode, padding }, &[data, key, iv]).unwrap_or_default()
        })?)?;

        
        // === Phase 5.4: Additional Utility APIs ===
        
        // java.timeFormatUTC
        let api = self.native_api.clone();
        java_obj.set("timeFormatUTC", Function::new(ctx.clone(), move |time: i64, format: String, sh: i32| -> String {
            // Note: NativeApi::TimeFormatUtc expects arguments as strings
            api.execute(&NativeApi::TimeFormatUtc { format: format, offset_hours: sh }, &[time.to_string()]).unwrap_or_default()
        })?)?;

        
        // java.getTxtInFolder(path) - Read all txt files in folder
        java_obj.set("getTxtInFolder", Function::new(ctx.clone(), |path: String| -> String {
            use std::fs;
            
            let entries = match fs::read_dir(&path) {
                Ok(e) => e,
                Err(_) => return String::new(),
            };
            
            let mut contents = Vec::new();
            for entry in entries.flatten() {
                let file_path = entry.path();
                if file_path.is_file() {
                    if let Some(ext) = file_path.extension() {
                        if ext == "txt" {
                            if let Ok(content) = fs::read_to_string(&file_path) {
                                contents.push(content);
                            }
                        }
                    }
                }
            }
            contents.join("\n")
        })?)?;
        
        // java.downloadFile(content, url) - Save hex content to file
        let download_cache = std::env::current_dir()
            .unwrap_or_default()
            .join("data")
            .join("cache");
        
        java_obj.set("downloadFile", Function::new(ctx.clone(), move |content: String, url: String| -> String {
            use std::fs;
            
            let _ = fs::create_dir_all(&download_cache);
            
            // Extract extension from URL
            let ext = url.rsplit('.').next()
                .filter(|&e| e.len() <= 10 && !e.contains('/'))
                .unwrap_or("bin");
            
            let file_name = format!("{:x}.{}", md5::compute(&content), ext);
            let file_path = download_cache.join(&file_name);
            
            // Decode hex content and write
            let bytes = hex::decode(&content).unwrap_or_default();
            let _ = fs::write(&file_path, &bytes);
            
            format!("/{}", file_name)
        })?)?;

        // java.getCookie(tag, key) - Get cookie value
        let cookie_cache_get = self.cache.clone();
        java_obj.set("getCookie", Function::new(ctx.clone(), move |tag: String, key: String| -> String {
            let cookie_key = format!("cookie_{}", tag);
            let full_cookie = cookie_cache_get.lock()
                .ok()
                .and_then(|c| c.get(&cookie_key).cloned())
                .unwrap_or_default();
            
            if key.is_empty() {
                return full_cookie;
            }
            
            // Extract specific key from cookie string "k1=v1; k2=v2"
            for part in full_cookie.split(';') {
                let part = part.trim();
                if part.starts_with(&format!("{}=", key)) {
                    return part[key.len() + 1..].to_string();
                }
            }
            String::new()
        })?)?;

        // java._getCookieProp() - Internal helper for the getter
        let cookie_cache_prop = self.cache.clone();
        let base_url_for_prop = self.base_url.clone();
        java_obj.set("_getCookieProp", Function::new(ctx.clone(), move || -> String {
             let cookie_key = format!("cookie_{}", base_url_for_prop);
             cookie_cache_prop.lock()
                .ok()
                .and_then(|c| c.get(&cookie_key).cloned())
                .unwrap_or_default()
        })?)?;

        globals.set("java", java_obj.clone())?;
        
        // Add JS-side property getter for java.cookie
        ctx.eval::<(), _>(r#"
            Object.defineProperty(java, 'cookie', {
                get: function() { return this._getCookieProp(); },
                configurable: true
            });
        "#)?;
        
        Ok(())
    }
}

impl Default for JsExecutor {
    fn default() -> Self {
        Self::new().expect("Failed to create JsExecutor")
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
    
    #[test]
    fn test_js_eval_simple() {
        let executor = JsExecutor::new().unwrap();
        let result = executor.eval("1 + 2").unwrap();
        assert_eq!(result, "3");
    }
    
    #[test]
    fn test_js_utils_base64() {
        let executor = JsExecutor::new().unwrap();
        let result = executor.eval("utils.base64.encode('hello')").unwrap();
        assert_eq!(result, "aGVsbG8=");
    }
    
    #[test]
    fn test_js_utils_md5() {
        let executor = JsExecutor::new().unwrap();
        let result = executor.eval("utils.md5('test')").unwrap();
        assert_eq!(result, "098f6bcd4621d373cade4e832627b4f6");
    }
    
    // === Tests for java.* APIs ===
    
    #[test]
    fn test_java_base64_encode() {
        let executor = JsExecutor::new().unwrap();
        let result = executor.eval("java.base64Encode('hello')").unwrap();
        assert_eq!(result, "aGVsbG8=");
    }
    
    #[test]
    fn test_java_base64_decode() {
        let executor = JsExecutor::new().unwrap();
        let result = executor.eval("java.base64Decode('aGVsbG8=')").unwrap();
        assert_eq!(result, "hello");
    }
    
    #[test]
    fn test_java_md5_encode() {
        let executor = JsExecutor::new().unwrap();
        let result = executor.eval("java.md5Encode('test')").unwrap();
        assert_eq!(result, "098f6bcd4621d373cade4e832627b4f6");
    }
    
    #[test]
    fn test_java_md5_encode16() {
        let executor = JsExecutor::new().unwrap();
        let result = executor.eval("java.md5Encode16('test')").unwrap();
        // Middle 16 chars of the full MD5
        assert_eq!(result.len(), 16);
    }
    
    #[test]
    fn test_java_encode_uri() {
        let executor = JsExecutor::new().unwrap();
        let result = executor.eval("java.encodeURI('hello world')").unwrap();
        assert_eq!(result, "hello%20world");
    }
    
    #[test]
    fn test_java_hex_encode_decode() {
        let executor = JsExecutor::new().unwrap();
        let encoded = executor.eval("java.hexEncodeToString('test')").unwrap();
        assert_eq!(encoded, "74657374");
        
        let decoded = executor.eval("java.hexDecodeToString('74657374')").unwrap();
        assert_eq!(decoded, "test");
    }
    
    #[test]
    fn test_java_put_get() {
        let executor = JsExecutor::new().unwrap();
        executor.eval("java.put('mykey', 'myvalue')").unwrap();
        let result = executor.eval("java.get('mykey')").unwrap();
        assert_eq!(result, "myvalue");
    }
    
    #[test]
    fn test_java_random_uuid() {
        let executor = JsExecutor::new().unwrap();
        let result = executor.eval("java.randomUUID()").unwrap();
        // UUID format: 8-4-4-4-12
        assert_eq!(result.len(), 36);
        assert!(result.contains('-'));
    }

    #[test]
    fn test_java_hex_string_byte_conversions() {
        let executor = JsExecutor::new().unwrap();
        // test -> 74657374
        let hex = executor.eval("java.byteToHexString('test')").unwrap();
        assert_eq!(hex, "74657374");
        
        let bytes = executor.eval("java.hexStringToByte('74657374')").unwrap();
        assert_eq!(bytes, "test");
    }

    #[test]
    fn test_java_des_crypto() {
        let executor = JsExecutor::new().unwrap();
        // DES-CBC
        let key = "12345678";
        let iv = "12345678";
        let data = "hello world";
        
        let encoded = executor.eval(&format!("java.desEncode('{}', '{}', '', '{}')", data, key, iv)).unwrap();
        assert!(!encoded.is_empty());
        
        let decoded = executor.eval(&format!("java.desDecode('{}', '{}', '', '{}')", encoded, key, iv)).unwrap();
        assert_eq!(decoded, data);
    }

    #[test]
    fn test_java_cookies() {
        let mut executor = JsExecutor::new().unwrap();
        executor.set_base_url("http://example.com");
        
        // Mock cookies in cache
        {
            let mut cache = executor.cache.lock().unwrap();
            cache.insert("cookie_http://example.com".to_string(), "k1=v1; k2=v2".to_string());
        }
        
        // Test java.cookie property
        let cookie_prop = executor.eval("java.cookie").unwrap();
        assert_eq!(cookie_prop, "k1=v1; k2=v2");
        
        // Test java.getCookie with key
        let k1 = executor.eval("java.getCookie('http://example.com', 'k1')").unwrap();
        assert_eq!(k1, "v1");
        
        let k2 = executor.eval("java.getCookie('http://example.com', 'k2')").unwrap();
        assert_eq!(k2, "v2");
        
        // Test java.getCookie without key
        let full = executor.eval("java.getCookie('http://example.com', '')").unwrap();
        assert_eq!(full, "k1=v1; k2=v2");
    }

    #[test]
    fn test_java_overloaded_get() {
        let executor = JsExecutor::new().unwrap();
        // Test cache get
        executor.eval("java.put('k1', 'v1')").unwrap();
        assert_eq!(executor.eval("java.get('k1')").unwrap(), "v1");
        
        // Test HTTP get (it should at least return a result object even if it fails)
        // Since we are in a test env without network maybe, we just check it doesn't crash
        let result = executor.eval("typeof java.get('http://example.com')").unwrap();
        assert_eq!(result, "object");
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

fn value_to_string_js(val: &Value) -> String {
    if let Some(s) = val.as_string() {
        if let Ok(rust_s) = s.to_string() {
            return rust_s;
        }
    }
    
    // Fallback for numbers, booleans etc.
    if val.is_number() {
        if let Some(n) = val.as_int() {
            return n.to_string();
        }
        if let Some(n) = val.as_float() {
            return n.to_string();
        }
    }
    
    if val.is_bool() {
        return val.as_bool().unwrap_or(false).to_string();
    }
    
    String::new()
}
