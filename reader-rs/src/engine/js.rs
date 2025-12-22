use boa_engine::{Context, Source, JsValue, js_string, NativeFunction, JsString};
use boa_engine::property::Attribute;
use boa_engine::object::ObjectInitializer;
use boa_engine::gc::{Finalize, Trace, Tracer};
use anyhow::Result;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

use boa_engine::object::NativeObject;

// Type alias for the cache
pub type JsCache = Arc<Mutex<HashMap<String, String>>>;

// CacheWrapper for capturing in closures
#[derive(Clone, Debug)]
struct CacheWrapper(JsCache);

impl Finalize for CacheWrapper {}
unsafe impl Trace for CacheWrapper {
    unsafe fn trace(&self, _tracer: &mut Tracer) {
        // No JS objects held within
    }
    unsafe fn trace_non_roots(&self) {}
    fn run_finalizer(&self) {}
}


/// Legado 兼容的 JavaScript 执行引擎
pub struct LegadoJsEngine {
    context: Context,
    http_results: Arc<Mutex<Vec<String>>>,
    cache: JsCache,
}

impl LegadoJsEngine {
    pub fn new(cache: Option<JsCache>) -> Self {
        let http_results = Arc::new(Mutex::new(Vec::new()));
        let cache = cache.unwrap_or_else(|| Arc::new(Mutex::new(HashMap::new())));
        let mut context = Context::default();
        
        // 注册全局函数和对象
        Self::register_globals(&mut context, http_results.clone(), cache.clone());
        
        Self { context, http_results, cache }
    }

    /// 执行 JavaScript 代码获取 URL
    pub fn eval_url(&mut self, code: &str, variables: &[(&str, &str)]) -> Result<String> {
        // 设置变量
        for (name, value) in variables {
            self.set_global(name, value);
        }

        // 执行代码
        let source = Source::from_bytes(code);
        match self.context.eval(source) {
            Ok(result) => Ok(self.js_value_to_string(result)),
            Err(e) => Err(anyhow::anyhow!("JS Error: {}", e.to_string())),
        }
    }

    /// 执行搜索 URL 规则
    pub fn eval_search_url(&mut self, rule: &str, key: &str, page: i32) -> Result<String> {
        let code = if rule.starts_with("@js:") {
            &rule[4..]
        } else {
            rule
        };

        self.set_global("key", key);
        self.set_global("page", &page.to_string());
        
        self.eval_url(code, &[])
    }

    /// 设置全局变量
    pub fn set_global(&mut self, name: &str, value: &str) {
        let js_value = JsValue::from(js_string!(value));
        let _ = self.context.register_global_property(
            js_string!(name),
            js_value,
            Attribute::all()
        );
    }

