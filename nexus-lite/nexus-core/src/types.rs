use crate::nxs::NxsSource;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

// ============== Source Governance Models ==============

/// License/compliance review state for a content source.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SourceLicenseStatus {
    #[default]
    Unknown,
    Licensed,
    PublicDomain,
    Restricted,
    Blocked,
}

/// Access path used by an approved source.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SourceAccessMode {
    #[default]
    Unknown,
    Api,
    Feed,
    PublicArchive,
    ManualImport,
}

/// Business policy attached to a source definition.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourcePolicy {
    #[serde(default)]
    pub license_status: SourceLicenseStatus,
    #[serde(default)]
    pub access_mode: SourceAccessMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_verified_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

impl SourcePolicy {
    /// Only explicitly approved sources may enter public search/reading flows.
    pub fn allows_public_access(&self) -> bool {
        matches!(
            self.license_status,
            SourceLicenseStatus::Licensed | SourceLicenseStatus::PublicDomain
        )
    }
}

// ============== Book Data Models ==============

/// Book search result item
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SearchExplainStrategy {
    NativeSearch,
    DirectDetail,
    ExternalDiscovery,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchExplain {
    pub strategy: SearchExplainStrategy,
    pub provider: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_score: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_rank: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<Arc<str>>,
}

/// Book search result item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookItem {
    pub name: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<Arc<str>>,
    pub book_url: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro: Option<Arc<str>>,
    pub source_id: Arc<str>,
    pub source_name: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_chapter: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_explain: Option<SearchExplain>,
}

/// Book detailed information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
    pub name: Arc<str>,
    pub author: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toc_url: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_chapter: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<Arc<str>>,
}

/// Table of contents item (chapter entry for TOC listing)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TocItem {
    pub title: Arc<str>,
    pub url: Arc<str>,
    pub index: usize,
}

/// Chapter information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub title: Arc<str>,
    pub url: Arc<str>,
    pub index: usize,
    #[serde(default)]
    pub is_vip: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub word_count: Option<u32>,
}

// ============== HTTP Models ==============

/// HTTP fetch response
#[derive(Debug, Clone)]
pub struct FetchResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub url: String,
}

impl FetchResponse {
    pub fn is_success(&self) -> bool {
        self.status >= 200 && self.status < 300
    }

    pub fn is_cloudflare_challenge(&self) -> bool {
        self.status == 403
            || self.status == 503
            || self.body.contains("cf-browser-verification")
            || self.body.contains("Just a moment")
    }
}

/// Fetch context for requests
#[derive(Debug, Clone)]
pub struct FetchContext {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub source_id: String,
    pub last_response: Option<FetchResponse>,
    pub cookies: HashMap<String, String>,
    /// Timeout in seconds for this request
    pub timeout_secs: u64,
}

impl FetchContext {
    pub fn new(url: &str, source_id: &str) -> Self {
        Self {
            url: url.to_string(),
            method: "GET".to_string(),
            headers: HashMap::new(),
            body: None,
            source_id: source_id.to_string(),
            last_response: None,
            cookies: HashMap::new(),
            timeout_secs: 30, // Default 30s timeout
        }
    }

    /// Create a context with custom timeout
    pub fn with_timeout(url: &str, source_id: &str, timeout_secs: u64) -> Self {
        let mut ctx = Self::new(url, source_id);
        ctx.timeout_secs = timeout_secs;
        ctx
    }
}

// ============== Flow Contracts ==============

/// Standardized fetch job context for cross-module orchestration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchJob {
    pub source_id: String,
    pub target_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_id: Option<String>,
    pub trace_id: String,
    #[serde(default)]
    pub request_meta: HashMap<String, String>,
}

/// Runtime policy profile per source.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuntimeProfile {
    #[serde(default)]
    pub strategy_chain: Vec<String>,
    pub timeout_ms: u64,
    pub retry_budget: u32,
    pub concurrency_limit: usize,
}

