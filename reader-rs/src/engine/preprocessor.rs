//! Source Preprocessor - Pre-analyze book source rules for efficient execution
//!
//! This module preprocesses book source rules at load time to:
//! 1. Parse {{...}} template expressions
//! 2. Identify java.xxx() calls that can be executed natively in Rust
//! 3. Generate precompiled rule structures for faster runtime execution
//!
//! ## Template Expression Types
//! - `{{key}}` - Variable substitution
//! - `{{page}}` - Page number variable
//! - `{{java.base64Encode(key)}}` - Native API call (can be Rust-executed)
//! - `{{(page-1)*20}}` - JS expression (requires JS engine)

use regex::Regex;
use std::collections::HashMap;
use once_cell::sync::Lazy;

/// Precompiled regex patterns for template parsing
static TEMPLATE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\{\{(.+?)\}\}").unwrap()
});

/// Regex for java.xxx() function calls
static JAVA_CALL_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^java\.(\w+)\s*\((.*)?\)$").unwrap()
});

/// Native API that can be executed directly in Rust
#[derive(Debug, Clone, PartialEq)]
pub enum NativeApi {
    // Encoding
    Base64Encode,
    Base64Decode,
    Base64DecodeWithFlags(i32),
    Md5Encode,
    Md5Encode16,
    EncodeUri,
    EncodeUriWithEnc(String),
    Utf8ToGbk,
    HtmlFormat,
    
    // Cookie
    GetCookie { url: String, key: Option<String> },
    
    // Crypto - AES
    AesEncode { transformation: String, iv: String },
    AesDecode { transformation: String, iv: String },
    AesEncodeArgsBase64 { mode: String, padding: String },
    AesDecodeArgsBase64 { mode: String, padding: String },
    
    // Crypto - DES
    DesEncode { transformation: String, iv: String },
    DesDecode { transformation: String, iv: String },
    
    // Crypto - 3DES (Triple DES / DESede)
    TripleDesDecodeStr { mode: String, padding: String },
    TripleDesDecodeArgsBase64 { mode: String, padding: String },
    TripleDesEncodeBase64 { mode: String, padding: String },
    TripleDesEncodeArgsBase64 { mode: String, padding: String },
    
    // Time
    TimeFormat(Option<String>),
    TimeFormatUtc { format: String, offset_hours: i32 },
    
    // File
    DeleteFile,
    
    // Hash
    DigestHex(String),  // algorithm
    
    // Random
    RandomUuid,
    
    // Unknown - must fallback to JS
    Unknown(String),
}

/// Template expression types
#[derive(Debug, Clone)]
pub enum TemplateExpr {
    /// Literal text, no substitution needed
    Literal(String),
    
    /// Simple variable: {{key}}, {{page}}
    Variable(String),
    
    /// Native API call: {{java.base64Encode(key)}}
    NativeCall {
        api: NativeApi,
        args: Vec<Box<TemplateExpr>>,
    },
    
    /// JS expression that must be evaluated by JS engine
    JsExpr(String),
}

/// Preprocessed URL with parsed template expressions
#[derive(Debug, Clone)]
pub struct PreprocessedUrl {
    /// Original URL string
    pub original: String,
    /// Parsed template parts
    pub parts: Vec<TemplateExpr>,
    /// URL options (method, headers, etc.)
    pub options: Option<UrlOptions>,
}

/// URL request options
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct UrlOptions {
    pub method: Option<String>,
    pub charset: Option<String>,
    pub body: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub web_view: bool,
    pub js: Option<String>,
    pub proxy: Option<String>,
    pub retry: u32,
}

/// Rule type identified during preprocessing
#[derive(Debug, Clone, PartialEq)]
pub enum PreprocessedRuleType {
    Css,
    XPath,
    JsonPath,
    JsoupDefault,
    Regex,
    JavaScript,
}

