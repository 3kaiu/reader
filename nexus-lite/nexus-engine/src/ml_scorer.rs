//! Lightweight ML-based Content Scorer
//!
//! Feature extraction and scoring model for content quality assessment.
//! Uses simple linear regression without external ML dependencies.

use scraper::{ElementRef, Html, Selector};
use std::collections::HashSet;

// Import visual features
use crate::visual_features::{VisualFeatureExtractor, VisualFeatures};

/// Feature extractor for content elements
pub struct FeatureExtractor {
    // Pre-compiled selectors for feature extraction
    link_selector: Selector,
    para_selector: Selector,
    heading_selector: Selector,
    img_selector: Selector,
    nav_selector: Selector,
    button_selector: Selector,

    // Visual feature extractor
    visual_extractor: VisualFeatureExtractor,
}

impl FeatureExtractor {
    pub fn new() -> Self {
        Self {
            link_selector: Selector::parse("a").unwrap(),
            para_selector: Selector::parse("p").unwrap(),
            heading_selector: Selector::parse("h1, h2, h3, h4, h5, h6").unwrap(),
            img_selector: Selector::parse("img").unwrap(),
            nav_selector: Selector::parse("nav, aside, footer, header").unwrap(),
            button_selector: Selector::parse("button, input[type='button'], input[type='submit']").unwrap(),
            visual_extractor: VisualFeatureExtractor::new(),
        }
    }

    /// Extract comprehensive features from an element
    pub fn extract_features(&self, el: &ElementRef) -> ContentFeatures {
        let text = el.text().collect::<Vec<_>>().join("");
        let text_len = text.chars().count();

        // Text-based features
        let punct_count = self.count_punctuation(&text);
        let digit_count = self.count_digits(&text);
        let chinese_char_count = self.count_chinese_chars(&text);

        // Structure-based features
        let link_count = el.select(&self.link_selector).count();
        let para_count = el.select(&self.para_selector).count();
        let heading_count = el.select(&self.heading_selector).count();
        let img_count = el.select(&self.img_selector).count();
        let nav_count = el.select(&self.nav_selector).count();
        let button_count = el.select(&self.button_selector).count();

        // Computed features
        let link_density = if text_len > 0 {
            link_count as f64 / text_len as f64
        } else {
            0.0
        };

        let punct_density = if text_len > 0 {
            punct_count as f64 / text_len as f64
        } else {
            0.0
        };

        let digit_density = if text_len > 0 {
            digit_count as f64 / text_len as f64
        } else {
            0.0
        };

        let chinese_density = if text_len > 0 {
            chinese_char_count as f64 / text_len as f64
        } else {
            0.0
        };

        let avg_para_len = if para_count > 0 {
            text_len as f64 / para_count as f64
        } else {
            0.0
        };

        // Keyword-based features
        let content_keywords = self.count_content_keywords(el);
        let noise_keywords = self.count_noise_keywords(&text);

        // Depth and structure features
        let depth = self.calculate_depth(el);
        let child_count = el.child_elements().count();
        let sibling_count = el.prev_siblings().count() + el.next_siblings().count();

        // Class/ID features
        let has_content_class = self.has_content_class(el);
        let has_noise_class = self.has_noise_class(el);

        // Visual features
        let visual_features = self.visual_extractor.extract(el);
        let visual_quality_score = visual_features.quality_score();
        let is_visually_hidden = visual_features.is_hidden();
        let is_visually_sidebar = visual_features.is_sidebar();
        let is_visually_header_footer = visual_features.is_header_footer();

        ContentFeatures {
            // Basic features
            text_length: text_len as f64,
            link_count: link_count as f64,
            para_count: para_count as f64,
            heading_count: heading_count as f64,
            img_count: img_count as f64,
            nav_count: nav_count as f64,
            button_count: button_count as f64,

            // Density features
            link_density,
            punct_density,
            digit_density,
            chinese_density,
            avg_para_len,

            // Keyword features
            content_keywords: content_keywords as f64,
            noise_keywords: noise_keywords as f64,

            // Structure features
            depth: depth as f64,
            child_count: child_count as f64,
            sibling_count: sibling_count as f64,

            // Class features
            has_content_class: if has_content_class { 1.0 } else { 0.0 },
            has_noise_class: if has_noise_class { 1.0 } else { 0.0 },

            // Text statistics
            punct_count: punct_count as f64,
            digit_count: digit_count as f64,
            chinese_char_count: chinese_char_count as f64,

            // Visual features
            visual_quality_score,
            is_visually_hidden: if is_visually_hidden { 1.0 } else { 0.0 },
            is_visually_sidebar: if is_visually_sidebar { 1.0 } else { 0.0 },
            is_visually_header_footer: if is_visually_header_footer { 1.0 } else { 0.0 },
        }
    }

