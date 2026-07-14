//! `&&` (concat) operator — evaluate all segments and concatenate results.
//!
//! Matches Legado's `&&` semantics: each segment is evaluated and the
//! results are concatenated with no separator.

use scraper::Html;

use crate::legado::rule_parser::{CompiledLegadoRule, SelectorMode};
use crate::legado::selector;

/// Execute a compiled Legado rule in concat (`&&`) mode.
///
/// Evaluates all segments and concatenates their results.
pub fn execute_concat(
    rule: &CompiledLegadoRule,
    html: &Html,
    json: Option<&serde_json::Value>,
    base_url: &str,
) -> Option<String> {
    let mut combined = String::new();
    let mut had_result = false;

    for segment in &rule.segments {
        let result = match segment.mode {
            SelectorMode::Css => selector::css::extract_css(html, &segment.expression),
            SelectorMode::Js => {
                let prev = "";
                selector::js::execute_js(&segment.expression, prev, base_url)
            },
            SelectorMode::Json => {
                json.and_then(|j| selector::json::extract_json_path(j, &segment.expression))
            },
            SelectorMode::Regex => selector::regex::extract_regex(
                &html.root_element().inner_html(),
                &segment.expression,
            ),
            SelectorMode::Xpath => {
                tracing::warn!("XPath selector not supported: {}", segment.expression);
                None
            },
            SelectorMode::Text => {
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

        if let Some(value) = result {
            // Apply regex clean if present
            let cleaned = if let Some((pattern, replacement)) = &segment.regex_clean {
                selector::regex::apply_regex_clean(&value, pattern, replacement)
            } else {
                value
            };
            if !cleaned.is_empty() {
                combined.push_str(&cleaned);
                had_result = true;
            }
        }
    }

    if had_result {
        Some(combined)
    } else {
        None
    }
}