/// Preprocessed rule with steps
#[derive(Debug, Clone)]
pub struct PreprocessedRule {
    /// Original rule string
    pub original: String,
    /// Detected rule type
    pub rule_type: PreprocessedRuleType,
    /// Rule body (without prefix)
    pub body: String,
    /// Regex replacement suffix if present
    pub regex_suffix: Option<RegexSuffix>,
    /// JS post-processing if present
    pub js_post: Option<String>,
    /// Put variables to store
    pub put_vars: HashMap<String, String>,
}

/// Regex replacement suffix
#[derive(Debug, Clone)]
pub struct RegexSuffix {
    pub pattern: String,
    pub replacement: String,
    pub first_only: bool,
}

/// Source Preprocessor - main entry point
pub struct SourcePreprocessor {
    /// Known native APIs
    native_apis: HashMap<String, fn(&str) -> NativeApi>,
}

impl Default for SourcePreprocessor {
    fn default() -> Self {
        Self::new()
    }
}

impl SourcePreprocessor {
    /// Create a new preprocessor
    pub fn new() -> Self {
        let mut native_apis: HashMap<String, fn(&str) -> NativeApi> = HashMap::new();
        
        // Register known native APIs
        native_apis.insert("base64Encode".to_string(), |_| NativeApi::Base64Encode);
        native_apis.insert("base64Decode".to_string(), |_| NativeApi::Base64Decode);
        native_apis.insert("md5Encode".to_string(), |_| NativeApi::Md5Encode);
        native_apis.insert("md5Encode16".to_string(), |_| NativeApi::Md5Encode16);
        native_apis.insert("encodeURI".to_string(), |_| NativeApi::EncodeUri);
        native_apis.insert("utf8ToGbk".to_string(), |_| NativeApi::Utf8ToGbk);
        native_apis.insert("htmlFormat".to_string(), |_| NativeApi::HtmlFormat);
        native_apis.insert("randomUUID".to_string(), |_| NativeApi::RandomUuid);
        native_apis.insert("timeFormat".to_string(), |_| NativeApi::TimeFormat(None));
        
        Self { native_apis }
    }
    
    /// Preprocess a URL string
    /// 
    /// Input: "https://example.com/s?q={{java.base64Encode(key)}}&p={{page}}"
    /// Output: PreprocessedUrl with parsed parts
    pub fn preprocess_url(&self, url: &str) -> PreprocessedUrl {
        // Check for URL options (comma-separated JSON)
        let (url_part, options) = self.parse_url_options(url);
        
        // Parse template expressions
        let parts = self.parse_template(&url_part);
        
        PreprocessedUrl {
            original: url.to_string(),
            parts,
            options,
        }
    }
    
    /// Preprocess a rule string
    pub fn preprocess_rule(&self, rule: &str) -> PreprocessedRule {
        let rule = rule.trim();
        
        // Extract @put:{...} if present
        let (rule, put_vars) = self.extract_put_vars(rule);
        
        // Detect rule type
        let (rule_type, body) = self.detect_rule_type(&rule);
        
        // Extract regex suffix if present
        let (body, regex_suffix) = self.extract_regex_suffix(&body);
        
        // Extract JS post-processing if present
        let (body, js_post) = self.extract_js_post(&body);
        
        PreprocessedRule {
            original: rule.to_string(),
            rule_type,
            body,
            regex_suffix,
            js_post,
            put_vars,
        }
    }
    
    /// Parse URL options from "url,{options}" format
    fn parse_url_options(&self, url: &str) -> (String, Option<UrlOptions>) {
        // Find the comma that separates URL from options
        // Be careful not to split on commas inside the options JSON
        if let Some(comma_pos) = url.find(",{") {
            let url_part = url[..comma_pos].to_string();
            let options_str = &url[comma_pos + 1..];
            
            // Try to parse as JSON
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(options_str) {
                let options = UrlOptions {
                    method: json.get("method").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    charset: json.get("charset").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    body: json.get("body").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    headers: json.get("headers").and_then(|v| {
                        v.as_object().map(|obj| {
                            obj.iter()
                                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                                .collect()
                        })
                    }),
                    web_view: json.get("webView").and_then(|v| v.as_bool()).unwrap_or(false),
                    js: json.get("js").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    proxy: json.get("proxy").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    retry: json.get("retry").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                };
                return (url_part, Some(options));
            }
        }
        
        (url.to_string(), None)
    }
    
