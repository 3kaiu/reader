//! Translate Legado CSS DSL to standard CSS selectors + JS DOM access.
//!
//! Legado's CSS DSL is a chain of instructions separated by `@`.
//! Each instruction is either a selector narrowing step or a value accessor.
//!
//! Examples:
//!   "class.foo@tag.p.0@text"
//!     → `.foo p:first-child` → `.textContent?.trim()`
//!
//!   "tag.h3@tag.a@href"
//!     → `h3 a` → `.getAttribute('href')`
//!
//!   "[property$=author]@content"
//!     → `[property$="author"]` → `.getAttribute('content')`
//!
//! The translation is deterministic: one DSL pattern → one JS expression.

use std::fmt;

/// A parsed instruction step in the Legado CSS DSL chain.
#[derive(Debug, Clone, PartialEq)]
pub enum Step {
    /// `.className` — select by class
    Class(String),
    /// `#idName` or `-idName` — select by id
    Id(String),
    /// `tagName` — select by tag
    Tag(String),
    /// `tagName.N` — select Nth child (0-indexed)
    TagIndexed(String, usize),
    /// `tagName!N` — exclude Nth child
    TagNotIndexed(String, usize),
    /// `[attr=val]`, `[attr$=val]`, `[attr~=val]`, `[attr|=val]`
    Attr {
        name: String,
        op: AttrOp,
        value: String,
    },
    /// `text` — element text content, trimmed
    Text,
    /// `textNodes` — all text nodes (not trimmed)
    TextNodes,
    /// `href` — get `href` attribute
    Href,
    /// `src` — get `src` attribute
    Src,
    /// `content` — get `content` attribute (meta tags)
    Content,
    /// `html` — inner HTML
    Html,
    /// `ownText` — direct text children only
    OwnText,
    /// Any unknown string after @ is treated as a generic attribute name
    /// e.g. `tag.img@data-src` → getAttribute('data-src')
    GenericAttr(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum AttrOp {
    Eq,    // =
    Ends,  // $=
    ContainsWord, // ~=
    Prefix, // ^=
    StartsWith, // |=
}

impl fmt::Display for AttrOp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AttrOp::Eq => write!(f, "="),
            AttrOp::Ends => write!(f, "$="),
            AttrOp::ContainsWord => write!(f, "~="),
            AttrOp::Prefix => write!(f, "^="),
            AttrOp::StartsWith => write!(f, "|="),
        }
    }
}

/// Parse a single Legado CSS DSL instruction into a Step.
fn parse_step(input: &str) -> Option<Step> {
    let input = input.trim();
    if input.is_empty() {
        return None;
    }

    // Accessor instructions
    if input == "text" {
        return Some(Step::Text);
    }
    if input == "textNodes" {
        return Some(Step::TextNodes);
    }
    if input == "href" {
        return Some(Step::Href);
    }
    if input == "src" {
        return Some(Step::Src);
    }
    if input == "content" {
        return Some(Step::Content);
    }
    if input == "html" {
        return Some(Step::Html);
    }
    if input == "ownText" {
        return Some(Step::OwnText);
    }

    // Attribute selectors: [attr=val], [attr$=val], etc.
    if input.starts_with('[') && input.ends_with(']') {
        let inner = &input[1..input.len() - 1];
        // Try to find attribute operators in order: $=, ~=, |=, ^=, =
        for (op_symbol, op) in [
            ("$=", AttrOp::Ends),
            ("~=", AttrOp::ContainsWord),
            ("|=", AttrOp::StartsWith),
            ("^=", AttrOp::Prefix),
            ("=", AttrOp::Eq),
        ] {
            if let Some(pos) = inner.find(op_symbol) {
                let name = inner[..pos].trim().to_string();
                let value = inner[pos + op_symbol.len()..].trim().to_string();
                // Handle pipe-separated values: attr~=cat|status → multiple selectors
                if value.contains('|') && matches!(op, AttrOp::Eq | AttrOp::ContainsWord) {
                    // Multiple attr values - handled at a higher level
                }
                return Some(Step::Attr { name, op, value });
            }
        }
        return None;
    }

    // Class selector: class.name
    if let Some(name) = input.strip_prefix("class.") {
        return Some(Step::Class(name.to_string()));
    }

    // ID selector: id.name or -id.name
    if let Some(name) = input.strip_prefix("id.") {
        return Some(Step::Id(name.to_string()));
    }
    if let Some(name) = input.strip_prefix("-id.") {
        return Some(Step::Id(name.to_string()));
    }

    // Tag selector with index: tag.div.0 or tag.div!0
    if let Some(rest) = input.strip_prefix("tag.") {
        // Check for negative index first: tag.div!0
        if let Some(bang_pos) = rest.rfind('!') {
            let tag_name = &rest[..bang_pos];
            let index_str = &rest[bang_pos + 1..];
            if let Ok(idx) = index_str.parse::<usize>() {
                return Some(Step::TagNotIndexed(tag_name.to_string(), idx));
            }
        }
        // Check for positive index: tag.div.0
        if let Some(dot_pos) = rest.rfind('.') {
            let tag_name = &rest[..dot_pos];
            let suffix = &rest[dot_pos + 1..];
            if let Ok(idx) = suffix.parse::<usize>() {
                return Some(Step::TagIndexed(tag_name.to_string(), idx));
            }
        }
        // Simple tag selector: tag.div
        return Some(Step::Tag(rest.to_string()));
    }

    // Any other string is treated as a generic attribute name
    // e.g. "data-src", "data-original", "alt", "title"
    // This MUST be last since it matches everything

    // Filter out strings that look like Legado keywords
    // that somehow slipped through
    if !input.contains(' ') && !input.contains('.') && !input.contains('#') {
        return Some(Step::GenericAttr(input.to_string()));
    }

    None
}

