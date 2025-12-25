//! JS Rule Static Analyzer - Convert simple JS patterns to native Rust execution
//!
//! This module analyzes JavaScript rule code to identify patterns that can be
//! executed natively in Rust, avoiding the need for QuickJS execution.

use crate::engine::preprocessor::NativeApi;
use regex::Regex;
use std::collections::HashMap;

/// Analysis result for JS code
#[derive(Debug, Clone)]
pub enum AnalysisResult {
    /// Can be executed entirely in Rust
    Native(NativeExecution),
    /// Chain of native operations
    NativeChain(Vec<NativeExecution>),
    /// Must use JS execution
    RequiresJs(String),
}

/// Native execution instruction
#[derive(Debug, Clone)]
pub struct NativeExecution {
    /// The API to call
    pub api: NativeApi,
    /// Arguments (can be values or variable references)
    pub args: Vec<ExprValue>,
}

/// Expression value types
#[derive(Debug, Clone)]
pub enum ExprValue {
    /// Literal string value
    Literal(String),
    /// Variable reference (e.g., "result", "key")
    Variable(String),
    /// Special: current content/result
    CurrentContent,
}

/// Pattern definition with regex and converter
struct JsPattern {
    regex: Regex,
    converter: Box<dyn Fn(&regex::Captures) -> Option<NativeExecution> + Send + Sync>,
}

/// Static analyzer for JavaScript rules
pub struct JsPatternAnalyzer {
    patterns: Vec<JsPattern>,
}

