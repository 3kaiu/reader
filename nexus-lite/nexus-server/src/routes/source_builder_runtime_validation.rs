use super::*;

pub(super) struct ValidationPhaseResult {
    pub(super) steps: Vec<SourceValidationStepReport>,
    pub(super) passed_steps: usize,
    pub(super) warnings: Vec<String>,
    pub(super) errors: Vec<String>,
    pub(super) valid: bool,
}

impl ValidationPhaseResult {
    fn new() -> Self {
        Self {
            steps: Vec::new(),
            passed_steps: 0,
            warnings: Vec::new(),
            errors: Vec::new(),
            valid: true,
        }
    }
}

pub(super) async fn validate_search_phase(
    engine: &NxsEngine,
    package: &SourceRulePackage,
    query: Option<String>,
    sample_book_url_for_search: Option<String>,
) -> ValidationPhaseResult {
    let mut result = ValidationPhaseResult::new();
    let Some(query) = query else {
        return result;
    };

    match engine.search(&query).await.map_err(|e| e.to_string()) {
        Ok(items) => {
            let mut step = make_step("search", !items.is_empty(), format!("{} items", items.len()));
            step.item_count = Some(items.len());
            if items.is_empty() {
                step.failure_code = Some("empty_result".to_string());
                step.warnings
                    .push("sample search returned empty".to_string());
                step.suggested_actions = suggested_actions_for("empty_result", "search");
                result
                    .warnings
                    .push("sample search returned empty".to_string());
            } else {
                result.passed_steps += 1;
            }
            result.steps.push(step);

            if items.is_empty() {
                return result;
            }

            let resolved_book_url =
                select_search_result_for_validation(&items, sample_book_url_for_search.as_deref());
            match resolved_book_url {
                Some(resolved_book_url) => {
                    match engine
                        .book_info(&resolved_book_url)
                        .await
                        .map_err(|e| e.to_string())
                    {
                        Ok(info) => {
                            let ok = !info.name.trim().is_empty();
                            let mut step = make_step(
                                "search_detail",
                                ok,
                                format!("resolved={} name={}", resolved_book_url, info.name),
                            );
                            if !ok {
                                let code = classify_search_detail_failure(
                                    &resolved_book_url,
                                    sample_book_url_for_search.as_deref(),
                                    None,
                                );
                                step.failure_code = Some(code.clone());
                                step.warnings.push(
                                    "search result resolved to a page but book_info name is empty"
                                        .to_string(),
                                );
                                step.suggested_actions =
                                    suggested_actions_for(&code, "search_detail");
                                result.warnings.push(
                                    "search result detail validation returned empty name"
                                        .to_string(),
                                );
                            } else {
                                result.passed_steps += 1;
                            }
                            result.steps.push(step);
                        },
                        Err(error) => {
                            let mut step =
                                make_step("search_detail", false, "search detail failed");
                            let code = classify_search_detail_failure(
                                &resolved_book_url,
                                sample_book_url_for_search.as_deref(),
                                Some(&error),
                            );
                            step.failure_code = Some(code.clone());
                            step.errors.push(error.clone());
                            step.suggested_actions = suggested_actions_for(&code, "search_detail");
                            result
                                .errors
                                .push(format!("search result detail validation failed: {error}"));
                            result.valid = false;
                            result.steps.push(step);
                        },
                    }
                },
                None => {
                    let mut step = make_step("search_detail", false, "no search result candidate");
                    step.failure_code = Some("detail_mismatch".to_string());
                    step.warnings.push(
                        "search returned items but none could be selected for detail validation"
                            .to_string(),
                    );
                    step.suggested_actions =
                        suggested_actions_for("detail_mismatch", "search_detail");
                    result.valid = false;
                    result.steps.push(step);
                },
            }
        },
        Err(error) => {
            let mut step = make_step("search", false, "search failed");
            let code = classify_fetch_error(&error).to_string();
            step.failure_code = Some(code.clone());
            step.errors.push(error.clone());
            step.suggested_actions = suggested_actions_for(&code, "search");
            result.errors.push(format!("sample search failed: {error}"));
            result.valid = false;
            result.steps.push(step);
        },
    }

    let native_search_enabled =
        has_enabled_search_strategy(package, SourceSearchMode::NativeSearch, None);
    if !native_search_enabled {
        return ValidationPhaseResult::new();
    }

    result
}

