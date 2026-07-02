//! Regex selector dispatcher — regex match/replace operations
//!
//! Handles Legado's `@regex:` prefixed rules and `##pattern##replacement` clean logic.

use regex::Regex;
use std::num::NonZeroUsize;
use std::sync::LazyLock;
use std::sync::Mutex;

/// Simple thread-local regex cache
static REGEX_CACHE: LazyLock<Mutex<lru::LruCache<String, Regex>>> =
    LazyLock::new(|| Mutex::new(lru::LruCache::new(NonZeroUsize::new(32).unwrap())));

/// Extract text using a regex match
///
/// Returns the first capture group, or the full match if no groups.
pub fn extract_regex(text: &str, pattern: &str) -> Option<String> {
    let re = compile_regex(pattern)?;
    re.captures(text).and_then(|caps| {
        if caps.len() > 1 {
            caps.get(1).map(|m| m.as_str().to_string())
        } else {
            caps.get(0).map(|m| m.as_str().to_string())
        }
    })
}

/// Apply a regex replacement
///
/// Supports `##pattern##replacement` syntax from Legado.
pub fn replace_regex(text: &str, pattern: &str, replacement: &str) -> String {
    let re = match compile_regex(pattern) {
        Some(r) => r,
        None => return text.to_string(),
    };
    re.replace_all(text, replacement).to_string()
}

/// Compile a regex with caching
fn compile_regex(pattern: &str) -> Option<Regex> {
    // Check cache
    if let Ok(mut cache) = REGEX_CACHE.lock() {
        if let Some(re) = cache.get(pattern) {
            return Some(re.clone());
        }
    }

    // Compile
    match Regex::new(pattern) {
        Ok(re) => {
            if let Ok(mut cache) = REGEX_CACHE.lock() {
                cache.put(pattern.to_string(), re.clone());
            }
            Some(re)
        },
        Err(e) => {
            tracing::warn!("Failed to compile regex '{}': {:?}", pattern, e);
            None
        },
    }
}

/// Apply `##pattern##replacement` to text
///
/// This is the postfix cleaning step applied after selector extraction.
pub fn apply_regex_clean(text: &str, pattern: &str, replacement: &str) -> String {
    if pattern.is_empty() {
        return text.to_string();
    }
    replace_regex(text, pattern, replacement)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_regex_extract() {
        let result = extract_regex("Chapter 123 - Title", r"Chapter (\d+)");
        assert_eq!(result, Some("123".to_string()));
    }

    #[test]
    fn test_regex_replace() {
        let result = replace_regex("  hello   world  ", r"\s+", " ");
        assert_eq!(result, " hello world ");
    }

    #[test]
    fn test_regex_clean() {
        let result = apply_regex_clean("Hello\n\n\nWorld", r"\n{3,}", "\n\n");
        assert_eq!(result, "Hello\n\nWorld");
    }

    #[test]
    fn test_no_match() {
        let result = extract_regex("no numbers", r"(\d+)");
        assert_eq!(result, None);
    }
}