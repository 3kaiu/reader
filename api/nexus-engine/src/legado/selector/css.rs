//! CSS selector dispatcher — wraps existing FallbackSelector / scraper
//!
//! Legado CSS rules use the same syntax as NXS: CSS selectors with
//! `@text`, `@href`, `@src`, `@html` attribute suffixes.
//! The `|` fallback in NXS corresponds to Legado's `||` (handled at rule_parser level).

use scraper::Html;
use std::sync::Arc;

use crate::selector_cache::FallbackSelector;

/// Extract text via CSS selector using the existing FallbackSelector infrastructure.
///
/// Returns `None` if the selector matches nothing or extracts empty content.
pub fn extract_css(html: &Html, rule_expr: &str) -> Option<String> {
    if rule_expr.trim().is_empty() || rule_expr.starts_with('@') {
        return None;
    }

    // Try to compile and use existing infrastructure
    match FallbackSelector::get_or_compile_global(rule_expr) {
        Ok(selector) => selector.extract(html),
        Err(e) => {
            tracing::warn!("Failed to compile CSS selector '{}': {:?}", rule_expr, e);
            None
        },
    }
}

/// Extract multiple values (for lists / TOC items)
pub fn extract_all_css(html: &Html, rule_expr: &str) -> Vec<String> {
    if rule_expr.trim().is_empty() || rule_expr.starts_with('@') {
        return Vec::new();
    }

    match FallbackSelector::get_or_compile_global(rule_expr) {
        Ok(selector) => selector.extract_all(html),
        Err(e) => {
            tracing::warn!("Failed to compile CSS selector '{}': {:?}", rule_expr, e);
            Vec::new()
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use scraper::Html;

    #[test]
    fn test_basic_css() {
        let html = Html::parse_document("<div><p class='title'>Hello</p></div>");
        let result = extract_css(&html, "p.title@text");
        assert_eq!(result, Some("Hello".to_string()));
    }

    #[test]
    fn test_href_extract() {
        let html = Html::parse_document("<a href='/book/123'>Book</a>");
        let result = extract_css(&html, "a@href");
        assert_eq!(result, Some("/book/123".to_string()));
    }

    #[test]
    fn test_empty_selector() {
        let html = Html::parse_document("<div>No match</div>");
        let result = extract_css(&html, "p.nonexistent@text");
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_all() {
        let html = Html::parse_document("<ul><li>A</li><li>B</li><li>C</li></ul>");
        let results = extract_all_css(&html, "li@text");
        assert_eq!(results, vec!["A", "B", "C"]);
    }
}