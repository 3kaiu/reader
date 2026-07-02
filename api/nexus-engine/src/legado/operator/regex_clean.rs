//! `##` (regex clean) operator — apply regex replacement to extracted text.
//!
//! This is applied as a postfix step after the main selector extraction.
//! Syntax: `selector##pattern##replacement` where `##` is the delimiter.
//!
//! A third `##` prefix (e.g. `selector####patt##repl`) means replaceFirst instead of replaceAll.

use crate::legado::selector::regex;

/// Apply regex clean to text
///
/// `pattern` is the regex to match
/// `replacement` is the replacement string (may contain $1, $2 capture references)
pub fn clean_text(text: &str, pattern: &str, replacement: &str) -> String {
    if text.is_empty() || pattern.is_empty() {
        return text.to_string();
    }
    regex::replace_regex(text, pattern, replacement)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_clean() {
        assert_eq!(clean_text("Hello XXX World", r"\s+XXX\s+", " "), "Hello World");
    }

    #[test]
    fn test_capture_groups() {
        assert_eq!(
            clean_text("Chapter 123", r"Chapter (\d+)", "Ch. $1"),
            "Ch. 123"
        );
    }

    #[test]
    fn test_no_match() {
        assert_eq!(clean_text("Hello World", r"\d+", ""), "Hello World");
    }

    #[test]
    fn test_empty_input() {
        assert_eq!(clean_text("", r"\d+", ""), "");
    }
}