//! Dynamic Noise Detection Module
//!
//! Statistical-based noise pattern detection for content extraction.
//! Automatically learns and adapts to new noise patterns.

use regex::Regex;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Dynamic noise detector with statistical pattern learning
pub struct DynamicNoiseDetector {
    // Statistical thresholds
    short_para_threshold: usize,
    high_link_density_threshold: f64,

    // Pattern-based detection
    common_patterns: Vec<Regex>,

    // Position-based detection
    header_footer_markers: Vec<String>,

    // Learned patterns (from user feedback or statistics)
    learned_patterns: Arc<RwLock<HashMap<String, f64>>>,

    // Configuration
    enable_learning: bool,
}

impl DynamicNoiseDetector {
    /// Create a new dynamic noise detector with default settings
    pub fn new() -> Self {
        Self {
            short_para_threshold: 60,
            high_link_density_threshold: 0.3,
            common_patterns: Self::build_common_patterns(),
            header_footer_markers: vec![
                "页脚".to_string(),
                "页眉".to_string(),
                "底部".to_string(),
                "顶部".to_string(),
                "copyright".to_string(),
                "版权".to_string(),
            ],
            learned_patterns: Arc::new(RwLock::new(HashMap::new())),
            enable_learning: true,
        }
    }

    /// Create a custom noise detector with specific thresholds
    pub fn with_config(
        short_para_threshold: usize,
        high_link_density_threshold: f64,
        enable_learning: bool,
    ) -> Self {
        Self {
            short_para_threshold,
            high_link_density_threshold,
            common_patterns: Self::build_common_patterns(),
            header_footer_markers: vec![
                "页脚".to_string(),
                "页眉".to_string(),
                "底部".to_string(),
                "顶部".to_string(),
                "copyright".to_string(),
                "版权".to_string(),
            ],
            learned_patterns: Arc::new(RwLock::new(HashMap::new())),
            enable_learning,
        }
    }

    /// Build common noise patterns using regex
    fn build_common_patterns() -> Vec<Regex> {
        vec![
            // URL patterns
            Regex::new(r"https?://[^\s]+").unwrap(),
            Regex::new(r"www\.[^\s]+").unwrap(),
            Regex::new(r"[a-zA-Z0-9-]+\.(com|cn|net|org|io)[^\s]*").unwrap(),

            // Email patterns
            Regex::new(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}").unwrap(),

            // Phone number patterns
            Regex::new(r"1[3-9]\d{9}").unwrap(),
            Regex::new(r"\d{3,4}[- ]?\d{7,8}").unwrap(),

            // Date patterns (often in footers)
            Regex::new(r"\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?").unwrap(),

            // Common button/link text patterns
            Regex::new(r"^(点击|请点击|立即|马上)[^\n]{0,10}$").unwrap(),
            Regex::new(r"^(返回|返回首页|返回顶部)[^\n]{0,10}$").unwrap(),

            // Advertisement patterns
            Regex::new(r"(广告|赞助|合作|推广)[^\n]{0,20}").unwrap(),

            // Copyright patterns
            Regex::new(r"(版权|Copyright|©)[^\n]{0,30}").unwrap(),

            // Technical patterns
            Regex::new(r"(加载中|正在加载|Loading)[^\n]{0,10}").unwrap(),

            // Repetitive patterns (often navigation)
            Regex::new(r"(第[一二三四五六七八九十百千]+[章节页回]).{0,5}").unwrap(),
        ]
    }

    /// Check if a paragraph is noise based on multiple criteria
    pub fn is_noise(
        &self,
        para: &str,
        context: &ExtractionContext,
    ) -> NoiseDetectionResult {
        let mut reasons = Vec::new();
        let mut score = 0.0;

        // 1. Length check
        let para_len = para.chars().count();
        if para_len < self.short_para_threshold {
            score += 2.0;
            reasons.push(NoiseReason::TooShort(para_len));
        }

        // 2. Link density check
        let link_ratio = self.count_links(para) as f64 / para_len.max(1) as f64;
        if link_ratio > self.high_link_density_threshold {
            score += 3.0;
            reasons.push(NoiseReason::HighLinkDensity(link_ratio));
        }

        // 3. Pattern matching
        for (i, pattern) in self.common_patterns.iter().enumerate() {
            if pattern.is_match(para) {
                score += 1.5;
                reasons.push(NoiseReason::MatchesPattern(i));
            }
        }

        // 4. Position-based detection
        if context.is_first_or_last_para {
            for marker in &self.header_footer_markers {
                if para.contains(marker) {
                    score += 2.0;
                    reasons.push(NoiseReason::HeaderFooterMarker(marker.clone()));
                    break;
                }
            }
        }

        // 5. Learned patterns
        if self.enable_learning {
            let learned = self.learned_patterns.read().unwrap();
            for (pattern, weight) in learned.iter() {
                if para.contains(pattern) {
                    score += weight;
                    reasons.push(NoiseReason::LearnedPattern(pattern.clone()));
                }
            }
        }

        // 6. Statistical features
        let stats = self.calculate_statistics(para);
        if stats.digit_ratio > 0.5 {
            score += 1.0;
            reasons.push(NoiseReason::HighDigitRatio(stats.digit_ratio));
        }

        if stats.punctuation_ratio < 0.05 && para_len > 50 {
            score += 0.5;
            reasons.push(NoiseReason::LowPunctuationRatio(stats.punctuation_ratio));
        }

        // 7. Repetitive content detection
        if self.is_repetitive(para) {
            score += 2.0;
            reasons.push(NoiseReason::RepetitiveContent);
        }

        let is_noise = score > 3.0;
        NoiseDetectionResult {
            is_noise,
            score,
            reasons,
        }
    }

