//! JavaScript Executor using rquickjs (QuickJS)
//!
//! Provides ES2023 JavaScript execution with custom utils.* API

use anyhow::Result;
use rquickjs::{Runtime, Context, Value, Object, Function, Ctx, IntoJs};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

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
        })
    }
    
    /// Create executor with cache
    pub fn with_cache(cache: JsCache) -> Result<Self> {
        let runtime = Runtime::new()?;
        let context = Context::full(&runtime)?;
        
        Ok(Self {
            runtime,
            context,
            cache,
            base_url: String::new(),
            initialized: AtomicBool::new(false),
        })
    }
    
    /// Set base URL for relative URL resolution
    pub fn set_base_url(&mut self, url: &str) {
        self.base_url = url.to_string();
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
        
        aes_obj.set("encrypt", Function::new(ctx.clone(), |data: String, key: String, iv: String| -> String {
            use aes::Aes128;
            use cbc::{Encryptor, cipher::{BlockEncryptMut, KeyIvInit, block_padding::Pkcs7}};
            use base64::Engine;
            
            type Aes128CbcEnc = Encryptor<Aes128>;
            
            // Ensure key and IV are 16 bytes
            let key_bytes = ensure_16_bytes(key.as_bytes());
            let iv_bytes = ensure_16_bytes(iv.as_bytes());
            
            let cipher = Aes128CbcEnc::new(&key_bytes.into(), &iv_bytes.into());
            
            let data_bytes = data.as_bytes();
            // Calculate padded buffer size (multiple of 16)
            let buf_len = ((data_bytes.len() / 16) + 1) * 16;
            let mut buf = vec![0u8; buf_len];
            buf[..data_bytes.len()].copy_from_slice(data_bytes);
            
            match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
                Ok(encrypted) => base64::engine::general_purpose::STANDARD.encode(encrypted),
                Err(_) => String::new(),
            }
        })?)?;
        
        aes_obj.set("decrypt", Function::new(ctx.clone(), |data: String, key: String, iv: String| -> String {
            use aes::Aes128;
            use cbc::{Decryptor, cipher::{BlockDecryptMut, KeyIvInit, block_padding::Pkcs7}};
            use base64::Engine;
            
            type Aes128CbcDec = Decryptor<Aes128>;
            
            // Decode base64 input
            let encrypted = match base64::engine::general_purpose::STANDARD.decode(data.as_bytes()) {
                Ok(bytes) => bytes,
                Err(_) => return String::new(),
            };
            
            // Ensure key and IV are 16 bytes
            let key_bytes = ensure_16_bytes(key.as_bytes());
            let iv_bytes = ensure_16_bytes(iv.as_bytes());
            
            let cipher = Aes128CbcDec::new(&key_bytes.into(), &iv_bytes.into());
            
            let mut buf = encrypted.clone();
            match cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                Ok(decrypted) => String::from_utf8_lossy(decrypted).to_string(),
                Err(_) => String::new(),
            }
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
        
        // === Encoding Methods ===
        
        // java.base64Encode(val) / java.base64Decode(val)
        java_obj.set("base64Encode", Function::new(ctx.clone(), |val: Value| -> String {
            use base64::Engine;
            let s = value_to_string_js(&val);
            base64::engine::general_purpose::STANDARD.encode(s.as_bytes())
        })?)?;
        
        java_obj.set("base64Decode", Function::new(ctx.clone(), |val: Value| -> String {
            use base64::Engine;
            let s = value_to_string_js(&val);
            base64::engine::general_purpose::STANDARD
                .decode(s.as_bytes())
                .ok()
                .and_then(|bytes| String::from_utf8(bytes).ok())
                .unwrap_or_default()
        })?)?;
        
        // java.md5Encode(val) - 32 character hex
        java_obj.set("md5Encode", Function::new(ctx.clone(), |val: Value| -> String {
            let s = value_to_string_js(&val);
            format!("{:x}", md5::compute(s.as_bytes()))
        })?)?;
        
        // java.md5Encode16(val) - 16 character hex (middle 16 chars)
        java_obj.set("md5Encode16", Function::new(ctx.clone(), |val: Value| -> String {
            let s = value_to_string_js(&val);
            let full = format!("{:x}", md5::compute(s.as_bytes()));
            if full.len() >= 24 {
                full[8..24].to_string()
            } else {
                full
            }
        })?)?;
        
        // java.encodeURI(val) / java.decodeURI(val)
        java_obj.set("encodeURI", Function::new(ctx.clone(), |val: Value| -> String {
            let s = value_to_string_js(&val);
            urlencoding::encode(&s).to_string()
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
        
        // java.timeFormat(timestamp) - Format timestamp to date string
        java_obj.set("timeFormat", Function::new(ctx.clone(), |time: i64| -> String {
            use chrono::{Utc, TimeZone};
            Utc.timestamp_opt(time / 1000, 0)
                .single()
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                .unwrap_or_default()
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

        // java.aesBase64DecodeToString
        java_obj.set("aesBase64DecodeToString", java_obj.get::<_, Function>("aesDecodeToString")?)?;
        // java.aesBase64EncodeToString
        java_obj.set("aesBase64EncodeToString", java_obj.get::<_, Function>("aesEncodeToString")?)?;

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