/// Parse a full Legado CSS DSL expression into a list of steps.
/// Expression: "class.navtxt@tag.p.0@textNodes"
pub fn parse_chain(input: &str) -> Vec<Step> {
    let input = input.trim();
    if input.is_empty() {
        return Vec::new();
    }

    input.split('@').filter_map(parse_step).collect()
}

/// Convert a sequence of Steps to a CSS selector string only (no JS wrapper).
pub fn to_css_selector(steps: &[Step]) -> String {
    let mut parts: Vec<String> = Vec::new();
    for step in steps {
        match step {
            Step::Class(name) => parts.push(format!(".{}", name)),
            Step::Id(name) => parts.push(format!("#{}", name)),
            Step::Tag(name) => parts.push(name.clone()),
            Step::TagIndexed(name, idx) => {
                parts.push(format!("{}:nth-child({})", name, idx + 1));
            }
            Step::TagNotIndexed(name, idx) => {
                parts.push(format!("{}:not(:nth-child({}))", name, idx + 1));
            }
            Step::Attr { name, op, value } => {
                if value.contains('|') && matches!(op, AttrOp::Eq | AttrOp::ContainsWord) {
                    let selectors: Vec<String> = value.split('|')
                        .map(|v| format!("[{}{}\"{}\"]", name, op, v))
                        .collect();
                    parts.push(selectors.join(","));
                } else {
                    parts.push(format!("[{}{}\"{}\"]", name, op, value));
                }
            }
            _ => {}
        }
    }
    parts.join(" ")
}

/// Generate a JS DOM query expression string.
/// 
/// The output is a JS code fragment like:
///   `.querySelector('.foo p:first-child')?.textContent?.trim() || ''`
pub fn to_js_expression(steps: &[Step]) -> String {
    if steps.is_empty() {
        return "''".to_string();
    }

    let mut selector_parts: Vec<String> = Vec::new();
    let mut accessor: Option<&Step> = None;

    for step in steps {
        match step {
            // Accessor steps terminate the chain
            s @ (Step::Text | Step::TextNodes | Step::Href | Step::Src | Step::Content | Step::Html | Step::OwnText | Step::GenericAttr(_)) => {
                accessor = Some(s);
            }
            // Selector steps combine into a CSS selector
            Step::Class(name) => selector_parts.push(format!(".{}", name)),
            Step::Id(name) => selector_parts.push(format!("#{}", name)),
            Step::Tag(name) => selector_parts.push(name.clone()),
            Step::TagIndexed(name, idx) => {
                selector_parts.push(format!("{}:nth-child({})", name, idx + 1));
            }
            Step::TagNotIndexed(name, idx) => {
                selector_parts.push(format!("{}:not(:nth-child({}))", name, idx + 1));
            }
            Step::Attr { name, op, value } => {
                // Handle pipe-separated values: split into multiple selectors
                if value.contains('|') && matches!(op, AttrOp::Eq | AttrOp::ContainsWord) {
                    let parts: Vec<&str> = value.split('|').collect();
                    let selectors: Vec<String> = parts
                        .iter()
                        .map(|v| format!("[{}{}\"{}\"]", name, op, v))
                        .collect();
                    selector_parts.push(selectors.join(","));
                } else {
                    selector_parts.push(format!("[{}{}\"{}\"]", name, op, value));
                }
            }
        }
    }

    let css_selector = selector_parts.join(" ");

    if css_selector.is_empty() {
        // Only accessor steps — use the document/element directly
        return match accessor {
            Some(Step::Text) => "el.textContent?.trim() || ''".to_string(),
            Some(Step::TextNodes) => "el.textContent || ''".to_string(),
            Some(Step::Href) => "el.getAttribute('href') || ''".to_string(),
            Some(Step::Src) => "el.getAttribute('src') || ''".to_string(),
            Some(Step::Content) => "el.getAttribute('content') || ''".to_string(),
            Some(Step::Html) => "el.innerHTML || ''".to_string(),
            Some(Step::OwnText) => "el.textContent?.trim() || ''".to_string(),
            Some(Step::GenericAttr(name)) => format!("el.getAttribute('{}') || ''", name),
            _ => "''".to_string(),
        };
    }

    match accessor {
        Some(Step::Text) => format!("el.querySelector('{}')?.textContent?.trim() || ''", css_selector),
        Some(Step::TextNodes) => format!("el.querySelector('{}')?.textContent || ''", css_selector),
        Some(Step::Href) => format!("el.querySelector('{}')?.getAttribute('href') || ''", css_selector),
        Some(Step::Src) => format!("el.querySelector('{}')?.getAttribute('src') || ''", css_selector),
        Some(Step::Content) => format!("el.querySelector('{}')?.getAttribute('content') || ''", css_selector),
        Some(Step::Html) => format!("el.querySelector('{}')?.innerHTML || ''", css_selector),
        Some(Step::OwnText) => {
            format!(
                "Array.from(el.querySelector('{}')?.childNodes || []).filter(n => n.nodeType === 3).map(n => n.textContent).join('') || ''",
                css_selector
            )
        }
        Some(Step::GenericAttr(name)) => {
            format!("el.querySelector('{}')?.getAttribute('{}') || ''", css_selector, name)
        }
        _ => {
            format!("el.querySelector('{}')", css_selector)
        }
    }
}

