use super::*;

pub(super) fn merge_hints(
    base: Option<SourceRuleHints>,
    free_text: Option<&str>,
) -> Option<SourceRuleHints> {
    let mut merged = base.unwrap_or_default();
    if let Some(input) = free_text {
        let parsed = extract_free_text_hints(input);
        if merged.search_entry.is_none() {
            merged.search_entry = parsed.search_entry;
        }
        if merged.search_result_selector.is_none() {
            merged.search_result_selector = parsed.search_result_selector;
        }
        if merged.book_title_selector.is_none() {
            merged.book_title_selector = parsed.book_title_selector;
        }
        if merged.author_selector.is_none() {
            merged.author_selector = parsed.author_selector;
        }
        if merged.intro_selector.is_none() {
            merged.intro_selector = parsed.intro_selector;
        }
        if merged.toc_item_selector.is_none() {
            merged.toc_item_selector = parsed.toc_item_selector;
        }
        if merged.content_selector.is_none() {
            merged.content_selector = parsed.content_selector;
        }
        if merged.content_title_selector.is_none() {
            merged.content_title_selector = parsed.content_title_selector;
        }
        if merged.pagination_selector.is_none() {
            merged.pagination_selector = parsed.pagination_selector;
        }
        if merged.noise_patterns.is_empty() {
            merged.noise_patterns = parsed.noise_patterns;
        }
    }

    let has_data = merged.search_entry.is_some()
        || merged.search_result_selector.is_some()
        || merged.book_title_selector.is_some()
        || merged.author_selector.is_some()
        || merged.intro_selector.is_some()
        || merged.toc_item_selector.is_some()
        || merged.content_selector.is_some()
        || merged.content_title_selector.is_some()
        || merged.pagination_selector.is_some()
        || !merged.noise_patterns.is_empty();
    if has_data {
        Some(merged)
    } else {
        None
    }
}

pub(super) fn apply_hints_to_package(
    package: &mut SourceRulePackage,
    hints: &SourceRuleHints,
) -> Vec<String> {
    let mut applied = Vec::new();
    if let Some(value) = hints.search_entry.as_ref() {
        package.source.search.path = value.clone();
        applied.push(format!("search.path={value}"));
    }
    if let Some(value) = hints.search_result_selector.as_ref() {
        package.source.search.list = value.clone();
        applied.push(format!("search.list={value}"));
    }
    if let Some(value) = hints.book_title_selector.as_ref() {
        package.source.book.name = value.clone();
        applied.push(format!("book.name={value}"));
    }
    if let Some(value) = hints.author_selector.as_ref() {
        package.source.book.author = Some(value.clone());
        package.source.search.item.author = Some(value.clone());
        applied.push(format!("author={value}"));
    }
    if let Some(value) = hints.intro_selector.as_ref() {
        package.source.book.intro = Some(value.clone());
        package.source.search.item.intro = Some(value.clone());
        applied.push(format!("intro={value}"));
    }
    if let Some(value) = hints.toc_item_selector.as_ref() {
        package.source.toc.list = value.clone();
        applied.push(format!("toc.list={value}"));
    }
    if let Some(value) = hints.content_selector.as_ref() {
        package.source.content.body = value.clone();
        applied.push(format!("content.body={value}"));
    }
    if let Some(value) = hints.content_title_selector.as_ref() {
        if !package.source.content.filter.iter().any(|it| it == value) {
            package.source.content.filter.push(value.clone());
        }
        applied.push(format!("content.titleHint={value}"));
    }
    if let Some(value) = hints.pagination_selector.as_ref() {
        package.source.content.pagination = Some(nexus_core::nxs::PaginationConfig {
            next_selector: value.clone(),
            max_pages: 10,
            delay_ms: 500,
            separator: "\n\n".to_string(),
            stop_text: None,
        });
        applied.push(format!("content.pagination.next={value}"));
    }
    for pattern in &hints.noise_patterns {
        if !package
            .source
            .content
            .replace
            .iter()
            .any(|it| it.pattern == *pattern)
        {
            package.source.content.replace.push(ReplaceRule {
                id: Uuid::new_v4().to_string(),
                name: format!("hint-remove-{pattern}"),
                pattern: pattern.clone(),
                replacement: Some(String::new()),
                scope: None,
                is_enabled: true,
                is_regex: true,
            });
            applied.push(format!("content.replace+={pattern}"));
        }
    }
    applied
}