impl Default for JsPatternAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl JsPatternAnalyzer {
    /// Create a new analyzer with built-in patterns
    pub fn new() -> Self {
        let mut patterns = Vec::new();
        
        // === Encoding patterns ===
        
        // java.base64Encode(variable) or java.base64Encode("literal")
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.base64Encode\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::Base64Encode,
                    args: vec![parse_arg(arg)],
                })
            }),
        });
        
        // java.base64Decode(variable)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.base64Decode\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::Base64Decode,
                    args: vec![parse_arg(arg)],
                })
            }),
        });
        
        // java.md5Encode(variable)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.md5Encode\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::Md5Encode,
                    args: vec![parse_arg(arg)],
                })
            }),
        });
        
        // java.encodeURI(variable)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.encodeURI\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::EncodeUri,
                    args: vec![parse_arg(arg)],
                })
            }),
        });
        
        // java.hexEncodeToString(variable)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.hexEncodeToString\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::HexEncode,
                    args: vec![parse_arg(arg)],
                })
            }),
        });
        
        // java.hexDecodeToString(variable)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.hexDecodeToString\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::HexDecode,
                    args: vec![parse_arg(arg)],
                })
            }),
        });
        
        // java.randomUUID()
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.randomUUID\(\)$"#).unwrap(),
            converter: Box::new(|_caps| {
                Some(NativeExecution {
                    api: NativeApi::RandomUuid,
                    args: vec![],
                })
            }),
        });
        
        // java.timeFormat(timestamp)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.timeFormat\(([^)]*)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1).map(|m| m.as_str().trim()).unwrap_or("");
                Some(NativeExecution {
                    api: NativeApi::TimeFormat(None),
                    args: vec![if arg.is_empty() { ExprValue::Literal(String::new()) } else { parse_arg(arg) }],
                })
            }),
        });
        
        // === String operations ===
        
        // result.trim()
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.trim\(\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                Some(NativeExecution {
                    api: NativeApi::StringTrim,
                    args: vec![ExprValue::Variable(var.to_string())],
                })
            }),
        });
        
        // result.replace(/pattern/g, "replacement")
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.replace\(/(.+?)/g?\s*,\s*["']([^"']*)["']\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                let pattern = caps.get(2)?.as_str();
                let replacement = caps.get(3)?.as_str();
                let global = caps.get(0)?.as_str().contains("/g,") || caps.get(0)?.as_str().contains("/g ");
                Some(NativeExecution {
                    api: NativeApi::StringReplace {
                        pattern: pattern.to_string(),
                        replacement: replacement.to_string(),
                        is_regex: true,
                        global,
                    },
                    args: vec![ExprValue::Variable(var.to_string())],
                })
            }),
        });
        
        // result.replace("literal", "replacement")
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.replace\(["']([^"']+)["']\s*,\s*["']([^"']*)["']\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                let pattern = caps.get(2)?.as_str();
                let replacement = caps.get(3)?.as_str();
                Some(NativeExecution {
                    api: NativeApi::StringReplace {
                        pattern: pattern.to_string(),
                        replacement: replacement.to_string(),
                        is_regex: false,
                        global: true,
                    },
                    args: vec![ExprValue::Variable(var.to_string())],
                })
            }),
        });
        
        // result.split("delimiter")
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.split\(["']([^"']*)["']\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                let delimiter = caps.get(2)?.as_str();
                Some(NativeExecution {
                    api: NativeApi::StringSplit {
                        delimiter: delimiter.to_string(),
                    },
                    args: vec![ExprValue::Variable(var.to_string())],
                })
            }),
        });
        
        // result.substring(start, end)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.substring\((\d+)(?:\s*,\s*(\d+))?\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                let start: i32 = caps.get(2)?.as_str().parse().ok()?;
                let end: Option<i32> = caps.get(3).and_then(|m| m.as_str().parse().ok());
                Some(NativeExecution {
                    api: NativeApi::StringSubstring { start, end },
                    args: vec![ExprValue::Variable(var.to_string())],
                })
            }),
        });
        
        // === HTTP patterns ===
        
        // java.ajax(url)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.ajax\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let url_arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::HttpGet { 
                        url: extract_string_value(url_arg), 
                        headers: HashMap::new() 
                    },
                    args: vec![parse_arg(url_arg)],
                })
            }),
        });
        
        // java.connect(url)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.connect\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let url_arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::HttpGet { 
                        url: extract_string_value(url_arg), 
                        headers: HashMap::new() 
                    },
                    args: vec![parse_arg(url_arg)],
                })
            }),
        });
        
        // === JSON patterns ===
        
        // java.getString(path)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.getString\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let path = caps.get(1)?.as_str().trim();
                let path = path.trim_matches('"').trim_matches('\'');
                Some(NativeExecution {
                    api: NativeApi::JsonPath { path: path.to_string() },
                    args: vec![ExprValue::CurrentContent],
                })
            }),
        });
        
        // JSON.parse(result)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^JSON\.parse\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::JsonParse,
                    args: vec![parse_arg(arg)],
                })
            }),
        });
        
        // JSON.stringify(obj)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^JSON\.stringify\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::JsonStringify,
                    args: vec![parse_arg(arg)],
                })
            }),
        });
        
        Self { patterns }
    }
    
    /// Analyze JS code and return execution plan
    pub fn analyze(&self, js_code: &str) -> AnalysisResult {
        let code = js_code.trim();
        
        // Skip @js: prefix
        let code = code.strip_prefix("@js:").unwrap_or(code);
        // Skip <js> tags
        let code = code.strip_prefix("<js>").and_then(|s| s.strip_suffix("</js>")).unwrap_or(code);
        let code = code.trim();
        
        // Try single pattern match
        if let Some(exec) = self.try_single_pattern(code) {
            return AnalysisResult::Native(exec);
        }
        
        // Try chain analysis (e.g., result.trim().replace(...))
        if let Some(chain) = self.try_chain_analysis(code) {
            return AnalysisResult::NativeChain(chain);
        }
        
        // Fallback to JS execution
        AnalysisResult::RequiresJs(code.to_string())
    }
    
    /// Try to match a single pattern
    fn try_single_pattern(&self, code: &str) -> Option<NativeExecution> {
        for pattern in &self.patterns {
            if let Some(caps) = pattern.regex.captures(code) {
                if let Some(exec) = (pattern.converter)(&caps) {
                    return Some(exec);
                }
            }
        }
        None
    }
    
    /// Try to analyze a method chain
    fn try_chain_analysis(&self, code: &str) -> Option<Vec<NativeExecution>> {
        // Simple chain detection: split by ).
        // This is a basic implementation; complex chains may still need JS
        
        // Check for common chain patterns like: result.trim().replace(...)
        let parts: Vec<&str> = code.split(").").collect();
        if parts.len() < 2 {
            return None;
        }
        
        // Reconstruct each call and analyze
        let mut chain = Vec::new();
        let mut current_var = None;
        
        for (i, part) in parts.iter().enumerate() {
            let call = if i == parts.len() - 1 {
                part.to_string()
            } else {
                format!("{})", part)
            };
            
            // For first call, extract variable
            if i == 0 {
                if let Some(dot_pos) = call.find('.') {
                    current_var = Some(call[..dot_pos].to_string());
                }
            }
            
            // Try to match this segment
            let to_analyze = if let Some(ref var) = current_var {
                if !call.starts_with(var) {
                    format!("{}.{}", var, call)
                } else {
                    call.clone()
                }
            } else {
                call.clone()
            };
            
            if let Some(exec) = self.try_single_pattern(&to_analyze) {
                chain.push(exec);
            } else {
                // If any part fails, the whole chain fails
                return None;
            }
        }
        
        if chain.is_empty() {
            None
        } else {
            Some(chain)
        }
    }
    
    /// Check if code likely contains complex JS that needs full execution
    pub fn is_complex_js(&self, code: &str) -> bool {
        // Indicators of complex JS that can't be statically analyzed
        let complex_indicators = [
            "function", "if(", "if (", "for(", "for (", "while(",
            "=>{", "=> {", "new ", "class ", "try{", "try {",
            "catch(", "async ", "await ", "Promise", ".then(",
            "eval(", "Function(",
        ];
        
        let code_lower = code.to_lowercase();
        complex_indicators.iter().any(|&indicator| code_lower.contains(indicator))
    }
}