    /// Parse template expressions from a string
    /// Parse template expressions from a string
    pub fn parse_template(&self, text: &str) -> Vec<TemplateExpr> {
        let mut parts = Vec::new();
        let mut last_end = 0;
        
        for cap in TEMPLATE_REGEX.captures_iter(text) {
            let full_match = cap.get(0).unwrap();
            let expr_content = &cap[1];
            
            // Add literal part before this match
            if full_match.start() > last_end {
                parts.push(TemplateExpr::Literal(text[last_end..full_match.start()].to_string()));
            }
            
            // Parse the expression
            parts.push(self.parse_template_expr(expr_content));
            
            last_end = full_match.end();
        }
        
        // Add remaining literal
        if last_end < text.len() {
            parts.push(TemplateExpr::Literal(text[last_end..].to_string()));
        }
        
        parts
    }
    
    /// Parse a single template expression
    fn parse_template_expr(&self, expr: &str) -> TemplateExpr {
        let expr = expr.trim();
        
        // Check for simple variables (alphanumeric + underscore)
        // This includes key, page, searchPage, bid, result, etc.
        if expr.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '.') {
            // Note: identifiers with dots (e.g. book.name) are also treated as variables
            // unless they match java.xxx pattern which is handled below
            if !expr.starts_with("java.") {
                return TemplateExpr::Variable(expr.to_string());
            }
        }
        
        // Check for java.xxx() calls
        if let Some(caps) = JAVA_CALL_REGEX.captures(expr) {
            let method_name = &caps[1];
            let args_str = caps.get(2).map(|m| m.as_str()).unwrap_or("");
            
            // Check if this is a known native API
            if let Some(api_factory) = self.native_apis.get(method_name) {
                let api = api_factory(args_str);
                let args = self.parse_args(args_str);
                return TemplateExpr::NativeCall {
                    api,
                    args,
                };
            }
            
            // Unknown java.xxx() call - check common ones
            if method_name == "getCookie" {
                let args = self.parse_args(args_str);
                let url = args.get(0).map(|a| self.extract_string_literal(a)).unwrap_or_default();
                let key = args.get(1).map(|a| {
                    let s = self.extract_string_literal(a);
                    if s.is_empty() || s == "null" { None } else { Some(s) }
                }).flatten();
                
                return TemplateExpr::NativeCall {
                    api: NativeApi::GetCookie { url, key },
                    args: vec![],
                };
            }
            
            // Fallback to unknown
            return TemplateExpr::NativeCall {
                api: NativeApi::Unknown(method_name.to_string()),
                args: self.parse_args(args_str),
            };
        }
        