fn append_selector_fallback(existing: &str, fallbacks: &[&str]) -> Option<String> {
    let mut parts = existing
        .split('|')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    let original_len = parts.len();
    for fallback in fallbacks {
        if !parts.iter().any(|item| item == fallback) {
            parts.push((*fallback).to_string());
        }
    }
    if parts.len() == original_len {
        None
    } else {
        Some(parts.join(" | "))
    }
}

fn apply_failure_code_refinements(package: &mut SourceRulePackage) -> Vec<String> {
    let mut applied = Vec::new();
    let steps = package.validation.steps.clone();
    for step in steps {
        match (step.step.as_str(), step.failure_code.as_deref()) {
            ("search", Some("empty_result")) => {
                if let Some(updated) = append_selector_fallback(
                    &package.source.search.list,
                    SEARCH_RESULT_SELECTOR_FALLBACKS,
                ) {
                    package.source.search.list = updated.clone();
                    applied.push(format!("auto:search.list={updated}"));
                }
            },
            ("search", Some("fetch_failed")) | ("search", Some("fetch_timeout")) => {
                if let Some(fetch) = package.fetch_profile.as_mut() {
                    if fetch.mode.eq_ignore_ascii_case("replay") {
                        fetch.note = Some(
                            "auto-refine: consider switching this package to external provider"
                                .to_string(),
                        );
                        applied.push("auto:fetch.note=consider external provider".to_string());
                    }
                }
            },
            ("book_info", Some("selector_miss")) => {
                if let Some(updated) = append_selector_fallback(
                    &package.source.book.name,
                    BOOK_TITLE_SELECTOR_FALLBACKS,
                ) {
                    package.source.book.name = updated.clone();
                    applied.push(format!("auto:book.name={updated}"));
                }
                let author_existing = package.source.book.author.clone().unwrap_or_default();
                if let Some(updated) =
                    append_selector_fallback(&author_existing, AUTHOR_SELECTOR_FALLBACKS)
                {
                    package.source.book.author = Some(updated.clone());
                    package.source.search.item.author = Some(updated.clone());
                    applied.push(format!("auto:book.author={updated}"));
                }
            },
            ("chapters", Some("empty_result")) => {
                if let Some(updated) =
                    append_selector_fallback(&package.source.toc.list, TOC_SELECTOR_FALLBACKS)
                {
                    package.source.toc.list = updated.clone();
                    applied.push(format!("auto:toc.list={updated}"));
                }
            },
            ("content", Some("low_quality")) | ("content", Some("manual_review")) => {
                if let Some(updated) = append_selector_fallback(
                    &package.source.content.body,
                    CONTENT_SELECTOR_FALLBACKS,
                ) {
                    package.source.content.body = updated.clone();
                    applied.push(format!("auto:content.body={updated}"));
                }
                package.source.content.visible_only = true;
                applied.push("auto:content.visibleOnly=true".to_string());
                for selector in COMMON_CONTENT_FILTERS {
                    if !package
                        .source
                        .content
                        .filter
                        .iter()
                        .any(|it| it == selector)
                    {
                        package.source.content.filter.push((*selector).to_string());
                        applied.push(format!("auto:content.filter+={selector}"));
                    }
                }
            },
            _ => {},
        }
    }
    applied
}

fn push_change(
    changes: &mut Vec<SourceRuleChange>,
    path: &str,
    before: Option<String>,
    after: Option<String>,
) {
    if before != after {
        changes.push(SourceRuleChange {
            path: path.to_string(),
            before,
            after,
        });
    }
}

