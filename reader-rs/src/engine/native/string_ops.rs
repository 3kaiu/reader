//! String Operations - Trim, Replace, Split, Substring
//!
//! Native Rust implementations of string manipulation APIs.

use anyhow::Result;
use regex::Regex;

/// Trim whitespace from string
pub fn string_trim(input: &str) -> Result<String> {
    Ok(input.trim().to_string())
}

/// Replace pattern in string
pub fn string_replace(
    input: &str,
    pattern: &str,
    replacement: &str,
    is_regex: bool,
    global: bool,
) -> Result<String> {
    if is_regex {
        if let Ok(re) = Regex::new(pattern) {
            if global {
                Ok(re.replace_all(input, replacement).to_string())
            } else {
                Ok(re.replace(input, replacement).to_string())
            }
        } else {
            // Invalid regex, fall back to literal
            Ok(input.replace(pattern, replacement))
        }
    } else {
        if global {
            Ok(input.replace(pattern, replacement))
        } else {
            Ok(input.replacen(pattern, replacement, 1))
        }
    }
}

/// Split string by delimiter
pub fn string_split(input: &str, delimiter: &str) -> Result<Vec<String>> {
    Ok(input.split(delimiter).map(|s| s.to_string()).collect())
}

/// Get substring
pub fn string_substring(input: &str, start: i32, end: Option<i32>) -> Result<String> {
    let chars: Vec<char> = input.chars().collect();
    let len = chars.len() as i32;

    let start = if start < 0 { 0 } else { start.min(len) } as usize;
    let end = end
        .map(|e| if e < 0 { len } else { e.min(len) } as usize)
        .unwrap_or(chars.len());

    if start >= end {
        return Ok(String::new());
    }

    Ok(chars[start..end].iter().collect())
}

/// Convert to lowercase
pub fn to_lower_case(input: &str) -> Result<String> {
    Ok(input.to_lowercase())
}

/// Convert to uppercase
pub fn to_upper_case(input: &str) -> Result<String> {
    Ok(input.to_uppercase())
}

/// Check if string starts with prefix
pub fn starts_with(input: &str, prefix: &str) -> bool {
    input.starts_with(prefix)
}

/// Check if string ends with suffix
pub fn ends_with(input: &str, suffix: &str) -> bool {
    input.ends_with(suffix)
}

/// Check if string contains substring
pub fn contains(input: &str, search: &str) -> bool {
    input.contains(search)
}

/// Find index of substring
pub fn index_of(input: &str, search: &str) -> i32 {
    input.find(search).map(|i| i as i32).unwrap_or(-1)
}

/// Get string length
pub fn length(input: &str) -> i32 {
    input.chars().count() as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trim() {
        assert_eq!(string_trim("  hello  ").unwrap(), "hello");
    }

    #[test]
    fn test_replace() {
        assert_eq!(
            string_replace("hello world", "world", "rust", false, true).unwrap(),
            "hello rust"
        );
    }

    #[test]
    fn test_substring() {
        assert_eq!(string_substring("hello", 1, Some(4)).unwrap(), "ell");
    }
}
