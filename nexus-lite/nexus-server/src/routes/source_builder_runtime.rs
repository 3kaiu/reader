use super::*;

fn build_temp_chain(
    fetch_profile: Option<&SourceFetchProfile>,
) -> Result<Arc<FallbackChain>, String> {
    let direct = DirectHttpStrategy::new(30).map_err(|e| e.to_string())?;
    if let Some(profile) = fetch_profile {
        if profile.mode.eq_ignore_ascii_case("external")
            || profile.provider.eq_ignore_ascii_case("external_service")
        {
            let mut config = CloudflareBypassConfig::default();
            if let Some(service_url) = resolve_external_service_url(Some(profile)) {
                config.service_url = service_url;
            }
            config.api_key = resolve_external_service_api_key();
            config.enabled = true;
            let external = CfBypassStrategy::new(config).map_err(|e| e.to_string())?;
            return Ok(Arc::new(FallbackChain::with_fallbacks(
                Arc::new(external),
                vec![Arc::new(direct)],
            )));
        }
    }
    Ok(Arc::new(FallbackChain::new(Arc::new(direct))))
}

fn inject_session_into_source(
    mut source: NxsSource,
    session: Option<&FetchSessionProfile>,
) -> NxsSource {
    let Some(session) = session else {
        return source;
    };
    let headers = source.headers.get_or_insert_with(HashMap::new);
    for (key, value) in &session.headers {
        headers.entry(key.clone()).or_insert_with(|| value.clone());
    }
    if let Some(user_agent) = session.user_agent.as_ref() {
        headers
            .entry("user-agent".to_string())
            .or_insert_with(|| user_agent.clone());
    }
    if let Some(referer) = session.referer.as_ref() {
        headers
            .entry("referer".to_string())
            .or_insert_with(|| referer.clone());
    }
    if !session.cookies.is_empty() {
        let cookie_header = session
            .cookies
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; ");
        headers.entry("cookie".to_string()).or_insert(cookie_header);
    }
    source
}

fn build_temp_engine(
    source: NxsSource,
    session: Option<&FetchSessionProfile>,
    fetch_profile: Option<&SourceFetchProfile>,
) -> Result<NxsEngine, String> {
    let chain = build_temp_chain(fetch_profile)?;
    NxsEngine::new(inject_session_into_source(source, session), chain).map_err(|e| e.to_string())
}

pub(super) async fn validate_same_site_generalization(
    state: &SourceBuilderState,
    package: &SourceRulePackage,
    book_url: &Url,
    book_html: &str,
    chapter_url: &Url,
) -> SameSiteValidationInsights {
    let candidates = extract_same_site_chapter_candidates(
        book_url,
        book_html,
        &package.source.toc.list,
        chapter_url,
        5,
    );
    if candidates.is_empty() {
        return SameSiteValidationInsights {
            score: 0.0,
            candidate_count: 0,
            validated_url: None,
            warnings: vec!["目录样本中未提取到可复用的同站章节链接".to_string()],
        };
    }

    let session = match package
        .fetch_profile
        .as_ref()
        .and_then(|profile| profile.session_key.as_deref())
    {
        Some(session_key) => load_fetch_session(state, session_key).await.ok(),
        None => None,
    };
    let engine = match build_temp_engine(
        package.source.clone(),
        session.as_ref(),
        package.fetch_profile.as_ref(),
    ) {
        Ok(engine) => engine,
        Err(error) => {
            return SameSiteValidationInsights {
                score: 0.0,
                candidate_count: candidates.len(),
                validated_url: None,
                warnings: vec![format!("同站泛化验证无法初始化引擎: {error}")],
            };
        },
    };

    let mut warnings = Vec::new();
    for candidate in &candidates {
        match engine
            .content(candidate.as_str(), &[] as &[ReplaceRule])
            .await
            .map_err(|e| e.to_string())
        {
            Ok(content) => {
                let quality = evaluate_content_quality(&content);
                let length_score = (content.chars().count().min(2500) as f64) / 2500.0;
                let score = (quality.score * 0.75 + length_score * 0.25).clamp(0.0, 1.0);
                if quality.score < 0.45 {
                    warnings.push(format!(
                        "同站章节验证质量偏低: {} score={:.3}",
                        candidate, quality.score
                    ));
                }
                return SameSiteValidationInsights {
                    score,
                    candidate_count: candidates.len(),
                    validated_url: Some(candidate.to_string()),
                    warnings,
                };
            },
            Err(error) => {
                warnings.push(format!("同站章节验证失败: {} ({})", candidate, error));
            },
        }
    }

    SameSiteValidationInsights {
        score: 0.0,
        candidate_count: candidates.len(),
        validated_url: None,
        warnings,
    }
}

