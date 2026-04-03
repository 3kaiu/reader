use super::*;

pub(crate) fn build_source_from_seed(
    req: &SourceBuildRequest,
    parsed: &Url,
    html: Option<&str>,
) -> (NxsSource, Option<ProbeInsights>) {
    let host = parsed.host_str().unwrap_or("unknown-source");
    let source_id = req
        .source_id
        .clone()
        .unwrap_or_else(|| normalize_source_id(host));
    let source_name = req
        .source_name
        .clone()
        .unwrap_or_else(|| infer_source_name(host));
    let base_url = derive_base_url(parsed);

    let (book_name_sel, author_sel, intro_sel, toc_list_sel, content_sel, probe_insights) =
        if let Some(html) = html {
            let doc = Html::parse_document(html);
            let mut probe = ProbeDoc::new(&doc);
            probe.warm_scores(BOOK_NAME_SELECTOR_CANDIDATES, false);
            probe.warm_scores(AUTHOR_SELECTOR_CANDIDATES, false);
            probe.warm_scores(INTRO_SELECTOR_CANDIDATES, false);
            probe.warm_scores(TOC_SELECTOR_CANDIDATES, true);
            probe.warm_scores(CONTENT_SELECTOR_CANDIDATES, false);
            let book_name_sel =
                derive_selector_chain(&mut probe, BOOK_NAME_SELECTOR_CANDIDATES, false, 3);
            let author_sel =
                derive_selector_chain(&mut probe, AUTHOR_SELECTOR_CANDIDATES, false, 2);
            let intro_sel = derive_selector_chain(&mut probe, INTRO_SELECTOR_CANDIDATES, false, 2);
            let (toc_list_sel, best_toc_score) =
                derive_best_toc_selector(&mut probe, TOC_SELECTOR_CANDIDATES, 3);
            let (content_sel, best_content_score) =
                derive_best_content_selector(&mut probe, CONTENT_SELECTOR_CANDIDATES, 3);
            let probe_insights = ProbeInsights {
                chapter_like_links: probe.likely_chapter_links(),
                best_toc_selector: toc_list_sel
                    .split('|')
                    .next()
                    .map(|it| it.trim().to_string())
                    .filter(|it| !it.is_empty())
                    .unwrap_or_else(|| ".chapter-list a".to_string()),
                best_toc_score,
                best_content_selector: content_sel
                    .split('|')
                    .next()
                    .map(|it| it.trim().to_string())
                    .filter(|it| !it.is_empty())
                    .unwrap_or_else(|| {
                        choose_best_selector(&mut probe, CONTENT_SELECTOR_CANDIDATES, false)
                    }),
                best_content_score,
            };
            (
                book_name_sel,
                author_sel,
                intro_sel,
                toc_list_sel,
                content_sel,
                Some(probe_insights),
            )
        } else {
            (
                "h1 | .book-title | .title".to_string(),
                ".author | .book-author | .info .author".to_string(),
                ".intro | .book-intro | #intro | .desc".to_string(),
                ".chapter-list a | #list a | .listmain a | .catalog a | a[href*='chapter']"
                    .to_string(),
                "article | .content | #content | .chapter-content | .txt | .read-content"
                    .to_string(),
                None,
            )
        };

    let source = NxsSource {
        version: 2,
        id: source_id,
        name: source_name,
        url: base_url,
        search: nexus_core::nxs::SearchRule {
            path: format!("https://html.duckduckgo.com/html/?q=site%3A{host}+{{q}}"),
            method: "GET".to_string(),
            body: None,
            encoding: None,
            list: "div.result, .search-result-item, .book-item".to_string(),
            result_filter: None,
            item: nexus_core::nxs::SearchItemFields {
                name: "a.result__a, .title a, h3 a, a".to_string(),
                author: Some(".author, .book-author, .result__snippet".to_string()),
                url: "a.result__a@href, .title a@href, h3 a@href, a@href".to_string(),
                cover: Some("img@src".to_string()),
                intro: Some(".result__snippet, .intro, .desc".to_string()),
            },
        },
        book: nexus_core::nxs::BookRule {
            name: book_name_sel,
            author: Some(author_sel),
            intro: Some(intro_sel),
            cover: Some("img.book-cover@src, .cover img@src, img@src".to_string()),
            toc: Some("a[href*='chapter'], a[href*='catalog'], a[href*='list']@href".to_string()),
        },
        toc: nexus_core::nxs::TocRule {
            list: toc_list_sel,
            reverse: false,
            item: nexus_core::nxs::TocItemFields {
                name: "text".to_string(),
                url: "href".to_string(),
            },
        },
        content: nexus_core::nxs::ContentRule {
            body: content_sel,
            filter: vec![
                "script".to_string(),
                "style".to_string(),
                ".ad".to_string(),
                ".ads".to_string(),
                ".advert".to_string(),
                ".banner".to_string(),
            ],
            visible_only: true,
            script: None,
            script_enabled: false,
            replace: Vec::new(),
            clean: None,
            pagination: None,
            font_decrypt: None,
            validation: Some(nexus_core::nxs::ContentValidationConfig {
                min_chars: 80,
                min_paragraphs: 1,
                allow_short_chapter: true,
            }),
        },
        protection: Some("L6".to_string()),
        headers: None,
        extra: None,
    };

    (source, probe_insights)
}