    fn count_punctuation(&self, text: &str) -> usize {
        text.chars().filter(|c| {
            matches!(
                *c,
                '。' | '！' | '？' | '；' | '，' | '、' | '!' | '?' | ';' | ',' | '.' | ':' | '—' | '-'
            )
        }).count()
    }

    fn count_digits(&self, text: &str) -> usize {
        text.chars().filter(|c| c.is_ascii_digit()).count()
    }

    fn count_chinese_chars(&self, text: &str) -> usize {
        text.chars().filter(|c| (*c as u32) >= 0x4E00 && (*c as u32) <= 0x9FFF).count()
    }

    fn count_content_keywords(&self, el: &ElementRef) -> usize {
        let class = el.value().attr("class").unwrap_or("").to_ascii_lowercase();
        let id = el.value().attr("id").unwrap_or("").to_ascii_lowercase();
        let haystack = format!("{} {}", class, id);

        let keywords = [
            "article", "content", "reader", "chapter", "post", "entry",
            "main", "text", "novel", "book", "story", "body", "detail",
        ];

        keywords.iter().filter(|k| haystack.contains(**k)).count()
    }

    fn count_noise_keywords(&self, text: &str) -> usize {
        let lower = text.to_ascii_lowercase();

        let keywords = [
            "下一章", "上一章", "下一页", "上一页", "目录", "广告", "会员",
            "点击", "下载", "推荐", "热门", "相关", "点赞", "收藏", "分享",
            "版权", "免责", "加载", "刷新", "本章完", "完本", "完结",
        ];

        keywords.iter().filter(|k| lower.contains(**k)).count()
    }

    fn calculate_depth(&self, el: &ElementRef) -> usize {
        let mut depth = 0;
        let mut current = el.parent();
        while current.is_some() {
            depth += 1;
            current = current.unwrap().parent();
        }
        depth
    }

    fn has_content_class(&self, el: &ElementRef) -> bool {
        let class = el.value().attr("class").unwrap_or("").to_ascii_lowercase();
        let id = el.value().attr("id").unwrap_or("").to_ascii_lowercase();
        let haystack = format!("{} {}", class, id);

        haystack.contains("content") || haystack.contains("article") ||
        haystack.contains("reader") || haystack.contains("chapter")
    }

    fn has_noise_class(&self, el: &ElementRef) -> bool {
        let class = el.value().attr("class").unwrap_or("").to_ascii_lowercase();
        let id = el.value().attr("id").unwrap_or("").to_ascii_lowercase();
        let haystack = format!("{} {}", class, id);

        haystack.contains("nav") || haystack.contains("footer") ||
        haystack.contains("header") || haystack.contains("sidebar") ||
        haystack.contains("ad") || haystack.contains("advertisement")
    }
}

impl Default for FeatureExtractor {
    fn default() -> Self {
        Self::new()
    }
}

/// Comprehensive content features
#[derive(Debug, Clone)]
pub struct ContentFeatures {
    // Basic features
    pub text_length: f64,
    pub link_count: f64,
    pub para_count: f64,
    pub heading_count: f64,
    pub img_count: f64,
    pub nav_count: f64,
    pub button_count: f64,

    // Density features
    pub link_density: f64,
    pub punct_density: f64,
    pub digit_density: f64,
    pub chinese_density: f64,
    pub avg_para_len: f64,

    // Keyword features
    pub content_keywords: f64,
    pub noise_keywords: f64,

    // Structure features
    pub depth: f64,
    pub child_count: f64,
    pub sibling_count: f64,

    // Class features
    pub has_content_class: f64,
    pub has_noise_class: f64,

    // Text statistics
    pub punct_count: f64,
    pub digit_count: f64,
    pub chinese_char_count: f64,

