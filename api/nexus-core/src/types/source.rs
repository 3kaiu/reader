use crate::nxs::NxsSource;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    pub fn allows_public_access(&self) -> bool {
        matches!(
            self.license_status,
            SourceLicenseStatus::Licensed | SourceLicenseStatus::PublicDomain
        )
    }
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

impl SourceRuleValidationReport {
    /// Draft report used by source-package authoring flows before runtime validation.
    pub fn draft(score: f64) -> Self {
        Self {
            score,
            ..Self::default()
        }
    }
}

impl Default for SourceRuleValidationReport {
    fn default() -> Self {
        Self {
            valid: false,
            compile_ok: false,
            warnings: Vec::new(),
            errors: Vec::new(),
            score: 0.0,
            steps: Vec::new(),
            importable: false,
            manual_review_required: false,
            health: SourceHealthReport::default(),
            last_validated_at_ms: None,
        }
    }
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

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SourceReadinessState {
    #[default]
    Draft,
    Blocked,
    SearchReady,
    CatalogReady,
    ReadingReady,
    FullFlowReady,
}

impl SourceReadinessState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Blocked => "blocked",
            Self::SearchReady => "search_ready",
            Self::CatalogReady => "catalog_ready",
            Self::ReadingReady => "reading_ready",
            Self::FullFlowReady => "full_flow_ready",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceReadinessReport {
    #[serde(default)]
    pub state: SourceReadinessState,
    #[serde(default)]
    pub searchable: bool,
    #[serde(default)]
    pub detail_ready: bool,
    #[serde(default)]
    pub toc_ready: bool,
    #[serde(default)]
    pub readable: bool,
    #[serde(default)]
    pub importable: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blockers: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub suggested_actions: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

impl SourceReadinessReport {
    pub fn from_validation(validation: &SourceRuleValidationReport) -> Self {
        let searchable = matches!(
            validation.health.search.status,
            SourceHealthStatus::Pass | SourceHealthStatus::Warn
        );
        let detail_ready = matches!(
            validation.health.book.status,
            SourceHealthStatus::Pass | SourceHealthStatus::Warn
        );
        let toc_ready = matches!(
            validation.health.toc.status,
            SourceHealthStatus::Pass | SourceHealthStatus::Warn
        );
        let readable = matches!(
            validation.health.content.status,
            SourceHealthStatus::Pass | SourceHealthStatus::Warn
        );
        let importable = validation.importable && validation.compile_ok;

        let mut blockers = Vec::new();
        if !validation.compile_ok {
            blockers.push("package_compile_failed".to_string());
        }
        if !validation.importable {
            blockers.push("validation_import_blocked".to_string());
        }
        if !searchable {
            blockers.push("search_not_ready".to_string());
        }
        if !detail_ready {
            blockers.push("book_detail_not_ready".to_string());
        }
        if !toc_ready {
            blockers.push("toc_not_ready".to_string());
        }
        if !readable {
            blockers.push("content_not_ready".to_string());
        }

        let state = if !importable {
            SourceReadinessState::Blocked
        } else if searchable && detail_ready && toc_ready && readable {
            SourceReadinessState::FullFlowReady
        } else if detail_ready && toc_ready && readable {
            SourceReadinessState::ReadingReady
        } else if searchable && detail_ready && toc_ready {
            SourceReadinessState::CatalogReady
        } else if searchable {
            SourceReadinessState::SearchReady
        } else {
            SourceReadinessState::Blocked
        };

        let summary = Some(match state {
            SourceReadinessState::Draft => "draft package not validated".to_string(),
            SourceReadinessState::Blocked => {
                "blocked for full business flow (search/detail/toc/content)".to_string()
            },
            SourceReadinessState::SearchReady => {
                "search available, downstream reading flow incomplete".to_string()
            },
            SourceReadinessState::CatalogReady => {
                "search + detail + toc available, content extraction needs work".to_string()
            },
            SourceReadinessState::ReadingReady => {
                "detail/toc/content available, search entry needs fallback or repair".to_string()
            },
            SourceReadinessState::FullFlowReady => {
                "full flow ready: source package -> search -> detail -> toc -> content".to_string()
            },
        });
        let mut suggested_actions = Vec::new();
        if blockers
            .iter()
            .any(|item| item == "validation_import_blocked")
        {
            suggested_actions.push("run_validation_with_samples".to_string());
        }
        if blockers.iter().any(|item| item == "package_compile_failed") {
            suggested_actions.push("fix_rule_compile_errors".to_string());
        }
        if blockers.iter().any(|item| item == "search_not_ready") {
            suggested_actions.push("repair_search_selectors_or_samples".to_string());
        }
        if blockers.iter().any(|item| item == "book_detail_not_ready") {
            suggested_actions.push("repair_book_title_author_selectors".to_string());
        }
        if blockers.iter().any(|item| item == "toc_not_ready") {
            suggested_actions.push("repair_toc_item_selector".to_string());
        }
        if blockers.iter().any(|item| item == "content_not_ready") {
            suggested_actions.push("repair_content_selector_and_noise_rules".to_string());
        }

        Self {
            state,
            searchable,
            detail_ready,
            toc_ready,
            readable,
            importable,
            blockers,
            warnings: validation.warnings.clone(),
            suggested_actions,
            summary,
        }
    }
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceSearchProfile {
    #[serde(default)]
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_mode: Option<SourceSearchMode>,
    #[serde(default)]
    pub strategies: Vec<SearchStrategyRule>,
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
    pub readiness: SourceReadinessReport,
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

impl SourceRulePackage {
    pub fn refresh_readiness(&mut self) {
        self.readiness = SourceReadinessReport::from_validation(&self.validation);
    }

    pub fn effective_readiness(&self) -> SourceReadinessReport {
        let is_default = self.readiness.state == SourceReadinessState::Draft
            && !self.readiness.searchable
            && !self.readiness.detail_ready
            && !self.readiness.toc_ready
            && !self.readiness.readable
            && !self.readiness.importable
            && self.readiness.blockers.is_empty()
            && self.readiness.warnings.is_empty()
            && self.readiness.suggested_actions.is_empty()
            && self.readiness.summary.is_none();
        if is_default {
            SourceReadinessReport::from_validation(&self.validation)
        } else {
            self.readiness.clone()
        }
    }
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

impl SourceBuildDiagnostics {
    #[allow(clippy::too_many_arguments)]
    pub fn basic(
        host: String,
        book_sample_url: String,
        chapter_sample_url: String,
        search_strategy: String,
        fetch_mode: String,
        fetch_provider: String,
        fetch_service_url: Option<String>,
        book_final_url: String,
        chapter_final_url: String,
        generalization_score: f64,
    ) -> Self {
        Self {
            host,
            book_sample_url,
            chapter_sample_url,
            search_strategy,
            fetch_mode,
            fetch_provider,
            fetch_service_url,
            book_fetch_status: 0,
            chapter_fetch_status: 0,
            book_final_url,
            chapter_final_url,
            generalization_score,
            ..Self::default()
        }
    }
}

impl Default for SourceBuildDiagnostics {
    fn default() -> Self {
        Self {
            host: String::new(),
            book_sample_url: String::new(),
            chapter_sample_url: String::new(),
            search_strategy: String::new(),
            fetch_mode: String::new(),
            fetch_provider: String::new(),
            fetch_service_url: None,
            book_fetch_status: 0,
            chapter_fetch_status: 0,
            book_final_url: String::new(),
            chapter_final_url: String::new(),
            generalization_score: 0.0,
            same_site_validation_score: None,
            same_site_candidate_count: 0,
            same_site_validated_url: None,
            same_site_validation_warnings: Vec::new(),
            search_inference_score: None,
            search_detail_validated_url: None,
            search_detail_resolved_name: None,
            search_detail_passed: None,
            search_detail_failure_code: None,
            search_detail_summary: None,
            search_detail_warnings: Vec::new(),
            selector_stability_warnings: Vec::new(),
            noise_patterns_detected: Vec::new(),
            risk_flags: Vec::new(),
            suggested_fixes: Vec::new(),
            failure_categories: Vec::new(),
            preferred_probe_input: None,
            raw_probe_score: None,
            jina_probe_score: None,
            trafilatura_probe_score: None,
            ai_readability_gain: None,
            trafilatura_readability_gain: None,
            recommended_content_extractor: None,
            content_candidate_summaries: Vec::new(),
            jina_search_used: false,
        }
    }
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
