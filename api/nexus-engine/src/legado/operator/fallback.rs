//! `||` (fallback) operator — try each segment in order, return first non-empty result.
//!
//! This is the most common combine mode. It matches Legado's `||` semantics:
//! evaluate left → right, return the first result that is non-empty.

use scraper::Html;

use crate::legado::rule_parser::{CompiledLegadoRule, SelectorMode};
use crate::legado::selector;

/// Execute a compiled Legado rule in fallback (`||`) mode.
///
/// Tries each segment in order and returns the first non-empty result.
pub fn execute_fallback(
    rule: &CompiledLegadoRule,
    html: &Html,
    json: Option<&serde_json::Value>,
    base_url: &str,
) -> Option<String> {
    for segment in &rule.segments {
        let result = match segment.mode {
            SelectorMode::Css => selector::css::extract_css(html, &segment.expression),
            SelectorMode::Js => {
                // For JS, pass the previous result (or empty) and base_url
                let prev = "";
                selector::js::execute_js(&segment.expression, prev, base_url)
            },
            SelectorMode::Json => {
                if let Some(json_val) = json {
                    selector::json::extract_json_path(json_val, &segment.expression)
                } else {
                    None
                }
            },
            SelectorMode::Regex => {
                // Regex is applied to the HTML text as a whole
                selector::regex::extract_regex(
                    &html.root_element().inner_html(),
                    &segment.expression,
                )
            },
            SelectorMode::Xpath => {
                // XPath not natively supported; log warning
                tracing::warn!(
                    "XPath selector not supported in LegadoEngine: {}",
                    segment.expression
                );
                None
            },
            SelectorMode::Text => {
                // @text: returns the literal text after the prefix
                let text = segment
                    .expression
                    .strip_prefix("@text:")
                    .unwrap_or(&segment.expression)
                    .trim();
                if text.is_empty() {
                    None
                } else {
                    Some(text.to_string())
                }
            },
        };

        if let Some(result) = result {
            // Apply regex clean postfix if present
            if let Some((pattern, replacement)) = &segment.regex_clean {
                return Some(selector::regex::apply_regex_clean(&result, pattern, replacement));
            }
            if !result.is_empty() {
                return Some(result);
            }
        }
    }

    None
}
