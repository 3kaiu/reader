//! Legado Rule Parser — rule string splitting and mode detection
//!
//! Translates Legado rule strings (e.g. ".title@text||div.header||@js:...") into
//! a `CompiledLegadoRule` that the selector dispatchers can evaluate.
//!
//! Matches the Android app's `AnalyzeRule.splitSourceRule()` logic.

use std::sync::Arc;
use tracing::warn;

/// Selector mode — mirrors Legado's SourceRule.Mode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SelectorMode {
    /// Default / CSS selector (Jsoup → scraper)
    Css,
    /// JavaScript expression (`<js>...</js>` or `@js:...`)
    Js,
    /// JSONPath expression (`$.xxx`)
    Json,
    /// XPath expression (prefix `/` or `@xpath:`)
    Xpath,
    /// Regex extraction / `##pattern##replacement`
    Regex,
    /// Pure text constant
    Text,
}

/// A single parsed rule segment (Legado's SourceRule equivalent)
#[derive(Debug, Clone)]
pub struct RuleSegment {
    pub mode: SelectorMode,
    pub expression: String,
    /// Postfix `##pattern##replacement` for regex cleanup
    pub regex_clean: Option<(String, String)>,
}

/// A compiled Legado rule chain
///
/// Mirrors Legado's `SourceRule` → `List<SourceRule>` → execution chain.
#[derive(Debug, Clone)]
pub struct CompiledLegadoRule {
    pub segments: Vec<RuleSegment>,
    /// Combine mode: "||" (fallback), "&&" (concat), or "%%" (merge)
    pub combine: CombineOp,
    /// Original rule string (for debugging)
    pub original: String,
}

/// Rule combine operator
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CombineOp {
    /// `||` — return first non-empty result
    Fallback,
    /// `&&` — concatenate all results
    Concat,
    /// `%%` — merge by index (zip)
    Merge,
}

impl Default for CombineOp {
    fn default() -> Self {
        Self::Fallback
    }
}

/// Cached compiled rules
use dashmap::DashMap;
use std::sync::LazyLock;

static RULE_CACHE: LazyLock<DashMap<String, Arc<CompiledLegadoRule>>> =
    LazyLock::new(DashMap::new);

impl CompiledLegadoRule {
    /// Parse a Legado rule string into a compiled rule
    ///
    /// Handles:
    /// - `||` fallback operator
    /// - `&&` concatenation operator
    /// - `%%` merge operator
    /// - `##pattern##replacement` regex clean postfix
    /// - `@js:`, `<js>...</js>`, `@json:`, `@xpath:`, `@css:` prefixes
    /// - Auto-detection: `$.` → JSON, `/` → XPath, else CSS
    pub fn parse(rule: &str) -> Result<Self, String> {
        if rule.is_empty() {
            return Ok(Self {
                segments: Vec::new(),
                combine: CombineOp::default(),
                original: String::new(),
            });
        }

        // Determine combine operator from the whole string
        // NOTE: || and && only apply at top level, not inside @js: or @json: expressions
        let (combine, parts) = Self::split_combine(rule);

        let mut segments = Vec::new();
        for part in parts {
            let (expression, regex_clean) = Self::extract_regex_clean(part);
            let trimmed = expression.trim();
            // Only trim the expression part, not the regex replacement
            let mode = Self::detect_mode(trimmed);
            let expr_str = if trimmed.is_empty() && !expression.is_empty() {
                expression.to_string()
            } else {
                trimmed.to_string()
            };
            segments.push(RuleSegment {
                mode,
                expression: expr_str,
                regex_clean,
            });
        }

        Ok(Self {
            segments,
            combine,
            original: rule.to_string(),
        })
    }

    /// Split rule by top-level `||` or `&&` or `%%`
    fn split_combine(rule: &str) -> (CombineOp, Vec<&str>) {
        // Try || first (longest match) — split ALL occurrences
        let parts = Self::split_all_top_level(rule, "||");
        if parts.len() >= 2 {
            return (CombineOp::Fallback, parts);
        }

        // Try &&
        let parts = Self::split_all_top_level(rule, "&&");
        if parts.len() >= 2 {
            return (CombineOp::Concat, parts);
        }

        // Try %%
        let parts = Self::split_all_top_level(rule, "%%");
        if parts.len() >= 2 {
            return (CombineOp::Merge, parts);
        }

        (CombineOp::Fallback, vec![rule])
    }

