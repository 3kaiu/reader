//! JSONPath selector dispatcher — JSON data extraction
//!
//! Uses `serde_json_path` to execute JSONPath queries against `serde_json::Value`.
//!
//! Supports Legado JSONPath patterns:
//! - `$.data.list[*].name` — wildcard
//! - `$..author` — deep scan
//! - `$[?@.price < 10]` — filter
//! - `$.store.book[0].title` — index

/// Extract a single string value using JSONPath
///
/// If the path matches multiple values, returns the first one.
/// Returns `None` if no match or the value is not a string.
pub fn extract_json_path(json: &serde_json::Value, path_expr: &str) -> Option<String> {
    let expr = path_expr.trim();
    if expr.is_empty() {
        return None;
    }

    // Try using serde_json::Value pointer for simple paths first (fast path)
    if let Some(pointer_str) = json_path_to_pointer(expr) {
        if let Some(value) = json.pointer(&pointer_str) {
            if let Some(s) = value.as_str() {
                return Some(s.to_string());
            }
        }
    }

    // Fall back to serde_json_path for full JSONPath support
    extract_via_serde_json_path(json, expr)
}

/// Extract multiple string values (for lists)
pub fn extract_all_json_path(json: &serde_json::Value, path_expr: &str) -> Vec<String> {
    let expr = path_expr.trim();
    if expr.is_empty() {
        return Vec::new();
    }

    match serde_json_path::JsonPath::parse(expr) {
        Ok(path) => {
            let results = path.query(json);
            results
                .iter()
                .filter_map(|n| n.as_str().map(|s| s.to_string()))
                .collect()
        },
        Err(e) => {
            tracing::warn!("Failed to parse JSONPath '{}': {:?}", expr, e);
            Vec::new()
        },
    }
}

fn extract_via_serde_json_path(json: &serde_json::Value, expr: &str) -> Option<String> {
    match serde_json_path::JsonPath::parse(expr) {
        Ok(path) => {
            let results = path.query(json);
            results
                .first()
                .and_then(|n| n.as_str().map(|s| s.to_string()))
        },
        Err(e) => {
            tracing::warn!("Failed to parse JSONPath '{}': {:?}", expr, e);
            None
        },
    }
}

/// Simple heuristic: convert `$.store.book[0].title` to `/store/book/0/title`
///
/// This only works for simple paths without wildcards, deep scan, or filters.
/// Returns `None` for complex patterns that need full JSONPath.
fn json_path_to_pointer(path: &str) -> Option<String> {
    let path = path.trim();
    if !path.starts_with("$.") {
        return None;
    }

    let inner = &path[2..]; // strip "$."
    let mut pointer = String::from("/");
    let mut chars = inner.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '.' => pointer.push('/'),
            '[' => {
                // Parse bracket index: [0], ['key']
                if chars.peek() == Some(&'\'') || chars.peek() == Some(&'"') {
                    // String key: ['key']
                    let quote = chars.next().unwrap();
                    let mut key = String::new();
                    loop {
                        match chars.next() {
                            Some(c) if c == quote => break,
                            Some(c) => key.push(c),
                            None => break,
                        }
                    }
                    pointer.push('/');
                    pointer.push_str(&key);
                    // Skip closing ]
                    chars.next();
                } else {
                    // Numeric index: [0]
                    let mut idx = String::new();
                    loop {
                        match chars.peek() {
                            Some(c) if c.is_ascii_digit() => {
                                idx.push(*c);
                                chars.next();
                            },
                            Some(']') => {
                                chars.next();
                                break;
                            },
                            _ => break,
                        }
                    }
                    if !idx.is_empty() {
                        pointer.push('/');
                        pointer.push_str(&idx);
                    }
                }
            },
            '*' | '?' | '@' => return None, // complex patterns
            _ => pointer.push(ch),
        }
    }

    // Check if the path contains wildcard or deep scan patterns
    if pointer.contains('*') || path.contains("..") || path.contains('?') || path.contains('@') {
        return None;
    }

    Some(pointer)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn test_json() -> serde_json::Value {
        json!({
            "store": {
                "book": [
                    { "title": "Book A", "author": "Author 1" },
                    { "title": "Book B", "author": "Author 2" }
                ]
            },
            "data": {
                "list": [
                    { "name": "Item 1" },
                    { "name": "Item 2" }
                ]
            }
        })
    }

    #[test]
    fn test_simple_path() {
        let json = test_json();
        let result = extract_json_path(&json, "$.store.book[0].title");
        assert_eq!(result, Some("Book A".to_string()));
    }

    #[test]
    fn test_wildcard() {
        let json = test_json();
        let results = extract_all_json_path(&json, "$.data.list[*].name");
        assert_eq!(results, vec!["Item 1", "Item 2"]);
    }

    #[test]
    fn test_deep_scan() {
        let json = test_json();
        let results = extract_all_json_path(&json, "$..author");
        assert_eq!(results, vec!["Author 1", "Author 2"]);
    }

    #[test]
    fn test_pointer_conversion() {
        assert_eq!(
            json_path_to_pointer("$.store.book[0].title"),
            Some("/store/book/0/title".to_string())
        );
    }

    #[test]
    fn test_complex_path_returns_none_for_pointer() {
        assert_eq!(json_path_to_pointer("$..author"), None);
    }
}