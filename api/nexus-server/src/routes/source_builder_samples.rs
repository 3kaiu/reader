use super::refine::{apply_hints_to_package, merge_hints};
use super::*;

#[derive(Debug, Clone)]
struct ProbePreference {
    preferred_input: String,
    raw_score: f64,
    jina_score: Option<f64>,
    trafilatura_score: Option<f64>,
    ai_readability_gain: Option<f64>,
    trafilatura_readability_gain: Option<f64>,
    recommended_content_extractor: String,
    content_candidate_summaries: Vec<String>,
}

fn insert_metadata_value(
    metadata: &mut HashMap<String, String>,
    key: &str,
    value: impl Into<String>,
) {
    metadata.insert(key.to_string(), value.into());
}

fn append_request_replay_metadata(
    metadata: &mut HashMap<String, String>,
    label: &str,
    replay: &CurlReplay,
) {
    insert_metadata_value(
        metadata,
        &format!("request.{label}.headerCount"),
        replay.request_headers.len().to_string(),
    );
    insert_metadata_value(
        metadata,
        &format!("request.{label}.cookieCount"),
        replay.request_cookies.len().to_string(),
    );
    insert_metadata_value(metadata, &format!("request.{label}.url"), replay.request_url.clone());
    insert_metadata_value(metadata, &format!("request.{label}.status"), replay.status.to_string());
    insert_metadata_value(metadata, &format!("request.{label}.finalUrl"), replay.final_url.clone());
}

fn append_search_sample_metadata(
    metadata: &mut HashMap<String, String>,
    search_sample: Option<&SearchSample>,
) {
    let Some(search_sample) = search_sample else {
        return;
    };
    insert_metadata_value(metadata, "request.search.url", search_sample.request_url.clone());
    insert_metadata_value(metadata, "request.search.finalUrl", search_sample.final_url.clone());
    insert_metadata_value(metadata, "request.search.status", search_sample.status.to_string());
    if let Some(body_template) = search_sample.body_template.as_ref() {
        insert_metadata_value(metadata, "request.search.bodyTemplate", body_template.clone());
    }
}

fn append_site_entry_metadata(
    metadata: &mut HashMap<String, String>,
    site_entry_probe: Option<&(CurlReplay, Option<SearchEntryProbeInsights>)>,
) {
    let Some((site_entry_replay, site_entry_probe)) = site_entry_probe else {
        return;
    };
    insert_metadata_value(metadata, "request.siteEntry.url", site_entry_replay.request_url.clone());
    insert_metadata_value(
        metadata,
        "request.siteEntry.finalUrl",
        site_entry_replay.final_url.clone(),
    );
    insert_metadata_value(
        metadata,
        "request.siteEntry.status",
        site_entry_replay.status.to_string(),
    );
    insert_metadata_value(
        metadata,
        "probe.searchEntryDetected",
        (!site_entry_probe.is_none()).to_string(),
    );
}