fn resolve_and_validate_target_url(
    operation: &str,
    target_url: Option<String>,
) -> Result<String, String> {
    let url = target_url
        .filter(|it| !it.trim().is_empty())
        .ok_or_else(|| format!("{operation} requires targetUrl"))?;
    validate_url(&url)
        .map(|_| url)
        .map_err(|e| format!("invalid targetUrl: {e}"))
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
enum EngineOperation {
    Search,
    BookInfo,
    Chapters,
    Content,
}

impl EngineOperation {
    fn parse(input: &str) -> Option<Self> {
        let op = input.trim();
        if op.eq_ignore_ascii_case("search") {
            Some(Self::Search)
        } else if op.eq_ignore_ascii_case("book_info") {
            Some(Self::BookInfo)
        } else if op.eq_ignore_ascii_case("chapters") {
            Some(Self::Chapters)
        } else if op.eq_ignore_ascii_case("content") {
            Some(Self::Content)
        } else {
            None
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Search => "search",
            Self::BookInfo => "book_info",
            Self::Chapters => "chapters",
            Self::Content => "content",
        }
    }
}

fn parse_operation(operation: &str) -> Result<EngineOperation, String> {
    EngineOperation::parse(operation)
        .ok_or_else(|| "operation must be one of: search, book_info, chapters, content".to_string())
}

async fn execute_operation(
    engine: &NxsEngine,
    operation: EngineOperation,
    query: Option<String>,
    target_url: Option<String>,
) -> Result<serde_json::Value, String> {
    match operation {
        EngineOperation::Search => {
            let query = query
                .filter(|q| !q.trim().is_empty())
                .ok_or_else(|| "search requires query".to_string())?;
            let items = engine.search(&query).await.map_err(|e| e.to_string())?;
            serde_json::to_value(items).map_err(|e| format!("serialize result failed: {e}"))
        },
        EngineOperation::BookInfo => {
            let url = resolve_and_validate_target_url("book_info", target_url)?;
            let info: BookInfo = engine.book_info(&url).await.map_err(|e| e.to_string())?;
            serde_json::to_value(info).map_err(|e| format!("serialize result failed: {e}"))
        },
        EngineOperation::Chapters => {
            let url = resolve_and_validate_target_url("chapters", target_url)?;
            let chapters: Vec<Chapter> = engine.chapters(&url).await.map_err(|e| e.to_string())?;
            serde_json::to_value(chapters).map_err(|e| format!("serialize result failed: {e}"))
        },
        EngineOperation::Content => {
            let url = resolve_and_validate_target_url("content", target_url)?;
            let content = engine
                .content(&url, &[] as &[ReplaceRule])
                .await
                .map_err(|e| e.to_string())?;
            serde_json::to_value(content).map_err(|e| format!("serialize result failed: {e}"))
        },
    }
}

pub(super) async fn run_validation(
    state: &SourceBuilderState,
    package: &SourceRulePackage,
    req_samples: Option<ValidationSamples>,
) -> SourceRuleValidationReport {
    let mut report = validate_package_shape(package);
    let validated_at_ms = now_ms();
    let session = match package
        .fetch_profile
        .as_ref()
        .and_then(|profile| profile.session_key.as_deref())
    {
        Some(session_key) => match load_fetch_session(state, session_key).await {
            Ok(session) => Some(session),
            Err(error) => {
                report.errors.push(error);
                report.valid = false;
                report.importable = false;
                report.health = compute_health_report(report.steps.clone(), validated_at_ms);
                report.last_validated_at_ms = Some(validated_at_ms);
                return report;
            },
        },
        None => None,
    };
    let engine = match build_temp_engine(
        package.source.clone(),
        session.as_ref(),
        package.fetch_profile.as_ref(),
    ) {
        Ok(engine) => {
            report.compile_ok = true;
            engine
        },
        Err(e) => {
            report.errors.push(format!("engine compile failed: {e}"));
            report.valid = false;
            report.importable = false;
            report.health = compute_health_report(report.steps.clone(), validated_at_ms);
            report.last_validated_at_ms = Some(validated_at_ms);
            return report;
        },
    };

    let samples = package_default_samples(package, req_samples);
    let mut step_results = Vec::new();
    let mut passed_steps = 0usize;
    let native_search_enabled =
        has_enabled_search_strategy(package, SourceSearchMode::NativeSearch, None);

    if let Some(samples) = samples {
        let sample_book_url_for_search = samples.book_url.clone();
        if native_search_enabled {
            if let Some(query) = samples.search_query {
                match engine.search(&query).await.map_err(|e| e.to_string()) {
                    Ok(items) => {
                        let mut step = make_step(
                            "search",
                            !items.is_empty(),
                            format!("{} items", items.len()),
                        );
                        step.item_count = Some(items.len());
                        if items.is_empty() {
                            step.failure_code = Some("empty_result".to_string());
                            step.warnings
                                .push("sample search returned empty".to_string());
                            step.suggested_actions =
                                suggested_actions_for("empty_result", "search");
                            report
                                .warnings
                                .push("sample search returned empty".to_string());
                        }
                        if step.ok {
                            passed_steps += 1;
                        }
                        step_results.push(step);

                        if !items.is_empty() {
                            let resolved_book_url = select_search_result_for_validation(
                                &items,
                                sample_book_url_for_search.as_deref(),
                            );
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
                                                format!(
                                                    "resolved={} name={}",
                                                    resolved_book_url, info.name
                                                ),
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
                                                report.warnings.push(
                                                    "search result detail validation returned empty name"
                                                        .to_string(),
                                                );
                                            } else {
                                                passed_steps += 1;
                                            }
                                            step_results.push(step);
                                        },
                                        Err(error) => {
                                            let mut step = make_step(
                                                "search_detail",
                                                false,
                                                "search detail failed",
                                            );
                                            let code = classify_search_detail_failure(
                                                &resolved_book_url,
                                                sample_book_url_for_search.as_deref(),
                                                Some(&error),
                                            );
                                            step.failure_code = Some(code.clone());
                                            step.errors.push(error.clone());
                                            step.suggested_actions =
                                                suggested_actions_for(&code, "search_detail");
                                            report.errors.push(format!(
                                                "search result detail validation failed: {error}"
                                            ));
                                            report.valid = false;
                                            step_results.push(step);
                                        },
                                    }
                                },
                                None => {
                                    let mut step = make_step(
                                        "search_detail",
                                        false,
                                        "no search result candidate",
                                    );
                                    step.failure_code = Some("detail_mismatch".to_string());
                                    step.warnings.push(
                                        "search returned items but none could be selected for detail validation"
                                            .to_string(),
                                    );
                                    step.suggested_actions =
                                        suggested_actions_for("detail_mismatch", "search_detail");
                                    report.valid = false;
                                    step_results.push(step);
                                },
                            }
                        }
                    },
                    Err(error) => {
                        let mut step = make_step("search", false, "search failed");
                        let code = classify_fetch_error(&error).to_string();
                        step.failure_code = Some(code.clone());
                        step.errors.push(error.clone());
                        step.suggested_actions = suggested_actions_for(&code, "search");
                        report.errors.push(format!("sample search failed: {error}"));
                        report.valid = false;
                        step_results.push(step);
                    },
                }
            }
        }

        if let Some(book_url) = samples.book_url {
            match engine.book_info(&book_url).await.map_err(|e| e.to_string()) {
                Ok(info) => {
                    let ok = !info.name.trim().is_empty();
                    let mut step = make_step("book", ok, format!("book info name={}", info.name));
                    if !ok {
                        step.failure_code = Some("empty_result".to_string());
                        step.suggested_actions = suggested_actions_for("empty_result", "book");
                        report
                            .warnings
                            .push("book_info returned empty name".to_string());
                    } else {
                        passed_steps += 1;
                    }
                    step_results.push(step);
                },
                Err(error) => {
                    let mut step = make_step("book", false, "book info failed");
                    let code = classify_fetch_error(&error).to_string();
                    step.failure_code = Some(code.clone());
                    step.errors.push(error.clone());
                    step.suggested_actions = suggested_actions_for(&code, "book");
                    report
                        .errors
                        .push(format!("book info validation failed: {error}"));
                    report.valid = false;
                    step_results.push(step);
                },
            }
        }

        if let Some(toc_url) = samples.toc_url {
            match engine.chapters(&toc_url).await.map_err(|e| e.to_string()) {
                Ok(chapters) => {
                    let ok = !chapters.is_empty();
                    let mut step = make_step("toc", ok, format!("{} chapters", chapters.len()));
                    step.item_count = Some(chapters.len());
                    if !ok {
                        step.failure_code = Some("empty_result".to_string());
                        step.suggested_actions = suggested_actions_for("empty_result", "toc");
                        report.warnings.push("chapters returned empty".to_string());
                    } else {
                        passed_steps += 1;
                    }
                    step_results.push(step);
                },
                Err(error) => {
                    let mut step = make_step("toc", false, "chapters failed");
                    let code = classify_fetch_error(&error).to_string();
                    step.failure_code = Some(code.clone());
                    step.errors.push(error.clone());
                    step.suggested_actions = suggested_actions_for(&code, "toc");
                    report
                        .errors
                        .push(format!("chapters validation failed: {error}"));
                    report.valid = false;
                    step_results.push(step);
                },
            }
        }

        if let Some(chapter_url) = samples.chapter_url {
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
                        report
                            .warnings
                            .push("content quality is below threshold".to_string());
                        report.valid = false;
                    } else {
                        passed_steps += 1;
                        if manual_review {
                            step.failure_code = Some("manual_review".to_string());
                            step.suggested_actions =
                                suggested_actions_for("manual_review", "content");
                        }
                    }
                    step_results.push(step);
                },
                Err(error) => {
                    let mut step = make_step("content", false, "content failed");
                    let code = classify_fetch_error(&error).to_string();
                    step.failure_code = Some(code.clone());
                    step.errors.push(error.clone());
                    step.suggested_actions = suggested_actions_for(&code, "content");
                    report
                        .errors
                        .push(format!("content validation failed: {error}"));
                    report.valid = false;
                    step_results.push(step);
                },
            }
        }
    }

    if step_results.is_empty() {
        report
            .warnings
            .push("no validation samples supplied; import remains blocked".to_string());
    }

    report.steps = step_results;
    let base_score = if report.errors.is_empty() { 0.55 } else { 0.2 };
    let step_score = if report.steps.is_empty() {
        0.0
    } else {
        passed_steps as f64 / report.steps.len() as f64
    };
    report.score = (base_score + step_score) / 2.0;
    report.importable = report.valid
        && report.compile_ok
        && !report.steps.is_empty()
        && report.steps.iter().all(|step| step.ok);
    report.health = compute_health_report(report.steps.clone(), validated_at_ms);
    report.last_validated_at_ms = Some(validated_at_ms);
    append_jina_guidance(&mut report, package);
    report
}