    /// Split a rule by all occurrences of the separator at top level
    fn split_all_top_level<'a>(s: &'a str, sep: &str) -> Vec<&'a str> {
        let mut parts = Vec::new();
        let mut start = 0;

        while let Some(pos) = find_top_level(&s[start..], sep) {
            let part = s[start..start + pos].trim();
            if !part.is_empty() {
                parts.push(part);
            }
            start += pos + sep.len();
        }

        let last = s[start..].trim();
        if !last.is_empty() {
            parts.push(last);
        }

        parts
    }

    /// Extract `##pattern##replacement` postfix from a rule expression
    fn extract_regex_clean(rule: &str) -> (&str, Option<(String, String)>) {
        // Count ## occurrences
        // Legado syntax: pattern##regex##replacement
        let mut parts = Vec::new();
        let mut start = 0;
        
        // Use simple find loop
        loop {
            let remaining = &rule[start..];
            match remaining.find("##") {
                Some(pos) => {
                    parts.push(&rule[start..start + pos]);
                    start += pos + 2;
                },
                None => {
                    parts.push(&rule[start..]);
                    break;
                },
            }
        }

        if parts.len() >= 3 {
            // Has regex clean: expr ## pattern ## replacement
            let expr = parts[0].trim();
            let pattern = parts[1].trim().to_string();
            // Reconstruct the replacement: trim only the FIRST part of it
            // (don't trim spaces that might be part of the replacement value)
            let replacement = if parts.len() > 3 {
                parts[2..].concat()
            } else {
                parts[2].to_string()
            };
            (expr, Some((pattern, replacement)))
        } else {
            (rule, None)
        }
    }

    /// Detect selector mode from expression prefix
    fn detect_mode(expr: &str) -> SelectorMode {
        let lower = expr.trim().to_lowercase();

        if lower.starts_with("@js:") || lower.starts_with("<js>") {
            SelectorMode::Js
        } else if lower.starts_with("@json:") {
            SelectorMode::Json
        } else if lower.starts_with("@xpath:") || lower.starts_with("/") {
            SelectorMode::Xpath
        } else if lower.starts_with("@css:") {
            SelectorMode::Css
        } else if lower.starts_with("@regex:") {
            SelectorMode::Regex
        } else if lower.starts_with("@text:") {
            SelectorMode::Text
        } else if expr.starts_with("$.") || expr.starts_with("$[") {
            SelectorMode::Json
        } else if expr.trim_start().starts_with('/') {
            SelectorMode::Xpath
        } else {
            SelectorMode::Css // default
        }
    }

    /// Get or compile from global cache
    pub fn get_or_compile(rule: &str) -> Result<Arc<CompiledLegadoRule>, String> {
        if let Some(cached) = RULE_CACHE.get(rule) {
            return Ok(Arc::clone(cached.value()));
        }
        let compiled = Self::parse(rule)?;
        let arc = Arc::new(compiled);
        RULE_CACHE.insert(rule.to_string(), Arc::clone(&arc));
        Ok(arc)
    }
}

/// Find a separator at the top level (not inside @js: / <js> / @json: blocks,
/// and not inside JS regex literals or string literals within @js: blocks).
///
/// Walks through the string character by character, skipping JS and JSON blocks
/// while respecting string and regex literal boundaries inside them.
fn find_top_level(s: &str, sep: &str) -> Option<usize> {
    let mut i = 0;

    while i < s.len() {
        // Skip <js>...</js> blocks entirely
        if s[i..].starts_with("<js>") {
            if let Some(end) = s[i..].find("</js>") {
                i += end + 5;
                continue;
            }
        }

        // For @js: and @json: blocks, scan inside respecting string/regex boundaries
        if s[i..].starts_with("@js:") || s[i..].starts_with("@json:") {
            let prefix_len = if s[i..].starts_with("@js:") { 4 } else { 6 };
            i += prefix_len;
            // Scan char by char inside the JS expression
            while i < s.len() {
                // Check separator
                if s[i..].starts_with(sep) {
                    return Some(i);
                }

                let c = s.as_bytes()[i] as char;
                match c {
                    // Skip single-quoted strings
                    '\'' => {
                        i += 1;
                        while i < s.len() {
                            if s.as_bytes()[i] as char == '\\' { i += 2; continue; }
                            if s.as_bytes()[i] as char == '\'' { break; }
                            i += 1;
                        }
                        i += 1; // skip closing quote
                    },
                    // Skip double-quoted strings
                    '"' => {
                        i += 1;
                        while i < s.len() {
                            if s.as_bytes()[i] as char == '\\' { i += 2; continue; }
                            if s.as_bytes()[i] as char == '"' { break; }
                            i += 1;
                        }
                        i += 1;
                    },
                    // Distinguish regex literal from division operator
                    '/' => {
                        let prev = s[..i].trim_end().chars().last();
                        let is_regex_start = prev.map_or(true, |pc| {
                            matches!(pc, '(' | ',' | '=' | ':' | '!' | '&' | '|'
                                | '^' | '~' | '%' | '*' | '-' | '+' | '<'
                                | '>' | '?' | '[' | '{' | ';' | ')' | '}')
                        });
                        if is_regex_start {
                            i += 1; // skip opening /
                            while i < s.len() {
                                if s.as_bytes()[i] as char == '\\' { i += 2; continue; }
                                if s.as_bytes()[i] as char == '/' { break; }
                                i += 1;
                            }
                            i += 1; // skip closing /
                            // skip regex flags
                            while i < s.len() {
                                let f = s.as_bytes()[i] as char;
                                if matches!(f, 'd' | 'g' | 'i' | 'm' | 's' | 'u' | 'y' | 'v') {
                                    i += 1;
                                } else { break; }
                            }
                        } else {
                            i += 1;
                        }
                    },
                    _ => i += 1,
                }
            }
            continue;
        }

        // Skip quoted strings (outside @js: blocks)
        if let Some(q) = s[i..].chars().next() {
            if q == '"' || q == '\'' {
                i += 1;
                while i < s.len() {
                    let c = s.as_bytes()[i];
                    if c == b'\\' {
                        i += 2;
                        continue;
                    }
                    if c as char == q {
                        break;
                    }
                    i += 1;
                }
                i += 1;
                continue;
            }
        }

        // Check separator match
        if s[i..].starts_with(sep) {
            return Some(i);
        }

        i += 1;
    }

    None
}