    /// Count links in a paragraph
    fn count_links(&self, para: &str) -> usize {
        let link_pattern = Regex::new(r"https?://[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|cn|net|org)[^\s]*")
            .unwrap();
        link_pattern.find_iter(para).count()
    }

    /// Calculate statistical features of a paragraph
    fn calculate_statistics(&self, para: &str) -> ParagraphStatistics {
        let total_chars = para.chars().count();
        if total_chars == 0 {
            return ParagraphStatistics::default();
        }

        let digit_count = para.chars().filter(|c| c.is_ascii_digit()).count();
        let punct_count = para.chars().filter(|c| {
            matches!(
                *c,
                '。' | '！' | '？' | '；' | '，' | '、' | '!' | '?' | ';' | ',' | '.' | ':' | '—' | '-'
            )
        }).count();

        ParagraphStatistics {
            digit_ratio: digit_count as f64 / total_chars as f64,
            punctuation_ratio: punct_count as f64 / total_chars as f64,
            total_chars,
        }
    }

    /// Check if content is repetitive (often navigation or TOC)
    fn is_repetitive(&self, para: &str) -> bool {
        // Check for repeated patterns like "第1章 第2章 第3章"
        let chapter_pattern = Regex::new(r"第[一二三四五六七八九十百千0-9]+[章节回]").unwrap();
        let matches: Vec<_> = chapter_pattern.find_iter(para).collect();

        if matches.len() > 3 {
            return true;
        }

        // Check for repeated phrases
        let words: Vec<&str> = para.split_whitespace().collect();
        if words.len() > 10 {
            let unique_words: std::collections::HashSet<&str> = words.iter().cloned().collect();
            let repetition_ratio = 1.0 - (unique_words.len() as f64 / words.len() as f64);
            if repetition_ratio > 0.5 {
                return true;
            }
        }

        false
    }

    /// Learn a new noise pattern from user feedback or statistics
    pub fn learn_pattern(&self, pattern: String, weight: f64) {
        if self.enable_learning {
            let mut learned = self.learned_patterns.write().unwrap();
            learned.insert(pattern, weight);
        }
    }

    /// Get all learned patterns
    pub fn get_learned_patterns(&self) -> Vec<(String, f64)> {
        let learned = self.learned_patterns.read().unwrap();
        learned.iter().map(|(k, v)| (k.clone(), *v)).collect()
    }

    /// Clear all learned patterns
    pub fn clear_learned_patterns(&self) {
        if self.enable_learning {
            let mut learned = self.learned_patterns.write().unwrap();
            learned.clear();
        }
    }
}

impl Default for DynamicNoiseDetector {
    fn default() -> Self {
        Self::new()
    }
}

/// Context information for noise detection
#[derive(Debug, Clone)]
pub struct ExtractionContext {
    pub is_first_or_last_para: bool,
    pub total_paragraphs: usize,
    pub current_index: usize,
}

impl ExtractionContext {
    pub fn new(total_paragraphs: usize, current_index: usize) -> Self {
        Self {
            is_first_or_last_para: current_index == 0 || current_index == total_paragraphs - 1,
            total_paragraphs,
            current_index,
        }
    }
}

/// Result of noise detection
#[derive(Debug, Clone)]
pub struct NoiseDetectionResult {
    pub is_noise: bool,
    pub score: f64,
    pub reasons: Vec<NoiseReason>,
}

/// Reasons for classifying content as noise
#[derive(Debug, Clone)]
pub enum NoiseReason {
    TooShort(usize),
    HighLinkDensity(f64),
    MatchesPattern(usize),
    HeaderFooterMarker(String),
    LearnedPattern(String),
    HighDigitRatio(f64),
    LowPunctuationRatio(f64),
    RepetitiveContent,
}

/// Statistical features of a paragraph
#[derive(Debug, Clone, Default)]
pub struct ParagraphStatistics {
    pub digit_ratio: f64,
    pub punctuation_ratio: f64,
    pub total_chars: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_short_paragraph_detection() {
        let detector = DynamicNoiseDetector::new();
        let context = ExtractionContext::new(10, 5);

        let short_para = "点击继续";
        let result = detector.is_noise(short_para, &context);

        assert!(result.is_noise);
        assert!(result.reasons.iter().any(|r| matches!(r, NoiseReason::TooShort(_))));
    }

    #[test]
    fn test_link_density_detection() {
        let detector = DynamicNoiseDetector::new();
        let context = ExtractionContext::new(10, 5);

        let link_heavy = "访问 https://example.com 和 https://test.com 获取更多信息";
        let result = detector.is_noise(link_heavy, &context);

        assert!(result.is_noise);
        assert!(result.reasons.iter().any(|r| matches!(r, NoiseReason::HighLinkDensity(_))));
    }

    #[test]
    fn test_pattern_matching() {
        let detector = DynamicNoiseDetector::new();
        let context = ExtractionContext::new(10, 5);

        let copyright = "Copyright © 2024 Example Inc. All rights reserved.";
        let result = detector.is_noise(copyright, &context);

        assert!(result.is_noise);
    }

    #[test]
    fn test_repetitive_content() {
        let detector = DynamicNoiseDetector::new();
        let context = ExtractionContext::new(10, 5);

        let repetitive = "第一章 第二章 第三章 第四章 第五章";
        let result = detector.is_noise(repetitive, &context);

        assert!(result.is_noise);
    }

    #[test]
    fn test_learned_patterns() {
        let detector = DynamicNoiseDetector::new();
        detector.learn_pattern("特殊噪音词".to_string(), 2.0);

        let context = ExtractionContext::new(10, 5);
        let result = detector.is_noise("这是一个特殊噪音词段落", &context);

        assert!(result.is_noise);
        assert!(result.reasons.iter().any(|r| matches!(r, NoiseReason::LearnedPattern(_))));
    }
}
