//! Quality gate for extracted chapter content.
//!
//! Provides deterministic scoring so extraction quality can be measured,
//! tracked, and used for cache/validation decisions.

use nexus_core::{ExtractionQuality, QualityLabel};
use regex::Regex;
use std::sync::LazyLock;

static NOISE_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"https?://[^\s]+").expect("valid regex"),
        Regex::new(r"(广告|赞助|推广|copyright|版权所有)").expect("valid regex"),
        Regex::new(r"(上一章|下一章|加入书签|返回目录)").expect("valid regex"),
    ]
});

#[derive(Debug, Clone)]
pub struct QualityGateConfig {
    pub min_score: f64,
}

impl Default for QualityGateConfig {
    fn default() -> Self {
        Self { min_score: 0.45 }
    }
}

fn count_paragraphs(text: &str) -> usize {
    text.split("\n\n").filter(|p| !p.trim().is_empty()).count()
}

fn duplicate_ratio(text: &str) -> f64 {
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    if lines.len() < 4 {
        return 0.0;
    }
    let mut uniq = std::collections::HashSet::new();
    for line in &lines {
        uniq.insert(*line);
    }
    1.0 - (uniq.len() as f64 / lines.len() as f64)
}

fn noise_ratio(text: &str) -> f64 {
    let chars = text.chars().count().max(1);
    let mut matched = 0usize;
    for pattern in NOISE_PATTERNS.iter() {
        matched += pattern
            .find_iter(text)
            .map(|m| m.as_str().chars().count())
            .sum::<usize>();
    }
    (matched as f64 / chars as f64).min(1.0)
}

pub fn evaluate_content_quality(text: &str) -> ExtractionQuality {
    let trimmed = text.trim();
    let char_count = trimmed.chars().count();
    let paragraph_count = count_paragraphs(trimmed);
    let noise = noise_ratio(trimmed);
    let duplicate = duplicate_ratio(trimmed);
    let mut reasons = Vec::new();

    if char_count < 80 {
        reasons.push("content_too_short".to_string());
    }
    if paragraph_count < 2 {
        reasons.push("too_few_paragraphs".to_string());
    }
    if noise > 0.2 {
        reasons.push("high_noise_ratio".to_string());
    }
    if duplicate > 0.35 {
        reasons.push("high_duplicate_ratio".to_string());
    }

    // Weighted deterministic score in [0, 1]
    let length_score = (char_count as f64 / 1200.0).clamp(0.0, 1.0);
    let para_score = (paragraph_count as f64 / 16.0).clamp(0.0, 1.0);
    let noise_score = 1.0 - noise;
    let dedup_score = 1.0 - duplicate;
    let score = (length_score * 0.4 + para_score * 0.2 + noise_score * 0.25 + dedup_score * 0.15)
        .clamp(0.0, 1.0);

    let label = if char_count == 0 {
        QualityLabel::Invalid
    } else if score >= 0.82 {
        QualityLabel::Excellent
    } else if score >= 0.68 {
        QualityLabel::Good
    } else if score >= 0.45 {
        QualityLabel::Acceptable
    } else {
        QualityLabel::Low
    };

    ExtractionQuality {
        score,
        label,
        char_count,
        paragraph_count,
        noise_ratio: noise,
        duplicate_ratio: duplicate,
        reasons,
    }
}

pub fn passes_quality_gate(quality: &ExtractionQuality, config: &QualityGateConfig) -> bool {
    quality.score >= config.min_score && quality.label != QualityLabel::Invalid
}
