use super::*;

pub(crate) fn build_fetch_profile(req: &SourceBuildFromSamplesRequest) -> SourceFetchProfile {
    SourceFetchProfile {
        mode: req
            .fetch_mode
            .clone()
            .unwrap_or_else(|| "replay".to_string()),
        provider: req
            .fetch_provider
            .clone()
            .unwrap_or_else(|| "curl_replay".to_string()),
        service_url: req.fetch_service_url.clone(),
        engine: req.fetch_engine.clone(),
        session_key: req.fetch_session_key.clone(),
        note: Some("Uses controlled fetch inputs or external provider output".to_string()),
    }
}

pub(crate) fn extract_free_text_hints(input: &str) -> SourceRuleHints {
    let mut hints = SourceRuleHints::default();
    for line in input.lines() {
        let Some((raw_key, raw_value)) = line.split_once(':') else {
            continue;
        };
        let key = raw_key.trim().to_ascii_lowercase();
        let value = raw_value.trim();
        if value.is_empty() {
            continue;
        }
        match key.as_str() {
            "search" | "search entry" | "search_entry" => {
                hints.search_entry = Some(value.to_string());
            },
            "search result" | "search_result" | "search result selector" => {
                hints.search_result_selector = Some(value.to_string());
            },
            "book title" | "book_title" | "title selector" => {
                hints.book_title_selector = Some(value.to_string());
            },
            "author" | "author selector" => {
                hints.author_selector = Some(value.to_string());
            },
            "intro" | "intro selector" | "description" => {
                hints.intro_selector = Some(value.to_string());
            },
            "toc" | "toc item" | "toc_item" | "chapter list" => {
                hints.toc_item_selector = Some(value.to_string());
            },
            "content" | "content selector" => {
                hints.content_selector = Some(value.to_string());
            },
            "content title" | "content_title" | "chapter title" => {
                hints.content_title_selector = Some(value.to_string());
            },
            "pagination" | "next page" | "next_page" => {
                hints.pagination_selector = Some(value.to_string());
            },
            "noise" | "noise pattern" | "noise_pattern" => {
                hints.noise_patterns.push(value.to_string());
            },
            _ => {},
        }
    }
    hints
}

pub(crate) fn package_default_samples(
    package: &SourceRulePackage,
    req_samples: Option<ValidationSamples>,
) -> Option<ValidationSamples> {
    if req_samples.is_some() {
        return req_samples;
    }
    let samples = package.samples.as_ref()?;
    Some(ValidationSamples {
        search_query: package.metadata.get("sample.searchKeyword").cloned(),
        book_url: samples.book_sample_url.clone(),
        toc_url: samples.book_sample_url.clone(),
        chapter_url: samples.chapter_sample_url.clone(),
    })
}

pub(crate) fn make_step(
    step: &str,
    ok: bool,
    summary: impl Into<String>,
) -> SourceValidationStepReport {
    SourceValidationStepReport {
        step: step.to_string(),
        ok,
        summary: summary.into(),
        failure_code: None,
        warnings: Vec::new(),
        errors: Vec::new(),
        item_count: None,
        quality_score: None,
        suggested_actions: Vec::new(),
        manual_review_recommended: false,
    }
}

pub(crate) fn classify_fetch_error(error: &str) -> &'static str {
    let lower = error.to_ascii_lowercase();
    if lower.contains("cloudflare") || lower.contains("403") || lower.contains("429") {
        "fetch_failed"
    } else if lower.contains("timeout") {
        "fetch_timeout"
    } else {
        "fetch_failed"
    }
}