pub(crate) fn classify_noise_patterns(
    chapter_html: &str,
    content_selector: &str,
) -> (Vec<String>, Vec<String>) {
    let mut noise_patterns = Vec::new();
    let mut risk_flags = Vec::new();
    let lower = chapter_html.to_ascii_lowercase();

    for needle in [
        "advert",
        "ads",
        "banner",
        "推广",
        "最新网址",
        "收藏本站",
        "手机阅读",
    ] {
        if lower.contains(&needle.to_ascii_lowercase()) {
            noise_patterns.push(needle.to_string());
        }
    }

    let private_use_chars = chapter_html
        .chars()
        .filter(|ch| ('\u{e000}'..='\u{f8ff}').contains(ch))
        .count();
    if private_use_chars > 0 {
        risk_flags.push("possible_font_obfuscation".to_string());
    }
    if chapter_html.contains("&#x") || chapter_html.contains("&#") {
        risk_flags.push("entity_encoded_text".to_string());
    }
    if chapter_html.matches("<br").count() > 20 && content_selector == "body" {
        risk_flags.push("content_selector_too_generic".to_string());
    }
    if count_pattern_hits(chapter_html, &["最新网址", "收藏本站", "手机阅读", "上一章", "下一章"])
        >= 2
    {
        risk_flags.push("chapter_noise_high".to_string());
    }

    noise_patterns.sort();
    noise_patterns.dedup();
    risk_flags.sort();
    risk_flags.dedup();
    (noise_patterns, risk_flags)
}

fn escape_regex_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '\\' | '.' | '+' | '*' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '^' | '$' | '|' => {
                out.push('\\');
                out.push(ch);
            },
            _ => out.push(ch),
        }
    }
    out
}

pub(crate) fn infer_noise_replace_rules(chapter_html: &str) -> Vec<ReplaceRule> {
    let known_noise_phrases = [
        "最新网址",
        "收藏本站",
        "手机阅读",
        "一秒记住",
        "加入书签",
        "返回目录",
        "上一章",
        "下一章",
        "本章未完",
        "本章完",
        "广告",
        "推广",
    ];

    let text = Html::parse_document(chapter_html)
        .root_element()
        .text()
        .collect::<Vec<_>>()
        .join("\n");

    let mut rules = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for phrase in known_noise_phrases {
        if !text.contains(phrase) {
            continue;
        }

        if seen.insert(phrase.to_string()) {
            rules.push(ReplaceRule {
                id: Uuid::new_v4().to_string(),
                name: format!("auto-remove-noise-{phrase}"),
                pattern: escape_regex_text(phrase),
                replacement: Some(String::new()),
                scope: None,
                is_enabled: true,
                is_regex: true,
            });
        }
    }

    for line in text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && line.chars().count() <= 48)
    {
        if count_pattern_hits(
            line,
            &[
                "最新网址",
                "收藏本站",
                "手机阅读",
                "一秒记住",
                "加入书签",
                "返回目录",
                "上一章",
                "下一章",
                "本章完",
            ],
        ) == 0
        {
            continue;
        }

        if seen.insert(line.to_string()) {
            rules.push(ReplaceRule {
                id: Uuid::new_v4().to_string(),
                name: format!("auto-remove-noise-line-{}", seen.len()),
                pattern: escape_regex_text(line),
                replacement: Some(String::new()),
                scope: None,
                is_enabled: true,
                is_regex: true,
            });
        }
    }

    rules
}