    // Visual features
    pub visual_quality_score: f64,
    pub is_visually_hidden: f64,
    pub is_visually_sidebar: f64,
    pub is_visually_header_footer: f64,
}

/// Lightweight linear regression model for content scoring
pub struct LinearScorer {
    weights: Vec<f64>,
    bias: f64,
    feature_names: Vec<String>,
}

impl LinearScorer {
    /// Create a new scorer with pre-trained weights
    pub fn new() -> Self {
        // Pre-trained weights based on heuristic analysis
        // These weights can be fine-tuned with real data
        let weights = vec![
            1.0,   // text_length
            -150.0, // link_count
            20.0,  // para_count
            -50.0, // heading_count
            -20.0, // img_count
            -200.0, // nav_count
            -70.0, // button_count
            -700.0, // link_density
            50.0,  // punct_density
            -100.0, // digit_density
            30.0,  // chinese_density
            200.0, // avg_para_len
            300.0, // content_keywords
            -150.0, // noise_keywords
            -10.0, // depth
            5.0,   // child_count
            -5.0,  // sibling_count
            300.0, // has_content_class
            -200.0, // has_noise_class
            50.0,  // punct_count
            -100.0, // digit_count
            30.0,  // chinese_char_count
            1.5,   // visual_quality_score
            -300.0, // is_visually_hidden
            -150.0, // is_visually_sidebar
            -100.0, // is_visually_header_footer
        ];

        let feature_names = vec![
            "text_length".to_string(),
            "link_count".to_string(),
            "para_count".to_string(),
            "heading_count".to_string(),
            "img_count".to_string(),
            "nav_count".to_string(),
            "button_count".to_string(),
            "link_density".to_string(),
            "punct_density".to_string(),
            "digit_density".to_string(),
            "chinese_density".to_string(),
            "avg_para_len".to_string(),
            "content_keywords".to_string(),
            "noise_keywords".to_string(),
            "depth".to_string(),
            "child_count".to_string(),
            "sibling_count".to_string(),
            "has_content_class".to_string(),
            "has_noise_class".to_string(),
            "punct_count".to_string(),
            "digit_count".to_string(),
            "chinese_char_count".to_string(),
            "visual_quality_score".to_string(),
            "is_visually_hidden".to_string(),
            "is_visually_sidebar".to_string(),
            "is_visually_header_footer".to_string(),
        ];

        Self {
            weights,
            bias: 0.0,
            feature_names,
        }
    }

    /// Score content features using linear regression
    pub fn score(&self, features: &ContentFeatures) -> f64 {
        let feature_values = vec![
            features.text_length,
            features.link_count,
            features.para_count,
            features.heading_count,
            features.img_count,
            features.nav_count,
            features.button_count,
            features.link_density,
            features.punct_density,
            features.digit_density,
            features.chinese_density,
            features.avg_para_len,
            features.content_keywords,
            features.noise_keywords,
            features.depth,
            features.child_count,
            features.sibling_count,
            features.has_content_class,
            features.has_noise_class,
            features.punct_count,
            features.digit_count,
            features.chinese_char_count,
            features.visual_quality_score,
            features.is_visually_hidden,
            features.is_visually_sidebar,
            features.is_visually_header_footer,
        ];

        let mut score = self.bias;
        for (weight, value) in self.weights.iter().zip(feature_values.iter()) {
            score += weight * value;
        }

        score
    }

    /// Get feature importance (absolute weight values)
    pub fn get_feature_importance(&self) -> Vec<(String, f64)> {
        let mut importance: Vec<_> = self.feature_names
            .iter()
            .zip(self.weights.iter())
            .map(|(name, weight)| (name.clone(), weight.abs()))
            .collect();

        importance.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        importance
    }

    /// Update weights (for online learning)
    pub fn update_weights(&mut self, new_weights: Vec<f64>) {
        if new_weights.len() == self.weights.len() {
            self.weights = new_weights;
        }
    }

    /// Get current weights
    pub fn get_weights(&self) -> Vec<f64> {
        self.weights.clone()
    }
}

impl Default for LinearScorer {
    fn default() -> Self {
        Self::new()
    }
}