fn append_probe_preference_metadata(
    metadata: &mut HashMap<String, String>,
    probe_preference: &ProbePreference,
    trafilatura_chapter_extract: Option<&fetch::ExternalExtractResponse>,
) {
    insert_metadata_value(
        metadata,
        "builder.preferredProbeInput",
        probe_preference.preferred_input.clone(),
    );
    insert_metadata_value(
        metadata,
        "builder.rawProbeScore",
        format!("{:.3}", probe_preference.raw_score),
    );
    if let Some(score) = probe_preference.jina_score {
        insert_metadata_value(metadata, "builder.jinaProbeScore", format!("{:.3}", score));
    }
    if let Some(gain) = probe_preference.ai_readability_gain {
        insert_metadata_value(metadata, "builder.aiReadabilityGain", format!("{:.3}", gain));
    }
    if let Some(score) = probe_preference.trafilatura_score {
        insert_metadata_value(metadata, "builder.trafilaturaProbeScore", format!("{:.3}", score));
    }
    if let Some(gain) = probe_preference.trafilatura_readability_gain {
        insert_metadata_value(
            metadata,
            "builder.trafilaturaReadabilityGain",
            format!("{:.3}", gain),
        );
    }
    insert_metadata_value(
        metadata,
        "builder.recommendedContentExtractor",
        probe_preference.recommended_content_extractor.clone(),
    );
    insert_metadata_value(
        metadata,
        "builder.contentCandidateSummaries",
        probe_preference.content_candidate_summaries.join(" || "),
    );

    let Some(extract) = trafilatura_chapter_extract else {
        return;
    };
    insert_metadata_value(metadata, "builder.trafilaturaCharCount", extract.char_count.to_string());
    insert_metadata_value(
        metadata,
        "builder.trafilaturaParagraphCount",
        extract.paragraph_count.to_string(),
    );
    if let Some(title) = extract
        .title
        .as_ref()
        .filter(|title| !title.trim().is_empty())
    {
        insert_metadata_value(metadata, "builder.trafilaturaTitle", title.clone());
    }
    if let Some(excerpt) = extract
        .excerpt
        .as_ref()
        .filter(|excerpt| !excerpt.trim().is_empty())
    {
        insert_metadata_value(metadata, "builder.trafilaturaExcerpt", excerpt.clone());
    }
    if !extract.warnings.is_empty() {
        insert_metadata_value(metadata, "builder.trafilaturaWarnings", extract.warnings.join(","));
    }
}

fn build_final_diagnostics(
    mut diagnostics: SourceBuildDiagnostics,
    package: &SourceRulePackage,
    book_replay: &CurlReplay,
    chapter_replay: &CurlReplay,
    same_site_validation: &SameSiteValidationInsights,
    probe_preference: ProbePreference,
) -> SourceBuildDiagnostics {
    let failure_categories = package
        .validation
        .steps
        .iter()
        .filter_map(|step| step.failure_code.clone())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let suggested_fixes = package
        .validation
        .steps
        .iter()
        .filter(|step| !step.ok || step.manual_review_recommended)
        .flat_map(|step| {
            if step.suggested_actions.is_empty() {
                vec![format!("fix {} step: {}", step.step, step.summary)]
            } else {
                step.suggested_actions
                    .iter()
                    .map(|item| format!("{}: {}", step.step, item))
                    .collect::<Vec<_>>()
            }
        })
        .collect();
    let (
        search_detail_validated_url,
        search_detail_resolved_name,
        search_detail_passed,
        search_detail_failure_code,
        search_detail_summary,
        search_detail_warnings,
    ) = extract_search_detail_diagnostics(&package.validation.steps);

    diagnostics.book_fetch_status = book_replay.status;
    diagnostics.chapter_fetch_status = chapter_replay.status;
    diagnostics.book_final_url = book_replay.final_url.clone();
    diagnostics.chapter_final_url = chapter_replay.final_url.clone();
    diagnostics.same_site_validation_score = Some(same_site_validation.score);
    diagnostics.same_site_candidate_count = same_site_validation.candidate_count;
    diagnostics.same_site_validated_url = same_site_validation.validated_url.clone();
    diagnostics.same_site_validation_warnings = same_site_validation.warnings.clone();
    diagnostics.search_detail_validated_url = search_detail_validated_url;
    diagnostics.search_detail_resolved_name = search_detail_resolved_name;
    diagnostics.search_detail_passed = search_detail_passed;
    diagnostics.search_detail_failure_code = search_detail_failure_code;
    diagnostics.search_detail_summary = search_detail_summary;
    diagnostics.search_detail_warnings = search_detail_warnings;
    diagnostics.suggested_fixes = suggested_fixes;
    diagnostics.failure_categories = failure_categories;
    diagnostics.preferred_probe_input = Some(probe_preference.preferred_input.clone());
    diagnostics.raw_probe_score = Some(probe_preference.raw_score);
    diagnostics.jina_probe_score = probe_preference.jina_score;
    diagnostics.trafilatura_probe_score = probe_preference.trafilatura_score;
    diagnostics.ai_readability_gain = probe_preference.ai_readability_gain;
    diagnostics.trafilatura_readability_gain = probe_preference.trafilatura_readability_gain;
    diagnostics.recommended_content_extractor =
        Some(probe_preference.recommended_content_extractor.clone());
    diagnostics.content_candidate_summaries = probe_preference.content_candidate_summaries;
    diagnostics.jina_search_used = package
        .search_profile
        .as_ref()
        .map(|profile| {
            profile
                .strategies
                .iter()
                .any(|strategy| strategy.enabled && strategy.provider == "jina_search")
        })
        .unwrap_or(false);

    diagnostics
}