pub async fn validate_source_package(
    State(state): State<SourceBuilderState>,
    Json(req): Json<ValidatePackageRequest>,
) -> Json<ApiResponse<ValidatePackageResponse>> {
    let report = run_validation(&state, &req.package, req.samples).await;

    Json(ApiResponse::success(ValidatePackageResponse {
        package_id: req.package.package_id,
        report,
        fetch_debug: req
            .package
            .fetch_profile
            .as_ref()
            .map(|profile| SourceFetchDebugInfo {
                mode: profile.mode.clone(),
                provider: profile.provider.clone(),
                service_url: profile.service_url.clone(),
                engine: profile.engine.clone(),
                request_url: req.package.metadata.get("request.book.url").cloned(),
                final_url: req
                    .package
                    .samples
                    .as_ref()
                    .and_then(|samples| samples.book_sample_url.clone()),
                http_status: req
                    .package
                    .metadata
                    .get("request.book.status")
                    .and_then(|value| value.parse::<u16>().ok()),
                session_key: profile.session_key.clone(),
                cache_hit: false,
                session_state: profile.session_key.as_ref().map(|_| "active".to_string()),
                jina_used: profile.provider.eq_ignore_ascii_case("jina_reader"),
                respond_with: profile.engine.clone(),
            }),
    }))
}

