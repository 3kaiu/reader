use axum::{
    extract::{Path, State},
    Json,
};
use nexus_core::{
    FetchHtmlRequest, FetchHtmlResponse, FetchSessionImportRequest, FetchSessionImportResponse,
    FetchSessionProfile, RawHtmlCacheEntry, SourceFetchDebugInfo, SourceFetchProfile,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

use super::{api_error, cache_key_for_url, now_ms};
use crate::api_response::ApiResponse;
use crate::source_builder_state::SourceBuilderState;

#[derive(Debug, Clone)]
pub(crate) struct ParsedCurl {
    pub(crate) method: String,
    pub(crate) url: String,
    pub(crate) headers: HashMap<String, String>,
    pub(crate) cookies: HashMap<String, String>,
    pub(crate) body: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct CurlReplay {
    pub(crate) request_url: String,
    pub(crate) final_url: String,
    pub(crate) status: u16,
    pub(crate) body: String,
    pub(crate) request_headers: HashMap<String, String>,
    pub(crate) request_cookies: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalFetchRequest {
    url: String,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    headers: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
    timeout: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    proxy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    engine: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalFetchResponse {
    status: u16,
    html: String,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalExtractRequest {
    html: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    favor_precision: bool,
    favor_recall: bool,
    include_comments: bool,
    include_tables: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalExtractResponse {
    #[serde(default)]
    pub(crate) text: String,
    #[serde(default)]
    pub(crate) title: Option<String>,
    #[serde(default)]
    pub(crate) excerpt: Option<String>,
    #[serde(default)]
    pub(crate) char_count: usize,
    #[serde(default)]
    pub(crate) paragraph_count: usize,
    #[serde(default)]
    pub(crate) warnings: Vec<String>,
}

pub(crate) fn source_builder_http_client() -> Result<&'static reqwest::Client, String> {
    static SOURCE_BUILDER_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(existing) = SOURCE_BUILDER_HTTP_CLIENT.get() {
        return Ok(existing);
    }
    let built = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;
    let _ = SOURCE_BUILDER_HTTP_CLIENT.set(built);
    SOURCE_BUILDER_HTTP_CLIENT
        .get()
        .ok_or_else(|| "source-builder HTTP client must be initialized".to_string())
}

fn normalize_curl_command(raw: &str) -> String {
    raw.replace("\\\n", " ")
        .replace("\\\r\n", " ")
        .trim()
        .to_string()
}

fn parse_cookie_header(value: &str) -> HashMap<String, String> {
    value
        .split(';')
        .filter_map(|part| {
            let trimmed = part.trim();
            let (name, val) = trimmed.split_once('=')?;
            Some((name.trim().to_ascii_lowercase(), val.trim().to_string()))
        })
        .collect()
}

pub(crate) fn parse_curl_command(raw: &str) -> Result<ParsedCurl, String> {
    let normalized = normalize_curl_command(raw);
    let tokens =
        shell_words::split(&normalized).map_err(|e| format!("invalid curl syntax: {e}"))?;
    if tokens.is_empty() || tokens[0] != "curl" {
        return Err("curl command must start with curl".to_string());
    }

    let mut method = "GET".to_string();
    let mut url: Option<String> = None;
    let mut headers = HashMap::new();
    let mut cookies = HashMap::new();
    let mut body: Option<String> = None;

    let mut idx = 1usize;
    while idx < tokens.len() {
        match tokens[idx].as_str() {
            "-X" | "--request" => {
                idx += 1;
                let value = tokens
                    .get(idx)
                    .ok_or_else(|| "curl missing request method".to_string())?;
                method = value.to_string();
            },
            "-H" | "--header" => {
                idx += 1;
                let value = tokens
                    .get(idx)
                    .ok_or_else(|| "curl missing header value".to_string())?;
                if let Some((name, header_value)) = value.split_once(':') {
                    headers
                        .insert(name.trim().to_ascii_lowercase(), header_value.trim().to_string());
                }
            },
            "-b" | "--cookie" => {
                idx += 1;
                let value = tokens
                    .get(idx)
                    .ok_or_else(|| "curl missing cookie value".to_string())?;
                cookies.extend(parse_cookie_header(value));
            },
            "--data" | "--data-raw" | "--data-binary" | "--data-urlencode" | "-d" => {
                idx += 1;
                let value = tokens
                    .get(idx)
                    .ok_or_else(|| "curl missing request body".to_string())?;
                body = Some(value.to_string());
                if method.eq_ignore_ascii_case("GET") {
                    method = "POST".to_string();
                }
            },
            token if token.starts_with("http://") || token.starts_with("https://") => {
                url = Some(token.to_string());
            },
            _ => {},
        }
        idx += 1;
    }

    let url = url.ok_or_else(|| "curl must contain an absolute URL".to_string())?;
    Ok(ParsedCurl {
        method,
        url,
        headers,
        cookies,
        body,
    })
}

pub(crate) async fn fetch_seed_html(seed_url: &str) -> Result<String, String> {
    let client = source_builder_http_client()?;
    let resp = client
        .get(seed_url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (compatible; source-builder/1.0; +https://nexuslite.local)",
        )
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // Many targets are behind anti-bot (e.g. Cloudflare challenge) and return 403/503
    // for non-browser clients. If so, fall back to Jina Reader which often succeeds.
    if !resp.status().is_success() {
        // Prefer HTML response for probing selectors.
        let replay = client
            .get(build_jina_reader_url(seed_url))
            .header("x-respond-with", "html")
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if replay.status().is_success() {
            let body = replay.text().await.map_err(|e| e.to_string())?;
            if !body.trim().is_empty() {
                return Ok(body);
            }
        }
    }

    resp.text().await.map_err(|e| e.to_string())
}

fn build_jina_reader_url(target_url: &str) -> String {
    format!("https://r.jina.ai/{target_url}")
}

pub(crate) fn preferred_jina_respond_with(profile: Option<&SourceFetchProfile>) -> String {
    profile
        .and_then(|it| it.engine.clone())
        .filter(|it| !it.trim().is_empty())
        .unwrap_or_else(|| "markdown".to_string())
}

pub(crate) async fn replay_curl_request(parsed: &ParsedCurl) -> Result<CurlReplay, String> {
    let client = source_builder_http_client()?;
    let method =
        reqwest::Method::from_bytes(parsed.method.as_bytes()).map_err(|e| e.to_string())?;
    let mut request = client.request(method, &parsed.url);
    for (name, value) in &parsed.headers {
        request = request.header(name, value);
    }
    if !parsed.cookies.is_empty() {
        let cookie_header = parsed
            .cookies
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; ");
        request = request.header(reqwest::header::COOKIE, cookie_header);
    }
    if let Some(body) = &parsed.body {
        request = request.body(body.clone());
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(CurlReplay {
        request_url: parsed.url.clone(),
        final_url,
        status,
        body,
        request_headers: parsed.headers.clone(),
        request_cookies: parsed.cookies.clone(),
    })
}

pub(crate) async fn load_fetch_session(
    state: &SourceBuilderState,
    session_key: &str,
) -> Result<FetchSessionProfile, String> {
    let Some(mut session) = state
        .store
        .get_fetch_session(session_key.to_string())
        .await
        .map_err(|e| e.to_string())?
    else {
        return Err(format!("fetch session not found: {session_key}"));
    };
    let now = now_ms();
    if session.expires_at_ms <= now {
        return Err(format!("fetch session expired: {session_key}"));
    }
    session.hit_count = session.hit_count.saturating_add(1);
    let _ = state.store.save_fetch_session(session.clone()).await;
    Ok(session)
}

pub(crate) fn apply_session_to_parsed(
    parsed: &ParsedCurl,
    session: &FetchSessionProfile,
) -> ParsedCurl {
    let mut merged = parsed.clone();
    for (key, value) in &session.headers {
        merged
            .headers
            .entry(key.clone())
            .or_insert_with(|| value.clone());
    }
    for (key, value) in &session.cookies {
        merged
            .cookies
            .entry(key.clone())
            .or_insert_with(|| value.clone());
    }
    if let Some(user_agent) = session.user_agent.as_ref() {
        merged
            .headers
            .entry("user-agent".to_string())
            .or_insert_with(|| user_agent.clone());
    }
    if let Some(referer) = session.referer.as_ref() {
        merged
            .headers
            .entry("referer".to_string())
            .or_insert_with(|| referer.clone());
    }
    merged
}

pub(crate) fn resolve_external_service_url(profile: Option<&SourceFetchProfile>) -> Option<String> {
    profile
        .and_then(|it| it.service_url.clone())
        .or_else(|| std::env::var("NEXUS_EXTERNAL_FETCH_URL").ok())
        .or_else(|| std::env::var("CF_BYPASS_URL").ok())
}

pub(crate) fn resolve_external_service_api_key() -> Option<String> {
    std::env::var("NEXUS_EXTERNAL_FETCH_API_KEY")
        .ok()
        .or_else(|| std::env::var("CF_API_KEY").ok())
}

async fn fetch_via_external_service(
    parsed: &ParsedCurl,
    profile: &SourceFetchProfile,
) -> Result<CurlReplay, String> {
    let Some(service_url) = resolve_external_service_url(Some(profile)) else {
        return Err("external fetch provider requires fetchServiceUrl or NEXUS_EXTERNAL_FETCH_URL"
            .to_string());
    };
    let client = source_builder_http_client()?;
    let mut headers = parsed.headers.clone();
    if !parsed.cookies.is_empty() && !headers.contains_key("cookie") && !headers.contains_key("Cookie")
    {
        let cookie_header = parsed
            .cookies
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; ");
        headers.insert("cookie".to_string(), cookie_header);
    }

    let payload = ExternalFetchRequest {
        url: parsed.url.clone(),
        method: parsed.method.clone(),
        headers: if headers.is_empty() { None } else { Some(headers) },
        body: parsed.body.clone(),
        timeout: 30,
        proxy: None,
        engine: profile.engine.clone(),
    };
    let mut request = client
        .post(format!("{}/fetch", service_url.trim_end_matches('/')))
        .json(&payload);
    if let Some(api_key) = resolve_external_service_api_key() {
        request = request.header("X-API-Key", api_key);
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    let body: ExternalFetchResponse = response.json().await.map_err(|e| e.to_string())?;
    if let Some(error) = body.error {
        return Err(error);
    }

    Ok(CurlReplay {
        request_url: parsed.url.clone(),
        final_url: parsed.url.clone(),
        status: body.status,
        body: body.html,
        request_headers: parsed.headers.clone(),
        request_cookies: parsed.cookies.clone(),
    })
}

pub(crate) async fn extract_via_trafilatura(
    html: &str,
    url: Option<&str>,
    profile: Option<&SourceFetchProfile>,
) -> Result<ExternalExtractResponse, String> {
    let Some(service_url) = resolve_external_service_url(profile) else {
        return Err("trafilatura extraction requires fetchServiceUrl or NEXUS_EXTERNAL_FETCH_URL"
            .to_string());
    };
    let client = source_builder_http_client()?;
    let payload = ExternalExtractRequest {
        html: html.to_string(),
        url: url.map(|value| value.to_string()),
        favor_precision: true,
        favor_recall: false,
        include_comments: false,
        include_tables: false,
    };
    let mut request = client
        .post(format!("{}/extract", service_url.trim_end_matches('/')))
        .json(&payload);
    if let Some(api_key) = resolve_external_service_api_key() {
        request = request.header("X-API-Key", api_key);
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    response.json().await.map_err(|e| e.to_string())
}

pub(crate) async fn fetch_via_jina_reader(
    parsed: &ParsedCurl,
    profile: Option<&SourceFetchProfile>,
) -> Result<CurlReplay, String> {
    let client = source_builder_http_client()?;
    let respond_with = preferred_jina_respond_with(profile);
    let mut request = if parsed.url.contains('#') {
        client
            .post("https://r.jina.ai/")
            .header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(format!(
                "url={}",
                url::form_urlencoded::byte_serialize(parsed.url.as_bytes()).collect::<String>()
            ))
    } else {
        client.get(build_jina_reader_url(&parsed.url))
    };

    request = request.header("x-respond-with", respond_with.clone());

    if !parsed.cookies.is_empty() {
        let cookie_header = parsed
            .cookies
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; ");
        request = request.header("x-set-cookie", cookie_header);
    }

    if let Some(referer) = parsed.headers.get("referer") {
        request = request.header("x-referer", referer);
    }
    if let Some(user_agent) = parsed.headers.get("user-agent") {
        request = request.header(reqwest::header::USER_AGENT, user_agent);
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(CurlReplay {
        request_url: parsed.url.clone(),
        final_url,
        status,
        body,
        request_headers: parsed.headers.clone(),
        request_cookies: parsed.cookies.clone(),
    })
}

pub(crate) async fn execute_fetch(
    parsed: &ParsedCurl,
    fetch_profile: Option<&SourceFetchProfile>,
    state: &SourceBuilderState,
    cache_ttl_seconds: u64,
) -> Result<CurlReplay, String> {
    let session_key = fetch_profile.and_then(|profile| profile.session_key.as_deref());
    let cache_key = cache_key_for_url(session_key, &parsed.method, &parsed.url);
    if let Some(entry) = state
        .store
        .get_raw_html_cache(cache_key.clone())
        .await
        .map_err(|e| e.to_string())?
    {
        if entry.expires_at_ms > now_ms() {
            return Ok(CurlReplay {
                request_url: parsed.url.clone(),
                final_url: entry.final_url,
                status: entry.status,
                body: entry.html,
                request_headers: parsed.headers.clone(),
                request_cookies: parsed.cookies.clone(),
            });
        }
    }
    if let Some(profile) = fetch_profile {
        if profile.provider.eq_ignore_ascii_case("jina_reader") {
            let replay = fetch_via_jina_reader(parsed, Some(profile)).await?;
            let _ = state
                .store
                .save_raw_html_cache(RawHtmlCacheEntry {
                    cache_key,
                    url: parsed.url.clone(),
                    status: replay.status,
                    final_url: replay.final_url.clone(),
                    html: replay.body.clone(),
                    cached_at_ms: now_ms(),
                    expires_at_ms: now_ms() + (cache_ttl_seconds as i64 * 1000),
                })
                .await;
            return Ok(replay);
        }
        if profile.mode.eq_ignore_ascii_case("external")
            || profile.provider.eq_ignore_ascii_case("external_service")
        {
            let replay = fetch_via_external_service(parsed, profile).await?;
            let _ = state
                .store
                .save_raw_html_cache(RawHtmlCacheEntry {
                    cache_key,
                    url: parsed.url.clone(),
                    status: replay.status,
                    final_url: replay.final_url.clone(),
                    html: replay.body.clone(),
                    cached_at_ms: now_ms(),
                    expires_at_ms: now_ms() + (cache_ttl_seconds as i64 * 1000),
                })
                .await;
            return Ok(replay);
        }
    }
    let replay = replay_curl_request(parsed).await?;
    let _ = state
        .store
        .save_raw_html_cache(RawHtmlCacheEntry {
            cache_key,
            url: parsed.url.clone(),
            status: replay.status,
            final_url: replay.final_url.clone(),
            html: replay.body.clone(),
            cached_at_ms: now_ms(),
            expires_at_ms: now_ms() + (cache_ttl_seconds as i64 * 1000),
        })
        .await;
    Ok(replay)
}

pub async fn import_fetch_session(
    State(state): State<SourceBuilderState>,
    Json(req): Json<FetchSessionImportRequest>,
) -> Json<ApiResponse<FetchSessionImportResponse>> {
    let session = FetchSessionProfile {
        session_key: req.session_key,
        label: req.label,
        cookies: req.cookies,
        headers: req.headers,
        user_agent: req.user_agent,
        referer: req.referer,
        created_at_ms: now_ms(),
        expires_at_ms: now_ms() + (req.ttl_seconds as i64 * 1000),
        hit_count: 0,
    };
    if let Err(error) = state.store.save_fetch_session(session.clone()).await {
        return api_error(format!("save fetch session failed: {error}"));
    }

    Json(ApiResponse::success(FetchSessionImportResponse {
        session,
        imported: true,
    }))
}

pub async fn get_fetch_session(
    State(state): State<SourceBuilderState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<FetchSessionProfile>> {
    match state.store.get_fetch_session(id).await {
        Ok(Some(session)) => Json(ApiResponse::success(session)),
        Ok(None) => Json(ApiResponse::error("fetch session not found")),
        Err(error) => api_error(format!("get fetch session failed: {error}")),
    }
}

pub async fn fetch_html_with_session(
    State(state): State<SourceBuilderState>,
    Json(req): Json<FetchHtmlRequest>,
) -> Json<ApiResponse<FetchHtmlResponse>> {
    let parsed = ParsedCurl {
        method: req.method,
        url: req.url,
        headers: req.headers,
        cookies: HashMap::new(),
        body: req.body,
    };
    let session = match req.session_key.as_deref() {
        Some(session_key) => match load_fetch_session(&state, session_key).await {
            Ok(session) => Some(session),
            Err(message) => return api_error(format!("fetch session invalid: {message}")),
        },
        None => None,
    };
    let parsed = session
        .as_ref()
        .map(|session| apply_session_to_parsed(&parsed, session))
        .unwrap_or(parsed);
    let fetch_profile = SourceFetchProfile {
        mode: req.fetch_mode.clone().unwrap_or_else(|| {
            if req.session_key.is_some() {
                "human_session".to_string()
            } else {
                "replay".to_string()
            }
        }),
        provider: req.fetch_provider.clone().unwrap_or_else(|| {
            if req.session_key.is_some() {
                "session_replay".to_string()
            } else {
                "curl_replay".to_string()
            }
        }),
        service_url: req.fetch_service_url.clone(),
        engine: req.fetch_engine.clone(),
        session_key: req.session_key.clone(),
        note: Some(if req.fetch_provider.as_deref() == Some("jina_reader") {
            "jina reader preview fetch".to_string()
        } else if req.session_key.is_some() {
            "human-assisted session fetch".to_string()
        } else {
            "debug preview fetch".to_string()
        }),
    };
    let cache_key = cache_key_for_url(req.session_key.as_deref(), &parsed.method, &parsed.url);
    let cached = if req.force_refresh {
        None
    } else {
        state
            .store
            .get_raw_html_cache(cache_key.clone())
            .await
            .ok()
            .flatten()
            .filter(|entry| entry.expires_at_ms > now_ms())
    };
    if let Some(entry) = cached {
        let ttl_remaining_ms = (entry.expires_at_ms - now_ms()).max(0);
        return Json(ApiResponse::success(FetchHtmlResponse {
            status: entry.status,
            final_url: entry.final_url.clone(),
            html: entry.html,
            cache_hit: true,
            cache_source: "raw_html_cache".to_string(),
            cached_at_ms: Some(entry.cached_at_ms),
            expires_at_ms: Some(entry.expires_at_ms),
            ttl_remaining_ms: Some(ttl_remaining_ms),
            session_state: "active".to_string(),
            fetch_debug: SourceFetchDebugInfo {
                service_url: fetch_profile.service_url.clone(),
                engine: fetch_profile.engine.clone(),
                request_url: Some(parsed.url),
                final_url: Some(entry.final_url),
                http_status: Some(entry.status),
                session_key: req.session_key,
                cache_hit: true,
                session_state: Some("active".to_string()),
                jina_used: fetch_profile.provider.eq_ignore_ascii_case("jina_reader"),
                respond_with: fetch_profile.engine.clone(),
                ..SourceFetchDebugInfo::new(
                    fetch_profile.mode.clone(),
                    fetch_profile.provider.clone(),
                )
            },
        }));
    }
    let replay =
        match execute_fetch(&parsed, Some(&fetch_profile), &state, req.cache_ttl_seconds).await {
            Ok(replay) => replay,
            Err(message) => return api_error(format!("fetch html failed: {message}")),
        };
    Json(ApiResponse::success(FetchHtmlResponse {
        status: replay.status,
        final_url: replay.final_url.clone(),
        html: replay.body,
        cache_hit: false,
        cache_source: "network".to_string(),
        cached_at_ms: None,
        expires_at_ms: None,
        ttl_remaining_ms: None,
        session_state: if session.is_some() {
            "active".to_string()
        } else {
            "none".to_string()
        },
        fetch_debug: SourceFetchDebugInfo {
            service_url: fetch_profile.service_url.clone(),
            engine: fetch_profile.engine.clone(),
            request_url: Some(replay.request_url),
            final_url: Some(replay.final_url),
            http_status: Some(replay.status),
            session_key: req.session_key,
            cache_hit: false,
            session_state: Some(if session.is_some() {
                "active".to_string()
            } else {
                "none".to_string()
            }),
            jina_used: fetch_profile.provider.eq_ignore_ascii_case("jina_reader"),
            respond_with: fetch_profile.engine.clone(),
            ..SourceFetchDebugInfo::new(fetch_profile.mode.clone(), fetch_profile.provider.clone())
        },
    }))
}