impl Default for SourceRuntimeProfile {
    fn default() -> Self {
        Self {
            strategy_chain: vec![
                "CF-Bypass".to_string(),
                "CloudScraper".to_string(),
                "DirectHTTP".to_string(),
            ],
            timeout_ms: 30_000,
            retry_budget: 2,
            concurrency_limit: 4,
        }
    }
}

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
pub struct SourceRuleValidationReport {
    pub valid: bool,
    pub compile_ok: bool,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub errors: Vec<String>,
    #[serde(default)]
    pub score: f64,
    #[serde(default)]
    pub steps: Vec<SourceValidationStepReport>,
    #[serde(default)]
    pub importable: bool,
    #[serde(default)]
    pub manual_review_required: bool,
    #[serde(default)]
    pub health: SourceHealthReport,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_validated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceValidationStepReport {
    pub step: String,
    pub ok: bool,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_code: Option<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub errors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality_score: Option<f64>,
    #[serde(default)]
    pub suggested_actions: Vec<String>,
    #[serde(default)]
    pub manual_review_recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceHealthStatus {
    Pass,
    Warn,
    Fail,
    #[default]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceHealthSegment {
    #[serde(default)]
    pub status: SourceHealthStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure_code: Option<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_validated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceHealthReport {
    #[serde(default)]
    pub overall_score: f64,
    #[serde(default)]
    pub recommended: bool,
    #[serde(default)]
    pub search: SourceHealthSegment,
    #[serde(default)]
    pub book: SourceHealthSegment,
    #[serde(default)]
    pub toc: SourceHealthSegment,
    #[serde(default)]
    pub content: SourceHealthSegment,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocumentation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub site_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_page_notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_page_notes: Option<String>,
    #[serde(default)]
    pub content_noise_notes: Vec<String>,
    #[serde(default)]
    pub known_risks: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommended_usage: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceBuildSamples {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_sample_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_sample_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_sample_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_sample_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCapabilityMatrix {
    pub search_supported: bool,
    pub book_supported: bool,
    pub toc_supported: bool,
    pub content_supported: bool,
    pub direct_detail_supported: bool,
    pub external_discovery_supported: bool,
    pub search_pagination_supported: bool,
    pub search_special_param_supported: bool,
    pub pagination_supported: bool,
    pub font_decrypt_supported: bool,
    pub script_clean_supported: bool,
}

impl Default for SourceCapabilityMatrix {
    fn default() -> Self {
        Self {
            search_supported: false,
            book_supported: true,
            toc_supported: true,
            content_supported: true,
            direct_detail_supported: false,
            external_discovery_supported: false,
            search_pagination_supported: false,
            search_special_param_supported: false,
            pagination_supported: false,
            font_decrypt_supported: false,
            script_clean_supported: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceSearchMode {
    NativeSearch,
    DirectDetail,
    ExternalDiscovery,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchPaginationRule {
    #[serde(default)]
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_selector: Option<String>,
    #[serde(default = "default_search_max_pages")]
    pub max_pages: u32,
}

fn default_search_max_pages() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchStrategyRule {
    pub id: String,
    pub mode: SourceSearchMode,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_search_priority")]
    pub priority: u32,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query_template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body_template: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail_url_template: Option<String>,
    #[serde(default)]
    pub book_url_matchers: Vec<String>,
    #[serde(default)]
    pub pagination: SearchPaginationRule,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabled_reason: Option<String>,
}

fn default_search_priority() -> u32 {
    100
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSearchProfile {
    #[serde(default)]
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_mode: Option<SourceSearchMode>,
    #[serde(default)]
    pub strategies: Vec<SearchStrategyRule>,
}

impl Default for SourceSearchProfile {
    fn default() -> Self {
        Self {
            enabled: false,
            default_mode: None,
            strategies: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceImportPolicy {
    pub enabled_by_default: bool,
    pub priority: i32,
    pub allow_search: bool,
    pub allow_read: bool,
    pub visibility: String,
}

impl Default for SourceImportPolicy {
    fn default() -> Self {
        Self {
            enabled_by_default: true,
            priority: 100,
            allow_search: true,
            allow_read: true,
            visibility: "private".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceFetchProfile {
    pub mode: String,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuleHints {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_entry: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_result_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_title_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intro_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toc_item_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_title_selector: Option<String>,
    #[serde(default)]
    pub noise_patterns: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pagination_selector: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRulePackage {
    pub package_id: String,
    pub engine_version: String,
    pub generated_at_ms: i64,
    pub generator: String,
    pub source: NxsSource,
    pub validation: SourceRuleValidationReport,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub documentation: Option<SourceDocumentation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub samples: Option<SourceBuildSamples>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<SourceCapabilityMatrix>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub import_policy: Option<SourceImportPolicy>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_profile: Option<SourceSearchProfile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fetch_profile: Option<SourceFetchProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBuildRequest {
    pub seed_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_name: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBuildResponse {
    pub package: SourceRulePackage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBuildFromSamplesRequest {
    pub book_curl: String,
    pub chapter_curl: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_curl: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub site_entry_curl: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_keyword: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_name: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub emit_package_json: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_service_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_engine: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_session_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured_hints: Option<SourceRuleHints>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_text_hints: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBuildDiagnostics {
    pub host: String,
    pub book_sample_url: String,
    pub chapter_sample_url: String,
    pub search_strategy: String,
    pub fetch_mode: String,
    pub fetch_provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_service_url: Option<String>,
    pub book_fetch_status: u16,
    pub chapter_fetch_status: u16,
    pub book_final_url: String,
    pub chapter_final_url: String,
    pub generalization_score: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub same_site_validation_score: Option<f64>,
    #[serde(default)]
    pub same_site_candidate_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub same_site_validated_url: Option<String>,
    #[serde(default)]
    pub same_site_validation_warnings: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_inference_score: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_detail_validated_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_detail_resolved_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_detail_passed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_detail_failure_code: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search_detail_summary: Option<String>,
    #[serde(default)]
    pub search_detail_warnings: Vec<String>,
    #[serde(default)]
    pub selector_stability_warnings: Vec<String>,
    #[serde(default)]
    pub noise_patterns_detected: Vec<String>,
    #[serde(default)]
    pub risk_flags: Vec<String>,
    #[serde(default)]
    pub suggested_fixes: Vec<String>,
    #[serde(default)]
    pub failure_categories: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preferred_probe_input: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_probe_score: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jina_probe_score: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trafilatura_probe_score: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_readability_gain: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trafilatura_readability_gain: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recommended_content_extractor: Option<String>,
    #[serde(default)]
    pub content_candidate_summaries: Vec<String>,
    #[serde(default)]
    pub jina_search_used: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBuildFromSamplesResponse {
    pub package: SourceRulePackage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_json: Option<String>,
    pub diagnostics: SourceBuildDiagnostics,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceDebugPresetInputs {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toc_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuleRefineRequest {
    pub package: SourceRulePackage,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured_hints: Option<SourceRuleHints>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_text_hints: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub samples: Option<SourceDebugPresetInputs>,
    #[serde(default)]
    pub emit_package_json: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuleRefineResponse {
    pub package: SourceRulePackage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_json: Option<String>,
    #[serde(default)]
    pub auto_applied_actions: Vec<String>,
    pub applied_hints: Vec<String>,
    #[serde(default)]
    pub changes: Vec<SourceRuleChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRuleChange {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceFetchDebugInfo {
    pub mode: String,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub final_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_key: Option<String>,
    #[serde(default)]
    pub cache_hit: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_state: Option<String>,
    #[serde(default)]
    pub jina_used: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub respond_with: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchSessionProfile {
    pub session_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default)]
    pub cookies: HashMap<String, String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referer: Option<String>,
    pub created_at_ms: i64,
    pub expires_at_ms: i64,
    #[serde(default)]
    pub hit_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawHtmlCacheEntry {
    pub cache_key: String,
    pub url: String,
    pub status: u16,
    pub final_url: String,
    pub html: String,
    pub cached_at_ms: i64,
    pub expires_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchSessionImportRequest {
    pub session_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default)]
    pub cookies: HashMap<String, String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referer: Option<String>,
    #[serde(default = "default_fetch_session_ttl_seconds")]
    pub ttl_seconds: u64,
}

fn default_fetch_session_ttl_seconds() -> u64 {
    3600
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchSessionImportResponse {
    pub session: FetchSessionProfile,
    pub imported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchHtmlRequest {
    pub url: String,
    #[serde(default = "default_fetch_method")]
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_key: Option<String>,
    #[serde(default)]
    pub force_refresh: bool,
    #[serde(default = "default_fetch_cache_ttl_seconds")]
    pub cache_ttl_seconds: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_service_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_engine: Option<String>,
}

fn default_fetch_method() -> String {
    "GET".to_string()
}

fn default_fetch_cache_ttl_seconds() -> u64 {
    900
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchHtmlResponse {
    pub status: u16,
    pub final_url: String,
    pub html: String,
    pub cache_hit: bool,
    pub cache_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_at_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ttl_remaining_ms: Option<i64>,
    pub session_state: String,
    pub fetch_debug: SourceFetchDebugInfo,
}

// ============== Bookshelf Models ==============

/// Structured chapter content response
#[derive(Debug, Clone, Serialize, Deserialize)]
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

/// Bookshelf item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookshelfItem {
    pub id: String,
    pub source_id: Arc<str>,
    pub book_url: Arc<str>,
    pub name: Arc<str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<Arc<str>>,
    #[serde(default)]
    pub last_chapter_index: u32,
    #[serde(default)]
    pub last_read_position: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_read_time: Option<i64>,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_chapter_num: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_chapter_title: Option<Arc<str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
}

/// Book group categorization
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookGroup {
    pub id: String,
    pub name: String,
    pub order_index: u32,
}

/// Content replacement rule
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceRule {
    pub id: String,
    pub name: String,
    pub pattern: String,
    pub replacement: Option<String>,
    pub scope: Option<String>, // "all" or specific source_id
    pub is_enabled: bool,
    pub is_regex: bool,
}

// ============== Discovery Models ==============

/// Discovery item (book representation in discovery feeds)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryItem {
    pub book_id: String,
    pub name: String,
    pub author: Option<String>,
    pub cover_url: Option<String>,
    pub book_url: String,
    pub intro: Option<String>,
    pub followers: Option<u32>,
    pub position: u32,
}

/// Discovery section (Carousel, List, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySection {
    pub section: String, // "carousel", "list", "image_list", etc.
    pub items: Vec<DiscoveryItem>,
}

/// Discovery response (aggregated for a period)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResponse {
    pub period: String,
    pub start_date: String,
    pub end_date: String,
    pub sections: Vec<DiscoverySection>,
    pub available_periods: Vec<String>,
}

// ============== AI Analysis ==============

/// AI Mapping Rule for homophones/entity resolution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMappingRule {
    pub id: String,
    pub original: String,
    pub target: String,
    pub r#type: String, // "person", "company", etc.
    pub confidence: f32,
    pub enabled: bool,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_count: Option<u32>,
}

/// AI Analysis History
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisHistory {
    pub id: String,
    pub book_title: String,
    pub chapter_title: String,
    pub mappings: Vec<AiMappingRule>,
    pub analyzed_at: i64,
}

// ============== Voice Models ==============

/// Voice model metadata for TTS
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceModelMetadata {
    pub id: String,
    pub name: String,
    pub r#type: String,                    // "custom", "system"
    pub metadata: HashMap<String, String>, // language, description, etc.
    pub model_size: u64,
    pub sample_duration: f32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[cfg(test)]
mod tests {
    use super::{SourceAccessMode, SourceLicenseStatus, SourcePolicy};

    #[test]
    fn source_policy_defaults_to_unreviewed() {
        let policy = SourcePolicy::default();

        assert_eq!(policy.license_status, SourceLicenseStatus::Unknown);
        assert_eq!(policy.access_mode, SourceAccessMode::Unknown);
        assert!(!policy.allows_public_access());
    }

    #[test]
    fn source_policy_only_allows_reviewed_public_sources() {
        let licensed = SourcePolicy {
            license_status: SourceLicenseStatus::Licensed,
            ..SourcePolicy::default()
        };
        let public_domain = SourcePolicy {
            license_status: SourceLicenseStatus::PublicDomain,
            ..SourcePolicy::default()
        };
        let blocked = SourcePolicy {
            license_status: SourceLicenseStatus::Blocked,
            ..SourcePolicy::default()
        };

        assert!(licensed.allows_public_access());
        assert!(public_domain.allows_public_access());
        assert!(!blocked.allows_public_access());
    }
}