/// Strip mode prefix from a rule expression (e.g. "@js:foo" -> "foo")
pub fn strip_prefix(expr: &str) -> &str {
    let trimmed = expr.trim();
    if let Some(stripped) = trimmed
        .strip_prefix("@js:")
        .or_else(|| trimmed.strip_prefix("@json:"))
        .or_else(|| trimmed.strip_prefix("@xpath:"))
        .or_else(|| trimmed.strip_prefix("@css:"))
        .or_else(|| trimmed.strip_prefix("@regex:"))
        .or_else(|| trimmed.strip_prefix("@text:"))
    {
        stripped.trim()
    } else if trimmed.starts_with("<js>") && trimmed.ends_with("</js>") {
        trimmed[4..trimmed.len() - 6].trim()
    } else {
        trimmed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_css_rule() {
        let r = CompiledLegadoRule::parse("div.content a@href").unwrap();
        assert_eq!(r.segments.len(), 1);
        assert_eq!(r.segments[0].mode, SelectorMode::Css);
        assert_eq!(r.segments[0].expression, "div.content a@href");
    }

    #[test]
    fn test_js_rule() {
        let r = CompiledLegadoRule::parse("@js:result.match(/\\d+/)[0]").unwrap();
        assert_eq!(r.segments[0].mode, SelectorMode::Js);
    }

    #[test]
    fn test_js_tag_rule() {
        let r = CompiledLegadoRule::parse("<js>JSON.parse(result)</js>").unwrap();
        assert_eq!(r.segments[0].mode, SelectorMode::Js);
        assert_eq!(r.segments[0].expression, "<js>JSON.parse(result)</js>");
    }

    #[test]
    fn test_json_path() {
        let r = CompiledLegadoRule::parse("$.data.list[*].name").unwrap();
        assert_eq!(r.segments[0].mode, SelectorMode::Json);
    }

    #[test]
    fn test_fallback_or() {
        let r = CompiledLegadoRule::parse("div.title || h1 || @text").unwrap();
        assert_eq!(r.segments.len(), 3);
        assert_eq!(r.combine, CombineOp::Fallback);
        assert_eq!(r.segments[0].expression, "div.title");
        assert_eq!(r.segments[1].expression, "h1");
        assert_eq!(r.segments[2].expression, "@text");
    }

    #[test]
    fn test_concat_and() {
        let r = CompiledLegadoRule::parse("@js:'第' + result && @js:result + '章'").unwrap();
        assert_eq!(r.combine, CombineOp::Concat);
        assert_eq!(r.segments.len(), 2);
    }

    #[test]
    fn test_regex_clean_postfix() {
        let input = "div.content##[a-z]+## ";
        eprintln!("input bytes: {:?}", input.as_bytes());
        let r = CompiledLegadoRule::parse(input).unwrap();
        assert_eq!(r.segments.len(), 1, "expected 1 segment, got {}: {:?}", r.segments.len(), r.segments);
        assert!(r.segments[0].regex_clean.is_some(), "expected regex_clean, got None");
        let (pat, repl) = r.segments[0].regex_clean.as_ref().unwrap();
        eprintln!("pat: {:?} (len={}), repl: {:?} (len={})", pat, pat.len(), repl, repl.len());
        assert_eq!(pat, "[a-z]+", "pattern mismatch");
        assert_eq!(repl, " ", "replacement mismatch");
    }

    #[test]
    fn test_empty_rule() {
        let r = CompiledLegadoRule::parse("").unwrap();
        assert!(r.segments.is_empty());
    }

    #[test]
    fn test_detect_json_auto() {
        // Starts with $. should auto-detect as JSON
        let r = CompiledLegadoRule::parse("$.info.name").unwrap();
        assert_eq!(r.segments[0].mode, SelectorMode::Json);
    }

    #[test]
    fn test_text_rule() {
        let r = CompiledLegadoRule::parse("@text:hello").unwrap();
        assert_eq!(r.segments[0].mode, SelectorMode::Text);
    }

    #[test]
    fn test_no_false_split_in_js() {
        // The `||` inside @js: should NOT cause a split
        let r = CompiledLegadoRule::parse("@js:result.replace(/a||b/g,'')").unwrap();
        assert_eq!(r.segments.len(), 1);
        assert_eq!(r.segments[0].mode, SelectorMode::Js);
    }
}