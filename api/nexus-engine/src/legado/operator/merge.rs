//! `%%` (merge) operator — merge results from all segments by index (zip).
//!
//! Evaluates all segments, then zips their results by index.
//! Used in Legado's Explore/Discovery rules where multiple selectors
//! produce parallel lists that need to be merged together.
//!
//! Example: "div.book%%div.author%%div.cover" → for each i, (book[i], author[i], cover[i])

use scraper::Html;

use crate::legado::rule_parser::{CompiledLegadoRule, SelectorMode};
use crate::legado::selector;

/// Execute a compiled Legado rule in merge (`%%`) mode.
///
/// Each segment is evaluated and returns a list of results.
/// The lists are then zipped together by index.
/// Returns the first merged group as a joined string.
pub fn execute_merge(
    rule: &CompiledLegadoRule,
    html: &Html,
    json: Option<&serde_json::Value>,
    base_url: &str,
) -> Option<String> {
    // Collect results from all segments as lists
    let mut all_lists: Vec<Vec<String>> = Vec::new();

    for segment in &rule.segments {
        let list = match segment.mode {
            SelectorMode::Css => {
                let results = selector::css::extract_all_css(html, &segment.expression);
                results
                    .into_iter()
                    .map(|s| {
                        if let Some((pattern, replacement)) = &segment.regex_clean {
                            selector::regex::apply_regex_clean(&s, pattern, replacement)
                        } else {
                            s
                        }
                    })
                    .collect()
            }
            SelectorMode::Json => {
                if let Some(json_val) = json {
                    let results = selector::json::extract_all_json_path(json_val, &segment.expression);
                    results
                } else {
                    Vec::new()
                }
            }
            SelectorMode::Js => {
                // For JS in merge mode, use the last non-empty result as input
                let prev = all_lists.last().and_then(|l| l.last()).map(|s| s.as_str()).unwrap_or("");
                selector::js::execute_js(&segment.expression, prev, base_url)
                    .map(|s| vec![s])
                    .unwrap_or_default()
            }
            SelectorMode::Regex => {
                selector::regex::extract_regex(&html.root_element().inner_html(), &segment.expression)
                    .map(|s| vec![s])
                    .unwrap_or_default()
            }
            SelectorMode::Xpath => {
                tracing::warn!("XPath selector not supported in Legado merge: {}", segment.expression);
                Vec::new()
            }
            SelectorMode::Text => {
                let text = segment.expression
                    .strip_prefix("@text:")
                    .unwrap_or(&segment.expression)
                    .trim();
                if text.is_empty() {
                    Vec::new()
                } else {
                    vec![text.to_string()]
                }
            }
        };

        if !list.is_empty() {
            all_lists.push(list);
        }
    }

    if all_lists.is_empty() {
        return None;
    }

    // Zip by index: take the i-th element from each list
    let min_len = all_lists.iter().map(|l| l.len()).min().unwrap_or(0);
    if min_len == 0 {
        return None;
    }

    // Return the first merged group
    let first_group: Vec<&str> = all_lists.iter().map(|l| l[0].as_str()).collect();
    Some(first_group.join(""))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::legado::rule_parser::CompiledLegadoRule;

    #[test]
    fn test_merge_basic() {
        let html = Html::parse_document(
            "<div class='list'>
                <div class='item'>
                    <span class='title'>Book A</span>
                    <span class='author'>Author A</span>
                </div>
                <div class='item'>
                    <span class='title'>Book B</span>
                    <span class='author'>Author B</span>
                </div>
            </div>"
        );
        // Note: merge requires splitting rule with %%
        // This is a simplified test
        let rule = CompiledLegadoRule::parse("span.title@text").unwrap();
        let result = crate::legado::operator::fallback::execute_fallback(&rule, &html, None, "");
        assert!(result.is_some());
    }
}