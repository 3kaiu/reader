//! Text Cleaning Module
//!
//! Provides text cleaning utilities for content extraction:
//! - Zero-width character removal
//! - Control character removal
//! - Unicode normalization

use regex::Regex;
use std::sync::LazyLock;
use unicode_normalization::UnicodeNormalization;

/// Zero-width and invisible character ranges
const ZERO_WIDTH_RANGES: &[(u32, u32)] = &[
    (0x200B, 0x200F), // Zero width characters + direction marks
    (0x2060, 0x2064), // Word joiner, invisible operators
    (0xFEFF, 0xFEFF), // Zero width no-break space (BOM)
    (0x00AD, 0x00AD), // Soft hyphen
    (0x034F, 0x034F), // Combining grapheme joiner
    (0x180B, 0x180D), // Mongolian free variation selectors
    (0x180E, 0x180E), // Mongolian vowel separator
    (0x200C, 0x200D), // Zero width non-joiner/joiner
    (0xFE00, 0xFE0F), // Variation selectors
    (0xE0100, 0xE01EF), // Variation selectors supplement
];

/// Pre-compiled regex for control characters (excluding newlines)
static CONTROL_CHARS_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]").unwrap()
});

#[inline]
fn is_zero_width_or_invisible(ch: char) -> bool {
    let cp = ch as u32;
    ZERO_WIDTH_RANGES
        .iter()
        .any(|(start, end)| cp >= *start && cp <= *end)
}

/// Text cleaner configuration
#[derive(Debug, Clone)]
pub struct CleanConfig {
    /// Remove zero-width characters
    pub remove_zero_width: bool,
    /// Remove control characters
    pub remove_control_chars: bool,
    /// Apply Unicode normalization (NFC)
    pub unicode_normalize: bool,
    /// Remove excessive whitespace
    pub normalize_whitespace: bool,
}

impl Default for CleanConfig {
    fn default() -> Self {
        Self {
            remove_zero_width: true,
            remove_control_chars: true,
            unicode_normalize: true,
            normalize_whitespace: true,
        }
    }
}

/// Text cleaner
pub struct TextCleaner {
    config: CleanConfig,
}

impl TextCleaner {
    /// Create a new text cleaner with default configuration
    pub fn new() -> Self {
        Self {
            config: CleanConfig::default(),
        }
    }

    /// Create a text cleaner with custom configuration
    pub fn with_config(config: CleanConfig) -> Self {
        Self { config }
    }

    /// Clean text according to configuration
    pub fn clean(&self, text: &str) -> String {
        let mut result = text.to_string();

        // Step 1: Remove zero-width characters
        if self.config.remove_zero_width {
            result = self.remove_zero_width(&result);
        }

        // Step 2: Remove control characters
        if self.config.remove_control_chars {
            result = self.remove_control_chars(&result);
        }

        // Step 3: Unicode normalization
        if self.config.unicode_normalize {
            result = self.normalize_unicode(&result);
        }

        // Step 4: Normalize whitespace
        if self.config.normalize_whitespace {
            result = self.normalize_whitespace(&result);
        }

        result
    }

    /// Remove zero-width and invisible characters
    pub fn remove_zero_width(&self, text: &str) -> String {
        text.chars()
            .filter(|ch| !is_zero_width_or_invisible(*ch))
            .collect()
    }

    /// Remove control characters (keeping newlines)
    pub fn remove_control_chars(&self, text: &str) -> String {
        CONTROL_CHARS_REGEX.replace_all(text, "").to_string()
    }

    /// Apply NFC Unicode normalization
    pub fn normalize_unicode(&self, text: &str) -> String {
        text.nfc().collect()
    }

    /// Normalize whitespace (collapse multiple spaces, trim lines)
    pub fn normalize_whitespace(&self, text: &str) -> String {
        text.lines()
            .map(|line| {
                // Collapse multiple spaces into single space
                let trimmed: String = line
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ");
                trimmed
            })
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Remove specific patterns from text
    pub fn remove_patterns(&self, text: &str, patterns: &[&str]) -> String {
        let mut result = text.to_string();
        for pattern in patterns {
            if let Ok(re) = Regex::new(pattern) {
                result = re.replace_all(&result, "").to_string();
            }
        }
        result
    }

    /// Clean text for novel reading (optimized for Chinese novels)
    pub fn clean_for_novel(text: &str) -> String {
        let cleaner = Self::new();
        cleaner.clean(text)
    }
}

impl Default for TextCleaner {
    fn default() -> Self {
        Self::new()
    }
}

/// Quick utility function to clean text
pub fn clean_text(text: &str) -> String {
    TextCleaner::new().clean(text)
}

/// Quick utility function to remove zero-width characters
pub fn remove_zero_width_chars(text: &str) -> String {
    TextCleaner::new().remove_zero_width(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remove_zero_width() {
        let input = "Hello\u{200B}World\u{200C}!";
        let output = remove_zero_width_chars(input);
        assert_eq!(output, "HelloWorld!");
    }

    #[test]
    fn test_remove_control_chars() {
        let input = "Hello\x00World\x07!";
        let cleaner = TextCleaner::new();
        let output = cleaner.remove_control_chars(input);
        assert_eq!(output, "HelloWorld!");
    }

    #[test]
    fn test_normalize_whitespace() {
        let input = "Hello   World\n\n\nTest";
        let cleaner = TextCleaner::new();
        let output = cleaner.normalize_whitespace(input);
        assert_eq!(output, "Hello World\nTest");
    }

    #[test]
    fn test_clean_for_novel() {
        let input = "第一章\u{200B}开始\n\n\u{FEFF}正文内容";
        let output = TextCleaner::clean_for_novel(input);
        assert_eq!(output, "第一章开始\n正文内容");
    }
}