    /// 设置 source 对象（JSON 格式的书源配置）
    pub fn set_source_json(&mut self, json: &str) {
        // 执行 JS 代码将 JSON 解析为对象
        let code = format!(
            r#"
            var source = {{}}; // Minimal mock
            "#, 
        );
        let source_code = Source::from_bytes(code.as_bytes());
        let _ = self.context.eval(source_code);
        
        // 同时设置 baseUrl 和执行 jsLib
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json) {
            if let Some(url) = parsed.get("bookSourceUrl").and_then(|v| v.as_str()) {
                self.set_global("baseUrl", url);
            }
            // 执行 jsLib
            if let Some(lib) = parsed.get("jsLib").and_then(|v| v.as_str()) {
                if !lib.is_empty() {
                     if let Err(e) = self.context.eval(Source::from_bytes(lib.as_bytes())) {
                         tracing::warn!("Failed to eval jsLib: {}", e);
                     }
                }
            }
        }
    }

    /// 注册全局函数和对象
    fn register_globals(context: &mut Context, _http_results: Arc<Mutex<Vec<String>>>, cache: JsCache) {
        // 注册 buildRequest 函数 - 返回 URL 字符串
        let _ = context.register_global_callable(
            js_string!("buildRequest"),
            1,
            NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                if let Some(url) = args.get(0) {
                    if let Some(s) = url.as_string() {
                        return Ok(JsValue::from(s.clone()));
                    }
                }
                Ok(JsValue::undefined())
            })
        );

        // 注册 t 函数（t2s 别名）
        let _ = context.register_global_callable(
            js_string!("t"),
            1,
            NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                if let Some(arg) = args.get(0) {
                    if let Some(s) = arg.as_string() {
                        return Ok(JsValue::from(s.clone()));
                    }
                }
                Ok(JsValue::undefined())
            })
        );

        // 注册 t2s/s2t (Placeholder)
        let _ = context.register_global_callable(
            js_string!("t2s"), 1,
            NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                if let Some(arg) = args.get(0) { if let Some(s) = arg.as_string() { return Ok(JsValue::from(s.clone())); } }
                Ok(JsValue::undefined())
            })
        );
        let _ = context.register_global_callable(
            JsString::from("s2t"), 1,
            NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                if let Some(arg) = args.get(0) { if let Some(s) = arg.as_string() { return Ok(JsValue::from(s.clone())); } }
                Ok(JsValue::undefined())
            })
        );

        // 注册 java 对象
        let java_obj = ObjectInitializer::new(context)
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    if let Some(arg) = args.get(0) { tracing::debug!("JS java.log: {:?}", arg); }
                    Ok(JsValue::undefined())
                }),
                JsString::from("log"), 1,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    if let Some(msg) = args.get(0) { tracing::debug!("JS java.toast: {:?}", msg); }
                    Ok(JsValue::undefined())
                }),
                JsString::from("toast"), 1,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    if let Some(msg) = args.get(0) { tracing::debug!("JS java.longToast: {:?}", msg); }
                    Ok(JsValue::undefined())
                }),
                JsString::from("longToast"), 1,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    if let Some(url_arg) = args.get(0) {
                        if let Some(url) = url_arg.as_string() {
                            let url_str = url.to_std_string_escaped();
                            tracing::debug!("JS java.ajax: {}", url_str);
                            let client = reqwest::blocking::Client::new();
                            match client.get(&url_str)
                                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
                                .send() 
                            {
                                Ok(resp) => {
                                    if let Ok(text) = resp.text() {
                                        return Ok(JsValue::from(JsString::from(text.as_str())));
                                    }
                                },
                                Err(e) => { tracing::error!("JS java.ajax error: {}", e); }
                            }
                        }
                    }
                    Ok(JsValue::from(JsString::from("")))
                }),
                JsString::from("ajax"), 1,
            )
            .function(
                // Capture cache for get
                {
                    let wrapper = CacheWrapper(cache.clone());
                    unsafe {
                        NativeFunction::from_closure(move |_this, args, ctx| {
                            let cache = &wrapper.0;
                            // get: 从缓存获取值 (parse JSON string to JsValue)
                            if let Some(key_arg) = args.get(0) {
                                if let Some(key) = key_arg.as_string() {
                                    let k = key.to_std_string_escaped();
                                    if let Ok(map) = cache.lock() {
                                         if let Some(val_json) = map.get(&k) {
                                             // Try parse back to JS value
                                             let source = Source::from_bytes(val_json.as_bytes());
                                             if let Ok(val) = ctx.eval(source) {
                                                 return Ok(val);
                                             }
                                             // Fallback to string if parse failed
                                             return Ok(JsValue::from(JsString::from(val_json.as_str())));
                                         }
                                    }
                                }
                            }
                            Ok(JsValue::from(JsString::from("")))
                        })
                    }
                },
                JsString::from("get"), 1,
            )
            .function(
                // Capture cache for put
                {
                    let wrapper = CacheWrapper(cache.clone());
                    unsafe {
                        NativeFunction::from_closure(move |_this, args, ctx| {
                             let cache = &wrapper.0;
                             // put: 存入缓存 (stringify value to JSON string)
                             if args.len() >= 2 {
                                 let key = args.get(0).and_then(|v| v.as_string()).map(|s| s.to_std_string_escaped());
                                 let val_ref = args.get(1);
                                 
                                 if let (Some(k), Some(v)) = (key, val_ref) {
                                          // ... parse_request_config ... fetch_content ...
                                          let val_json = (|| {
                                              let json_obj = ctx.global_object().get(JsString::from("JSON"), ctx).ok()?;
                                              let stringify = json_obj.as_object()?.get(JsString::from("stringify"), ctx).ok()?;
                                              let func = stringify.as_callable()?;
                                              let res = func.call(&JsValue::undefined(), &[v.clone()], ctx).ok()?;
                                              res.as_string().map(|s| s.to_std_string_escaped())
                                          })().unwrap_or_else(|| "null".to_string());
         
                                          if let Ok(mut map) = cache.lock() {
                                              map.insert(k, val_json);
                                          }
                                 }
                             }
                             Ok(JsValue::undefined())
                        })
                    }
                },
                JsString::from("put"), 2,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    // base64Encode
                    if let Some(arg) = args.get(0) {
                        if let Some(s) = arg.as_string() {
                            use std::io::Write;
                            let mut buf = Vec::new();
                            let _ = write!(buf, "{}", s.to_std_string_escaped());
                            let encoded = base64_encode(&buf);
                            return Ok(JsValue::from(JsString::from(encoded.as_str())));
                        }
                    }
                    Ok(JsValue::from(JsString::from("")))
                }),
                JsString::from("base64Encode"), 1,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    // base64Decode
                    if let Some(arg) = args.get(0) {
                        if let Some(s) = arg.as_string() {
                            if let Ok(decoded) = base64_decode(&s.to_std_string_escaped()) {
                                return Ok(JsValue::from(JsString::from(decoded.as_str())));
                            }
                        }
                    }
                    Ok(JsValue::from(JsString::from("")))
                }),
                JsString::from("base64Decode"), 1,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    // md5Encode
                    if let Some(arg) = args.get(0) {
                         if let Some(s) = arg.as_string() {
                             let digest = md5::compute(s.to_std_string_escaped());
                             let hex_str = hex::encode(digest.0);
                             return Ok(JsValue::from(JsString::from(hex_str.as_str())));
                         }
                    }
                    Ok(JsValue::from(JsString::from("")))
                }),
                JsString::from("md5Encode"), 1,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    // md5Encode16
                    if let Some(arg) = args.get(0) {
                         if let Some(s) = arg.as_string() {
                             let digest = md5::compute(s.to_std_string_escaped());
                             let hex_str = hex::encode(digest.0);
                             if hex_str.len() == 32 {
                                 return Ok(JsValue::from(JsString::from(&hex_str[8..24])));
                             }
                             return Ok(JsValue::from(JsString::from(hex_str.as_str())));
                         }
                    }
                    Ok(JsValue::from(JsString::from("")))
                }),
                JsString::from("md5Encode16"), 1,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    // timeFormat
                    if let Some(arg) = args.get(0) {
                        if let Some(timestamp) = arg.as_number() {
                             use chrono::TimeZone;
                             let dt = chrono::Utc.timestamp_millis_opt(timestamp as i64).unwrap();
                             let formatted = dt.format("%Y-%m-%d %H:%M:%S").to_string();
                             return Ok(JsValue::from(JsString::from(formatted.as_str())));
                        }
                    }
                    Ok(JsValue::from(JsString::from("")))
                }),
                JsString::from("timeFormat"), 1,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    // encodeURI
                    if let Some(arg) = args.get(0) {
                        if let Some(s) = arg.as_string() {
                            let encoded = urlencoding::encode(&s.to_std_string_escaped()).to_string();
                            return Ok(JsValue::from(JsString::from(&*encoded)));
                        }
                    }
                     Ok(JsValue::from(js_string!("")))
                }),
                JsString::from("encodeURI"), 1,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    // getString - alias to get for now
                    if let Some(arg) = args.get(0) { tracing::debug!("JS java.getString: {:?}", arg); }
                     // TODO: Actually implement same as get?
                     // java.getString('$.bid') -> implies get the value stored, and it should be string.
                     // For now, let's reuse logic of get, or return stringified?
                     // If stored value is JSON string "123", parsed is number 123. getString should return "123".
                     Ok(JsValue::from(JsString::from("")))
                }),
                JsString::from("getString"), 1,
            )
            .function(
                NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    // hexDecodeToString
                    if let Some(arg) = args.get(0) {
                         if let Some(s) = arg.as_string() {
                             if let Ok(bytes) = hex::decode(s.to_std_string_escaped()) {
                                 if let Ok(utf8) = String::from_utf8(bytes) {
                                     return Ok(JsValue::from(JsString::from(utf8.as_str())));
                                 }
                             }
                         }
                    }
                    Ok(JsValue::from(JsString::from("")))
                }),
                JsString::from("hexDecodeToString"), 1,
            )
            .build();

        let _ = context.register_global_property(
            JsString::from("java"),
            java_obj,
            Attribute::all()
        );
            
        context.register_global_callable(
             JsString::from("log"), 1,
             NativeFunction::from_fn_ptr(|_this, args, _ctx| {
                    if let Some(arg) = args.get(0) { tracing::debug!("JS global log: {:?}", arg); }
                    Ok(JsValue::undefined())
             })
        ).unwrap();
    }

    /// 将 JsValue 转换为字符串
    fn js_value_to_string(&mut self, value: JsValue) -> String {
        if value.is_undefined() || value.is_null() {
            return String::new();
        }
        if let Some(s) = value.as_string() {
            return s.to_std_string_escaped();
        }
        if let Some(i) = value.as_i32() {
            return i.to_string();
        }
        if let Some(f) = value.as_number() {
            return f.to_string();
        }
        if let Some(b) = value.as_boolean() {
            return b.to_string();
        }
        if value.is_object() {
            // handle arrays and objects if needed, for now just simplistic
            return value.display().to_string();
        }
        String::new()
    }
}

