//! Text Deduplication Module
//!
//! Provides text deduplication utilities based on string similarity:
//! - Levenshtein distance calculation
//! - Similarity-based deduplication
//! - Paragraph deduplication for novel content

use std::collections::HashSet;
use strsim::{levenshtein, jaro_winkler};

/// Deduplication configuration
#[derive(Debug, Clone)]
pub struct DedupConfig {
    /// Similarity threshold (0.0-1.0), paragraphs above this are considered duplicates
    pub threshold: f64,
    /// Minimum length to consider for deduplication
    pub min_length: usize,
    /// Maximum length difference ratio (0.0-1.0)
    pub max_length_diff_ratio: f64,
    /// Use Jaro-Winkler instead of Levenshtein (faster but less accurate)
    pub use_jaro_winkler: bool,
}

impl Default for DedupConfig {
    fn default() -> Self {
        Self {
            threshold: 0.9,       // 90% similarity
            min_length: 10,       // At least 10 characters
            max_length_diff_ratio: 0.2, // Max 20% length difference
            use_jaro_winkler: false,
        }
    }
}

/// Text deduplicator
pub struct TextDeduplicator {
    config: DedupConfig,
}

impl TextDeduplicator {
    /// Create a new deduplicator with default configuration
    pub fn new() -> Self {
        Self {
            config: DedupConfig::default(),
        }
    }

    /// Create a deduplicator with custom configuration
    pub fn with_config(config: DedupConfig) -> Self {
        Self { config }
    }

    /// Calculate similarity between two strings
    pub fn calculate_similarity(&self, a: &str, b: &str) -> f64 {
        if self.config.use_jaro_winkler {
            jaro_winkler(a, b)
        } else {
            let max_len = a.chars().count().max(b.chars().count());
            if max_len == 0 {
                return 1.0;
            }
            let distance = levenshtein(a, b);
            1.0 - (distance as f64 / max_len as f64)
        }
    }

    /// Check if two strings are similar enough to be considered duplicates
    pub fn is_similar(&self, a: &str, b: &str) -> bool {
        let a_len = a.chars().count();
        let b_len = b.chars().count();

        // Skip if either is too short
        if a_len < self.config.min_length || b_len < self.config.min_length {
            return false;
        }

        // Check length difference ratio
        let len_diff_ratio = (a_len as f64 - b_len as f64).abs() / a_len.max(b_len) as f64;
        if len_diff_ratio > self.config.max_length_diff_ratio {
            return false;
        }

        // Calculate similarity
        let similarity = self.calculate_similarity(a, b);
        similarity >= self.config.threshold
    }

    /// Deduplicate paragraphs, removing similar ones
    pub fn deduplicate(&self, paragraphs: &[String]) -> Vec<String> {
        if paragraphs.is_empty() {
            return Vec::new();
        }

        let mut result = Vec::new();
        let mut skip_indices: HashSet<usize> = HashSet::new();

        for (i, para) in paragraphs.iter().enumerate() {
            if skip_indices.contains(&i) {
                continue;
            }

            // Check against all subsequent paragraphs
            for (j, other) in paragraphs.iter().enumerate().skip(i + 1) {
                if skip_indices.contains(&j) {
                    continue;
                }

                if self.is_similar(para, other) {
                    // Mark the later one as duplicate
                    skip_indices.insert(j);
                }
            }

            result.push(para.clone());
        }

        result
    }

    /// Deduplicate consecutive similar paragraphs
    pub fn deduplicate_consecutive(&self, paragraphs: &[String]) -> Vec<String> {
        if paragraphs.is_empty() {
            return Vec::new();
        }

        let mut result = Vec::new();
        let mut last_para: Option<&str> = None;

        for para in paragraphs {
            // Check if similar to previous paragraph
            let should_skip = if let Some(last) = last_para {
                self.is_similar(last, para)
            } else {
                false
            };

            if !should_skip {
                result.push(para.clone());
                last_para = Some(para.as_str());
            }
        }

        result
    }

    /// Find duplicate paragraphs and return their indices
    pub fn find_duplicates(&self, paragraphs: &[String]) -> Vec<(usize, usize, f64)> {
        let mut duplicates = Vec::new();

        for (i, para) in paragraphs.iter().enumerate() {
            for (j, other) in paragraphs.iter().enumerate().skip(i + 1) {
                let similarity = self.calculate_similarity(para, other);
                if similarity >= self.config.threshold {
                    duplicates.push((i, j, similarity));
                }
            }
        }

        duplicates
    }

    /// Remove common noise patterns from paragraphs before deduplication
    pub fn remove_noise_patterns(&self, paragraphs: &[String]) -> Vec<String> {
        paragraphs
            .iter()
            .map(|p| {
                // Remove common noise patterns
                let mut cleaned = p.clone();
                
                // Remove URL patterns
                cleaned = regex::Regex::new(r"https?://[^\s]+")
                    .map(|re| re.replace_all(&cleaned, "").to_string())
                    .unwrap_or(cleaned);
                
                // Remove advertisement patterns
                cleaned = regex::Regex::new(r"(?i)(广告|赞助|合作|推广)")
                    .map(|re| re.replace_all(&cleaned, "").to_string())
                    .unwrap_or(cleaned);
                
                // Remove "本章未完" patterns
                cleaned = regex::Regex::new(r"本章未完.*")
                    .map(|re| re.replace_all(&cleaned, "").to_string())
                    .unwrap_or(cleaned);
                
                cleaned.trim().to_string()
            })
            .filter(|p| !p.is_empty())
            .collect()
    }
}

impl Default for TextDeduplicator {
    fn default() -> Self {
        Self::new()
    }
}

/// Quick utility function to deduplicate paragraphs
pub fn deduplicate_paragraphs(paragraphs: &[String]) -> Vec<String> {
    TextDeduplicator::new().deduplicate(paragraphs)
}

/// Quick utility function to calculate similarity
pub fn similarity(a: &str, b: &str) -> f64 {
    TextDeduplicator::new().calculate_similarity(a, b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_similarity() {
        let a = "Hello World";
        let b = "Hello World!";
        let sim = similarity(a, b);
        assert!(sim > 0.9);
    }

    #[test]
    fn test_dissimilar() {
        let a = "Hello World";
        let b = "Goodbye Moon";
        let sim = similarity(a, b);
        assert!(sim < 0.5);
    }

    #[test]
    fn test_deduplicate() {
        let paragraphs = vec![
            "这是一个测试段落".to_string(),
            "这是一个测试段落".to_string(), // Exact duplicate
            "这是另一个不同的段落".to_string(),
        ];
        let deduped = deduplicate_paragraphs(&paragraphs);
        assert_eq!(deduped.len(), 2);
    }

    #[test]
    fn test_deduplicate_similar() {
        let paragraphs = vec![
            "本章内容由某某网站提供".to_string(),
            "本章内容由某某网站提供！".to_string(), // Similar
            "正文内容开始".to_string(),
        ];
        let deduper = TextDeduplicator::with_config(DedupConfig {
            threshold: 0.9,
            ..Default::default()
        });
        let deduped = deduper.deduplicate(&paragraphs);
        assert_eq!(deduped.len(), 2);
    }

    #[test]
    fn test_deduplicate_consecutive() {
        let paragraphs = vec![
            "段落一".to_string(),
            "段落一".to_string(), // Consecutive duplicate
            "段落二".to_string(),
        ];
        let deduper = TextDeduplicator::new();
        let deduped = deduper.deduplicate_consecutive(&paragraphs);
        assert_eq!(deduped.len(), 2);
    }
}