pub(crate) fn suggested_actions_for(code: &str, step: &str) -> Vec<String> {
    match code {
        "fetch_failed" => vec![
            format!("检查 {step} 步骤的 fetch provider、service url 和请求头是否正确"),
            "确认目标页面 HTML 已被成功获取，而不是保护页或错误页".to_string(),
        ],
        "fetch_timeout" => vec![
            format!("提高 {step} 步骤的 provider 超时或检查外部服务性能"),
            "确认外部抓取服务本身可达".to_string(),
        ],
        "empty_result" => vec![
            format!("检查 {step} 对应的列表选择器是否命中"),
            "尝试补充更精确的结构化提示，如 result selector / toc item selector".to_string(),
        ],
        "selector_miss" => vec![
            format!("修正 {step} 的关键选择器"),
            "优先提供结构化提示而不是仅靠自由文本".to_string(),
        ],
        "detail_mismatch" => vec![
            "检查 search item.url 是否提取到了真实详情页链接".to_string(),
            "补充 result_filter 或更精确的 search item url selector".to_string(),
        ],
        "detail_cross_site" => vec![
            "限制搜索结果到当前源站域名，避免外链或聚合搜索结果混入".to_string(),
            "补充 result_filter，约束到书籍详情页路径前缀".to_string(),
        ],
        "detail_fetch_failed" => vec![
            "检查详情页链接是否真实可访问，而不是跳到保护页、章节页或错误页".to_string(),
            "确认 search item.url 提取的是详情页入口，不是其他功能链接".to_string(),
        ],
        "detail_selector_miss" => vec![
            "详情页已打开但书籍规则不命中，优先修正 book.name / book.author / book.intro"
                .to_string(),
            "若当前搜索结果落到了章节页，需要收紧 result_filter 或修正 search item.url".to_string(),
        ],
        "low_quality" => vec![
            "补充 content selector 或噪音清洗规则".to_string(),
            "增加广告关键词、替换规则或分页提示".to_string(),
        ],
        "manual_review" => vec![
            "人工核对当前 HTML 是否为正文页".to_string(),
            "若正文混杂广告或错乱，补充 noise patterns 和 content selector".to_string(),
        ],
        _ => vec![format!("检查 {step} 步骤的规则与样本输入是否匹配")],
    }
}

fn parse_metadata_f64(package: &SourceRulePackage, key: &str) -> Option<f64> {
    package
        .metadata
        .get(key)
        .and_then(|value| value.parse::<f64>().ok())
}

pub(crate) fn has_enabled_search_strategy(
    package: &SourceRulePackage,
    mode: SourceSearchMode,
    provider: Option<&str>,
) -> bool {
    package
        .search_profile
        .as_ref()
        .map(|profile| {
            profile.strategies.iter().any(|strategy| {
                strategy.enabled
                    && strategy.mode == mode
                    && provider
                        .map(|expected| strategy.provider == expected)
                        .unwrap_or(true)
            })
        })
        .unwrap_or(false)
}

/// Enabled `direct_detail` / `external_discovery` strategies (same notion as search API fallback modes).
pub(crate) fn has_fallback_search_strategies(package: &SourceRulePackage) -> bool {
    package
        .search_profile
        .as_ref()
        .map(|profile| {
            profile.strategies.iter().any(|strategy| {
                strategy.enabled
                    && matches!(
                        strategy.mode,
                        SourceSearchMode::DirectDetail | SourceSearchMode::ExternalDiscovery
                    )
            })
        })
        .unwrap_or(false)
}

/// When native search steps fail but book/toc/content pass and the package declares a search fallback, allow import.
pub(crate) fn validation_relaxed_search_importable(
    steps: &[SourceValidationStepReport],
    native_search_enabled: bool,
    has_fallback: bool,
) -> bool {
    if !native_search_enabled || !has_fallback {
        return false;
    }
    let strict_all_ok = steps.iter().all(|step| step.ok);
    if strict_all_ok {
        return false;
    }
    let critical_ok = steps
        .iter()
        .filter(|step| matches!(step.step.as_str(), "book" | "toc" | "content"))
        .all(|step| step.ok);
    if !critical_ok {
        return false;
    }
    steps
        .iter()
        .all(|step| step.ok || matches!(step.step.as_str(), "search" | "search_detail"))
}

