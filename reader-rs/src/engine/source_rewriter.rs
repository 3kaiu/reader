//! Source Rewriter - Transpile java.* calls to native.* at import time
//!
//! This module rewrites book source JSON during import, converting all
//! `java.xxx()` API calls to `native.xxx()` equivalents. This eliminates
//! the need for a `java` global object at runtime.

use super::java_api_mapping::JAVA_TO_NATIVE;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

/// Regex to match java.methodName( pattern
static JAVA_CALL_REGEX: Lazy<Regex> = Lazy::new(|| {
    // Matches: java.methodName( where methodName is alphanumeric
    Regex::new(r"java\.(\w+)\s*\(").unwrap()
});

/// Statistics from a rewrite operation
#[derive(Debug, Default, Clone)]
pub struct RewriteStats {
    /// Number of java.* calls that were transpiled
    pub transpiled: usize,
    /// Number of java.* calls that couldn't be transpiled (unknown API)
    pub unknown: usize,
    /// List of unknown API names encountered
    pub unknown_apis: Vec<String>,
}

/// Book source rewriter for import-time transpilation
pub struct SourceRewriter {
    /// Whether to log unknown APIs
    log_unknown: bool,
}

impl Default for SourceRewriter {
    fn default() -> Self {
        Self::new()
    }
}

impl SourceRewriter {
    /// Create a new SourceRewriter
    pub fn new() -> Self {
        Self { log_unknown: true }
    }

    /// Create a rewriter that doesn't log unknown APIs
    pub fn quiet() -> Self {
        Self { log_unknown: false }
    }

    /// Rewrite a book source JSON value in-place
    ///
    /// Returns statistics about what was transpiled
    pub fn rewrite_source(&self, source: &mut Value) -> RewriteStats {
        let mut stats = RewriteStats::default();
        self.rewrite_value(source, &mut stats);

        if self.log_unknown && !stats.unknown_apis.is_empty() {
            tracing::warn!(
                "Source rewriter: {} unknown java.* APIs: {:?}",
                stats.unknown,
                stats.unknown_apis
            );
        }

        stats
    }

    /// Rewrite all string fields in a JSON value recursively
    fn rewrite_value(&self, value: &mut Value, stats: &mut RewriteStats) {
        match value {
            Value::String(s) => {
                if s.contains("java.") {
                    *s = self.rewrite_string(s, stats);
                }
            }
            Value::Object(map) => {
                for (_, v) in map.iter_mut() {
                    self.rewrite_value(v, stats);
                }
            }
            Value::Array(arr) => {
                for v in arr.iter_mut() {
                    self.rewrite_value(v, stats);
                }
            }
            _ => {}
        }
    }

    /// Rewrite java.* calls in a single string
    fn rewrite_string(&self, input: &str, stats: &mut RewriteStats) -> String {
        let mut result = input.to_string();

        // First pass: direct string replacement for known APIs
        for (java_api, native_api) in JAVA_TO_NATIVE.iter() {
            if result.contains(*java_api) {
                let count = result.matches(*java_api).count();
                stats.transpiled += count;
                result = result.replace(*java_api, native_api);
            }
        }

        // Second pass: find any remaining java.xxx( patterns that weren't matched
        let remaining: Vec<String> = JAVA_CALL_REGEX
            .captures_iter(&result)
            .filter_map(|cap| {
                let method_name = cap.get(1)?.as_str();
                let full_name = format!("java.{}", method_name);
                // Check if this is a native.xxx call (already converted) or still java.xxx
                if result.contains(&format!("java.{}(", method_name)) {
                    Some(full_name)
                } else {
                    None
                }
            })
            .collect();

        for unknown_api in remaining {
            if !stats.unknown_apis.contains(&unknown_api) {
                stats.unknown_apis.push(unknown_api);
                stats.unknown += 1;
            }
        }

        result
    }

    /// Check if a source needs a Java compatibility shim
    ///
    /// Returns true if the source contains java.* calls that couldn't be transpiled
    pub fn needs_java_shim(&self, source: &Value) -> bool {
        let mut stats = RewriteStats::default();
        let mut source_clone = source.clone();
        self.rewrite_value(&mut source_clone, &mut stats);
        stats.unknown > 0
    }

    /// Analyze a source without modifying it
    pub fn analyze(&self, source: &Value) -> RewriteStats {
        let mut stats = RewriteStats::default();
        let mut source_clone = source.clone();
        self.rewrite_value(&mut source_clone, &mut stats);
        stats
    }
}