// ... existing code ... (Base64 helpers, etc)


impl Default for LegadoJsEngine {
    fn default() -> Self {
        Self::new(None)
    }
}

/// 简单的 Base64 编码
fn base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;
        
        result.push(CHARSET[(b0 >> 2)] as char);
        result.push(CHARSET[((b0 & 0x03) << 4) | (b1 >> 4)] as char);
        
        if chunk.len() > 1 {
            result.push(CHARSET[((b1 & 0x0f) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }
        
        if chunk.len() > 2 {
            result.push(CHARSET[b2 & 0x3f] as char);
        } else {
            result.push('=');
        }
    }
    
    result
}

/// 简单的 Base64 解码
fn base64_decode(data: &str) -> Result<String> {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    
    fn char_to_val(c: char) -> Option<u8> {
        CHARSET.iter().position(|&x| x == c as u8).map(|p| p as u8)
    }
    
    let mut result = Vec::new();
    let chars: Vec<char> = data.chars().filter(|c| *c != '=').collect();
    
    for chunk in chars.chunks(4) {
        if chunk.len() < 2 { break; }
        
        let b0 = char_to_val(chunk[0]).unwrap_or(0);
        let b1 = char_to_val(chunk[1]).unwrap_or(0);
        result.push((b0 << 2) | (b1 >> 4));
        
        if chunk.len() > 2 {
            let b2 = char_to_val(chunk[2]).unwrap_or(0);
            result.push((b1 << 4) | (b2 >> 2));
            
            if chunk.len() > 3 {
                let b3 = char_to_val(chunk[3]).unwrap_or(0);
                result.push((b2 << 6) | b3);
            }
        }
    }
    
    String::from_utf8(result).map_err(|e| anyhow::anyhow!("Base64 decode error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_request() {
        let mut engine = LegadoJsEngine::new(None);
        let result = engine.eval_url("buildRequest('https://example.com/search?key=test')", &[]).unwrap();
        assert_eq!(result, "https://example.com/search?key=test");
    }

    #[test]
    fn test_java_object() {
        let mut engine = LegadoJsEngine::new(None);
        // Test java.log
        let result = engine.eval_url("java.log('test log'); 'success'", &[]);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
        
        // Test java.ajax
        let result_ajax = engine.eval_url("java.ajax('https://example.com')", &[]);
        assert!(result_ajax.is_ok());
    }

    #[test]
    fn test_search_url() {
        let mut engine = LegadoJsEngine::new(None);
        let result = engine.eval_search_url(
            "@js:buildRequest(`https://example.com/search?key=${key}&page=${page}`)",
            "test",
            1
        ).unwrap();
        assert_eq!(result, "https://example.com/search?key=test&page=1");
    }

    #[test]
    fn test_jslib_persistence() {
        let mut engine = LegadoJsEngine::new(None);
        
        // Simulating jsLib loading
        let jslib = "function getSign(k) { return 'sign_' + k; }";
        let _ = engine.context.eval(Source::from_bytes(jslib)).unwrap();
        
        // Simulating rule execution expecting getSign
        let result = engine.eval_url("getSign('test')", &[]);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "sign_test");
    }
}