pub(crate) fn append_jina_guidance(
    report: &mut SourceRuleValidationReport,
    package: &SourceRulePackage,
) {
    let preferred_probe = package
        .metadata
        .get("builder.preferredProbeInput")
        .cloned()
        .unwrap_or_default();
    let ai_gain = parse_metadata_f64(package, "builder.aiReadabilityGain").unwrap_or(0.0);
    let trafilatura_gain =
        parse_metadata_f64(package, "builder.trafilaturaReadabilityGain").unwrap_or(0.0);
    let recommended_extractor = package
        .metadata
        .get("builder.recommendedContentExtractor")
        .cloned()
        .unwrap_or_default();
    let candidate_summary = package
        .metadata
        .get("builder.contentCandidateSummaries")
        .cloned()
        .unwrap_or_default();

    for step in &mut report.steps {
        match step.step.as_str() {
            "content"
                if (step.failure_code.as_deref() == Some("low_quality")
                    || step.failure_code.as_deref() == Some("manual_review")) =>
            {
                if preferred_probe == "jina_readable" && ai_gain >= 0.08 {
                    step.suggested_actions.push(
                        "Jina 可读内容明显优于原始抓取，优先根据 Jina 输出收窄 content selector 并补充 noise patterns"
                            .to_string(),
                    );
                    step.suggested_actions.push(
                        "保持原始 HTML 作为 selector 基准，同时用 Jina markdown/text 对照核验正文边界"
                            .to_string(),
                    );
                }
                if recommended_extractor == "trafilatura" && trafilatura_gain >= 0.08 {
                    step.suggested_actions.push(
                        "Trafilatura 提取明显优于规则正文，优先根据 Trafilatura 的连续段落边界收窄 content selector，并补充 filter / replace 清洗规则"
                            .to_string(),
                    );
                    step.suggested_actions.push(
                        "对照 Trafilatura 结果检查正文容器是否混入顶部导航、底部推荐、广告尾注或分页提示"
                            .to_string(),
                    );
                }
                if !candidate_summary.is_empty() {
                    step.suggested_actions
                        .push(format!("候选对比: {candidate_summary}"));
                }
            },
            "search" if step.failure_code.as_deref() == Some("empty_result") => {
                let has_jina_search = has_enabled_search_strategy(
                    package,
                    SourceSearchMode::ExternalDiscovery,
                    Some("jina_search"),
                );
                if has_jina_search {
                    step.suggested_actions.push(
                        "当前包未验证原生搜索时，可先用 jina_search 外部发现命中详情页，再补 search_curl 回修 native_search 规则"
                            .to_string(),
                    );
                }
            },
            _ => {},
        }
    }
}

pub(crate) fn select_search_result_for_validation(
    items: &[nexus_core::BookItem],
    sample_book_url: Option<&str>,
) -> Option<String> {
    if items.is_empty() {
        return None;
    }
    if let Some(sample_book_url) = sample_book_url {
        if let Ok(sample) = Url::parse(sample_book_url) {
            if let Some(found) = items.iter().find(|item| {
                Url::parse(item.book_url.as_ref())
                    .ok()
                    .map(|url| url.host_str() == sample.host_str() && url.path() == sample.path())
                    .unwrap_or(false)
            }) {
                return Some(found.book_url.to_string());
            }
            if let Some(found) = items.iter().find(|item| {
                Url::parse(item.book_url.as_ref())
                    .ok()
                    .map(|url| url.host_str() == sample.host_str())
                    .unwrap_or(false)
            }) {
                return Some(found.book_url.to_string());
            }
        }
    }
    items.first().map(|item| item.book_url.to_string())
}

#[cfg(test)]
mod validation_relaxed_tests {
    use super::*;

    #[test]
    fn relaxed_import_when_only_native_search_fails() {
        let steps = vec![
            make_step("search", false, "failed"),
            make_step("book", true, "ok"),
            make_step("toc", true, "ok"),
            make_step("content", true, "ok"),
        ];
        assert!(validation_relaxed_search_importable(&steps, true, true));
    }

    #[test]
    fn relaxed_import_when_search_and_detail_fail() {
        let steps = vec![
            make_step("search", false, "failed"),
            make_step("search_detail", false, "failed"),
            make_step("book", true, "ok"),
            make_step("toc", true, "ok"),
            make_step("content", true, "ok"),
        ];
        assert!(validation_relaxed_search_importable(&steps, true, true));
    }

    #[test]
    fn no_relaxed_import_without_fallback() {
        let steps = vec![
            make_step("search", false, "failed"),
            make_step("book", true, "ok"),
            make_step("toc", true, "ok"),
            make_step("content", true, "ok"),
        ];
        assert!(!validation_relaxed_search_importable(&steps, true, false));
    }

    #[test]
    fn no_relaxed_import_when_book_fails() {
        let steps = vec![
            make_step("search", false, "failed"),
            make_step("book", false, "failed"),
            make_step("toc", true, "ok"),
            make_step("content", true, "ok"),
        ];
        assert!(!validation_relaxed_search_importable(&steps, true, true));
    }
}
