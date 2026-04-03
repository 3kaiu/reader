use super::*;

pub(crate) fn absolutize_url(base: &Url, href: &str) -> Option<Url> {
    if href.trim().is_empty() || href.starts_with("javascript:") || href.starts_with('#') {
        return None;
    }
    base.join(href).ok()
}

pub(crate) fn extract_selector_candidates(selector_chain: &str) -> Vec<String> {
    selector_chain
        .split('|')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect()
}

pub(crate) fn extract_same_site_chapter_candidates(
    book_url: &Url,
    book_html: &str,
    toc_selector_chain: &str,
    current_chapter_url: &Url,
    limit: usize,
) -> Vec<Url> {
    let doc = Html::parse_document(book_html);
    let mut urls = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for selector_text in extract_selector_candidates(toc_selector_chain) {
        let Ok(selector) = Selector::parse(&selector_text) else {
            continue;
        };
        for el in doc.select(&selector) {
            let Some(href) = el.value().attr("href") else {
                continue;
            };
            let Some(url) = absolutize_url(book_url, href) else {
                continue;
            };
            if url.host_str() != current_chapter_url.host_str() {
                continue;
            }
            if url.as_str() == current_chapter_url.as_str() {
                continue;
            }
            if seen.insert(url.as_str().to_string()) {
                urls.push(url);
            }
            if urls.len() >= limit {
                return urls;
            }
        }
    }

    urls
}

fn step_to_health_segment(
    step: Option<&SourceValidationStepReport>,
    validated_at_ms: i64,
) -> SourceHealthSegment {
    match step {
        Some(step) => SourceHealthSegment {
            status: if step.ok {
                if step.manual_review_recommended || !step.warnings.is_empty() {
                    SourceHealthStatus::Warn
                } else {
                    SourceHealthStatus::Pass
                }
            } else {
                SourceHealthStatus::Fail
            },
            quality_score: step.quality_score,
            failure_code: step.failure_code.clone(),
            warnings: step.warnings.clone(),
            last_validated_at_ms: Some(validated_at_ms),
        },
        None => SourceHealthSegment {
            status: SourceHealthStatus::Unknown,
            quality_score: None,
            failure_code: None,
            warnings: Vec::new(),
            last_validated_at_ms: Some(validated_at_ms),
        },
    }
}

pub(crate) fn compute_health_report(
    steps: Vec<SourceValidationStepReport>,
    validated_at_ms: i64,
) -> SourceHealthReport {
    let search_step = steps
        .iter()
        .find(|step| step.step == "search_detail")
        .or_else(|| steps.iter().find(|step| step.step == "search"));
    let book_step = steps.iter().find(|step| step.step == "book_info");
    let toc_step = steps.iter().find(|step| step.step == "chapters");
    let content_step = steps.iter().find(|step| step.step == "content");

    let search = step_to_health_segment(search_step, validated_at_ms);
    let book = step_to_health_segment(book_step, validated_at_ms);
    let toc = step_to_health_segment(toc_step, validated_at_ms);
    let content = step_to_health_segment(content_step, validated_at_ms);

    let segments = [&search, &book, &toc, &content];
    let mut score_sum = 0.0f64;
    let mut considered = 0u32;
    let mut recommended = true;

    for segment in segments {
        let segment_score = match segment.status {
            SourceHealthStatus::Pass => segment.quality_score.unwrap_or(1.0),
            SourceHealthStatus::Warn => segment.quality_score.unwrap_or(0.65),
            SourceHealthStatus::Fail => {
                recommended = false;
                segment.quality_score.unwrap_or(0.1)
            },
            SourceHealthStatus::Unknown => continue,
        };
        considered += 1;
        score_sum += segment_score.clamp(0.0, 1.0);
    }

    if considered == 0 {
        recommended = false;
    }

    SourceHealthReport {
        overall_score: if considered == 0 {
            0.0
        } else {
            score_sum / considered as f64
        },
        recommended,
        search,
        book,
        toc,
        content,
    }
}

pub(crate) fn validate_package_shape(pkg: &SourceRulePackage) -> SourceRuleValidationReport {
    let mut warnings = Vec::new();
    let mut errors = Vec::new();
    if pkg.source.search.list.trim().is_empty() {
        errors.push("search.list is empty".to_string());
    }
    if pkg.source.book.name.trim().is_empty() {
        errors.push("book.name is empty".to_string());
    }
    if pkg.source.toc.list.trim().is_empty() {
        errors.push("toc.list is empty".to_string());
    }
    if pkg.source.content.body.trim().is_empty() {
        errors.push("content.body is empty".to_string());
    }
    if pkg.source.search.path.contains("duckduckgo.com") {
        warnings.push("search.path uses generic DuckDuckGo site search template".to_string());
    }
    let score = if errors.is_empty() { 0.72 } else { 0.25 };
    SourceRuleValidationReport {
        valid: errors.is_empty(),
        compile_ok: false,
        warnings,
        errors,
        score,
        steps: Vec::new(),
        importable: false,
        manual_review_required: false,
        health: compute_health_report(Vec::new(), now_ms()),
        last_validated_at_ms: Some(now_ms()),
    }
}

pub(crate) fn classify_search_detail_failure(
    resolved_book_url: &str,
    sample_book_url: Option<&str>,
    error: Option<&str>,
) -> String {
    if let Some(sample_book_url) = sample_book_url {
        if let (Ok(resolved), Ok(sample)) =
            (Url::parse(resolved_book_url), Url::parse(sample_book_url))
        {
            if resolved.host_str() != sample.host_str() {
                return "detail_cross_site".to_string();
            }
            let resolved_path = resolved.path().to_ascii_lowercase();
            let sample_path = sample.path().to_ascii_lowercase();
            if resolved_path != sample_path
                && (resolved_path.contains("/author")
                    || resolved_path.contains("/chapter")
                    || resolved_path.contains("/list")
                    || resolved_path.contains("/top")
                    || resolved_path.contains("/rank"))
            {
                return "detail_cross_site".to_string();
            }
        }
    }

    if let Some(error) = error {
        let lower = error.to_ascii_lowercase();
        if lower.contains("rule mismatch") || lower.contains("book.name") {
            return "detail_selector_miss".to_string();
        }
        if lower.contains("http 4") || lower.contains("http 5") || lower.contains("cloudflare") {
            return "detail_fetch_failed".to_string();
        }
    }

    "detail_mismatch".to_string()
}