fn compute_refine_changes(
    before: &SourceRulePackage,
    after: &SourceRulePackage,
) -> Vec<SourceRuleChange> {
    let mut changes = Vec::new();
    push_change(
        &mut changes,
        "source.search.path",
        Some(before.source.search.path.clone()),
        Some(after.source.search.path.clone()),
    );
    push_change(
        &mut changes,
        "source.search.list",
        Some(before.source.search.list.clone()),
        Some(after.source.search.list.clone()),
    );
    push_change(
        &mut changes,
        "source.book.name",
        Some(before.source.book.name.clone()),
        Some(after.source.book.name.clone()),
    );
    push_change(
        &mut changes,
        "source.book.author",
        before.source.book.author.clone(),
        after.source.book.author.clone(),
    );
    push_change(
        &mut changes,
        "source.book.intro",
        before.source.book.intro.clone(),
        after.source.book.intro.clone(),
    );
    push_change(
        &mut changes,
        "source.toc.list",
        Some(before.source.toc.list.clone()),
        Some(after.source.toc.list.clone()),
    );
    push_change(
        &mut changes,
        "source.content.body",
        Some(before.source.content.body.clone()),
        Some(after.source.content.body.clone()),
    );
    push_change(
        &mut changes,
        "source.content.visibleOnly",
        Some(before.source.content.visible_only.to_string()),
        Some(after.source.content.visible_only.to_string()),
    );
    push_change(
        &mut changes,
        "source.content.filter",
        Some(before.source.content.filter.join(" | ")),
        Some(after.source.content.filter.join(" | ")),
    );
    push_change(
        &mut changes,
        "source.content.replace",
        Some(
            before
                .source
                .content
                .replace
                .iter()
                .map(|item| item.pattern.clone())
                .collect::<Vec<_>>()
                .join(" | "),
        ),
        Some(
            after
                .source
                .content
                .replace
                .iter()
                .map(|item| item.pattern.clone())
                .collect::<Vec<_>>()
                .join(" | "),
        ),
    );
    push_change(
        &mut changes,
        "source.content.pagination.nextSelector",
        before
            .source
            .content
            .pagination
            .as_ref()
            .map(|it| it.next_selector.clone()),
        after
            .source
            .content
            .pagination
            .as_ref()
            .map(|it| it.next_selector.clone()),
    );
    push_change(
        &mut changes,
        "fetchProfile.mode",
        before.fetch_profile.as_ref().map(|it| it.mode.clone()),
        after.fetch_profile.as_ref().map(|it| it.mode.clone()),
    );
    push_change(
        &mut changes,
        "fetchProfile.provider",
        before.fetch_profile.as_ref().map(|it| it.provider.clone()),
        after.fetch_profile.as_ref().map(|it| it.provider.clone()),
    );
    push_change(
        &mut changes,
        "fetchProfile.note",
        before.fetch_profile.as_ref().and_then(|it| it.note.clone()),
        after.fetch_profile.as_ref().and_then(|it| it.note.clone()),
    );
    changes
}

fn validation_samples_from_presets(samples: SourceDebugPresetInputs) -> ValidationSamples {
    ValidationSamples {
        search_query: samples.search_query,
        book_url: samples.book_url,
        toc_url: samples.toc_url,
        chapter_url: samples.chapter_url,
    }
}

pub async fn refine_source_package(
    State(state): State<SourceBuilderState>,
    Json(req): Json<SourceRuleRefineRequest>,
) -> Json<ApiResponse<SourceRuleRefineResponse>> {
    let original_package = req.package;
    let mut package = original_package.clone();
    let merged_hints = merge_hints(req.structured_hints, req.free_text_hints.as_deref());
    let auto_applied_actions = apply_failure_code_refinements(&mut package);
    let mut applied_hints = Vec::new();
    if let Some(hints) = merged_hints {
        applied_hints = apply_hints_to_package(&mut package, &hints);
    }
    if auto_applied_actions.is_empty() && applied_hints.is_empty() {
        return api_error("no applicable refine actions were recognized");
    }

    package.generated_at_ms = now_ms();
    package.generator = "source-builder-refine-skill".to_string();
    package.validation =
        run_validation(&state, &package, req.samples.map(validation_samples_from_presets)).await;
    package.refresh_readiness();
    if !auto_applied_actions.is_empty() {
        package
            .metadata
            .insert("builder.lastAutoRefineActions".to_string(), auto_applied_actions.join(" | "));
    }
    package
        .metadata
        .insert("builder.lastRefineHints".to_string(), applied_hints.join(" | "));

    let package_json = if req.emit_package_json {
        serde_json::to_string_pretty(&package).ok()
    } else {
        None
    };
    let changes = compute_refine_changes(&original_package, &package);

    Json(ApiResponse::success(SourceRuleRefineResponse {
        package,
        package_json,
        auto_applied_actions,
        applied_hints,
        changes,
    }))
}