pub(crate) fn build_documentation(
    host: &str,
    book_url: &str,
    chapter_url: &str,
    noise_patterns: &[String],
    risk_flags: &[String],
) -> SourceDocumentation {
    SourceDocumentation {
        site_summary: Some(format!(
            "{host} uses a split page model where the book detail page carries metadata and TOC, while chapter pages carry正文内容."
        )),
        page_model: Some(
            "book_detail page provides book metadata + chapter list; chapter_content page provides正文抽取与清洗样本。".to_string(),
        ),
        book_page_notes: Some(format!("Sample book page: {book_url}")),
        chapter_page_notes: Some(format!("Sample chapter page: {chapter_url}")),
        content_noise_notes: noise_patterns.to_vec(),
        known_risks: risk_flags.to_vec(),
        recommended_usage: Some(
            "Import this package into the backend registry, then use source_id for multi-source search and source-bound reading flows."
                .to_string(),
        ),
    }
}

fn derive_search_rule(host: &str) -> (String, bool) {
    (format!("https://html.duckduckgo.com/html/?q=site%3A{host}+{{q}}"), false)
}

pub(crate) fn infer_detail_url_template(book_url: &Url) -> Option<String> {
    let path = book_url.path();
    let mut replaced = false;
    let templated = path
        .split('/')
        .map(|segment| {
            if !replaced && !segment.is_empty() && segment.chars().any(|ch| ch.is_ascii_digit()) {
                replaced = true;
                "{id}".to_string()
            } else {
                segment.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("/");
    if replaced {
        Some(format!(
            "{}://{}{}{}",
            book_url.scheme(),
            book_url.host_str().unwrap_or_default(),
            if templated.starts_with('/') { "" } else { "/" },
            templated
        ))
    } else {
        None
    }
}

fn looks_like_template_stable(path: &str) -> bool {
    let segments = path
        .split('/')
        .filter(|segment| !segment.trim().is_empty())
        .collect::<Vec<_>>();
    if segments.is_empty() {
        return false;
    }

    let numeric_segments = segments
        .iter()
        .filter(|segment| segment.chars().any(|ch| ch.is_ascii_digit()))
        .count();
    let unstable_markers = segments
        .iter()
        .filter(|segment| {
            segment.contains('?')
                || segment.contains('=')
                || segment.len() > 48
                || segment.chars().filter(|ch| ch.is_ascii_digit()).count() > 12
        })
        .count();

    numeric_segments <= 2 && unstable_markers == 0
}

fn fingerprint_dom_shape(html: &str) -> (usize, usize, usize) {
    let doc = Html::parse_document(html);
    let all_selector = Selector::parse("*").expect("selector");
    let link_selector = Selector::parse("a").expect("selector");
    let image_selector = Selector::parse("img").expect("selector");

    (
        doc.select(&all_selector).count(),
        doc.select(&link_selector).count(),
        doc.select(&image_selector).count(),
    )
}

pub(crate) fn compute_generalization_score(
    book_url: &Url,
    chapter_url: &Url,
    book_html: &str,
    chapter_html: &str,
    risk_flags: &[String],
    book_probe: Option<&ProbeInsights>,
    content_score: f64,
    inferred_noise_rule_count: usize,
) -> f64 {
    let mut score = 0.55f64;

    if infer_detail_url_template(book_url).is_some() {
        score += 0.1;
    }
    if looks_like_template_stable(book_url.path()) {
        score += 0.08;
    }
    if looks_like_template_stable(chapter_url.path()) {
        score += 0.08;
    }
    if let Some(book_probe) = book_probe {
        if book_probe.best_toc_score >= 12.0 {
            score += 0.08;
        } else if book_probe.best_toc_score < 4.0 {
            score -= 0.08;
        }
        if book_probe.chapter_like_links >= 8 {
            score += 0.06;
        } else if book_probe.chapter_like_links < 3 {
            score -= 0.08;
        }
        if book_probe.best_content_score >= 10.0 {
            score += 0.04;
        }
    }
    if content_score >= 10.0 {
        score += 0.08;
    } else if content_score < 4.0 {
        score -= 0.12;
    }
    if inferred_noise_rule_count > 0 {
        score += 0.03;
    }

    let (book_nodes, book_links, _) = fingerprint_dom_shape(book_html);
    let (chapter_nodes, chapter_links, _) = fingerprint_dom_shape(chapter_html);
    if book_nodes > 30 && chapter_nodes > 20 {
        score += 0.03;
    }
    if chapter_links < book_links {
        score += 0.02;
    }

    for flag in risk_flags {
        match flag.as_str() {
            "toc_selector_too_specific" => score -= 0.08,
            "book_selector_too_generic" => score -= 0.08,
            "content_selector_too_generic" => score -= 0.12,
            "chapter_noise_high" => score -= 0.06,
            "possible_font_obfuscation" => score -= 0.05,
            "entity_encoded_text" => score -= 0.03,
            _ => {},
        }
    }

    score.clamp(0.2, 0.95)
}

pub(crate) fn build_search_profile(
    req: &SourceBuildFromSamplesRequest,
    book_url: &Url,
    native_search_supported: bool,
    native_search_candidate: bool,
    search_path: &str,
    source: &NxsSource,
    search_next_page_selector: Option<&str>,
) -> SourceSearchProfile {
    let mut strategies = Vec::new();
    let native_search_sampled = req.search_curl.is_some();

    if native_search_sampled && native_search_supported {
        if let Some(search_curl) = req.search_curl.as_ref() {
            if let Ok(parsed) = parse_curl_command(search_curl) {
                let method = parsed.method.to_uppercase();
                let query_template = if method == "GET" {
                    Some(parsed.url.clone())
                } else {
                    Some(search_path.to_string())
                };
                let body_template = parsed.body.clone();
                strategies.push(SearchStrategyRule {
                    id: "native-search".to_string(),
                    mode: SourceSearchMode::NativeSearch,
                    enabled: true,
                    priority: 10,
                    provider: "native_http".to_string(),
                    query_template,
                    method: Some(method),
                    body_template,
                    result_selector: Some(source.search.list.clone()),
                    detail_url_template: None,
                    book_url_matchers: source.search.result_filter.clone().into_iter().collect(),
                    pagination: SearchPaginationRule {
                        enabled: search_next_page_selector.is_some(),
                        next_page_selector: search_next_page_selector.map(ToString::to_string),
                        max_pages: if search_next_page_selector.is_some() {
                            3
                        } else {
                            1
                        },
                    },
                    disabled_reason: None,
                });
            }
        }
    } else if native_search_candidate {
        strategies.push(SearchStrategyRule {
            id: "native-search".to_string(),
            mode: SourceSearchMode::NativeSearch,
            enabled: false,
            priority: 10,
            provider: if req.site_entry_curl.is_some() {
                "native_http_inferred".to_string()
            } else {
                "native_http_candidate".to_string()
            },
            query_template: if source.search.method.eq_ignore_ascii_case("GET") {
                Some(search_path.to_string())
            } else {
                None
            },
            method: Some(source.search.method.clone()),
            body_template: source.search.body.clone(),
            result_selector: Some(source.search.list.clone()),
            detail_url_template: None,
            book_url_matchers: source.search.result_filter.clone().into_iter().collect(),
            pagination: SearchPaginationRule {
                enabled: search_next_page_selector.is_some(),
                next_page_selector: search_next_page_selector.map(ToString::to_string),
                max_pages: if search_next_page_selector.is_some() {
                    3
                } else {
                    1
                },
            },
            disabled_reason: Some(
                "native search rule inferred but not yet validated with search result sample"
                    .to_string(),
            ),
        });
    }

    if let Some(detail_url_template) = infer_detail_url_template(book_url) {
        strategies.push(SearchStrategyRule {
            id: "direct-detail".to_string(),
            mode: SourceSearchMode::DirectDetail,
            enabled: true,
            priority: 30,
            provider: "direct_candidate_url".to_string(),
            query_template: None,
            method: None,
            body_template: None,
            result_selector: None,
            detail_url_template: Some(detail_url_template),
            book_url_matchers: vec![book_url.host_str().unwrap_or_default().to_string()],
            pagination: SearchPaginationRule::default(),
            disabled_reason: None,
        });
    }

    strategies.push(SearchStrategyRule {
        id: "external-discovery".to_string(),
        mode: SourceSearchMode::ExternalDiscovery,
        enabled: !native_search_supported,
        priority: 50,
        provider: "jina_search".to_string(),
        query_template: Some(format!("site:{} {{q}}", book_url.host_str().unwrap_or_default())),
        method: Some("GET".to_string()),
        body_template: None,
        result_selector: Some(source.search.list.clone()),
        detail_url_template: None,
        book_url_matchers: vec![book_url.host_str().unwrap_or_default().to_string()],
        pagination: SearchPaginationRule {
            enabled: search_next_page_selector.is_some(),
            next_page_selector: search_next_page_selector.map(ToString::to_string),
            max_pages: if search_next_page_selector.is_some() {
                3
            } else {
                1
            },
        },
        disabled_reason: if native_search_supported {
            Some(
                "native search verified; external discovery kept as builder/runtime fallback"
                    .to_string(),
            )
        } else {
            Some("used when source lacks verified native search".to_string())
        },
    });

    SourceSearchProfile {
        enabled: true,
        default_mode: Some(if native_search_supported {
            SourceSearchMode::NativeSearch
        } else if infer_detail_url_template(book_url).is_some() {
            SourceSearchMode::DirectDetail
        } else {
            SourceSearchMode::ExternalDiscovery
        }),
        strategies,
    }
}

pub(crate) fn build_source_from_samples(
    req: &SourceBuildFromSamplesRequest,
    book_url: &Url,
    book_html: &str,
    chapter_url: &Url,
    chapter_html: &str,
    search_sample: Option<&SearchSample>,
    site_entry_probe: Option<&SearchEntryProbeInsights>,
) -> (SourceRulePackage, SourceBuildDiagnostics) {
    let seed_req = SourceBuildRequest {
        seed_url: book_url.as_str().to_string(),
        source_id: req.source_id.clone(),
        source_name: req.source_name.clone(),
        tags: req.tags.clone(),
    };
    let (mut source, book_probe) = build_source_from_seed(&seed_req, book_url, Some(book_html));
    let chapter_doc = Html::parse_document(chapter_html);
    let mut chapter_probe = ProbeDoc::new(&chapter_doc);
    chapter_probe.warm_scores(CONTENT_SELECTOR_CANDIDATES, false);
    let (content_sel, content_score) =
        derive_best_content_selector(&mut chapter_probe, CONTENT_SELECTOR_CANDIDATES, 3);
    source.content.body = content_sel.clone();

    let (search_path, mut native_search_supported) =
        derive_search_rule(book_url.host_str().unwrap_or("unknown-source"));
    source.search.path = search_path.clone();
    let mut native_search_candidate = false;
    let mut search_inference_score = None;
    let mut search_next_page_selector = None::<String>;
    if let Some(search_sample) = search_sample {
        native_search_candidate = true;
        let search_probe = infer_search_selector_from_html(&search_sample.html, Some(book_url));
        source.search.path = search_sample.final_url.clone();
        source.search.method = search_sample.method.clone();
        source.search.body = search_sample.body_template.clone();
        if search_probe.list_score > 0.0 {
            source.search.list = search_probe.list_selector.clone();
            source.search.item.name = search_probe.name_selector.clone();
            source.search.item.url = search_probe.url_selector.clone();
            source.search.item.author = search_probe.author_selector.clone();
            source.search.item.intro = search_probe.intro_selector.clone();
            source.search.result_filter = search_probe.result_filter.clone();
            search_next_page_selector = search_probe.next_page_selector.clone();
            native_search_supported = search_probe.result_count > 0;
            search_inference_score = Some(search_probe.list_score);
        }
    } else if let Some(site_entry_probe) = site_entry_probe {
        native_search_candidate = true;
        source.search.path = site_entry_probe.action_url.clone();
        source.search.method = site_entry_probe.method.clone();
        source.search.body = site_entry_probe.body_template.clone();
    }

    let (noise_patterns, mut risk_flags) = classify_noise_patterns(chapter_html, &content_sel);
    let inferred_noise_rules = infer_noise_replace_rules(chapter_html);
    source.content.replace.extend(inferred_noise_rules.clone());
    if book_probe
        .as_ref()
        .map(|it| it.chapter_like_links)
        .unwrap_or_default()
        < 5
    {
        risk_flags.push("toc_selector_too_specific".to_string());
    }
    if book_probe
        .as_ref()
        .map(|it| it.best_content_selector == "body")
        .unwrap_or(false)
    {
        risk_flags.push("book_selector_too_generic".to_string());
    }
    risk_flags.sort();
    risk_flags.dedup();

    let documentation = build_documentation(
        book_url.host_str().unwrap_or("unknown-source"),
        book_url.as_str(),
        chapter_url.as_str(),
        &noise_patterns,
        &risk_flags,
    );
    let capabilities = SourceCapabilityMatrix {
        search_supported: native_search_supported,
        book_supported: true,
        toc_supported: true,
        content_supported: true,
        direct_detail_supported: infer_detail_url_template(book_url).is_some(),
        external_discovery_supported: true,
        search_pagination_supported: search_next_page_selector.is_some(),
        search_special_param_supported: req.search_curl.is_some() && native_search_supported,
        pagination_supported: false,
        font_decrypt_supported: risk_flags
            .iter()
            .any(|it| it == "possible_font_obfuscation"),
        script_clean_supported: !noise_patterns.is_empty(),
    };
    let search_profile = build_search_profile(
        req,
        book_url,
        native_search_supported,
        native_search_candidate,
        &source.search.path,
        &source,
        search_next_page_selector.as_deref(),
    );
    let samples = SourceBuildSamples {
        book_sample_url: Some(book_url.as_str().to_string()),
        chapter_sample_url: Some(chapter_url.as_str().to_string()),
        book_sample_fingerprint: Some(fingerprint_text(book_html)),
        chapter_sample_fingerprint: Some(fingerprint_text(chapter_html)),
    };
    let import_policy = SourceImportPolicy {
        enabled_by_default: true,
        priority: 100,
        allow_search: search_profile.enabled,
        allow_read: true,
        visibility: "private".to_string(),
    };

    let mut metadata = HashMap::new();
    metadata.insert("seedUrl".to_string(), book_url.as_str().to_string());
    metadata.insert("chapterSampleUrl".to_string(), chapter_url.as_str().to_string());
    metadata.insert("generatedBy".to_string(), "source-builder-skill".to_string());
    metadata.insert("urlPatterns.book".to_string(), book_url.path().to_string());
    metadata.insert("urlPatterns.chapter".to_string(), chapter_url.path().to_string());
    metadata.insert(
        "probe.chapterLikeLinks".to_string(),
        book_probe
            .as_ref()
            .map(|it| it.chapter_like_links.to_string())
            .unwrap_or_else(|| "0".to_string()),
    );
    metadata
        .insert("builder.nativeSearchSupported".to_string(), native_search_supported.to_string());
    metadata
        .insert("builder.nativeSearchSampled".to_string(), req.search_curl.is_some().to_string());
    metadata.insert(
        "builder.searchRuleSource".to_string(),
        if native_search_supported {
            "verified_search_sample".to_string()
        } else if site_entry_probe.is_some() {
            "site_entry_inferred".to_string()
        } else if req.search_curl.is_some() {
            "search_sample_unverified".to_string()
        } else {
            "no_native_search_sample".to_string()
        },
    );
    if let Some(book_probe) = book_probe.as_ref() {
        metadata.insert("probe.tocSelector".to_string(), book_probe.best_toc_selector.clone());
        metadata.insert(
            "probe.tocSelectorScore".to_string(),
            format!("{:.3}", book_probe.best_toc_score),
        );
    }
    metadata.insert("probe.contentSelectorScore".to_string(), format!("{content_score:.3}"));
    metadata.insert("probe.autoNoiseRuleCount".to_string(), inferred_noise_rules.len().to_string());
    if let Some(score) = search_inference_score {
        metadata.insert("probe.searchSelectorScore".to_string(), format!("{score:.3}"));
    }
    if let Some(site_entry_probe) = site_entry_probe {
        metadata.insert("probe.searchEntryAction".to_string(), site_entry_probe.action_url.clone());
        metadata.insert("probe.searchEntryMethod".to_string(), site_entry_probe.method.clone());
        metadata.insert(
            "probe.searchEntryKeywordParam".to_string(),
            site_entry_probe.keyword_param.clone(),
        );
        if let Some(form_selector) = site_entry_probe.form_selector.as_ref() {
            metadata.insert("probe.searchEntryFormSelector".to_string(), form_selector.clone());
        }
        if let Some(body_template) = site_entry_probe.body_template.as_ref() {
            metadata.insert("probe.searchEntryBodyTemplate".to_string(), body_template.clone());
        }
    }
    metadata.insert("probe.searchItemNameSelector".to_string(), source.search.item.name.clone());
    metadata.insert("probe.searchItemUrlSelector".to_string(), source.search.item.url.clone());
    if let Some(result_filter) = source.search.result_filter.as_ref() {
        metadata.insert("probe.searchResultFilter".to_string(), result_filter.clone());
    }
    if let Some(next_page_selector) = search_next_page_selector.as_ref() {
        metadata.insert("probe.searchNextPageSelector".to_string(), next_page_selector.clone());
    }
    if let Some(author) = source.search.item.author.as_ref() {
        metadata.insert("probe.searchItemAuthorSelector".to_string(), author.clone());
    }
    if let Some(intro) = source.search.item.intro.as_ref() {
        metadata.insert("probe.searchItemIntroSelector".to_string(), intro.clone());
    }
    if let Some(book_probe) = book_probe.as_ref() {
        metadata.insert(
            "probe.bookContentSelectorScore".to_string(),
            format!("{:.3}", book_probe.best_content_score),
        );
    }

    let generalization_score = compute_generalization_score(
        book_url,
        chapter_url,
        book_html,
        chapter_html,
        &risk_flags,
        book_probe.as_ref(),
        content_score,
        inferred_noise_rules.len(),
    );
    let mut package = SourceRulePackage {
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
            score: generalization_score,
            steps: Vec::new(),
            importable: false,
            manual_review_required: false,
            health: SourceHealthReport::default(),
            last_validated_at_ms: None,
        },
        tags: req.tags.clone(),
        metadata,
        documentation: Some(documentation),
        samples: Some(samples),
        capabilities: Some(capabilities.clone()),
        import_policy: Some(import_policy),
        search_profile: Some(search_profile),
        fetch_profile: None,
    };
    if !capabilities.search_supported {
        package.validation.warnings.push(
            "native search not verified; package will rely on direct detail or external discovery"
                .to_string(),
        );
    }
    if !noise_patterns.is_empty() {
        package.validation.warnings.push(format!(
            "detected potential content noise patterns: {}",
            noise_patterns.join(", ")
        ));
    }
    package.validation = validate_package_shape(&package);
    package.validation.score = generalization_score;

    let diagnostics = SourceBuildDiagnostics {
        host: book_url.host_str().unwrap_or("unknown-source").to_string(),
        book_sample_url: book_url.as_str().to_string(),
        chapter_sample_url: chapter_url.as_str().to_string(),
        search_strategy: if native_search_supported {
            "native_verified".to_string()
        } else if site_entry_probe.is_some() {
            "native_entry_inferred".to_string()
        } else if req.search_curl.is_some() {
            "native_unverified".to_string()
        } else {
            "external_discovery_only".to_string()
        },
        fetch_mode: req
            .fetch_mode
            .clone()
            .unwrap_or_else(|| "replay".to_string()),
        fetch_provider: req
            .fetch_provider
            .clone()
            .unwrap_or_else(|| "curl_replay".to_string()),
        fetch_service_url: req.fetch_service_url.clone(),
        book_fetch_status: 0,
        chapter_fetch_status: 0,
        book_final_url: book_url.as_str().to_string(),
        chapter_final_url: chapter_url.as_str().to_string(),
        generalization_score,
        same_site_validation_score: None,
        same_site_candidate_count: 0,
        same_site_validated_url: None,
        same_site_validation_warnings: Vec::new(),
        search_inference_score,
        search_detail_validated_url: None,
        search_detail_resolved_name: None,
        search_detail_passed: None,
        search_detail_failure_code: None,
        search_detail_summary: None,
        search_detail_warnings: Vec::new(),
        selector_stability_warnings: risk_flags
            .iter()
            .filter(|flag| flag.contains("selector"))
            .cloned()
            .collect(),
        noise_patterns_detected: noise_patterns,
        risk_flags,
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
        jina_search_used: !native_search_supported,
    };

    (package, diagnostics)
}
