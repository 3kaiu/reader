use super::package::compute_generalization_score;
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

async fn build_test_state(config: &nexus_core::EngineConfig) -> anyhow::Result<SourceBuilderState> {
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
    let curl =
        "curl 'https://example.com/book/1' -H 'accept: text/html' -b 'cf_clearance=abc; foo=bar'";
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
    let book_url = Url::parse("https://example.com/book/1.html").expect("book url should parse");
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
    assert!(profile
        .strategies
        .iter()
        .any(|strategy| { strategy.mode == SourceSearchMode::NativeSearch && strategy.enabled }));
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
    let book_url = Url::parse("https://example.com/book/1.html").expect("book url should parse");
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
        nexus_core::BookItem::new("A", "https://example.com/book/999.html", "example", "Example"),
        nexus_core::BookItem::new("B", "https://example.com/book/123.html", "example", "Example"),
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
        readiness: nexus_core::SourceReadinessReport::default(),
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
