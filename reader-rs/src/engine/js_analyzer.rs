//! JS Rule Static Analyzer - Convert simple JS patterns to native Rust execution
//!
//! This module analyzes JavaScript rule code to identify patterns that can be
//! executed natively in Rust, avoiding the need for QuickJS execution.

use crate::engine::preprocessor::NativeApi;
use regex::Regex;
use serde::{Deserialize, Serialize};

use std::sync::OnceLock;

/// Analysis result for JS code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AnalysisResult {
    /// Can be executed entirely in Rust
    Native(NativeExecution),
    /// Chain of native operations
    NativeChain(Vec<NativeExecution>),
    /// Must use JS execution
    RequiresJs(String),
}

/// Native execution instruction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeExecution {
    /// The API to call
    pub api: NativeApi,
    /// Arguments (can be values or variable references)
    pub args: Vec<ExprValue>,
}

/// Expression value types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExprValue {
    /// Literal string value
    Literal(String),
    /// Variable reference (e.g., "result", "key")
    Variable(String),
    /// Special: current content/result
    CurrentContent,
    /// Nested native execution
    NativeCall(Box<NativeExecution>),
}

/// Pattern definition with regex and converter
struct JsPattern {
    regex: Regex,
    converter: Box<dyn Fn(&regex::Captures) -> Option<NativeExecution> + Send + Sync>,
}

/// Static analyzer for JavaScript rules
pub struct JsPatternAnalyzer;

impl Default for JsPatternAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

impl JsPatternAnalyzer {
    /// Create a new analyzer with built-in patterns
    pub fn new() -> Self {
        Self
    }