/// Parse argument to ExprValue
fn parse_arg(arg: &str) -> ExprValue {
    let arg = arg.trim();
    
    // String literal
    if (arg.starts_with('"') && arg.ends_with('"')) || 
       (arg.starts_with('\'') && arg.ends_with('\'')) {
        ExprValue::Literal(arg[1..arg.len()-1].to_string())
    }
    // Special keywords
    else if arg == "result" || arg == "content" || arg == "src" {
        ExprValue::CurrentContent
    }
    // Variable reference
    else {
        ExprValue::Variable(arg.to_string())
    }
}

/// Extract string value from quoted or unquoted arg
fn extract_string_value(arg: &str) -> String {
    let arg = arg.trim();
    if (arg.starts_with('"') && arg.ends_with('"')) || 
       (arg.starts_with('\'') && arg.ends_with('\'')) {
        arg[1..arg.len()-1].to_string()
    } else {
        arg.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    fn analyzer() -> JsPatternAnalyzer {
        JsPatternAnalyzer::new()
    }
    
    #[test]
    fn test_base64_encode() {
        let result = analyzer().analyze("java.base64Encode(result)");
        match result {
            AnalysisResult::Native(exec) => {
                assert_eq!(exec.api, NativeApi::Base64Encode);
            }
            _ => panic!("Expected Native result"),
        }
    }
    
    #[test]
    fn test_base64_decode() {
        let result = analyzer().analyze("java.base64Decode(key)");
        match result {
            AnalysisResult::Native(exec) => {
                assert_eq!(exec.api, NativeApi::Base64Decode);
            }
            _ => panic!("Expected Native result"),
        }
    }
    
    #[test]
    fn test_md5_encode() {
        let result = analyzer().analyze("java.md5Encode(content)");
        match result {
            AnalysisResult::Native(exec) => {
                assert_eq!(exec.api, NativeApi::Md5Encode);
            }
            _ => panic!("Expected Native result"),
        }
    }
    
    #[test]
    fn test_random_uuid() {
        let result = analyzer().analyze("java.randomUUID()");
        match result {
            AnalysisResult::Native(exec) => {
                assert_eq!(exec.api, NativeApi::RandomUuid);
            }
            _ => panic!("Expected Native result"),
        }
    }
    
    #[test]
    fn test_string_trim() {
        let result = analyzer().analyze("result.trim()");
        match result {
            AnalysisResult::Native(exec) => {
                assert_eq!(exec.api, NativeApi::StringTrim);
            }
            _ => panic!("Expected Native result"),
        }
    }
    
    #[test]
    fn test_string_replace_literal() {
        let result = analyzer().analyze(r#"result.replace("old", "new")"#);
        match result {
            AnalysisResult::Native(exec) => {
                match exec.api {
                    NativeApi::StringReplace { pattern, replacement, is_regex, .. } => {
                        assert_eq!(pattern, "old");
                        assert_eq!(replacement, "new");
                        assert!(!is_regex);
                    }
                    _ => panic!("Expected StringReplace API"),
                }
            }
            _ => panic!("Expected Native result"),
        }
    }
    
    #[test]
    fn test_string_replace_regex() {
        let result = analyzer().analyze(r#"result.replace(/\s+/g, "")"#);
        match result {
            AnalysisResult::Native(exec) => {
                match exec.api {
                    NativeApi::StringReplace { pattern, is_regex, global, .. } => {
                        assert_eq!(pattern, r"\s+");
                        assert!(is_regex);
                        assert!(global);
                    }
                    _ => panic!("Expected StringReplace API"),
                }
            }
            _ => panic!("Expected Native result"),
        }
    }
    
    #[test]
    fn test_json_parse() {
        let result = analyzer().analyze("JSON.parse(result)");
        match result {
            AnalysisResult::Native(exec) => {
                assert_eq!(exec.api, NativeApi::JsonParse);
            }
            _ => panic!("Expected Native result"),
        }
    }
    
    #[test]
    fn test_js_prefix() {
        let result = analyzer().analyze("@js:java.base64Encode(result)");
        match result {
            AnalysisResult::Native(exec) => {
                assert_eq!(exec.api, NativeApi::Base64Encode);
            }
            _ => panic!("Expected Native result"),
        }
    }
    
    #[test]
    fn test_complex_js_detection() {
        let analyzer = analyzer();
        assert!(analyzer.is_complex_js("function test() { return 1; }"));
        assert!(analyzer.is_complex_js("if (x > 0) { return x; }"));
        assert!(analyzer.is_complex_js("async function fetch() {}"));
        assert!(!analyzer.is_complex_js("java.base64Encode(result)"));
    }
    
    #[test]
    fn test_requires_js() {
        let result = analyzer().analyze("function() { return result * 2; }");
        match result {
            AnalysisResult::RequiresJs(_) => {}
            _ => panic!("Expected RequiresJs result"),
        }
    }
}