/// Ensemble scorer combining multiple scoring strategies
pub struct EnsembleScorer {
    linear_scorer: LinearScorer,
    heuristic_weight: f64,
    ml_weight: f64,
}

impl EnsembleScorer {
    pub fn new() -> Self {
        Self {
            linear_scorer: LinearScorer::new(),
            heuristic_weight: 0.4,
            ml_weight: 0.6,
        }
    }

    pub fn with_weights(heuristic_weight: f64, ml_weight: f64) -> Self {
        Self {
            linear_scorer: LinearScorer::new(),
            heuristic_weight,
            ml_weight,
        }
    }

    /// Score using ensemble of heuristic and ML-based scoring
    pub fn score_ensemble(
        &self,
        features: &ContentFeatures,
        heuristic_score: f64,
    ) -> f64 {
        let ml_score = self.linear_scorer.score(features);

        // Normalize scores to [0, 1] range
        let normalized_heuristic = self.sigmoid(heuristic_score / 1000.0);
        let normalized_ml = self.sigmoid(ml_score / 1000.0);

        let ensemble_score = self.heuristic_weight * normalized_heuristic
            + self.ml_weight * normalized_ml;

        ensemble_score * 1000.0
    }

    fn sigmoid(&self, x: f64) -> f64 {
        1.0 / (1.0 + (-x).exp())
    }
}

impl Default for EnsembleScorer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use scraper::Html;

    #[test]
    fn test_feature_extraction() {
        let extractor = FeatureExtractor::new();
        let html = Html::parse_fragment(
            "<div class=\"content\">\n                <p>这是一段测试文本，包含标点符号。</p>\n                <a href=\"#\">链接</a>\n                <img src=\"test.png\" alt=\"图片\" />\n            </div>",
        );

        let el = html.select(&Selector::parse("div").unwrap()).next().unwrap();
        let features = extractor.extract_features(&el);

        assert!(features.text_length > 0.0);
        assert!(features.link_count > 0.0);
        assert!(features.punct_count > 0.0);
    }

    #[test]
    fn test_linear_scorer() {
        let scorer = LinearScorer::new();
        let features = ContentFeatures {
            text_length: 1000.0,
            link_count: 5.0,
            para_count: 10.0,
            heading_count: 2.0,
            img_count: 1.0,
            nav_count: 0.0,
            button_count: 0.0,
            link_density: 0.005,
            punct_density: 0.05,
            digit_density: 0.01,
            chinese_density: 0.8,
            avg_para_len: 100.0,
            content_keywords: 1.0,
            noise_keywords: 0.0,
            depth: 5.0,
            child_count: 15.0,
            sibling_count: 3.0,
            has_content_class: 1.0,
            has_noise_class: 0.0,
            punct_count: 50.0,
            digit_count: 10.0,
            chinese_char_count: 800.0,
            visual_quality_score: 1.0,
            is_visually_hidden: 0.0,
            is_visually_sidebar: 0.0,
            is_visually_header_footer: 0.0,
        };

        let score = scorer.score(&features);
        assert!(score > 0.0);
    }

    #[test]
    fn test_ensemble_scorer() {
        let ensemble = EnsembleScorer::new();
        let features = ContentFeatures {
            text_length: 1000.0,
            link_count: 5.0,
            para_count: 10.0,
            heading_count: 2.0,
            img_count: 1.0,
            nav_count: 0.0,
            button_count: 0.0,
            link_density: 0.005,
            punct_density: 0.05,
            digit_density: 0.01,
            chinese_density: 0.8,
            avg_para_len: 100.0,
            content_keywords: 1.0,
            noise_keywords: 0.0,
            depth: 5.0,
            child_count: 15.0,
            sibling_count: 3.0,
            has_content_class: 1.0,
            has_noise_class: 0.0,
            punct_count: 50.0,
            digit_count: 10.0,
            chinese_char_count: 800.0,
            visual_quality_score: 1.0,
            is_visually_hidden: 0.0,
            is_visually_sidebar: 0.0,
            is_visually_header_footer: 0.0,
        };

        let heuristic_score = 500.0;
        let ensemble_score = ensemble.score_ensemble(&features, heuristic_score);

        assert!(ensemble_score > 0.0);
        assert!(ensemble_score <= 1000.0);
    }
}
