use axum::extract::FromRef;
use axum::routing::post;
use axum::{extract::State, Json, Router};
use nexus_core::types::Chapter;
use nexus_core::{
    BookInfo, CloudflareBypassConfig, FetchSessionProfile, NxsSource, ReplaceRule,
    SearchPaginationRule, SearchStrategyRule, SourceBuildDiagnostics,
    SourceBuildFromSamplesRequest, SourceBuildFromSamplesResponse, SourceBuildRequest,
    SourceBuildResponse, SourceBuildSamples, SourceCapabilityMatrix, SourceDebugPresetInputs,
    SourceDocumentation, SourceFetchDebugInfo, SourceFetchProfile, SourceHealthReport,
    SourceHealthSegment, SourceHealthStatus, SourceImportPolicy, SourceRuleChange, SourceRuleHints,
    SourceRulePackage, SourceRuleRefineRequest, SourceRuleRefineResponse,
    SourceRuleValidationReport, SourceSearchMode, SourceSearchProfile, SourceValidationStepReport,
};
use nexus_engine::anti_crawl::{CfBypassStrategy, DirectHttpStrategy, FallbackChain, JinaReaderStrategy};
use nexus_engine::quality_gate::evaluate_content_quality;
use nexus_engine::NxsEngine;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use url::Url;
use uuid::Uuid;

#[path = "source_builder_analysis.rs"]
mod analysis;
#[path = "source_builder_common.rs"]
mod common;
#[path = "source_builder_constants.rs"]
mod constants;
#[path = "source_builder_fetch.rs"]
mod fetch;
#[path = "source_builder_package.rs"]
mod package;
#[path = "source_builder_probe.rs"]
mod probe;
#[path = "source_builder_refine.rs"]
mod refine;
#[path = "source_builder_runtime.rs"]
mod runtime;
#[path = "source_builder_samples.rs"]
mod samples;
#[path = "source_builder_search.rs"]
mod search;
#[cfg(test)]
#[path = "source_builder_tests.rs"]
mod tests;
#[path = "source_builder_types.rs"]
mod types_support;
#[path = "source_builder_runtime_validation.rs"]
mod validation_runtime;
#[path = "source_builder_validation.rs"]
mod validation_support;

use crate::api_response::ApiResponse;
use crate::source_builder_state::SourceBuilderState;
use crate::validation::validate_url;
use analysis::{
    classify_search_detail_failure, compute_health_report, extract_same_site_chapter_candidates,
    validate_package_shape,
};
use common::{
    api_error, cache_key_for_url, derive_base_url, fingerprint_text, infer_source_name,
    normalize_source_id, now_ms,
};
use constants::{
    AUTHOR_SELECTOR_CANDIDATES, AUTHOR_SELECTOR_FALLBACKS, BOOK_NAME_SELECTOR_CANDIDATES,
    BOOK_TITLE_SELECTOR_FALLBACKS, COMMON_CONTENT_FILTERS, CONTENT_SELECTOR_CANDIDATES,
    CONTENT_SELECTOR_FALLBACKS, INTRO_SELECTOR_CANDIDATES, SEARCH_RESULT_SELECTOR_FALLBACKS,
    TOC_SELECTOR_CANDIDATES, TOC_SELECTOR_FALLBACKS,
};
use fetch::{
    apply_session_to_parsed, execute_fetch, extract_via_trafilatura, fetch_html_with_session,
    fetch_seed_html, fetch_via_jina_reader, get_fetch_session, import_fetch_session,
    load_fetch_session, parse_curl_command, preferred_jina_respond_with, replay_curl_request,
    resolve_external_service_api_key, resolve_external_service_url, CurlReplay, ParsedCurl,
};
use package::{build_source_from_samples, build_source_from_seed};
use probe::{
    choose_best_selector, count_pattern_hits, derive_best_content_selector,
    derive_best_search_result_selector, derive_best_toc_selector, derive_selector_chain, ProbeDoc,
};
use refine::refine_source_package;
use runtime::{
    run_engine_by_package, run_validation, validate_same_site_generalization,
    validate_source_package,
};
use samples::build_source_package_from_samples;
use search::{infer_search_entry_from_html, infer_search_selector_from_html};
use types_support::{
    ProbeInsights, SameSiteValidationInsights, SearchEntryProbeInsights, SearchProbeInsights,
    SearchSample,
};
use validation_support::{
    append_jina_guidance, build_fetch_profile, classify_fetch_error, extract_free_text_hints,
    has_enabled_search_strategy, has_fallback_search_strategies, make_step,
    package_default_samples, select_search_result_for_validation, suggested_actions_for,
    validation_relaxed_search_importable,
};

pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    SourceBuilderState: FromRef<S>,
{
    Router::new()
        .route("/api/source-builder/build", post(build_source_package))
        .route(
            "/api/source-builder/build-from-samples",
            post(build_source_package_from_samples),
        )
        .route("/api/fetch/session/import", post(import_fetch_session))
        .route("/api/fetch/session/{id}", axum::routing::get(get_fetch_session))
        .route("/api/fetch/html", post(fetch_html_with_session))
        .route("/api/source-builder/validate", post(validate_source_package))
        .route("/api/source-builder/refine", post(refine_source_package))
        .route("/api/engine/run-by-package", post(run_engine_by_package))
}

/// Build source package from a target URL with HTML probing.
pub async fn build_source_package(
    Json(req): Json<SourceBuildRequest>,
) -> Json<ApiResponse<SourceBuildResponse>> {
    let parsed = match validate_url(&req.seed_url) {
        Ok(url) => url,
        Err(e) => return api_error(format!("invalid seedUrl: {e}")),
    };
    let fetched_html = fetch_seed_html(&req.seed_url).await.ok();

    let (source, probe_insights) = build_source_from_seed(&req, &parsed, fetched_html.as_deref());
    let mut metadata = HashMap::new();
    metadata.insert("seedUrl".to_string(), req.seed_url.clone());
    metadata.insert("generatedBy".to_string(), "source-builder-skill".to_string());
    if let Some(insights) = probe_insights {
        metadata
            .insert("probe.chapterLikeLinks".to_string(), insights.chapter_like_links.to_string());
        metadata.insert("probe.bestContentSelector".to_string(), insights.best_content_selector);
    } else {
        metadata.insert("probe.failed".to_string(), "true".to_string());
    }

    let mut pkg = SourceRulePackage {
        package_id: Uuid::new_v4().to_string(),
        engine_version: env!("CARGO_PKG_VERSION").to_string(),
        generated_at_ms: now_ms(),
        generator: "source-builder-skill".to_string(),
        source,
        validation: SourceRuleValidationReport::draft(0.0),
        readiness: Default::default(),
        tags: req.tags.clone(),
        metadata,
        documentation: None,
        samples: None,
        capabilities: None,
        import_policy: None,
        search_profile: None,
        fetch_profile: None,
    };
    pkg.validation = validate_package_shape(&pkg);
    pkg.refresh_readiness();

    let package_json = serde_json::to_string_pretty(&pkg).ok();
    Json(ApiResponse::success(SourceBuildResponse {
        package: pkg,
        package_json,
    }))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidatePackageRequest {
    pub package: SourceRulePackage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub samples: Option<ValidationSamples>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationSamples {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toc_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidatePackageResponse {
    pub package_id: String,
    pub report: SourceRuleValidationReport,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_debug: Option<SourceFetchDebugInfo>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineRunByPackageRequest {
    pub package: SourceRulePackage,
    pub operation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineRunByPackageResponse {
    pub package_id: String,
    pub operation: String,
    pub result: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<SourceValidationStepReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_debug: Option<SourceFetchDebugInfo>,
}