        // Fallback to JS expression
        TemplateExpr::JsExpr(expr.to_string())
    }
    
    /// Parse function arguments
    fn parse_args(&self, args_str: &str) -> Vec<Box<TemplateExpr>> {
        if args_str.trim().is_empty() {
            return vec![];
        }
        
        // Simple split by comma (doesn't handle nested function calls well)
        // For complex cases, we fall back to treating the whole thing as an expression
        args_str.split(',')
            .map(|arg| {
                let arg = arg.trim();
                Box::new(if arg.starts_with('"') || arg.starts_with('\'') {
                    TemplateExpr::Literal(self.extract_string_literal(&TemplateExpr::Literal(arg.to_string())))
                } else if arg == "key" || arg == "page" {
                    TemplateExpr::Variable(arg.to_string())
                } else {
                    TemplateExpr::JsExpr(arg.to_string())
                })
            })
            .collect()
    }
    
    /// Extract string literal value
    fn extract_string_literal(&self, expr: &TemplateExpr) -> String {
        match expr {
            TemplateExpr::Literal(s) => {
                s.trim_matches(|c| c == '"' || c == '\'').to_string()
            }
            _ => String::new(),
        }
    }
    
    /// Extract @put:{...} variables
    fn extract_put_vars(&self, rule: &str) -> (String, HashMap<String, String>) {
        let mut vars = HashMap::new();
        let mut result = rule.to_string();
        
        // Pattern: @put:{...}
        let put_regex = Regex::new(r"@put:\{([^}]+)\}").unwrap();
        
        for cap in put_regex.captures_iter(rule) {
            let json_content = &cap[1];
            
            // Try to parse as JSON
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&format!("{{{}}}", json_content)) {
                if let Some(obj) = json.as_object() {
                    for (k, v) in obj {
                        vars.insert(k.clone(), v.as_str().unwrap_or(&v.to_string()).to_string());
                    }
                }
            }
            
            // Remove from result
            result = result.replace(cap.get(0).unwrap().as_str(), "");
        }
        
        (result.trim().to_string(), vars)
    }
    
    /// Detect rule type from prefix
    fn detect_rule_type(&self, rule: &str) -> (PreprocessedRuleType, String) {
        let rule = rule.trim();
        let rule_lower = rule.to_lowercase();
        
        // CSS Rule
        if rule_lower.starts_with("@css:") {
             (PreprocessedRuleType::Css, rule[5..].to_string())
        } else if rule_lower.starts_with("css:") {
             (PreprocessedRuleType::Css, rule[4..].to_string())
        } else if rule_lower.starts_with("css#") || rule_lower.starts_with("css.") {
             (PreprocessedRuleType::Css, rule[3..].to_string())
        }
        
        // XPath Rule
        else if rule_lower.starts_with("@xpath:") {
             (PreprocessedRuleType::XPath, rule[7..].to_string())
        } else if rule_lower.starts_with("xpath:") {
             (PreprocessedRuleType::XPath, rule[6..].to_string())
        } else if rule.starts_with("//") {
             (PreprocessedRuleType::XPath, rule.to_string())
        } 
        
        // JsonPath Rule
        else if rule_lower.starts_with("@json:") {
             (PreprocessedRuleType::JsonPath, rule[6..].to_string())
        } else if rule_lower.starts_with("json:") {
             (PreprocessedRuleType::JsonPath, rule[5..].to_string())
        } else if rule.starts_with("$.") || rule.starts_with("$[") {
             (PreprocessedRuleType::JsonPath, rule.to_string())
        }
        
        // JS Rule
        else if rule_lower.starts_with("@js:") {
            (PreprocessedRuleType::JavaScript, rule[4..].to_string())
        } else if rule.starts_with("<js>") && rule.ends_with("</js>") {
            (PreprocessedRuleType::JavaScript, rule[4..rule.len()-5].to_string())
        }
        
        // Regex Rule
        else if rule.starts_with(":") || rule.starts_with("##") {
            (PreprocessedRuleType::Regex, rule.to_string())
        }
        
        // Default (Jsoup/Css)
        else {
             // Treat default as Css for better compatibility with Jsoup selectors
            (PreprocessedRuleType::Css, rule.to_string())
        }
    }
    
    /// Extract regex suffix ##pattern##replacement
    fn extract_regex_suffix(&self, rule: &str) -> (String, Option<RegexSuffix>) {
        // Don't process if it's a pure regex rule
        if rule.starts_with("##") || rule.starts_with(":") {
            return (rule.to_string(), None);
        }
        
        // Find ## that's not at the start
        if let Some(pos) = rule.find("##") {
            if pos > 0 {
                let base = rule[..pos].to_string();
                let suffix = &rule[pos + 2..];
                
                // Split by ##
                let parts: Vec<&str> = suffix.split("##").collect();
                let pattern = parts.first().unwrap_or(&"").to_string();
                let replacement = parts.get(1).unwrap_or(&"").to_string();
                let first_only = parts.len() >= 4; // ##p##r###
                
                return (base, Some(RegexSuffix {
                    pattern,
                    replacement,
                    first_only,
                }));
            }
        }
        
        (rule.to_string(), None)
    }
    
    /// Extract JS post-processing <js>...</js>
    fn extract_js_post(&self, rule: &str) -> (String, Option<String>) {
        if let Some(start) = rule.find("<js>") {
            if let Some(end) = rule.find("</js>") {
                let base = rule[..start].trim().to_string();
                let js_code = rule[start + 4..end].to_string();
                return (base, Some(js_code));
            }
        }
        
        (rule.to_string(), None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_preprocess_simple_url() {
        let pp = SourcePreprocessor::new();
        let result = pp.preprocess_url("https://example.com/search?q={{key}}&page={{page}}");
        
        // URL: literal + key + literal + page = 4 parts (no trailing literal)
        assert_eq!(result.parts.len(), 4);
        assert!(matches!(&result.parts[0], TemplateExpr::Literal(s) if s == "https://example.com/search?q="));
        assert!(matches!(&result.parts[1], TemplateExpr::Variable(s) if s == "key"));
        assert!(matches!(&result.parts[2], TemplateExpr::Literal(s) if s == "&page="));
        assert!(matches!(&result.parts[3], TemplateExpr::Variable(s) if s == "page"));
    }
    
    #[test]
    fn test_preprocess_url_with_java_call() {
        let pp = SourcePreprocessor::new();
        let result = pp.preprocess_url("https://example.com/s?q={{java.base64Encode(key)}}");
        
        assert_eq!(result.parts.len(), 2);
        assert!(matches!(
            &result.parts[1],
            TemplateExpr::NativeCall { api: NativeApi::Base64Encode, .. }
        ));
    }
    
    #[test]
    fn test_preprocess_url_with_options() {
        let pp = SourcePreprocessor::new();
        let result = pp.preprocess_url(r#"https://example.com,{"method":"POST","body":"q=test"}"#);
        
        assert!(result.options.is_some());
        let opts = result.options.unwrap();
        assert_eq!(opts.method, Some("POST".to_string()));
        assert_eq!(opts.body, Some("q=test".to_string()));
    }
    
    #[test]
    fn test_preprocess_rule_css() {
        let pp = SourcePreprocessor::new();
        let result = pp.preprocess_rule("@css:div.title");
        
        assert_eq!(result.rule_type, PreprocessedRuleType::Css);
        assert_eq!(result.body, "div.title");
    }
    
    #[test]
    fn test_preprocess_rule_with_regex_suffix() {
        let pp = SourcePreprocessor::new();
        let result = pp.preprocess_rule("$.name##\\d+##ID:");
        
        assert_eq!(result.rule_type, PreprocessedRuleType::JsonPath);
        assert_eq!(result.body, "$.name");
        assert!(result.regex_suffix.is_some());
        let suffix = result.regex_suffix.unwrap();
        assert_eq!(suffix.pattern, "\\d+");
        assert_eq!(suffix.replacement, "ID:");
    }
    
    #[test]
    fn test_preprocess_rule_with_js_post() {
        let pp = SourcePreprocessor::new();
        let result = pp.preprocess_rule("@css:.name<js>result.trim()</js>");
        
        assert_eq!(result.rule_type, PreprocessedRuleType::Css);
        // Body is the base rule after JS extraction
        assert_eq!(result.body, ".name");
        assert_eq!(result.js_post, Some("result.trim()".to_string()));
    }
    
    #[test]
    fn test_extract_put_vars() {
        let pp = SourcePreprocessor::new();
        let (rule, vars) = pp.extract_put_vars(r#"$.data@put:{"token":"abc123"}"#);
        
        assert_eq!(rule, "$.data");
        assert_eq!(vars.get("token"), Some(&"abc123".to_string()));
    }
    
    #[test]
    fn test_get_cookie_detection() {
        let pp = SourcePreprocessor::new();
        let result = pp.preprocess_url(r#"https://example.com?cookie={{java.getCookie("http://site.com", "userid")}}"#);
        
        assert_eq!(result.parts.len(), 2);
        if let TemplateExpr::NativeCall { api, .. } = &result.parts[1] {
            if let NativeApi::GetCookie { url, key } = api {
                assert_eq!(url, "http://site.com");
                assert_eq!(key, &Some("userid".to_string()));
            } else {
                panic!("Expected GetCookie API");
            }
        } else {
            panic!("Expected NativeCall");
        }
    }
}