    fn get_patterns() -> &'static Vec<JsPattern> {
        static PATTERNS: OnceLock<Vec<JsPattern>> = OnceLock::new();
        PATTERNS.get_or_init(Self::init_patterns)
    }

    fn init_patterns() -> Vec<JsPattern> {
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
                    args: vec![if arg.is_empty() {
                        ExprValue::Literal(String::new())
                    } else {
                        parse_arg(arg)
                    }],
                })
            }),
        });

        // java.dateFormat(timestamp, format)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.dateFormat\(([^,]+),\s*(.+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let timestamp = caps.get(1)?.as_str().trim();
                let format_arg = caps.get(2)?.as_str().trim();

                // Extract string literal for format. Static format only supported.
                let format_str = extract_string_value(format_arg);

                Some(NativeExecution {
                    api: NativeApi::TimeFormat(Some(format_str)),
                    args: vec![parse_arg(timestamp)],
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
                let global =
                    caps.get(0)?.as_str().contains("/g,") || caps.get(0)?.as_str().contains("/g ");
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
            regex: Regex::new(r#"^(\w+)\.replace\(["']([^"']+)["']\s*,\s*["']([^"']*)["']\)$"#)
                .unwrap(),
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
                    api: NativeApi::HttpGet,
                    args: vec![parse_arg(url_arg)],
                })
            }),
        });

        // java.post(url, body, headers)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.post\(([^,]+),\s*([^,]+)(?:,\s*(.+))?\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let url = caps.get(1)?.as_str().trim();
                let body = caps.get(2)?.as_str().trim();
                let headers = caps.get(3).map(|m| m.as_str().trim());

                let mut args = vec![parse_arg(url), parse_arg(body)];
                if let Some(h) = headers {
                    args.push(parse_arg(h));
                }

                Some(NativeExecution {
                    api: NativeApi::HttpPost,
                    args,
                })
            }),
        });

        // java.connect(url)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.connect\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let url_arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::HttpGet,
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
                    api: NativeApi::JsonPath,
                    args: vec![
                        ExprValue::CurrentContent,
                        ExprValue::Literal(path.to_string()),
                    ],
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

        // === NEW: native.* patterns (mirror java.* for transpiled sources) ===

        // native.base64Encode(variable)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^native\.base64Encode\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::Base64Encode,
                    args: vec![parse_arg(arg)],
                })
            }),
        });

        // native.base64Decode(variable)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^native\.base64Decode\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::Base64Decode,
                    args: vec![parse_arg(arg)],
                })
            }),
        });

        // native.md5(variable) or native.md5Encode(variable)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^native\.md5(?:Encode)?\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::Md5Encode,
                    args: vec![parse_arg(arg)],
                })
            }),
        });

        // native.encodeUri(variable)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^native\.encodeUri\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::EncodeUri,
                    args: vec![parse_arg(arg)],
                })
            }),
        });

        // native.uuid() or native.randomUUID()
        patterns.push(JsPattern {
            regex: Regex::new(r#"^native\.(?:uuid|randomUUID)\(\)$"#).unwrap(),
            converter: Box::new(|_caps| {
                Some(NativeExecution {
                    api: NativeApi::RandomUuid,
                    args: vec![],
                })
            }),
        });

        // native.httpGet(url) / native.httpPost(url)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^native\.httpGet\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let url_arg = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::HttpGet,
                    args: vec![parse_arg(url_arg)],
                })
            }),
        });

        // === NEW: Array and property access patterns ===

        // result[0] or result[index] - array index access
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\[(\d+)\]$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                let index: i32 = caps.get(2)?.as_str().parse().ok()?;
                Some(NativeExecution {
                    api: NativeApi::StringSubstring {
                        start: index,
                        end: Some(index + 1),
                    },
                    args: vec![ExprValue::Variable(format!(
                        "__array_index__:{}:{}",
                        var, index
                    ))],
                })
            }),
        });

        // result.indexOf("str") - find index of substring
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.indexOf\(['"]([^'"]+)['"]\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                let search = caps.get(2)?.as_str();
                Some(NativeExecution {
                    api: NativeApi::JsonPath,
                    args: vec![
                        ExprValue::Variable(var.to_string()),
                        ExprValue::Literal(format!("__indexOf__:{}:{}", var, search)),
                    ],
                })
            }),
        });

        // result.length - get string/array length
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.length$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                Some(NativeExecution {
                    api: NativeApi::JsonPath,
                    args: vec![
                        ExprValue::Variable(var.to_string()),
                        ExprValue::Literal(format!("__length__:{}", var)),
                    ],
                })
            }),
        });

        // result.toLowerCase() / result.toUpperCase()
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.toLowerCase\(\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                Some(NativeExecution {
                    api: NativeApi::StringReplace {
                        pattern: "__toLowerCase__".to_string(),
                        replacement: String::new(),
                        is_regex: false,
                        global: true,
                    },
                    args: vec![ExprValue::Variable(var.to_string())],
                })
            }),
        });

        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.toUpperCase\(\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                Some(NativeExecution {
                    api: NativeApi::StringReplace {
                        pattern: "__toUpperCase__".to_string(),
                        replacement: String::new(),
                        is_regex: false,
                        global: true,
                    },
                    args: vec![ExprValue::Variable(var.to_string())],
                })
            }),
        });

        // result.startsWith("prefix") / result.endsWith("suffix")
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.startsWith\(['"]([^'"]+)['"]\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                let prefix = caps.get(2)?.as_str();
                Some(NativeExecution {
                    api: NativeApi::JsonPath,
                    args: vec![
                        ExprValue::Variable(var.to_string()),
                        ExprValue::Literal(format!("__startsWith__:{}:{}", var, prefix)),
                    ],
                })
            }),
        });

        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.endsWith\(['"]([^'"]+)['"]\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                let suffix = caps.get(2)?.as_str();
                Some(NativeExecution {
                    api: NativeApi::JsonPath,
                    args: vec![
                        ExprValue::Variable(var.to_string()),
                        ExprValue::Literal(format!("__endsWith__:{}:{}", var, suffix)),
                    ],
                })
            }),
        });

        // result.includes("str") - check if string contains substring
        patterns.push(JsPattern {
            regex: Regex::new(r#"^(\w+)\.includes\(['"]([^'"]+)['"]\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str();
                let search = caps.get(2)?.as_str();
                Some(NativeExecution {
                    api: NativeApi::JsonPath,
                    args: vec![
                        ExprValue::Variable(var.to_string()),
                        ExprValue::Literal(format!("__includes__:{}:{}", var, search)),
                    ],
                })
            }),
        });

        // JSON.parse(var).prop -> JsonPath
        patterns.push(JsPattern {
            regex: Regex::new(r#"^JSON\.parse\(([^)]+)\)\.(.+)$"#).unwrap(),
            converter: Box::new(|caps| {
                let var = caps.get(1)?.as_str().trim();
                let prop = caps.get(2)?.as_str().trim();
                // Convert JS dot notation to JsonPath
                // e.g. "data.list" -> "$.data.list"
                // e.g. "auth.token" -> "$.auth.token"
                let json_path = format!("$.{}", prop);

                Some(NativeExecution {
                    api: NativeApi::JsonPath,
                    args: vec![parse_arg(var), ExprValue::Literal(json_path)],
                })
            }),
        });

        // === KV Storage Patterns ===

        // java.put(key, value)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.put\(([^,]+),\s*([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let key = caps.get(1)?.as_str().trim();
                let value = caps.get(2)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::CacheSet,
                    args: vec![parse_arg(key), parse_arg(value)],
                })
            }),
        });

        // java.get(key)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^java\.get\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let key = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::CacheGet,
                    args: vec![parse_arg(key)],
                })
            }),
        });

        // source.putVariable(key, value)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^source\.putVariable\(([^,]+),\s*([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let key = caps.get(1)?.as_str().trim();
                let value = caps.get(2)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::SourceVarSet,
                    args: vec![parse_arg(key), parse_arg(value)],
                })
            }),
        });

        // source.getVariable(key)
        patterns.push(JsPattern {
            regex: Regex::new(r#"^source\.getVariable\(([^)]+)\)$"#).unwrap(),
            converter: Box::new(|caps| {
                let key = caps.get(1)?.as_str().trim();
                Some(NativeExecution {
                    api: NativeApi::SourceVarGet,
                    args: vec![parse_arg(key)],
                })
            }),
        });

        patterns
    }

    /// Analyze JS code and return execution plan
    pub fn analyze(&self, js_code: &str) -> AnalysisResult {
        let code = js_code.trim();

        // Skip @js: prefix
        let code = code.strip_prefix("@js:").unwrap_or(code);
        // Skip <js> tags
        let code = code
            .strip_prefix("<js>")
            .and_then(|s| s.strip_suffix("</js>"))
            .unwrap_or(code);
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
        for pattern in Self::get_patterns() {
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
            "function",
            "if(",
            "if (",
            "for(",
            "for (",
            "while(",
            "=>{",
            "=> {",
            "new ",
            "class ",
            "try{",
            "try {",
            "catch(",
            "async ",
            "await ",
            "Promise",
            ".then(",
            "eval(",
            "Function(",
        ];

        let code_lower = code.to_lowercase();
        complex_indicators
            .iter()
            .any(|&indicator| code_lower.contains(indicator))
    }
}