pub async fn run_engine_by_package(
    State(state): State<SourceBuilderState>,
    Json(req): Json<EngineRunByPackageRequest>,
) -> Json<ApiResponse<EngineRunByPackageResponse>> {
    let session = match req
        .package
        .fetch_profile
        .as_ref()
        .and_then(|profile| profile.session_key.as_deref())
    {
        Some(session_key) => match load_fetch_session(&state, session_key).await {
            Ok(session) => Some(session),
            Err(message) => return api_error(format!("fetch session invalid: {message}")),
        },
        None => None,
    };
    let engine = match build_temp_engine(
        req.package.source.clone(),
        session.as_ref(),
        req.package.fetch_profile.as_ref(),
    ) {
        Ok(it) => it,
        Err(e) => return api_error(format!("invalid source package: {e}")),
    };

    let operation = match parse_operation(&req.operation) {
        Ok(op) => op,
        Err(message) => return api_error(message),
    };

    let debug_query = req.query.clone();
    let debug_target_url = req.target_url.clone();
    let result = match execute_operation(&engine, operation, req.query, req.target_url).await {
        Ok(result) => result,
        Err(message) => return api_error(message),
    };
    let step = match operation {
        EngineOperation::Search => {
            let count = result.as_array().map(|items| items.len());
            let ok = count.unwrap_or(0) > 0;
            Some(SourceValidationStepReport {
                step: "search".to_string(),
                ok,
                summary: format!("{} items", count.unwrap_or(0)),
                failure_code: if ok {
                    None
                } else {
                    Some("empty_result".to_string())
                },
                warnings: Vec::new(),
                errors: Vec::new(),
                item_count: count,
                quality_score: None,
                suggested_actions: if ok {
                    Vec::new()
                } else {
                    suggested_actions_for("empty_result", "search")
                },
                manual_review_recommended: false,
            })
        },
        EngineOperation::BookInfo => Some(make_step("book_info", true, "book_info executed")),
        EngineOperation::Chapters => {
            let count = result.as_array().map(|items| items.len());
            let ok = count.unwrap_or(0) > 0;
            Some(SourceValidationStepReport {
                step: "chapters".to_string(),
                ok,
                summary: format!("{} chapters", count.unwrap_or(0)),
                failure_code: if ok {
                    None
                } else {
                    Some("empty_result".to_string())
                },
                warnings: Vec::new(),
                errors: Vec::new(),
                item_count: count,
                quality_score: None,
                suggested_actions: if ok {
                    Vec::new()
                } else {
                    suggested_actions_for("empty_result", "chapters")
                },
                manual_review_recommended: false,
            })
        },
        EngineOperation::Content => {
            let quality = result
                .get("meta")
                .and_then(|meta| meta.get("quality"))
                .and_then(|quality| quality.get("score"))
                .and_then(|score| score.as_f64());
            let ok = quality.unwrap_or(0.0) >= 0.4 || quality.is_none();
            let manual_review = quality.map(|score| score < 0.55).unwrap_or(false);
            Some(SourceValidationStepReport {
                step: "content".to_string(),
                ok,
                summary: "content executed".to_string(),
                failure_code: if ok {
                    if manual_review {
                        Some("manual_review".to_string())
                    } else {
                        None
                    }
                } else {
                    Some("low_quality".to_string())
                },
                warnings: Vec::new(),
                errors: Vec::new(),
                item_count: None,
                quality_score: quality,
                suggested_actions: if ok {
                    if manual_review {
                        suggested_actions_for("manual_review", "content")
                    } else {
                        Vec::new()
                    }
                } else {
                    suggested_actions_for("low_quality", "content")
                },
                manual_review_recommended: manual_review,
            })
        },
    };

    Json(ApiResponse::success(EngineRunByPackageResponse {
        package_id: req.package.package_id,
        operation: operation.as_str().to_string(),
        result,
        step,
        fetch_debug: req
            .package
            .fetch_profile
            .as_ref()
            .map(|profile| SourceFetchDebugInfo {
                mode: profile.mode.clone(),
                provider: profile.provider.clone(),
                service_url: profile.service_url.clone(),
                engine: profile.engine.clone(),
                request_url: debug_target_url.clone().or(debug_query.clone()),
                final_url: debug_target_url,
                http_status: None,
                session_key: profile.session_key.clone(),
                cache_hit: false,
                session_state: profile.session_key.as_ref().map(|_| "active".to_string()),
                jina_used: profile.provider.eq_ignore_ascii_case("jina_reader"),
                respond_with: profile.engine.clone(),
            }),
    }))
}