type SearchDetailDiagnostics = (
    Option<String>,
    Option<String>,
    Option<bool>,
    Option<String>,
    Option<String>,
    Vec<String>,
);

fn extract_search_detail_diagnostics(
    steps: &[SourceValidationStepReport],
) -> SearchDetailDiagnostics {
    let Some(step) = steps.iter().find(|step| step.step == "search_detail") else {
        return (None, None, None, None, None, Vec::new());
    };

    let validated_url = step
        .summary
        .split("resolved=")
        .nth(1)
        .and_then(|value| value.split(" name=").next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    let resolved_name = step
        .summary
        .split(" name=")
        .nth(1)
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "search detail failed")
        .map(ToString::to_string);

    let mut warnings = step.warnings.clone();
    warnings.extend(step.errors.clone());
    (
        validated_url,
        resolved_name,
        Some(step.ok),
        step.failure_code.clone(),
        Some(step.summary.clone()),
        warnings,
    )
}

fn extract_text_signal(input: &str) -> String {
    if input.contains('<') && input.contains('>') {
        let doc = Html::parse_document(input);
        doc.root_element()
            .text()
            .map(|it| it.trim())
            .filter(|it| !it.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        input.to_string()
    }
}

fn compute_probe_signal_score(input: &str) -> f64 {
    let text = extract_text_signal(input);
    let char_count = text.chars().count() as f64;
    if char_count == 0.0 {
        return 0.0;
    }

    let paragraph_count = text
        .lines()
        .map(str::trim)
        .filter(|line| line.len() >= 12)
        .count() as f64;
    let ad_hits = [
        "最新网址",
        "最新章节",
        "广告",
        "扫码",
        "下载",
        "公众号",
        "请收藏",
        "手机阅读",
        "插图",
        "本章未完",
    ]
    .iter()
    .map(|needle| text.matches(needle).count() as f64)
    .sum::<f64>();
    let chapter_hits = ["第", "章", "节", "回", "卷"]
        .iter()
        .map(|needle| text.matches(needle).count() as f64)
        .sum::<f64>();

    let length_score = (char_count / 3500.0).clamp(0.0, 1.0);
    let paragraph_score = (paragraph_count / 18.0).clamp(0.0, 1.0);
    let chapter_signal = (chapter_hits / 18.0).clamp(0.0, 1.0);
    let ad_penalty = (ad_hits / 12.0).clamp(0.0, 0.7);

    (length_score * 0.4 + paragraph_score * 0.35 + chapter_signal * 0.25 - ad_penalty)
        .clamp(0.0, 1.0)
}

fn summarize_probe_candidate(label: &str, score: f64, input: &str) -> String {
    let text = extract_text_signal(input);
    let chars = text.chars().count();
    let paragraphs = text
        .lines()
        .map(str::trim)
        .filter(|line| line.len() >= 12)
        .count();
    format!("{label}: score={score:.3}, chars={chars}, paragraphs={paragraphs}")
}

fn choose_probe_preference(
    raw_html: &str,
    jina_body: Option<&str>,
    trafilatura_text: Option<&str>,
) -> ProbePreference {
    let raw_score = compute_probe_signal_score(raw_html);
    let jina_score = jina_body.map(compute_probe_signal_score);
    let trafilatura_score = trafilatura_text.map(compute_probe_signal_score);
    let ai_readability_gain = jina_score.map(|score| (score - raw_score).clamp(-1.0, 1.0));
    let trafilatura_readability_gain =
        trafilatura_score.map(|score| (score - raw_score).clamp(-1.0, 1.0));
    let mut recommended_content_extractor = "rule_dom".to_string();
    let mut preferred_input = "raw_html".to_string();

    if let Some(score) = jina_score {
        if score >= raw_score + 0.08 {
            preferred_input = "jina_readable".to_string();
            recommended_content_extractor = "jina_reader".to_string();
        }
    }
    if let Some(score) = trafilatura_score {
        let current_score = match preferred_input.as_str() {
            "jina_readable" => jina_score.unwrap_or(raw_score),
            _ => raw_score,
        };
        if score >= current_score + 0.05 {
            preferred_input = "trafilatura_text".to_string();
            recommended_content_extractor = "trafilatura".to_string();
        }
    }

    let mut content_candidate_summaries =
        vec![summarize_probe_candidate("rule_dom", raw_score, raw_html)];
    if let Some(body) = jina_body {
        content_candidate_summaries.push(summarize_probe_candidate(
            "jina_reader",
            jina_score.unwrap_or(0.0),
            body,
        ));
    }
    if let Some(text) = trafilatura_text {
        content_candidate_summaries.push(summarize_probe_candidate(
            "trafilatura",
            trafilatura_score.unwrap_or(0.0),
            text,
        ));
    }

    ProbePreference {
        preferred_input,
        raw_score,
        jina_score,
        trafilatura_score,
        ai_readability_gain,
        trafilatura_readability_gain,
        recommended_content_extractor,
        content_candidate_summaries,
    }
}

async fn run_builder_sample_fetch(
    label: &str,
    parsed: &ParsedCurl,
    fetch_profile: &SourceFetchProfile,
    state: &SourceBuilderState,
) -> Result<CurlReplay, String> {
    let replay = if fetch_profile.provider.eq_ignore_ascii_case("jina_reader") {
        replay_curl_request(parsed).await
    } else {
        execute_fetch(parsed, Some(fetch_profile), state, 900).await
    }
    .map_err(|message| format!("{label} replay failed: {message}"))?;

    if !(200..300).contains(&replay.status) {
        return Err(format!("{label} replay returned HTTP {}", replay.status));
    }

    Ok(replay)
}

pub async fn build_source_package_from_samples(
    State(state): State<SourceBuilderState>,
    Json(req): Json<SourceBuildFromSamplesRequest>,
) -> Json<ApiResponse<SourceBuildFromSamplesResponse>> {
    let parsed_book = match parse_curl_command(&req.book_curl) {
        Ok(value) => value,
        Err(message) => return api_error(format!("invalid bookCurl: {message}")),
    };
    let parsed_chapter = match parse_curl_command(&req.chapter_curl) {
        Ok(value) => value,
        Err(message) => return api_error(format!("invalid chapterCurl: {message}")),
    };

    let book_url = match validate_url(&parsed_book.url) {
        Ok(url) => url,
        Err(error) => return api_error(format!("invalid bookCurl URL: {error}")),
    };
    let chapter_url = match validate_url(&parsed_chapter.url) {
        Ok(url) => url,
        Err(error) => return api_error(format!("invalid chapterCurl URL: {error}")),
    };

    if book_url.host_str() != chapter_url.host_str() {
        return api_error("bookCurl and chapterCurl must target the same host");
    }

    let fetch_profile = build_fetch_profile(&req);
    let session = match fetch_profile.session_key.as_deref() {
        Some(session_key) => match load_fetch_session(&state, session_key).await {
            Ok(session) => Some(session),
            Err(message) => return api_error(format!("fetch session invalid: {message}")),
        },
        None => None,
    };
    let parsed_book = session
        .as_ref()
        .map(|session| apply_session_to_parsed(&parsed_book, session))
        .unwrap_or(parsed_book);
    let parsed_chapter = session
        .as_ref()
        .map(|session| apply_session_to_parsed(&parsed_chapter, session))
        .unwrap_or(parsed_chapter);
    let parsed_search = req
        .search_curl
        .as_ref()
        .map(|raw| parse_curl_command(raw))
        .transpose()
        .map_err(|message| api_error(format!("invalid searchCurl: {message}")));
    let parsed_search = match parsed_search {
        Ok(value) => value,
        Err(response) => return response,
    };
    let parsed_search = parsed_search.map(|parsed| {
        session
            .as_ref()
            .map(|session| apply_session_to_parsed(&parsed, session))
            .unwrap_or(parsed)
    });
    let parsed_site_entry = req
        .site_entry_curl
        .as_ref()
        .map(|raw| parse_curl_command(raw))
        .transpose()
        .map_err(|message| api_error(format!("invalid siteEntryCurl: {message}")));
    let parsed_site_entry = match parsed_site_entry {
        Ok(value) => value,
        Err(response) => return response,
    };
    let parsed_site_entry = parsed_site_entry.map(|parsed| {
        session
            .as_ref()
            .map(|session| apply_session_to_parsed(&parsed, session))
            .unwrap_or(parsed)
    });

    let book_replay =
        match run_builder_sample_fetch("bookCurl", &parsed_book, &fetch_profile, &state).await {
            Ok(value) => value,
            Err(message) => return api_error(message),
        };
    let chapter_replay = match run_builder_sample_fetch(
        "chapterCurl",
        &parsed_chapter,
        &fetch_profile,
        &state,
    )
    .await
    {
        Ok(value) => value,
        Err(message) => return api_error(message),
    };

    let _jina_book_replay = if fetch_profile.provider.eq_ignore_ascii_case("jina_reader") {
        fetch_via_jina_reader(&parsed_book, Some(&fetch_profile))
            .await
            .ok()
    } else {
        None
    };
    let jina_chapter_replay = if fetch_profile.provider.eq_ignore_ascii_case("jina_reader") {
        fetch_via_jina_reader(&parsed_chapter, Some(&fetch_profile))
            .await
            .ok()
    } else {
        None
    };
    let search_sample = if let Some(parsed_search) = parsed_search.as_ref() {
        let search_replay =
            match run_builder_sample_fetch("searchCurl", parsed_search, &fetch_profile, &state)
                .await
            {
                Ok(value) => value,
                Err(message) => return api_error(message),
            };
        Some(SearchSample {
            request_url: search_replay.request_url,
            final_url: search_replay.final_url,
            method: parsed_search.method.clone(),
            body_template: parsed_search.body.clone(),
            status: search_replay.status,
            html: search_replay.body,
        })
    } else {
        None
    };
    let final_book_url = Url::parse(&book_replay.final_url).unwrap_or(book_url);
    let final_chapter_url = Url::parse(&chapter_replay.final_url).unwrap_or(chapter_url);
    let trafilatura_chapter_extract = extract_via_trafilatura(
        &chapter_replay.body,
        Some(final_chapter_url.as_str()),
        Some(&fetch_profile),
    )
    .await
    .ok();
    let site_entry_probe = if let Some(parsed_site_entry) = parsed_site_entry.as_ref() {
        let site_entry_replay = match run_builder_sample_fetch(
            "siteEntryCurl",
            parsed_site_entry,
            &fetch_profile,
            &state,
        )
        .await
        {
            Ok(value) => value,
            Err(message) => return api_error(message),
        };
        let site_entry_final_url =
            Url::parse(&site_entry_replay.final_url).unwrap_or_else(|_| final_book_url.clone());
        let inferred = infer_search_entry_from_html(&site_entry_replay.body, &site_entry_final_url);
        Some((site_entry_replay, inferred))
    } else {
        None
    };
    let site_entry_probe_ref = site_entry_probe
        .as_ref()
        .and_then(|(_, inferred)| inferred.as_ref());
    let (mut package, diagnostics) = build_source_from_samples(
        &req,
        &final_book_url,
        &book_replay.body,
        &final_chapter_url,
        &chapter_replay.body,
        search_sample.as_ref(),
        site_entry_probe_ref,
    );

    append_request_replay_metadata(&mut package.metadata, "book", &book_replay);
    append_request_replay_metadata(&mut package.metadata, "chapter", &chapter_replay);
    if let Some(keyword) = req.search_keyword.as_ref() {
        insert_metadata_value(&mut package.metadata, "sample.searchKeyword", keyword.clone());
    }
    package.fetch_profile = Some(fetch_profile.clone());
    if let Some(hints) = merge_hints(req.structured_hints.clone(), req.free_text_hints.as_deref()) {
        let applied = apply_hints_to_package(&mut package, &hints);
        if !applied.is_empty() {
            insert_metadata_value(
                &mut package.metadata,
                "builder.appliedHints",
                applied.join(" | "),
            );
        }
    }
    if fetch_profile.provider.eq_ignore_ascii_case("jina_reader") {
        insert_metadata_value(&mut package.metadata, "builder.fetchProvider", "jina_reader");
        insert_metadata_value(
            &mut package.metadata,
            "builder.fetchRespondWith",
            preferred_jina_respond_with(Some(&fetch_profile)),
        );
    }
    append_search_sample_metadata(&mut package.metadata, search_sample.as_ref());
    append_site_entry_metadata(&mut package.metadata, site_entry_probe.as_ref());

    let samples = ValidationSamples {
        search_query: req.search_keyword.clone(),
        book_url: Some(final_book_url.as_str().to_string()),
        toc_url: Some(final_book_url.as_str().to_string()),
        chapter_url: Some(final_chapter_url.as_str().to_string()),
    };
    package.validation = run_validation(&state, &package, Some(samples)).await;
    let same_site_validation = validate_same_site_generalization(
        &state,
        &package,
        &final_book_url,
        &book_replay.body,
        &final_chapter_url,
    )
    .await;
    insert_metadata_value(
        &mut package.metadata,
        "probe.sameSiteCandidateCount",
        same_site_validation.candidate_count.to_string(),
    );
    if let Some(url) = same_site_validation.validated_url.as_ref() {
        insert_metadata_value(&mut package.metadata, "probe.sameSiteValidatedUrl", url.clone());
    }
    if same_site_validation.score > 0.0 {
        insert_metadata_value(
            &mut package.metadata,
            "probe.sameSiteValidationScore",
            format!("{:.3}", same_site_validation.score),
        );
    }
    let probe_preference = choose_probe_preference(
        &chapter_replay.body,
        jina_chapter_replay
            .as_ref()
            .map(|replay| replay.body.as_str()),
        trafilatura_chapter_extract
            .as_ref()
            .map(|extract| extract.text.as_str())
            .filter(|text| !text.trim().is_empty()),
    );
    append_probe_preference_metadata(
        &mut package.metadata,
        &probe_preference,
        trafilatura_chapter_extract.as_ref(),
    );

    let package_json = if req.emit_package_json {
        serde_json::to_string_pretty(&package).ok()
    } else {
        None
    };
    let diagnostics = build_final_diagnostics(
        diagnostics,
        &package,
        &book_replay,
        &chapter_replay,
        &same_site_validation,
        probe_preference,
    );

    Json(ApiResponse::success(SourceBuildFromSamplesResponse {
        package,
        package_json,
        diagnostics,
    }))
}
