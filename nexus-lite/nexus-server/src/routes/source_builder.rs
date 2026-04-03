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
use nexus_engine::anti_crawl::{CfBypassStrategy, DirectHttpStrategy, FallbackChain};
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
use fetch::{
    apply_session_to_parsed, execute_fetch, extract_via_trafilatura, fetch_html_with_session,
    fetch_seed_html, fetch_via_jina_reader, get_fetch_session, import_fetch_session,
    load_fetch_session, parse_curl_command, preferred_jina_respond_with, replay_curl_request,
    resolve_external_service_api_key, resolve_external_service_url, CurlReplay, ParsedCurl,
};
#[cfg(test)]
use package::{
    build_documentation, build_search_profile, classify_noise_patterns,
    compute_generalization_score, infer_detail_url_template, infer_noise_replace_rules,
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
use validation_support::{
    append_jina_guidance, build_fetch_profile, classify_fetch_error, extract_free_text_hints,
    has_enabled_search_strategy, make_step, package_default_samples,
    select_search_result_for_validation, suggested_actions_for,
};

const CONTENT_SELECTOR_CANDIDATES: &[&str] = &[
    "article",
    ".content",
    "#content",
    ".chapter-content",
    "#txtcontent",
    ".txtnav",
    ".yd_text2",
    ".Readarea",
    ".read-content-text",
    ".txt",
    ".read-content",
    ".content-body",
    ".chapter-body",
    ".article-content",
];
const BOOK_NAME_SELECTOR_CANDIDATES: &[&str] = &[
    "h1",
    ".book-title",
    ".title",
    ".info h1",
    "meta[property='og:title']",
];
const AUTHOR_SELECTOR_CANDIDATES: &[&str] = &[
    ".author",
    ".book-author",
    ".info .author",
    "p.author",
    ".book-meta",
];
const INTRO_SELECTOR_CANDIDATES: &[&str] =
    &[".intro", ".book-intro", "#intro", ".desc", ".book-summary"];
const TOC_SELECTOR_CANDIDATES: &[&str] = &[
    ".chapter-list a",
    "#list a",
    ".listmain a",
    ".catalog a",
    ".dirlist a",
    "#catalog a",
    "#chapterList a",
    ".chapters a",
    "a[href*='chapter']",
    "a[href*='/book/'][href*='/']",
];
const SEARCH_RESULT_SELECTOR_FALLBACKS: &[&str] = &[
    ".search-list > li",
    ".search-result a",
    ".result-list li",
    ".book-list li",
    ".bookbox",
    ".result-item",
    ".search-item",
    "li",
    "a[href]",
];
const TOC_SELECTOR_FALLBACKS: &[&str] = &[".chapter-list a", "#list a", ".catalog a", "a[href]"];
const CONTENT_SELECTOR_FALLBACKS: &[&str] = &[
    "#content",
    ".content",
    ".txtnav",
    ".read-content",
    "article",
];
const BOOK_TITLE_SELECTOR_FALLBACKS: &[&str] =
    &["h1", ".book-title", ".title", "meta[property='og:title']"];
const AUTHOR_SELECTOR_FALLBACKS: &[&str] = &[".author", ".book-author", ".info .author"];
const COMMON_CONTENT_FILTERS: &[&str] = &["script", "style", "ins", ".ads", ".advert", ".banner"];

#[derive(Debug, Clone)]
struct ProbeInsights {
    chapter_like_links: usize,
    best_toc_selector: String,
    best_toc_score: f64,
    best_content_selector: String,
    best_content_score: f64,
}

#[derive(Debug, Clone)]
struct SearchProbeInsights {
    list_selector: String,
    list_score: f64,
    result_count: usize,
    name_selector: String,
    url_selector: String,
    author_selector: Option<String>,
    intro_selector: Option<String>,
    result_filter: Option<String>,
    next_page_selector: Option<String>,
}

#[derive(Debug, Clone)]
struct SearchEntryProbeInsights {
    action_url: String,
    method: String,
    keyword_param: String,
    body_template: Option<String>,
    form_selector: Option<String>,
}

#[derive(Debug, Clone)]
struct SearchSample {
    request_url: String,
    final_url: String,
    method: String,
    body_template: Option<String>,
    status: u16,
    html: String,
}

#[derive(Debug, Clone)]
struct SameSiteValidationInsights {
    score: f64,
    candidate_count: usize,
    validated_url: Option<String>,
    warnings: Vec<String>,
}

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
        validation: SourceRuleValidationReport {
            valid: true,
            compile_ok: false,
            warnings: Vec::new(),
            errors: Vec::new(),
            score: 0.0,
            steps: Vec::new(),
            importable: false,
            manual_review_required: false,
            health: SourceHealthReport::default(),
            last_validated_at_ms: None,
        },
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
        routing::post,
        Router,
    };
    use nexus_storage::SledStore;
    use std::sync::Arc;
    use tower::ServiceExt;

    async fn build_test_state(
        config: &nexus_core::EngineConfig,
    ) -> anyhow::Result<SourceBuilderState> {
        let store = Arc::new(SledStore::new(&config.storage.db_path)?);
        Ok(SourceBuilderState { store })
    }

    #[tokio::test]
    async fn build_source_package_returns_package() {
        let app = Router::new().route("/api/source-builder/build", post(build_source_package));
        let payload = serde_json::json!({
            "seedUrl": "https://example.com"
        });
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/source-builder/build")
                    .method("POST")
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("route should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should be readable");
        let body: serde_json::Value = serde_json::from_slice(&bytes).expect("valid json");
        assert_eq!(body.get("success").and_then(|v| v.as_bool()), Some(true));
    }

    #[test]
    fn parse_curl_command_extracts_headers_and_cookies() {
        let curl = "curl 'https://example.com/book/1' -H 'accept: text/html' -b 'cf_clearance=abc; foo=bar'";
        let parsed = parse_curl_command(curl).expect("curl should parse");
        assert_eq!(parsed.url, "https://example.com/book/1");
        assert_eq!(parsed.headers.get("accept").map(String::as_str), Some("text/html"));
        assert_eq!(parsed.cookies.get("cf_clearance").map(String::as_str), Some("abc"));
        assert_eq!(parsed.cookies.get("foo").map(String::as_str), Some("bar"));
    }

    #[test]
    fn build_source_from_samples_generates_documented_package() {
        let req = SourceBuildFromSamplesRequest {
            book_curl: "curl 'https://example.com/book/1'".to_string(),
            chapter_curl: "curl 'https://example.com/book/1/2.html'".to_string(),
            search_curl: None,
            site_entry_curl: None,
            search_keyword: None,
            source_id: Some("example".to_string()),
            source_name: Some("Example".to_string()),
            tags: vec!["test".to_string()],
            emit_package_json: false,
            fetch_mode: None,
            fetch_provider: None,
            fetch_service_url: None,
            fetch_engine: None,
            fetch_session_key: None,
            structured_hints: None,
            free_text_hints: None,
        };
        let book_url = Url::parse("https://example.com/book/1").expect("book url should parse");
        let chapter_url =
            Url::parse("https://example.com/book/1/2.html").expect("chapter url should parse");
        let book_html = r#"
            <html><body>
              <div class="info"><h1>Test Book</h1><p class="author">Tester</p></div>
              <div class="intro">Intro text</div>
              <div class="chapter-list">
                <a href="/book/1/2.html">第一章 起始</a>
                <a href="/book/1/3.html">第二章 继续</a>
              </div>
            </body></html>
        "#;
        let chapter_html = r#"
            <html><body>
              <div class="content">正文内容<br/>继续正文</div>
              <div class="ad">最新网址发布页</div>
            </body></html>
        "#;

        let (package, diagnostics) = build_source_from_samples(
            &req,
            &book_url,
            book_html,
            &chapter_url,
            chapter_html,
            None,
            None,
        );

        assert_eq!(package.source.id, "example");
        assert!(package.documentation.is_some());
        assert!(package.capabilities.is_some());
        assert_eq!(diagnostics.host, "example.com");
        assert!(diagnostics
            .noise_patterns_detected
            .iter()
            .any(|it| it.contains("最新网址")));
        assert!(package
            .source
            .content
            .replace
            .iter()
            .any(|rule| rule.pattern.contains("最新网址") || rule.pattern.contains("本章完")));
        assert!(
            package
                .metadata
                .get("probe.contentSelectorScore")
                .and_then(|value| value.parse::<f64>().ok())
                .unwrap_or_default()
                > 0.0
        );
        assert!(
            package
                .metadata
                .get("probe.autoNoiseRuleCount")
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or_default()
                > 0
        );
        assert_eq!(
            package
                .metadata
                .get("builder.searchRuleSource")
                .map(String::as_str),
            Some("no_native_search_sample")
        );
        assert_eq!(diagnostics.search_strategy, "external_discovery_only");
        assert_eq!(diagnostics.same_site_candidate_count, 0);
    }

    #[test]
    fn build_source_from_samples_marks_native_search_only_when_verified() {
        let req = SourceBuildFromSamplesRequest {
            book_curl: "curl 'https://example.com/book/1'".to_string(),
            chapter_curl: "curl 'https://example.com/book/1/2.html'".to_string(),
            search_curl: Some("curl 'https://example.com/search?q=test'".to_string()),
            site_entry_curl: None,
            search_keyword: Some("测试小说".to_string()),
            source_id: Some("example".to_string()),
            source_name: Some("Example".to_string()),
            tags: vec![],
            emit_package_json: false,
            fetch_mode: None,
            fetch_provider: None,
            fetch_service_url: None,
            fetch_engine: None,
            fetch_session_key: None,
            structured_hints: None,
            free_text_hints: None,
        };
        let book_url =
            Url::parse("https://example.com/book/1.html").expect("book url should parse");
        let chapter_url =
            Url::parse("https://example.com/book/1/2.html").expect("chapter url should parse");
        let book_html = r#"
            <html><body>
              <div class="info"><h1>Test Book</h1><p class="author">Tester</p></div>
              <div id="list">
                <a href="/book/1/2.html">第一章 起始</a>
              </div>
            </body></html>
        "#;
        let chapter_html = r#"
            <html><body>
              <div id="content">正文内容</div>
            </body></html>
        "#;
        let search_sample = SearchSample {
            request_url: "https://example.com/search?q=test".to_string(),
            final_url: "https://example.com/search?q=test".to_string(),
            method: "GET".to_string(),
            body_template: None,
            status: 200,
            html: r#"
                <html><body>
                  <ul class="search-list">
                    <li><a href="/book/1.html">测试小说</a><span>作者：张三</span></li>
                  </ul>
                </body></html>
            "#
            .to_string(),
        };

        let (package, diagnostics) = build_source_from_samples(
            &req,
            &book_url,
            book_html,
            &chapter_url,
            chapter_html,
            Some(&search_sample),
            None,
        );

        let profile = package.search_profile.expect("search profile");
        assert_eq!(profile.default_mode, Some(SourceSearchMode::NativeSearch));
        assert!(profile.strategies.iter().any(|strategy| {
            strategy.mode == SourceSearchMode::NativeSearch && strategy.enabled
        }));
        assert!(profile.strategies.iter().any(|strategy| {
            strategy.mode == SourceSearchMode::ExternalDiscovery && !strategy.enabled
        }));
        assert_eq!(
            package
                .metadata
                .get("builder.searchRuleSource")
                .map(String::as_str),
            Some("verified_search_sample")
        );
        assert_eq!(diagnostics.search_strategy, "native_verified");
    }

    #[test]
    fn build_source_from_samples_can_infer_native_search_from_site_entry() {
        let req = SourceBuildFromSamplesRequest {
            book_curl: "curl 'https://example.com/book/1'".to_string(),
            chapter_curl: "curl 'https://example.com/book/1/2.html'".to_string(),
            search_curl: None,
            site_entry_curl: Some("curl 'https://example.com/'".to_string()),
            search_keyword: Some("测试小说".to_string()),
            source_id: Some("example".to_string()),
            source_name: Some("Example".to_string()),
            tags: vec![],
            emit_package_json: false,
            fetch_mode: None,
            fetch_provider: None,
            fetch_service_url: None,
            fetch_engine: None,
            fetch_session_key: None,
            structured_hints: None,
            free_text_hints: None,
        };
        let book_url =
            Url::parse("https://example.com/book/1.html").expect("book url should parse");
        let chapter_url =
            Url::parse("https://example.com/book/1/2.html").expect("chapter url should parse");
        let book_html = r#"
            <html><body>
              <div class="info"><h1>Test Book</h1><p class="author">Tester</p></div>
              <div id="list">
                <a href="/book/1/2.html">第一章 起始</a>
              </div>
            </body></html>
        "#;
        let chapter_html = r#"
            <html><body>
              <div id="content">正文内容</div>
            </body></html>
        "#;
        let site_entry_probe = SearchEntryProbeInsights {
            action_url: "https://example.com/search?keyword={q}".to_string(),
            method: "GET".to_string(),
            keyword_param: "keyword".to_string(),
            body_template: None,
            form_selector: Some("form:nth-of-type(1)".to_string()),
        };

        let (package, diagnostics) = build_source_from_samples(
            &req,
            &book_url,
            book_html,
            &chapter_url,
            chapter_html,
            None,
            Some(&site_entry_probe),
        );

        let profile = package.search_profile.expect("search profile");
        assert_eq!(profile.default_mode, Some(SourceSearchMode::DirectDetail));
        assert!(profile.strategies.iter().any(|strategy| {
            strategy.mode == SourceSearchMode::NativeSearch
                && !strategy.enabled
                && strategy.provider == "native_http_inferred"
        }));
        assert!(profile.strategies.iter().any(|strategy| {
            strategy.mode == SourceSearchMode::ExternalDiscovery && strategy.enabled
        }));
        assert_eq!(
            package
                .metadata
                .get("builder.searchRuleSource")
                .map(String::as_str),
            Some("site_entry_inferred")
        );
        assert_eq!(
            package
                .metadata
                .get("probe.searchEntryKeywordParam")
                .map(String::as_str),
            Some("keyword")
        );
        assert_eq!(package.source.search.path, "https://example.com/search?keyword={q}");
        assert_eq!(diagnostics.search_strategy, "native_entry_inferred");
    }

    #[test]
    fn derive_best_content_selector_prefers_main_chapter_container() {
        let html = Html::parse_document(
            r#"
            <html><body>
              <div class="banner">最新网址，收藏本站，手机阅读，广告投放</div>
              <div id="txtcontent">
                第1章 开始<br/><br/>
                这是正文第一段，这是正文第一段，这是正文第一段。<br/><br/>
                这是正文第二段，这是正文第二段，这是正文第二段。<br/><br/>
                这是正文第三段，这是正文第三段，这是正文第三段。
              </div>
            </body></html>
            "#,
        );
        let mut probe = ProbeDoc::new(&html);
        let (selector, score) =
            derive_best_content_selector(&mut probe, CONTENT_SELECTOR_CANDIDATES, 3);

        assert!(selector.contains("#txtcontent"), "selector={selector}");
        assert!(score > 0.0, "score should be positive");
    }

    #[test]
    fn derive_best_toc_selector_prefers_real_chapter_list() {
        let html = Html::parse_document(
            r#"
            <html><body>
              <div class="recommend">
                <a href="/book/1.html">猜你喜欢</a>
                <a href="/book/2.html">作者主页</a>
                <a href="/top.html">排行榜</a>
              </div>
              <div id="list">
                <a href="/book/9/1.html">第1章 开始</a>
                <a href="/book/9/2.html">第2章 继续</a>
                <a href="/book/9/3.html">第3章 深入</a>
                <a href="/book/9/4.html">第4章 转折</a>
                <a href="/book/9/5.html">第5章 收束</a>
                <a href="/book/9/6.html">第6章 余波</a>
              </div>
            </body></html>
            "#,
        );
        let mut probe = ProbeDoc::new(&html);
        let (selector, score) = derive_best_toc_selector(&mut probe, TOC_SELECTOR_CANDIDATES, 3);

        assert!(selector.contains("#list a"), "selector={selector}");
        assert!(score > 0.0, "score should be positive");
    }

    #[test]
    fn infer_search_selector_prefers_real_result_list() {
        let search_html = r#"
            <html><body>
              <div class="nav">
                <a href="/">首页</a>
                <a href="/rank">排行</a>
              </div>
              <ul class="search-list">
                <li><a href="/book/1.html">测试小说</a><span>作者：张三</span></li>
                <li><a href="/book/2.html">另一部小说</a><span>作者：李四</span></li>
              </ul>
              <div class="pagination">
                <a href="/search?q=test&page=1">1</a>
                <a href="/search?q=test&page=2">2</a>
                <a href="/search?q=test&page=2">下一页</a>
              </div>
            </body></html>
        "#;
        let sample_book_url = Url::parse("https://example.com/book/123.html").expect("book url");
        let insights = infer_search_selector_from_html(search_html, Some(&sample_book_url));

        assert!(
            insights.list_selector.contains(".search-list > li"),
            "selector={}",
            insights.list_selector
        );
        assert!(insights.list_score > 0.0);
        assert!(insights.result_count >= 2);
        assert_eq!(insights.name_selector, "a");
        assert_eq!(insights.url_selector, "a@href");
        assert_eq!(insights.author_selector.as_deref(), Some("span"));
        assert_eq!(insights.result_filter.as_deref(), Some("/book/"));
        assert_eq!(insights.next_page_selector.as_deref(), Some(".pagination a"));
    }

    #[test]
    fn extract_same_site_chapter_candidates_returns_siblings() {
        let book_url = Url::parse("https://example.com/book/1.html").expect("book url");
        let chapter_url = Url::parse("https://example.com/book/1/1.html").expect("chapter url");
        let book_html = r#"
            <html><body>
              <div id="list">
                <a href="/book/1/1.html">第1章</a>
                <a href="/book/1/2.html">第2章</a>
                <a href="/book/1/3.html">第3章</a>
              </div>
            </body></html>
        "#;

        let urls =
            extract_same_site_chapter_candidates(&book_url, book_html, "#list a", &chapter_url, 5);

        assert_eq!(urls.len(), 2);
        assert_eq!(urls[0].as_str(), "https://example.com/book/1/2.html");
    }

    #[test]
    fn select_search_result_for_validation_prefers_sample_match() {
        let items = vec![
            nexus_core::BookItem {
                name: "A".into(),
                author: None,
                cover_url: None,
                book_url: "https://example.com/book/999.html".into(),
                intro: None,
                source_id: "example".into(),
                source_name: "Example".into(),
                latest_chapter: None,
                search_explain: None,
            },
            nexus_core::BookItem {
                name: "B".into(),
                author: None,
                cover_url: None,
                book_url: "https://example.com/book/123.html".into(),
                intro: None,
                source_id: "example".into(),
                source_name: "Example".into(),
                latest_chapter: None,
                search_explain: None,
            },
        ];

        let selected =
            select_search_result_for_validation(&items, Some("https://example.com/book/123.html"));

        assert_eq!(selected.as_deref(), Some("https://example.com/book/123.html"));
    }

    #[test]
    fn classify_search_detail_failure_distinguishes_cross_site_and_selector_miss() {
        let cross_site = classify_search_detail_failure(
            "https://other.example.com/author/12",
            Some("https://example.com/book/123.html"),
            None,
        );
        let selector_miss = classify_search_detail_failure(
            "https://example.com/book/123.html",
            Some("https://example.com/book/123.html"),
            Some("Rule mismatch: book.name"),
        );

        assert_eq!(cross_site, "detail_cross_site");
        assert_eq!(selector_miss, "detail_selector_miss");
    }

    #[test]
    fn compute_generalization_score_penalizes_risky_patterns() {
        let book_url = Url::parse("https://example.com/book/123.html").expect("book url");
        let chapter_url = Url::parse("https://example.com/book/123/1.html").expect("chapter url");
        let book_html = r#"
            <html><body>
              <div id="list">
                <a href="/book/123/1.html">第1章</a>
                <a href="/book/123/2.html">第2章</a>
                <a href="/book/123/3.html">第3章</a>
                <a href="/book/123/4.html">第4章</a>
                <a href="/book/123/5.html">第5章</a>
                <a href="/book/123/6.html">第6章</a>
              </div>
            </body></html>
        "#;
        let chapter_html = r#"
            <html><body>
              <div id="txtcontent">第1章 开始<br/><br/>正文内容正文内容正文内容正文内容正文内容。</div>
            </body></html>
        "#;

        let stable = compute_generalization_score(
            &book_url,
            &chapter_url,
            book_html,
            chapter_html,
            &[],
            Some(&ProbeInsights {
                chapter_like_links: 12,
                best_toc_selector: "#list a".to_string(),
                best_toc_score: 18.0,
                best_content_selector: "#txtcontent".to_string(),
                best_content_score: 12.0,
            }),
            12.0,
            2,
        );

        let risky = compute_generalization_score(
            &book_url,
            &chapter_url,
            book_html,
            chapter_html,
            &[
                "toc_selector_too_specific".to_string(),
                "content_selector_too_generic".to_string(),
                "chapter_noise_high".to_string(),
            ],
            Some(&ProbeInsights {
                chapter_like_links: 2,
                best_toc_selector: "a[href]".to_string(),
                best_toc_score: 2.0,
                best_content_selector: "body".to_string(),
                best_content_score: 2.0,
            }),
            2.0,
            0,
        );

        assert!(stable > risky, "stable={stable}, risky={risky}");
    }

    #[tokio::test]
    async fn validate_source_package_returns_report() {
        let seed = Url::parse("https://example.com/book/1").expect("valid seed");
        let (source, _) = build_source_from_seed(
            &SourceBuildRequest {
                seed_url: "https://example.com/book/1".to_string(),
                source_id: Some("example".to_string()),
                source_name: Some("example".to_string()),
                tags: vec![],
            },
            &seed,
            None,
        );
        let package = SourceRulePackage {
            package_id: "pkg-1".to_string(),
            engine_version: "test".to_string(),
            generated_at_ms: 0,
            generator: "test".to_string(),
            source,
            validation: SourceRuleValidationReport {
                valid: true,
                compile_ok: false,
                warnings: vec![],
                errors: vec![],
                score: 0.0,
                steps: vec![],
                importable: false,
                manual_review_required: false,
                health: SourceHealthReport::default(),
                last_validated_at_ms: None,
            },
            tags: vec![],
            metadata: HashMap::new(),
            documentation: None,
            samples: None,
            capabilities: None,
            import_policy: None,
            search_profile: None,
            fetch_profile: None,
        };

        let temp_root =
            std::env::temp_dir().join(format!("nexus-source-builder-test-{}", Uuid::new_v4()));
        tokio::fs::create_dir_all(&temp_root)
            .await
            .expect("temp dir should be created");
        let mut config = nexus_core::EngineConfig::default();
        config.storage.db_path = temp_root.join("db");
        config.storage.sources_dir = temp_root.join("sources");
        config.storage.cache_dir = temp_root.join("cache");
        nexus_storage::init_storage(&config)
            .await
            .expect("storage should init");
        let state = build_test_state(&config)
            .await
            .expect("app state should build");

        let app = Router::new()
            .route("/api/source-builder/validate", post(validate_source_package))
            .with_state(state);
        let payload = serde_json::json!({ "package": package });
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/source-builder/validate")
                    .method("POST")
                    .header("content-type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("request should build"),
            )
            .await
            .expect("route should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should be readable");
        let body: serde_json::Value = serde_json::from_slice(&bytes).expect("valid json");
        assert_eq!(body.get("success").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(body.pointer("/data/packageId").and_then(|v| v.as_str()), Some("pkg-1"));
        assert!(body.pointer("/data/report").is_some(), "validate endpoint should return report");
    }
}