/// Parse argument to ExprValue
fn parse_arg(arg: &str) -> ExprValue {
    let arg = arg.trim();

    // String literal
    if (arg.starts_with('"') && arg.ends_with('"'))
        || (arg.starts_with('\'') && arg.ends_with('\''))
    {
        ExprValue::Literal(arg[1..arg.len() - 1].to_string())
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
    if (arg.starts_with('"') && arg.ends_with('"'))
        || (arg.starts_with('\'') && arg.ends_with('\''))
    {
        arg[1..arg.len() - 1].to_string()
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
            AnalysisResult::Native(exec) => match exec.api {
                NativeApi::StringReplace {
                    pattern,
                    replacement,
                    is_regex,
                    ..
                } => {
                    assert_eq!(pattern, "old");
                    assert_eq!(replacement, "new");
                    assert!(!is_regex);
                }
                _ => panic!("Expected StringReplace API"),
            },
            _ => panic!("Expected Native result"),
        }
    }

    #[test]
    fn test_string_replace_regex() {
        let result = analyzer().analyze(r#"result.replace(/\s+/g, "")"#);
        match result {
            AnalysisResult::Native(exec) => match exec.api {
                NativeApi::StringReplace {
                    pattern,
                    is_regex,
                    global,
                    ..
                } => {
                    assert_eq!(pattern, r"\s+");
                    assert!(is_regex);
                    assert!(global);
                }
                _ => panic!("Expected StringReplace API"),
            },
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
    #[test]
    fn test_kv_storage_patterns() {
        let analyzer = JsPatternAnalyzer::new();

        // java.put
        let result = analyzer.analyze("java.put('key', 'value')");
        assert!(matches!(result, AnalysisResult::Native(_)));
        if let AnalysisResult::Native(exec) = result {
            assert_eq!(exec.api, NativeApi::CacheSet);
        }

        // java.get
        let result = analyzer.analyze("java.get('key')");
        assert!(matches!(result, AnalysisResult::Native(_)));

        // source.putVariable
        let result = analyzer.analyze("source.putVariable('k', 'v')");
        assert!(matches!(result, AnalysisResult::Native(_)));

        // source.getVariable
        let result = analyzer.analyze("source.getVariable('k')");
        assert!(matches!(result, AnalysisResult::Native(_)));
    }

    #[test]
    fn test_json_parse_pattern() {
        let analyzer = JsPatternAnalyzer::new();

        // JSON.parse(x).prop
        let result = analyzer.analyze("JSON.parse(result).data.list");
        if let AnalysisResult::Native(exec) = result {
            assert_eq!(exec.api, NativeApi::JsonPath);
            // Verify generated JSONPath
            match &exec.args[1] {
                ExprValue::Literal(s) => assert_eq!(s, "$.data.list"),
                _ => panic!("Expected second arg to be literal"),
            }
        } else {
            panic!("Should match native execution");
        }
    }
    #[test]
    fn test_http_post_patterns() {
        let analyzer = JsPatternAnalyzer::new();

        // java.post(url, body)
        let result = analyzer.analyze("java.post('http://url', 'body')");
        if let AnalysisResult::Native(exec) = result {
            assert_eq!(exec.api, NativeApi::HttpPost);
            assert_eq!(exec.args.len(), 2);
        } else {
            panic!("Expected Native result for post 2 args");
        }

        // java.post(url, body, headers)
        let result = analyzer.analyze("java.post('http://url', 'body', headers)");
        if let AnalysisResult::Native(exec) = result {
            assert_eq!(exec.api, NativeApi::HttpPost);
            assert_eq!(exec.args.len(), 3);
        } else {
            panic!("Expected Native result for post 3 args");
        }
    }

    #[test]
    fn test_date_format_patterns() {
        let analyzer = JsPatternAnalyzer::new();

        // java.dateFormat(ts, "yyyy-MM-dd")
        let result = analyzer.analyze("java.dateFormat(timestamp, 'yyyy-MM-dd')");
        if let AnalysisResult::Native(exec) = result {
            if let NativeApi::TimeFormat(Some(fmt)) = exec.api {
                assert_eq!(fmt, "yyyy-MM-dd");
            } else {
                panic!("Expected TimeFormat with Some format");
            }
        } else {
            panic!("Expected Native result");
        }
    }
}