/// Convenience function to rewrite a source JSON string
pub fn rewrite_source_json(json: &str) -> Result<(String, RewriteStats), serde_json::Error> {
    let mut value: Value = serde_json::from_str(json)?;
    let rewriter = SourceRewriter::new();
    let stats = rewriter.rewrite_source(&mut value);
    let output = serde_json::to_string(&value)?;
    Ok((output, stats))
}

/// Convenience function to rewrite multiple sources
pub fn rewrite_sources_json(json: &str) -> Result<(String, Vec<RewriteStats>), serde_json::Error> {
    let mut values: Vec<Value> = serde_json::from_str(json)?;
    let rewriter = SourceRewriter::new();

    let stats: Vec<RewriteStats> = values
        .iter_mut()
        .map(|v| rewriter.rewrite_source(v))
        .collect();

    let output = serde_json::to_string(&values)?;
    Ok((output, stats))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_rewrite_simple_string() {
        let rewriter = SourceRewriter::quiet();
        let mut stats = RewriteStats::default();

        let input = "java.base64Encode(result)";
        let output = rewriter.rewrite_string(input, &mut stats);

        assert_eq!(output, "native.base64Encode(result)");
        assert_eq!(stats.transpiled, 1);
        assert_eq!(stats.unknown, 0);
    }

    #[test]
    fn test_rewrite_multiple_calls() {
        let rewriter = SourceRewriter::quiet();
        let mut stats = RewriteStats::default();

        let input = "java.base64Encode(java.md5Encode(result))";
        let output = rewriter.rewrite_string(input, &mut stats);

        assert_eq!(output, "native.base64Encode(native.md5(result))");
        assert_eq!(stats.transpiled, 2);
    }

    #[test]
    fn test_rewrite_url_template() {
        let rewriter = SourceRewriter::quiet();
        let mut stats = RewriteStats::default();

        let input =
            "https://example.com/search?q={{java.encodeURI(key)}}&sign={{java.md5Encode(key)}}";
        let output = rewriter.rewrite_string(input, &mut stats);

        assert_eq!(
            output,
            "https://example.com/search?q={{native.encodeUri(key)}}&sign={{native.md5(key)}}"
        );
        assert_eq!(stats.transpiled, 2);
    }

    #[test]
    fn test_rewrite_json_value() {
        let rewriter = SourceRewriter::quiet();

        let mut source = json!({
            "searchUrl": "https://test.com?q={{java.encodeURI(key)}}",
            "ruleSearch": {
                "bookList": "div.list",
                "name": "@js:java.base64Decode(result)"
            }
        });

        let stats = rewriter.rewrite_source(&mut source);

        assert_eq!(
            source["searchUrl"].as_str().unwrap(),
            "https://test.com?q={{native.encodeUri(key)}}"
        );
        assert_eq!(
            source["ruleSearch"]["name"].as_str().unwrap(),
            "@js:native.base64Decode(result)"
        );
        assert_eq!(stats.transpiled, 2);
    }

    #[test]
    fn test_unknown_api_detection() {
        let rewriter = SourceRewriter::quiet();
        let mut stats = RewriteStats::default();

        let input = "java.customMethod(result)";
        let output = rewriter.rewrite_string(input, &mut stats);

        // Unknown API is not replaced
        assert_eq!(output, "java.customMethod(result)");
        assert_eq!(stats.unknown, 1);
        assert!(stats
            .unknown_apis
            .contains(&"java.customMethod".to_string()));
    }

    #[test]
    fn test_rewrite_sources_json() {
        let json = r#"[{
            "bookSourceUrl": "https://test.com",
            "searchUrl": "https://test.com?q={{java.encodeURI(key)}}"
        }]"#;

        let (output, stats) = rewrite_sources_json(json).unwrap();

        assert!(output.contains("native.encodeUri"));
        assert!(!output.contains("java.encodeURI"));
        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].transpiled, 1);
    }

    #[test]
    fn test_no_change_for_non_java() {
        let rewriter = SourceRewriter::quiet();

        let mut source = json!({
            "searchUrl": "https://test.com?q={{key}}",
            "ruleSearch": {
                "bookList": "div.list@a",
                "name": ".name@text"
            }
        });

        let original = source.clone();
        let stats = rewriter.rewrite_source(&mut source);

        assert_eq!(source, original);
        assert_eq!(stats.transpiled, 0);
        assert_eq!(stats.unknown, 0);
    }
}
