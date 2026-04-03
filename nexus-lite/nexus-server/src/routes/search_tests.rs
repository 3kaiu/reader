use super::ranking::package_search_rank;
use super::*;
use nexus_core::nxs::{
    BookRule, ContentRule, SearchItemFields, SearchRule, TocItemFields, TocRule,
};
use nexus_core::{
    NxsSource, SearchExplainStrategy, SourceHealthReport, SourceHealthSegment, SourceHealthStatus,
    SourceImportPolicy, SourceRulePackage, SourceRuleValidationReport,
};
use std::collections::HashMap;
use std::sync::Arc;

fn make_package(
    source_id: &str,
    recommended: bool,
    overall_score: f64,
    import_priority: i32,
) -> SourceRulePackage {
    SourceRulePackage {
        package_id: format!("pkg-{source_id}"),
        engine_version: "test".to_string(),
        generated_at_ms: 0,
        generator: "test".to_string(),
        source: NxsSource {
            version: 1,
            id: source_id.to_string(),
            name: source_id.to_string(),
            url: format!("https://{source_id}.example.com"),
            search: SearchRule {
                path: "/search?q={q}".to_string(),
                method: "GET".to_string(),
                body: None,
                encoding: None,
                list: ".book".to_string(),
                result_filter: None,
                item: SearchItemFields {
                    name: ".title".to_string(),
                    author: Some(".author".to_string()),
                    url: "a".to_string(),
                    cover: None,
                    intro: None,
                },
            },
            book: BookRule {
                name: "h1".to_string(),
                author: Some(".author".to_string()),
                intro: Some(".intro".to_string()),
                cover: None,
                toc: Some("#toc".to_string()),
            },
            toc: TocRule {
                list: "#toc a".to_string(),
                item: TocItemFields {
                    name: "text".to_string(),
                    url: "href".to_string(),
                },
                reverse: false,
            },
            content: ContentRule {
                body: "#content".to_string(),
                filter: Vec::new(),
                visible_only: true,
                script: None,
                script_enabled: false,
                replace: Vec::new(),
                clean: None,
                pagination: None,
                font_decrypt: None,
                validation: None,
            },
            protection: None,
            headers: None,
            extra: None,
        },
        validation: SourceRuleValidationReport {
            valid: true,
            compile_ok: true,
            warnings: Vec::new(),
            errors: Vec::new(),
            score: overall_score,
            steps: Vec::new(),
            importable: true,
            manual_review_required: false,
            health: SourceHealthReport {
                overall_score,
                recommended,
                search: SourceHealthSegment {
                    status: SourceHealthStatus::Pass,
                    ..Default::default()
                },
                book: SourceHealthSegment {
                    status: SourceHealthStatus::Pass,
                    ..Default::default()
                },
                toc: SourceHealthSegment {
                    status: SourceHealthStatus::Pass,
                    ..Default::default()
                },
                content: SourceHealthSegment {
                    status: SourceHealthStatus::Pass,
                    ..Default::default()
                },
            },
            last_validated_at_ms: Some(0),
        },
        tags: Vec::new(),
        metadata: HashMap::new(),
        documentation: None,
        samples: None,
        capabilities: None,
        import_policy: Some(SourceImportPolicy {
            enabled_by_default: true,
            priority: import_priority,
            allow_search: true,
            allow_read: true,
            visibility: "private".to_string(),
        }),
        search_profile: None,
        fetch_profile: None,
    }
}

fn make_item(name: &str, source_id: &str) -> BookItem {
    let mut item = BookItem::new(
        Arc::<str>::from(name),
        Arc::<str>::from(format!("https://{source_id}.example.com/book")),
        Arc::<str>::from(source_id),
        Arc::<str>::from(source_id),
    );
    item.author = Some(Arc::<str>::from("tester"));
    item.intro = Some(Arc::<str>::from("intro"));
    item
}

#[test]
fn package_sort_prefers_recommended_then_health() {
    let mut packages = vec![
        make_package("low", false, 0.95, 100),
        make_package("recommended", true, 0.60, 100),
        make_package("mid", false, 0.80, 100),
    ];

    sort_packages_for_search(&mut packages);

    let ids = packages
        .iter()
        .map(|pkg| pkg.source.id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["recommended", "low", "mid"]);
}

#[test]
fn result_sort_prefers_keyword_match_then_package_rank() {
    let packages = [
        make_package("high", true, 0.90, 100),
        make_package("low", false, 0.40, 100),
    ];
    let ranks = packages
        .iter()
        .map(|pkg| (pkg.source.id.clone(), package_search_rank(pkg)))
        .collect::<HashMap<_, _>>();

    let mut results = vec![
        make_item("别的书", "high"),
        make_item("目标书", "low"),
        make_item("目标书", "high"),
    ];

    sort_results_for_keyword(&mut results, "目标书", &ranks);

    let ordered = results
        .iter()
        .map(|item| (item.name.as_ref(), item.source_id.as_ref()))
        .collect::<Vec<_>>();
    assert_eq!(ordered, vec![("目标书", "high"), ("目标书", "low"), ("别的书", "high")]);
}

#[test]
fn annotate_rankings_adds_explainability_fields() {
    let packages = [make_package("high", true, 0.90, 100)];
    let ranks = packages
        .iter()
        .map(|pkg| (pkg.source.id.clone(), package_search_rank(pkg)))
        .collect::<HashMap<_, _>>();

    let mut results = vec![make_item("目标书", "high")];
    annotate_result_rankings(&mut results, "目标书", &ranks);

    let explain = results[0].search_explain.as_ref().expect("search explain");
    assert_eq!(explain.strategy, SearchExplainStrategy::NativeSearch);
    assert_eq!(explain.provider.as_ref(), "source_search");
    assert!(explain.match_score.unwrap_or_default() > 0);
    assert_eq!(explain.package_rank, Some(package_search_rank(&packages[0])));
}
