//! JavaScript Executor using rquickjs (QuickJS)
//!
//! Provides ES2023 JavaScript execution with custom utils.* API

use anyhow::Result;
use rquickjs::{Runtime, Context, Value, Object, Function, Ctx};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Cache for JavaScript context data
pub type JsCache = Arc<Mutex<HashMap<String, String>>>;

/// JavaScript executor using QuickJS engine
pub struct JsExecutor {
    runtime: Runtime,
    context: Context,
    cache: JsCache,
    base_url: String,
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
        })
    }
    
    /// Set base URL for relative URL resolution
    pub fn set_base_url(&mut self, url: &str) {
        self.base_url = url.to_string();
    }
    
    /// Evaluate JavaScript code and return result as string
    pub fn eval(&self, code: &str) -> Result<String> {
        self.context.with(|ctx| {
            // Register utils object
            self.register_utils(&ctx)?;
            
            // Evaluate code
            let result: Value = ctx.eval(code)?;
            
            // Convert to string
            value_to_string(&ctx, result)
        })
    }
    
    /// Evaluate with context variables
    pub fn eval_with_context(&self, code: &str, vars: &HashMap<String, String>) -> Result<String> {
        let base_url = self.base_url.clone();
        
        self.context.with(|ctx| {
            // Register utils object
            self.register_utils(&ctx)?;
            
            // Set context variables
            let globals = ctx.globals();
            for (key, value) in vars {
                globals.set(key.as_str(), value.as_str())?;
            }
            
            // Set baseUrl
            globals.set("baseUrl", base_url.as_str())?;
            
            // Evaluate code
            let result: Value = ctx.eval(code)?;
            
            value_to_string(&ctx, result)
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
}

/// Ensure bytes array is exactly 16 bytes (for AES-128)
fn ensure_16_bytes(input: &[u8]) -> [u8; 16] {
    let mut result = [0u8; 16];
    let copy_len = input.len().min(16);
    result[..copy_len].copy_from_slice(&input[..copy_len]);
    result
}
