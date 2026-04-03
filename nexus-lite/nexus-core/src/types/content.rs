use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedExtractionMetrics {
    pub source_id: String,
    pub success: u64,
    pub fallback_hits: u64,
    pub validation_failures: u64,
    pub rule_mismatch_failures: u64,
    pub empty_content_failures: u64,
    pub low_quality_failures: u64,
    pub quality_score_total: f64,
    pub quality_samples: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum QualityLabel {
    Excellent,
    Good,
    Acceptable,
    Low,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionQuality {
    pub score: f64,
    pub label: QualityLabel,
    pub char_count: usize,
    pub paragraph_count: usize,
    pub noise_ratio: f64,
    pub duplicate_ratio: f64,
    #[serde(default)]
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedContentCandidate {
    pub text: Arc<str>,
    pub extractor_type: String,
    pub strategy_path: Vec<String>,
    pub quality: ExtractionQuality,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDecisionEnvelope {
    pub decision_id: String,
    pub skill_name: String,
    pub input_hash: String,
    pub confidence: f64,
    pub mode: String,
    pub version: String,
    #[serde(default)]
    pub output: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDecisionLogEntry {
    pub id: String,
    pub occurred_at_ms: i64,
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    pub decision: SkillDecisionEnvelope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterContent {
    pub content: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunks: Option<Vec<Arc<str>>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ChapterContentMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterContentMeta {
    pub quality: ExtractionQuality,
    #[serde(default)]
    pub strategy_path: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stage_reports: Vec<PipelineStageReport>,
}

impl ChapterContentMeta {
    pub fn new(quality: ExtractionQuality, strategy_path: Vec<String>) -> Self {
        Self {
            quality,
            strategy_path,
            stage_reports: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PipelineStageReport {
    pub stage: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub strategy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_code: Option<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub metrics: HashMap<String, String>,
}

/// Content replacement rule
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceRule {
    pub id: String,
    pub name: String,
    pub pattern: String,
    pub replacement: Option<String>,
    pub scope: Option<String>,
    pub is_enabled: bool,
    pub is_regex: bool,
}