pub(super) async fn validate_book_phase(
    engine: &NxsEngine,
    book_url: Option<String>,
) -> ValidationPhaseResult {
    let mut result = ValidationPhaseResult::new();
    let Some(book_url) = book_url else {
        return result;
    };

    match engine.book_info(&book_url).await.map_err(|e| e.to_string()) {
        Ok(info) => {
            let ok = !info.name.trim().is_empty();
            let mut step = make_step("book", ok, format!("book info name={}", info.name));
            if !ok {
                step.failure_code = Some("empty_result".to_string());
                step.suggested_actions = suggested_actions_for("empty_result", "book");
                result
                    .warnings
                    .push("book_info returned empty name".to_string());
            } else {
                result.passed_steps += 1;
            }
            result.steps.push(step);
        },
        Err(error) => {
            let mut step = make_step("book", false, "book info failed");
            let code = classify_fetch_error(&error).to_string();
            step.failure_code = Some(code.clone());
            step.errors.push(error.clone());
            step.suggested_actions = suggested_actions_for(&code, "book");
            result
                .errors
                .push(format!("book info validation failed: {error}"));
            result.valid = false;
            result.steps.push(step);
        },
    }

    result
}

pub(super) async fn validate_toc_phase(
    engine: &NxsEngine,
    toc_url: Option<String>,
) -> ValidationPhaseResult {
    let mut result = ValidationPhaseResult::new();
    let Some(toc_url) = toc_url else {
        return result;
    };

    match engine.chapters(&toc_url).await.map_err(|e| e.to_string()) {
        Ok(chapters) => {
            let ok = !chapters.is_empty();
            let mut step = make_step("toc", ok, format!("{} chapters", chapters.len()));
            step.item_count = Some(chapters.len());
            if !ok {
                step.failure_code = Some("empty_result".to_string());
                step.suggested_actions = suggested_actions_for("empty_result", "toc");
                result.warnings.push("chapters returned empty".to_string());
            } else {
                result.passed_steps += 1;
            }
            result.steps.push(step);
        },
        Err(error) => {
            let mut step = make_step("toc", false, "chapters failed");
            let code = classify_fetch_error(&error).to_string();
            step.failure_code = Some(code.clone());
            step.errors.push(error.clone());
            step.suggested_actions = suggested_actions_for(&code, "toc");
            result
                .errors
                .push(format!("chapters validation failed: {error}"));
            result.valid = false;
            result.steps.push(step);
        },
    }

    result
}

pub(super) async fn validate_content_phase(
    engine: &NxsEngine,
    chapter_url: Option<String>,
) -> ValidationPhaseResult {
    let mut result = ValidationPhaseResult::new();
    let Some(chapter_url) = chapter_url else {
        return result;
    };

    match engine
        .content(&chapter_url, &[] as &[ReplaceRule])
        .await
        .map_err(|e| e.to_string())
    {
        Ok(content) => {
            let quality = evaluate_content_quality(&content);
            let ok = quality.score >= 0.4;
            let manual_review = quality.score < 0.55;
            let mut step = make_step(
                "content",
                ok,
                format!("len={} score={:.3}", content.chars().count(), quality.score),
            );
            step.quality_score = Some(quality.score);
            step.manual_review_recommended = manual_review;
            if !ok {
                step.failure_code = Some("low_quality".to_string());
                step.suggested_actions = suggested_actions_for("low_quality", "content");
                result
                    .warnings
                    .push("content quality is below threshold".to_string());
                result.valid = false;
            } else {
                result.passed_steps += 1;
                if manual_review {
                    step.failure_code = Some("manual_review".to_string());
                    step.suggested_actions = suggested_actions_for("manual_review", "content");
                }
            }
            result.steps.push(step);
        },
        Err(error) => {
            let mut step = make_step("content", false, "content failed");
            let code = classify_fetch_error(&error).to_string();
            step.failure_code = Some(code.clone());
            step.errors.push(error.clone());
            step.suggested_actions = suggested_actions_for(&code, "content");
            result
                .errors
                .push(format!("content validation failed: {error}"));
            result.valid = false;
            result.steps.push(step);
        },
    }

    result
}