/// Generate a JS expression for extracting ALL matching elements (bookList / selectAll).
pub fn to_js_all_expression(steps: &[Step]) -> String {
    if steps.is_empty() {
        return "[]".to_string();
    }

    let mut selector_parts: Vec<String> = Vec::new();
    let mut accessor: Option<&Step> = None;

    for step in steps {
        match step {
            s @ (Step::Text | Step::TextNodes | Step::Href | Step::Src | Step::Content | Step::Html | Step::OwnText | Step::GenericAttr(_)) => {
                accessor = Some(s);
            }
            Step::Class(name) => selector_parts.push(format!(".{}", name)),
            Step::Id(name) => selector_parts.push(format!("#{}", name)),
            Step::Tag(name) => selector_parts.push(name.clone()),
            Step::TagIndexed(name, idx) => {
                selector_parts.push(format!("{}:nth-child({})", name, idx + 1));
            }
            Step::TagNotIndexed(name, idx) => {
                selector_parts.push(format!("{}:not(:nth-child({}))", name, idx + 1));
            }
            Step::Attr { name, op, value } => {
                if value.contains('|') && matches!(op, AttrOp::Eq | AttrOp::ContainsWord) {
                    let parts: Vec<&str> = value.split('|').collect();
                    let selectors: Vec<String> = parts
                        .iter()
                        .map(|v| format!("[{}{}\"{}\"]", name, op, v))
                        .collect();
                    selector_parts.push(selectors.join(","));
                } else {
                    selector_parts.push(format!("[{}{}\"{}\"]", name, op, value));
                }
            }
        }
    }

    let css_selector = selector_parts.join(" ");

    match accessor {
        Some(Step::Text) => format!(
            "Array.from(el.querySelectorAll('{}'), e => e.textContent?.trim() || '')",
            css_selector
        ),
        Some(Step::TextNodes) => format!(
            "Array.from(el.querySelectorAll('{}'), e => e.textContent || '')",
            css_selector
        ),
        Some(Step::Href) => format!(
            "Array.from(el.querySelectorAll('{}'), e => e.getAttribute('href') || '')",
            css_selector
        ),
        Some(Step::Src) => format!(
            "Array.from(el.querySelectorAll('{}'), e => e.getAttribute('src') || '')",
            css_selector
        ),
        Some(Step::GenericAttr(name)) => format!(
            "Array.from(el.querySelectorAll('{}'), e => e.getAttribute('{}') || '')",
            css_selector, name
        ),
        _ => format!("Array.from(el.querySelectorAll('{}'))", css_selector),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_class() {
        let steps = parse_chain("class.title@text");
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0], Step::Class("title".to_string()));
        assert_eq!(steps[1], Step::Text);
    }

    #[test]
    fn test_parse_tag_chain() {
        let steps = parse_chain("tag.h3@tag.a@href");
        assert_eq!(steps.len(), 3);
        assert_eq!(steps[0], Step::Tag("h3".to_string()));
        assert_eq!(steps[1], Step::Tag("a".to_string()));
        assert_eq!(steps[2], Step::Href);
    }

    #[test]
    fn test_parse_indexed() {
        let steps = parse_chain("class.navtxt@tag.p.0@textNodes");
        assert_eq!(steps.len(), 3);
        assert_eq!(steps[0], Step::Class("navtxt".to_string()));
        assert_eq!(steps[1], Step::TagIndexed("p".to_string(), 0));
        assert_eq!(steps[2], Step::TextNodes);
    }

    #[test]
    fn test_parse_not_indexed() {
        let steps = parse_chain("class.labelbox@tag.label!0@text");
        assert_eq!(steps.len(), 3);
        assert_eq!(steps[0], Step::Class("labelbox".to_string()));
        assert_eq!(steps[1], Step::TagNotIndexed("label".to_string(), 0));
        assert_eq!(steps[2], Step::Text);
    }

    #[test]
    fn test_parse_attr_selector() {
        let steps = parse_chain("[property$=author]@content");
        assert_eq!(steps.len(), 2);
        assert_eq!(
            steps[0],
            Step::Attr {
                name: "property".to_string(),
                op: AttrOp::Ends,
                value: "author".to_string(),
            }
        );
        assert_eq!(steps[1], Step::Content);
    }

    #[test]
    fn test_attr_with_pipe_values() {
        let steps = parse_chain("[property~=category|status|update_time]@content");
        assert_eq!(steps.len(), 2);
        assert_eq!(
            steps[0],
            Step::Attr {
                name: "property".to_string(),
                op: AttrOp::ContainsWord,
                value: "category|status|update_time".to_string(),
            }
        );
    }

    #[test]
    fn test_to_js_expression_class_text() {
        let steps = parse_chain("class.title@text");
        let js = to_js_expression(&steps);
        assert_eq!(js, "el.querySelector('.title')?.textContent?.trim() || ''");
    }

    #[test]
    fn test_to_js_expression_tag_chain_href() {
        let steps = parse_chain("tag.h3@tag.a@href");
        let js = to_js_expression(&steps);
        assert_eq!(js, "el.querySelector('h3 a')?.getAttribute('href') || ''");
    }

    #[test]
    fn test_to_js_expression_indexed() {
        let steps = parse_chain("class.navtxt@tag.p.0@textNodes");
        let js = to_js_expression(&steps);
        assert_eq!(
            js,
            "el.querySelector('.navtxt p:nth-child(1)')?.textContent || ''"
        );
    }

    #[test]
    fn test_to_js_expression_not_indexed() {
        let steps = parse_chain("class.labelbox@tag.label!0@text");
        let js = to_js_expression(&steps);
        assert_eq!(
            js,
            "el.querySelector('.labelbox label:not(:nth-child(1))')?.textContent?.trim() || ''"
        );
    }

    #[test]
    fn test_to_js_expression_attr_content() {
        let steps = parse_chain("[property$=author]@content");
        let js = to_js_expression(&steps);
        assert_eq!(
            js,
            "el.querySelector('[property$=\"author\"]')?.getAttribute('content') || ''"
        );
    }

    #[test]
    fn test_to_js_all_expression() {
        let steps = parse_chain("class.newbox@tag.li");
        let js = to_js_all_expression(&steps);
        assert_eq!(js, "Array.from(el.querySelectorAll('.newbox li'))");
    }

    #[test]
    fn test_to_js_all_with_text() {
        let steps = parse_chain("class.list@tag.a@text");
        let js = to_js_all_expression(&steps);
        assert_eq!(
            js,
            "Array.from(el.querySelectorAll('.list a'), e => e.textContent?.trim() || '')"
        );
    }

    #[test]
    fn test_69shuba_search_items() {
        let steps = parse_chain("class.newbox@tag.li");
        let js = to_js_all_expression(&steps);
        assert_eq!(js, "Array.from(el.querySelectorAll('.newbox li'))");

        let steps = parse_chain("tag.h3@tag.a@text");
        let js = to_js_expression(&steps);
        assert_eq!(js, "el.querySelector('h3 a')?.textContent?.trim() || ''");

        let steps = parse_chain("class.labelbox@tag.label.0@text");
        let js = to_js_expression(&steps);
        assert_eq!(
            js,
            "el.querySelector('.labelbox label:nth-child(1)')?.textContent?.trim() || ''"
        );
    }

    #[test]
    fn test_69shuba_cover_url() {
        let steps = parse_chain("tag.img@data-src");
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0], Step::Tag("img".to_string()));
        assert_eq!(steps[1], Step::GenericAttr("data-src".to_string()));

        let js = to_js_expression(&steps);
        assert_eq!(
            js,
            "el.querySelector('img')?.getAttribute('data-src') || ''"
        );
    }

    #[test]
    fn test_generic_attr_fallback() {
        let steps = parse_chain("tag.img@data-original");
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[1], Step::GenericAttr("data-original".to_string()));
    }
}