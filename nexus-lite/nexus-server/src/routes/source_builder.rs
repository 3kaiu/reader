use axum::routing::post;
use axum::{extract::{Path, State}, Json, Router};
use nexus_core::types::Chapter;
use nexus_core::{
    BookInfo, CloudflareBypassConfig, NxsSource, ReplaceRule, SourceBuildDiagnostics, SourceBuildFromSamplesRequest,
    SourceBuildFromSamplesResponse, SourceBuildRequest, SourceBuildResponse, SourceBuildSamples,
    SourceCapabilityMatrix, SourceDebugPresetInputs, SourceDocumentation, SourceFetchDebugInfo,
    FetchHtmlRequest, FetchHtmlResponse, FetchSessionImportRequest, FetchSessionImportResponse,
    FetchSessionProfile, RawHtmlCacheEntry, SourceFetchProfile, SourceImportPolicy, SourceRuleHints, SourceRulePackage,
    SourceRuleChange, SourceRuleRefineRequest, SourceRuleRefineResponse,
    SourceRuleValidationReport, SourceSearchMode, SourceSearchProfile,
    SourceValidationStepReport, SearchPaginationRule, SearchStrategyRule,
};
use nexus_engine::anti_crawl::{CfBypassStrategy, DirectHttpStrategy, FallbackChain};
use nexus_engine::quality_gate::evaluate_content_quality;
use nexus_engine::NxsEngine;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use shell_words::split as shell_split;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::sync::OnceLock;
use std::time::Duration;
use url::Url;
use uuid::Uuid;

use crate::app::AppState;
use crate::routes::ApiResponse;
use crate::validation::validate_url;

const CONTENT_SELECTOR_CANDIDATES: &[&str] = &[
    "article",
    ".content",
    "#content",
    ".chapter-content",
    "#txtcontent",
    ".txtnav",
    ".yd_text2",
    ".Readarea",
    ".read-content-text",
    ".txt",
    ".read-content",
    ".content-body",
    ".chapter-body",
    ".article-content",
];
const BOOK_NAME_SELECTOR_CANDIDATES: &[&str] =
    &["h1", ".book-title", ".title", ".info h1", "meta[property='og:title']"];
const AUTHOR_SELECTOR_CANDIDATES: &[&str] =
    &[".author", ".book-author", ".info .author", "p.author", ".book-meta"];
const INTRO_SELECTOR_CANDIDATES: &[&str] =
    &[".intro", ".book-intro", "#intro", ".desc", ".book-summary"];
const TOC_SELECTOR_CANDIDATES: &[&str] = &[
    ".chapter-list a",
    "#list a",
    ".listmain a",
    ".catalog a",
    ".dirlist a",
    "#catalog a",
    "#chapterList a",
    ".chapters a",
    "a[href*='chapter']",
    "a[href*='/book/'][href*='/']",
];
const SEARCH_RESULT_SELECTOR_FALLBACKS: &[&str] = &[
    ".search-list > li",
    ".search-result a",
    ".result-list li",
    ".book-list li",
    ".bookbox",
    ".result-item",
    ".search-item",
    "li",
    "a[href]",
];
const TOC_SELECTOR_FALLBACKS: &[&str] = &[
    ".chapter-list a",
    "#list a",
    ".catalog a",
    "a[href]",
];
const CONTENT_SELECTOR_FALLBACKS: &[&str] = &[
    "#content",
    ".content",
    ".txtnav",
    ".read-content",
    "article",
];
const BOOK_TITLE_SELECTOR_FALLBACKS: &[&str] = &[
    "h1",
    ".book-title",
    ".title",
    "meta[property='og:title']",
];
const AUTHOR_SELECTOR_FALLBACKS: &[&str] = &[
    ".author",
    ".book-author",
    ".info .author",
];
const COMMON_CONTENT_FILTERS: &[&str] = &["script", "style", "ins", ".ads", ".advert", ".banner"];

#[derive(Debug, Clone)]
struct ProbeInsights {
    chapter_like_links: usize,
    best_toc_selector: String,
    best_toc_score: f64,
    best_content_selector: String,
    best_content_score: f64,
}

#[derive(Debug, Clone)]
struct SearchProbeInsights {
    list_selector: String,
    list_score: f64,
    result_count: usize,
    name_selector: String,
    url_selector: String,
    author_selector: Option<String>,
    intro_selector: Option<String>,
    result_filter: Option<String>,
    next_page_selector: Option<String>,
}

#[derive(Debug, Clone)]
struct SearchSample {
    request_url: String,
    final_url: String,
    method: String,
    body_template: Option<String>,
    status: u16,
    html: String,
}

#[derive(Debug, Clone)]
struct SameSiteValidationInsights {
    score: f64,
    candidate_count: usize,
    validated_url: Option<String>,
    warnings: Vec<String>,
}

struct ProbeDoc<'a> {
    doc: &'a Html,
    selectors: HashMap<String, Option<Selector>>,
    text_scores: HashMap<String, usize>,
    count_scores: HashMap<String, usize>,
}

#[derive(Debug, Clone)]
struct ParsedCurl {
    method: String,
    url: String,
    headers: HashMap<String, String>,
    cookies: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Debug, Clone)]
struct CurlReplay {
    request_url: String,
    final_url: String,
    status: u16,
    body: String,
    request_headers: HashMap<String, String>,
    request_cookies: HashMap<String, String>,
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

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/source-builder/build", post(build_source_package))
        .route(
            "/api/source-builder/build-from-samples",
            post(build_source_package_from_samples),
        )
        .route("/api/fetch/session/import", post(import_fetch_session))
        .route("/api/fetch/session/{id}", axum::routing::get(get_fetch_session))
        .route("/api/fetch/html", post(fetch_html_with_session))
        .route("/api/source-builder/validate", post(validate_source_package))
        .route("/api/source-builder/refine", post(refine_source_package))
        .route("/api/engine/run-by-package", post(run_engine_by_package))
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn normalize_source_id(host: &str) -> String {
    host.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

fn infer_source_name(host: &str) -> String {
    host.to_string()
}

fn derive_base_url(url: &Url) -> String {
    let scheme = url.scheme();
    let host = url.host_str().unwrap_or_default();
    let port = url.port().map(|p| format!(":{p}")).unwrap_or_default();
    format!("{scheme}://{host}{port}")
}

fn fingerprint_text(input: &str) -> String {
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn cache_key_for_url(session_key: Option<&str>, method: &str, url: &str) -> String {
    fingerprint_text(&format!("{}:{}:{}", session_key.unwrap_or(""), method, url))
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

fn parse_curl_command(raw: &str) -> Result<ParsedCurl, String> {
    let normalized = normalize_curl_command(raw);
    let tokens = shell_split(&normalized).map_err(|e| format!("invalid curl syntax: {e}"))?;
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
                let value = tokens.get(idx).ok_or_else(|| "curl missing request method".to_string())?;
                method = value.to_string();
            }
            "-H" | "--header" => {
                idx += 1;
                let value = tokens.get(idx).ok_or_else(|| "curl missing header value".to_string())?;
                if let Some((name, header_value)) = value.split_once(':') {
                    headers.insert(name.trim().to_ascii_lowercase(), header_value.trim().to_string());
                }
            }
            "-b" | "--cookie" => {
                idx += 1;
                let value = tokens.get(idx).ok_or_else(|| "curl missing cookie value".to_string())?;
                cookies.extend(parse_cookie_header(value));
            }
            "--data" | "--data-raw" | "--data-binary" | "--data-urlencode" | "-d" => {
                idx += 1;
                let value = tokens.get(idx).ok_or_else(|| "curl missing request body".to_string())?;
                body = Some(value.to_string());
                if method.eq_ignore_ascii_case("GET") {
                    method = "POST".to_string();
                }
            }
            token if token.starts_with("http://") || token.starts_with("https://") => {
                url = Some(token.to_string());
            }
            _ => {}
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

impl<'a> ProbeDoc<'a> {
    fn new(doc: &'a Html) -> Self {
        Self {
            doc,
            selectors: HashMap::new(),
            text_scores: HashMap::new(),
            count_scores: HashMap::new(),
        }
    }

    fn selector(&mut self, selector: &str) -> Option<&Selector> {
        let entry = self
            .selectors
            .entry(selector.to_string())
            .or_insert_with(|| Selector::parse(selector).ok());
        entry.as_ref()
    }

    fn selector_text_weight(&mut self, selector: &str) -> usize {
        if let Some(score) = self.text_scores.get(selector) {
            return *score;
        }
        let score = self
            .selector(selector)
            .cloned()
            .map(|sel| {
                self.doc
                    .select(&sel)
                    .take(5)
                    .map(|el| el.text().collect::<String>().trim().chars().count())
                    .sum()
            })
            .unwrap_or(0);
        self.text_scores.insert(selector.to_string(), score);
        score
    }

    fn selector_match_count(&mut self, selector: &str) -> usize {
        if let Some(score) = self.count_scores.get(selector) {
            return *score;
        }
        let score = self
            .selector(selector)
            .cloned()
            .map(|sel| self.doc.select(&sel).count())
            .unwrap_or(0);
        self.count_scores.insert(selector.to_string(), score);
        score
    }

    fn score(&mut self, selector: &str, prefer_count: bool) -> usize {
        if prefer_count {
            self.selector_match_count(selector)
        } else {
            self.selector_text_weight(selector)
        }
    }

    fn warm_scores(&mut self, candidates: &[&str], prefer_count: bool) {
        let mut seen = std::collections::HashSet::new();
        for candidate in candidates {
            if seen.insert(*candidate) {
                let _ = self.score(candidate, prefer_count);
            }
        }
    }

    fn likely_chapter_links(&mut self) -> usize {
        self.selector("a")
            .cloned()
            .map(|a_sel| {
                self.doc
                    .select(&a_sel)
                    .filter(|a| {
                        let t = a.text().collect::<String>();
                        t.contains('章')
                            || t.contains('节')
                            || t.to_ascii_lowercase().contains("chapter")
                    })
                    .count()
            })
            .unwrap_or(0)
    }
}

fn choose_best_selector(probe: &mut ProbeDoc<'_>, candidates: &[&str], prefer_count: bool) -> String {
    let mut best = "";
    let mut best_score = 0usize;
    for candidate in candidates {
        let score = probe.score(candidate, prefer_count);
        if score > best_score {
            best = candidate;
            best_score = score;
        }
    }
    if best.is_empty() {
        candidates.first().copied().unwrap_or("body")
    } else {
        best
    }
    .to_string()
}

fn count_pattern_hits(text: &str, patterns: &[&str]) -> usize {
    let lower = text.to_ascii_lowercase();
    patterns
        .iter()
        .filter(|pattern| lower.contains(&pattern.to_ascii_lowercase()))
        .count()
}

fn score_content_selector(probe: &mut ProbeDoc<'_>, selector: &str) -> f64 {
    let Some(sel) = probe.selector(selector).cloned() else {
        return 0.0;
    };

    let mut best = 0.0f64;
    for el in probe.doc.select(&sel).take(8) {
        let text = el.text().collect::<String>();
        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }

        let char_count = trimmed.chars().count() as f64;
        let paragraph_count = trimmed
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count() as f64;
        let br_count = el.html().matches("<br").count() as f64;
        let link_count = el.select(&Selector::parse("a").expect("selector")).count() as f64;
        let chapter_hits = count_pattern_hits(trimmed, &["第", "章", "节", "回", "正文"]) as f64;
        let noise_hits = count_pattern_hits(
            trimmed,
            &[
                "最新网址",
                "手机阅读",
                "收藏本站",
                "广告",
                "推广",
                "上一章",
                "下一章",
                "返回目录",
            ],
        ) as f64;
        let class_attr = el.value().attr("class").unwrap_or_default();
        let id_attr = el.value().attr("id").unwrap_or_default();
        let selector_hint_bonus = count_pattern_hits(
            &format!("{class_attr} {id_attr} {selector}"),
            &["content", "read", "txt", "chapter", "article"],
        ) as f64;

        let score = (char_count.min(6000.0) / 220.0)
            + (paragraph_count.min(40.0) * 1.3)
            + (br_count.min(60.0) * 0.6)
            + (chapter_hits * 4.0)
            + (selector_hint_bonus * 2.0)
            - (link_count.min(30.0) * 0.9)
            - (noise_hits * 3.5);
        if score > best {
            best = score;
        }
    }

    best.max(0.0)
}

fn derive_best_content_selector(probe: &mut ProbeDoc<'_>, candidates: &[&str], top_n: usize) -> (String, f64) {
    let mut scored = candidates
        .iter()
        .map(|candidate| (*candidate, score_content_selector(probe, candidate)))
        .filter(|(_, score)| *score > 0.0)
        .collect::<Vec<_>>();
    if scored.is_empty() {
        return (candidates.first().copied().unwrap_or("body").to_string(), 0.0);
    }
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let best_score = scored.first().map(|(_, score)| *score).unwrap_or(0.0);
    let chain = scored
        .into_iter()
        .take(top_n.max(1))
        .map(|(selector, _)| selector.to_string())
        .collect::<Vec<_>>()
        .join(" | ");
    (chain, best_score)
}

fn score_toc_selector(probe: &mut ProbeDoc<'_>, selector: &str) -> f64 {
    let Some(sel) = probe.selector(selector).cloned() else {
        return 0.0;
    };

    let mut link_count = 0usize;
    let mut chapter_like_count = 0usize;
    let mut noise_like_count = 0usize;
    let mut total_text_len = 0usize;
    let mut href_hits = 0usize;

    for el in probe.doc.select(&sel).take(300) {
        let text = el.text().collect::<String>().trim().to_string();
        if text.is_empty() {
            continue;
        }
        link_count += 1;
        total_text_len += text.chars().count();
        chapter_like_count += count_pattern_hits(&text, &["第", "章", "节", "回", "卷", "chapter"]).min(1);
        noise_like_count += count_pattern_hits(
            &text,
            &["最新", "推荐", "作者", "分类", "简介", "目录", "排行", "相关阅读", "猜你喜欢"],
        )
        .min(1);
        if let Some(href) = el.value().attr("href") {
            href_hits += count_pattern_hits(href, &["chapter", "book", ".html", "/read", "/chapter"]).min(1);
        }
    }

    if link_count == 0 {
        return 0.0;
    }

    let avg_text_len = total_text_len as f64 / link_count as f64;
    let density_bonus = if link_count >= 12 {
        18.0
    } else if link_count >= 6 {
        8.0
    } else {
        0.0
    };

    let score = density_bonus
        + chapter_like_count as f64 * 3.5
        + href_hits as f64 * 1.4
        + avg_text_len.min(32.0) * 0.25
        - noise_like_count as f64 * 2.5
        - (link_count.min(8) as f64 - chapter_like_count.min(8) as f64).max(0.0) * 0.4;

    score.max(0.0)
}

fn derive_best_toc_selector(probe: &mut ProbeDoc<'_>, candidates: &[&str], top_n: usize) -> (String, f64) {
    let mut scored = candidates
        .iter()
        .map(|candidate| (*candidate, score_toc_selector(probe, candidate)))
        .filter(|(_, score)| *score > 0.0)
        .collect::<Vec<_>>();
    if scored.is_empty() {
        return (candidates.first().copied().unwrap_or("a[href]").to_string(), 0.0);
    }
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let best_score = scored.first().map(|(_, score)| *score).unwrap_or(0.0);
    let chain = scored
        .into_iter()
        .take(top_n.max(1))
        .map(|(selector, _)| selector.to_string())
        .collect::<Vec<_>>()
        .join(" | ");
    (chain, best_score)
}

fn score_search_result_selector(probe: &mut ProbeDoc<'_>, selector: &str) -> f64 {
    let Some(sel) = probe.selector(selector).cloned() else {
        return 0.0;
    };

    let mut item_count = 0usize;
    let mut anchor_hits = 0usize;
    let mut book_like_hits = 0usize;
    let mut author_hits = 0usize;
    let mut total_text_len = 0usize;
    let mut noise_hits = 0usize;
    let link_selector = Selector::parse("a[href]").expect("selector");

    for el in probe.doc.select(&sel).take(80) {
        let text = el.text().collect::<String>().trim().to_string();
        if text.is_empty() {
            continue;
        }
        item_count += 1;
        total_text_len += text.chars().count();
        anchor_hits += el.select(&link_selector).count().min(3);
        book_like_hits += count_pattern_hits(
            &text,
            &["作者", "最新", "简介", "章", "书", "小说", "连载", "更新"],
        )
        .min(2);
        author_hits += count_pattern_hits(&text, &["作者", "author"]).min(1);
        noise_hits += count_pattern_hits(
            &text,
            &["首页", "上一页", "下一页", "尾页", "推荐", "排行", "导航"],
        )
        .min(1);
    }

    if item_count == 0 {
        return 0.0;
    }

    let avg_text_len = total_text_len as f64 / item_count as f64;
    let density_bonus = if item_count >= 5 {
        14.0
    } else if item_count >= 2 {
        6.0
    } else {
        0.0
    };

    (density_bonus
        + anchor_hits as f64 * 1.8
        + book_like_hits as f64 * 2.4
        + author_hits as f64 * 1.4
        + avg_text_len.min(80.0) * 0.12
        - noise_hits as f64 * 2.2)
        .max(0.0)
}

fn derive_best_search_result_selector(
    probe: &mut ProbeDoc<'_>,
    candidates: &[&str],
    top_n: usize,
) -> (String, f64) {
    let mut scored = candidates
        .iter()
        .map(|candidate| (*candidate, score_search_result_selector(probe, candidate)))
        .filter(|(_, score)| *score > 0.0)
        .collect::<Vec<_>>();
    if scored.is_empty() {
        return (candidates.first().copied().unwrap_or("a[href]").to_string(), 0.0);
    }
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let best_score = scored.first().map(|(_, score)| *score).unwrap_or(0.0);
    let chain = scored
        .into_iter()
        .take(top_n.max(1))
        .map(|(selector, _)| selector.to_string())
        .collect::<Vec<_>>()
        .join(" | ");
    (chain, best_score)
}

fn derive_selector_chain(
    probe: &mut ProbeDoc<'_>,
    candidates: &[&str],
    prefer_count: bool,
    top_n: usize,
) -> String {
    let mut scored = candidates
        .iter()
        .map(|candidate| {
            let score = probe.score(candidate, prefer_count);
            (*candidate, score)
        })
        .filter(|(_, score)| *score > 0)
        .collect::<Vec<_>>();
    if scored.is_empty() {
        return candidates.first().copied().unwrap_or("body").to_string();
    }
    scored.sort_by(|a, b| b.1.cmp(&a.1));
    scored
        .into_iter()
        .take(top_n.max(1))
        .map(|(selector, _)| selector.to_string())
        .collect::<Vec<_>>()
        .join(" | ")
}

fn build_source_from_seed(
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
            let book_name_sel = derive_selector_chain(
                &mut probe,
                BOOK_NAME_SELECTOR_CANDIDATES,
                false,
                3,
            );
            let author_sel = derive_selector_chain(
                &mut probe,
                AUTHOR_SELECTOR_CANDIDATES,
                false,
                2,
            );
            let intro_sel = derive_selector_chain(
                &mut probe,
                INTRO_SELECTOR_CANDIDATES,
                false,
                2,
            );
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
                    .unwrap_or_else(|| choose_best_selector(&mut probe, CONTENT_SELECTOR_CANDIDATES, false)),
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
                "article | .content | #content | .chapter-content | .txt | .read-content".to_string(),
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

fn classify_noise_patterns(chapter_html: &str, content_selector: &str) -> (Vec<String>, Vec<String>) {
    let mut noise_patterns = Vec::new();
    let mut risk_flags = Vec::new();
    let lower = chapter_html.to_ascii_lowercase();

    for needle in ["advert", "ads", "banner", "推广", "最新网址", "收藏本站", "手机阅读"] {
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
    if count_pattern_hits(chapter_html, &["最新网址", "收藏本站", "手机阅读", "上一章", "下一章"]) >= 2 {
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
            }
            _ => out.push(ch),
        }
    }
    out
}

fn infer_noise_replace_rules(chapter_html: &str) -> Vec<ReplaceRule> {
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

fn build_documentation(
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
    (
        format!("https://html.duckduckgo.com/html/?q=site%3A{host}+{{q}}"),
        false,
    )
}

fn infer_detail_url_template(book_url: &Url) -> Option<String> {
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

fn absolutize_url(base: &Url, href: &str) -> Option<Url> {
    if href.trim().is_empty() || href.starts_with("javascript:") || href.starts_with('#') {
        return None;
    }
    base.join(href).ok()
}

fn extract_selector_candidates(selector_chain: &str) -> Vec<String> {
    selector_chain
        .split('|')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn extract_same_site_chapter_candidates(
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

fn infer_search_selector_from_html(html: &str, sample_book_url: Option<&Url>) -> SearchProbeInsights {
    let doc = Html::parse_document(html);
    let mut probe = ProbeDoc::new(&doc);
    let candidates = [
        ".search-list > li",
        ".result-list > li",
        ".book-list > li",
        ".bookbox",
        ".search-item",
        ".result-item",
        "ul > li",
        "tbody > tr",
        "a[href]",
    ];
    let (list_selector, list_score) = derive_best_search_result_selector(&mut probe, &candidates, 3);
    let result_count = extract_selector_candidates(&list_selector)
        .into_iter()
        .filter_map(|item| Selector::parse(&item).ok())
        .map(|selector| doc.select(&selector).count())
        .max()
        .unwrap_or(0);

    let (name_selector, url_selector, author_selector, intro_selector) =
        infer_search_item_fields(&doc, &list_selector);
    let result_filter =
        infer_search_result_filter(&doc, &list_selector, &url_selector, sample_book_url);
    let next_page_selector = infer_search_next_page_selector(&doc);

    SearchProbeInsights {
        list_selector,
        list_score,
        result_count,
        name_selector,
        url_selector,
        author_selector,
        intro_selector,
        result_filter,
        next_page_selector,
    }
}

fn derive_stable_path_filter(sample_book_url: &Url) -> Option<String> {
    let segments = sample_book_url
        .path_segments()
        .map(|it| {
            it.filter(|segment| !segment.trim().is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if segments.is_empty() {
        return None;
    }

    for marker in ["book", "novel", "novels", "n", "xiaoshuo", "shu"] {
        if let Some(found) = segments.iter().find(|segment| segment.eq_ignore_ascii_case(marker)) {
            return Some(format!("/{found}/"));
        }
    }

    let first = segments.first()?;
    if first.chars().any(|ch| ch.is_ascii_alphabetic()) && first.len() <= 20 {
        Some(format!("/{first}/"))
    } else {
        None
    }
}

fn infer_search_result_filter(
    doc: &Html,
    list_selector_chain: &str,
    url_selector: &str,
    sample_book_url: Option<&Url>,
) -> Option<String> {
    let expected_filter = sample_book_url.and_then(derive_stable_path_filter)?;
    let url_attr_selector = url_selector.split('@').next().unwrap_or("a").trim();
    let attr_name = url_selector
        .split('@')
        .nth(1)
        .map(str::trim)
        .filter(|it| !it.is_empty())
        .unwrap_or("href");

    let mut hits = 0usize;
    let mut misses = 0usize;
    for selector_text in extract_selector_candidates(list_selector_chain) {
        let Ok(item_selector) = Selector::parse(&selector_text) else {
            continue;
        };
        let Ok(url_sel) = Selector::parse(url_attr_selector) else {
            continue;
        };
        for item in doc.select(&item_selector).take(20) {
            let Some(node) = item.select(&url_sel).next() else {
                continue;
            };
            let Some(raw_url) = node.value().attr(attr_name) else {
                continue;
            };
            if raw_url.contains(&expected_filter) {
                hits += 1;
            } else {
                misses += 1;
            }
        }
    }

    if hits == 0 {
        return None;
    }
    if misses > hits * 2 {
        return None;
    }
    Some(expected_filter)
}

fn infer_search_next_page_selector(doc: &Html) -> Option<String> {
    let candidates = [
        ".pagination a",
        ".page a",
        ".pager a",
        "#pagelink a",
        ".pages a",
        "a[href*='page=']",
    ];

    for candidate in candidates {
        let Ok(selector) = Selector::parse(candidate) else {
            continue;
        };
        let mut next_like_hits = 0usize;
        let mut numeric_hits = 0usize;
        for el in doc.select(&selector).take(24) {
            let text = el.text().collect::<String>().trim().to_string();
            let href = el.value().attr("href").unwrap_or_default().to_string();
            if text.is_empty() && href.is_empty() {
                continue;
            }
            if count_pattern_hits(&format!("{text} {href}"), &["下一页", "下页", "next", ">", "›", "»"]) > 0 {
                next_like_hits += 1;
            }
            if text.chars().all(|ch| ch.is_ascii_digit()) {
                numeric_hits += 1;
            }
        }
        if next_like_hits > 0 || numeric_hits >= 2 {
            return Some(candidate.to_string());
        }
    }

    None
}

fn selector_looks_specific(tag: &str, class_attr: &str, id_attr: &str) -> bool {
    !class_attr.trim().is_empty() || !id_attr.trim().is_empty() || matches!(tag, "h2" | "h3" | "h4" | "a" | "p" | "span")
}

fn preferred_relative_selector(tag: &str, class_attr: &str, id_attr: &str, attr: Option<&str>) -> String {
    let base = if !id_attr.trim().is_empty() {
        format!("#{id_attr}")
    } else if let Some(class_name) = class_attr
        .split_whitespace()
        .find(|name| !name.trim().is_empty() && name.len() <= 32)
    {
        format!(".{class_name}")
    } else {
        tag.to_string()
    };
    match attr {
        Some(attr) if !attr.is_empty() => format!("{base}@{attr}"),
        _ => base,
    }
}

fn infer_search_item_fields(
    doc: &Html,
    list_selector_chain: &str,
) -> (String, String, Option<String>, Option<String>) {
    let mut best_anchor_selector = None::<String>;
    let mut best_author_selector = None::<String>;
    let mut best_intro_selector = None::<String>;

    for selector_text in extract_selector_candidates(list_selector_chain) {
        let Ok(item_selector) = Selector::parse(&selector_text) else {
            continue;
        };
        let anchor_selector = Selector::parse("a[href]").expect("selector");
        let author_candidates = Selector::parse("span, p, div, small, em, i").expect("selector");

        for item in doc.select(&item_selector).take(12) {
            if best_anchor_selector.is_none() {
                let mut best_local_anchor = None::<(String, usize)>;
                for anchor in item.select(&anchor_selector).take(6) {
                    let text = anchor.text().collect::<String>().trim().to_string();
                    if text.is_empty() {
                        continue;
                    }
                    let href = anchor.value().attr("href").unwrap_or_default();
                    if href.is_empty() {
                        continue;
                    }
                    let tag = anchor.value().name();
                    let class_attr = anchor.value().attr("class").unwrap_or_default();
                    let id_attr = anchor.value().attr("id").unwrap_or_default();
                    if !selector_looks_specific(tag, class_attr, id_attr) {
                        continue;
                    }
                    let score = text.chars().count()
                        + count_pattern_hits(&text, &["书", "小说", "章", "卷", "第"]).min(2) * 6;
                    let selector = preferred_relative_selector(tag, class_attr, id_attr, Some("href"));
                    match &best_local_anchor {
                        Some((_, best_score)) if *best_score >= score => {}
                        _ => best_local_anchor = Some((selector, score)),
                    }
                }
                if let Some((selector, _)) = best_local_anchor {
                    best_anchor_selector = Some(selector);
                }
            }

            if best_author_selector.is_none() || best_intro_selector.is_none() {
                for node in item.select(&author_candidates).take(10) {
                    let text = node.text().collect::<String>().trim().to_string();
                    if text.is_empty() {
                        continue;
                    }
                    let tag = node.value().name();
                    let class_attr = node.value().attr("class").unwrap_or_default();
                    let id_attr = node.value().attr("id").unwrap_or_default();
                    if !selector_looks_specific(tag, class_attr, id_attr) {
                        continue;
                    }

                    if best_author_selector.is_none()
                        && count_pattern_hits(&text, &["作者", "author"]) > 0
                    {
                        best_author_selector = Some(preferred_relative_selector(
                            tag,
                            class_attr,
                            id_attr,
                            None,
                        ));
                    }

                    if best_intro_selector.is_none()
                        && text.chars().count() >= 12
                        && count_pattern_hits(&text, &["简介", "更新", "连载", "最新", "字数", "状态"]) == 0
                    {
                        best_intro_selector = Some(preferred_relative_selector(
                            tag,
                            class_attr,
                            id_attr,
                            None,
                        ));
                    }

                    if best_author_selector.is_some() && best_intro_selector.is_some() {
                        break;
                    }
                }
            }

            if best_anchor_selector.is_some()
                && best_author_selector.is_some()
                && best_intro_selector.is_some()
            {
                break;
            }
        }
    }

    let name_selector = best_anchor_selector
        .as_ref()
        .map(|selector| selector.trim_end_matches("@href").to_string())
        .unwrap_or_else(|| "a".to_string());
    let url_selector = best_anchor_selector.unwrap_or_else(|| "a@href".to_string());

    (name_selector, url_selector, best_author_selector, best_intro_selector)
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

fn compute_generalization_score(
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
            _ => {}
        }
    }

    score.clamp(0.2, 0.95)
}

fn build_search_profile(
    req: &SourceBuildFromSamplesRequest,
    book_url: &Url,
    search_supported: bool,
    search_path: &str,
    source: &NxsSource,
    search_next_page_selector: Option<&str>,
) -> SourceSearchProfile {
    let mut strategies = Vec::new();

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
                book_url_matchers: source
                    .search
                    .result_filter
                    .clone()
                    .into_iter()
                    .collect(),
                pagination: SearchPaginationRule {
                    enabled: search_next_page_selector.is_some(),
                    next_page_selector: search_next_page_selector.map(ToString::to_string),
                    max_pages: if search_next_page_selector.is_some() { 3 } else { 1 },
                },
                disabled_reason: None,
            });
        }
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
        enabled: true,
        priority: 50,
        provider: "site_search_html".to_string(),
        query_template: Some(search_path.to_string()),
        method: Some(source.search.method.clone()),
        body_template: source.search.body.clone(),
        result_selector: Some(source.search.list.clone()),
        detail_url_template: None,
        book_url_matchers: vec![book_url.host_str().unwrap_or_default().to_string()],
        pagination: SearchPaginationRule {
            enabled: search_next_page_selector.is_some(),
            next_page_selector: search_next_page_selector.map(ToString::to_string),
            max_pages: if search_next_page_selector.is_some() { 3 } else { 1 },
        },
        disabled_reason: if search_supported {
            None
        } else {
            Some("fallback site-search strategy".to_string())
        },
    });

    SourceSearchProfile {
        enabled: true,
        default_mode: Some(if req.search_curl.is_some() {
            SourceSearchMode::NativeSearch
        } else if infer_detail_url_template(book_url).is_some() {
            SourceSearchMode::DirectDetail
        } else {
            SourceSearchMode::ExternalDiscovery
        }),
        strategies,
    }
}

fn build_source_from_samples(
    req: &SourceBuildFromSamplesRequest,
    book_url: &Url,
    book_html: &str,
    chapter_url: &Url,
    chapter_html: &str,
    search_sample: Option<&SearchSample>,
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

    let (search_path, mut search_supported) =
        derive_search_rule(book_url.host_str().unwrap_or("unknown-source"));
    source.search.path = search_path.clone();
    let mut search_inference_score = None;
    let mut search_next_page_selector = None::<String>;
    if let Some(search_sample) = search_sample {
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
            search_supported = search_probe.result_count > 0;
            search_inference_score = Some(search_probe.list_score);
        }
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
        search_supported,
        book_supported: true,
        toc_supported: true,
        content_supported: true,
        direct_detail_supported: infer_detail_url_template(book_url).is_some(),
        external_discovery_supported: true,
        search_pagination_supported: search_next_page_selector.is_some(),
        search_special_param_supported: req.search_curl.is_some(),
        pagination_supported: false,
        font_decrypt_supported: risk_flags.iter().any(|it| it == "possible_font_obfuscation"),
        script_clean_supported: !noise_patterns.is_empty(),
    };
    let search_profile = build_search_profile(
        req,
        book_url,
        search_supported,
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
    if let Some(book_probe) = book_probe.as_ref() {
        metadata.insert(
            "probe.tocSelector".to_string(),
            book_probe.best_toc_selector.clone(),
        );
        metadata.insert(
            "probe.tocSelectorScore".to_string(),
            format!("{:.3}", book_probe.best_toc_score),
        );
    }
    metadata.insert(
        "probe.contentSelectorScore".to_string(),
        format!("{content_score:.3}"),
    );
    metadata.insert(
        "probe.autoNoiseRuleCount".to_string(),
        inferred_noise_rules.len().to_string(),
    );
    if let Some(score) = search_inference_score {
        metadata.insert("probe.searchSelectorScore".to_string(), format!("{score:.3}"));
    }
    metadata.insert(
        "probe.searchItemNameSelector".to_string(),
        source.search.item.name.clone(),
    );
    metadata.insert(
        "probe.searchItemUrlSelector".to_string(),
        source.search.item.url.clone(),
    );
    if let Some(result_filter) = source.search.result_filter.as_ref() {
        metadata.insert("probe.searchResultFilter".to_string(), result_filter.clone());
    }
    if let Some(next_page_selector) = search_next_page_selector.as_ref() {
        metadata.insert(
            "probe.searchNextPageSelector".to_string(),
            next_page_selector.clone(),
        );
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
        package
            .validation
            .warnings
            .push("search uses generic site-search fallback".to_string());
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
        search_strategy: if search_supported {
            "native".to_string()
        } else {
            "generic_site_search".to_string()
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
    };

    (package, diagnostics)
}

fn validate_package_shape(pkg: &SourceRulePackage) -> SourceRuleValidationReport {
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
    }
}

fn build_fetch_profile(req: &SourceBuildFromSamplesRequest) -> SourceFetchProfile {
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

fn extract_free_text_hints(input: &str) -> SourceRuleHints {
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
            }
            "search result" | "search_result" | "search result selector" => {
                hints.search_result_selector = Some(value.to_string());
            }
            "book title" | "book_title" | "title selector" => {
                hints.book_title_selector = Some(value.to_string());
            }
            "author" | "author selector" => {
                hints.author_selector = Some(value.to_string());
            }
            "intro" | "intro selector" | "description" => {
                hints.intro_selector = Some(value.to_string());
            }
            "toc" | "toc item" | "toc_item" | "chapter list" => {
                hints.toc_item_selector = Some(value.to_string());
            }
            "content" | "content selector" => {
                hints.content_selector = Some(value.to_string());
            }
            "content title" | "content_title" | "chapter title" => {
                hints.content_title_selector = Some(value.to_string());
            }
            "pagination" | "next page" | "next_page" => {
                hints.pagination_selector = Some(value.to_string());
            }
            "noise" | "noise pattern" | "noise_pattern" => {
                hints.noise_patterns.push(value.to_string());
            }
            _ => {}
        }
    }
    hints
}

fn merge_hints(base: Option<SourceRuleHints>, free_text: Option<&str>) -> Option<SourceRuleHints> {
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

fn apply_hints_to_package(package: &mut SourceRulePackage, hints: &SourceRuleHints) -> Vec<String> {
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
                if let Some(updated) =
                    append_selector_fallback(&package.source.search.list, SEARCH_RESULT_SELECTOR_FALLBACKS)
                {
                    package.source.search.list = updated.clone();
                    applied.push(format!("auto:search.list={updated}"));
                }
            }
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
            }
            ("book_info", Some("selector_miss")) => {
                if let Some(updated) =
                    append_selector_fallback(&package.source.book.name, BOOK_TITLE_SELECTOR_FALLBACKS)
                {
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
            }
            ("chapters", Some("empty_result")) => {
                if let Some(updated) =
                    append_selector_fallback(&package.source.toc.list, TOC_SELECTOR_FALLBACKS)
                {
                    package.source.toc.list = updated.clone();
                    applied.push(format!("auto:toc.list={updated}"));
                }
            }
            ("content", Some("low_quality")) | ("content", Some("manual_review")) => {
                if let Some(updated) =
                    append_selector_fallback(&package.source.content.body, CONTENT_SELECTOR_FALLBACKS)
                {
                    package.source.content.body = updated.clone();
                    applied.push(format!("auto:content.body={updated}"));
                }
                package.source.content.visible_only = true;
                applied.push("auto:content.visibleOnly=true".to_string());
                for selector in COMMON_CONTENT_FILTERS {
                    if !package.source.content.filter.iter().any(|it| it == selector) {
                        package.source.content.filter.push((*selector).to_string());
                        applied.push(format!("auto:content.filter+={selector}"));
                    }
                }
            }
            _ => {}
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

fn compute_refine_changes(before: &SourceRulePackage, after: &SourceRulePackage) -> Vec<SourceRuleChange> {
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

fn package_default_samples(
    package: &SourceRulePackage,
    req_samples: Option<ValidationSamples>,
) -> Option<ValidationSamples> {
    if req_samples.is_some() {
        return req_samples;
    }
    let samples = package.samples.as_ref()?;
    Some(ValidationSamples {
        search_query: package
            .metadata
            .get("sample.searchKeyword")
            .cloned(),
        book_url: samples.book_sample_url.clone(),
        toc_url: samples.book_sample_url.clone(),
        chapter_url: samples.chapter_sample_url.clone(),
    })
}

fn make_step(step: &str, ok: bool, summary: impl Into<String>) -> SourceValidationStepReport {
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

fn classify_fetch_error(error: &str) -> &'static str {
    let lower = error.to_ascii_lowercase();
    if lower.contains("cloudflare") || lower.contains("403") || lower.contains("429") {
        "fetch_failed"
    } else if lower.contains("timeout") {
        "fetch_timeout"
    } else {
        "fetch_failed"
    }
}

fn suggested_actions_for(code: &str, step: &str) -> Vec<String> {
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
            "详情页已打开但书籍规则不命中，优先修正 book.name / book.author / book.intro".to_string(),
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

fn classify_search_detail_failure(
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

fn select_search_result_for_validation(
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

fn extract_search_detail_diagnostics(
    steps: &[SourceValidationStepReport],
) -> (
    Option<String>,
    Option<String>,
    Option<bool>,
    Option<String>,
    Option<String>,
    Vec<String>,
) {
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

async fn run_validation(
    state: &AppState,
    package: &SourceRulePackage,
    req_samples: Option<ValidationSamples>,
) -> SourceRuleValidationReport {
    let mut report = validate_package_shape(package);
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
                return report;
            }
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
        }
        Err(e) => {
            report.errors.push(format!("engine compile failed: {e}"));
            report.valid = false;
            report.importable = false;
            return report;
        }
    };

    let samples = package_default_samples(package, req_samples);
    let mut step_results = Vec::new();
    let mut passed_steps = 0usize;

    if let Some(samples) = samples {
        let sample_book_url_for_search = samples.book_url.clone();
        if let Some(query) = samples.search_query {
            match engine.search(&query).await.map_err(|e| e.to_string()) {
                Ok(items) => {
                    let mut step = make_step("search", !items.is_empty(), format!("{} items", items.len()));
                    step.item_count = Some(items.len());
                    if items.is_empty() {
                        step.failure_code = Some("empty_result".to_string());
                        step.warnings.push("sample search returned empty".to_string());
                        step.suggested_actions = suggested_actions_for("empty_result", "search");
                        report.warnings.push("sample search returned empty".to_string());
                    }
                    if step.ok {
                        passed_steps += 1;
                    }
                    step_results.push(step);

                    if !items.is_empty() {
                        let resolved_book_url =
                            select_search_result_for_validation(&items, sample_book_url_for_search.as_deref());
                        match resolved_book_url {
                            Some(resolved_book_url) => {
                                match engine.book_info(&resolved_book_url).await.map_err(|e| e.to_string()) {
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
                                            report.warnings.push(
                                                "search result detail validation returned empty name".to_string(),
                                            );
                                        } else {
                                            passed_steps += 1;
                                        }
                                        step_results.push(step);
                                    }
                                    Err(error) => {
                                        let mut step = make_step("search_detail", false, "search detail failed");
                                        let code = classify_search_detail_failure(
                                            &resolved_book_url,
                                            sample_book_url_for_search.as_deref(),
                                            Some(&error),
                                        );
                                        step.failure_code = Some(code.clone());
                                        step.errors.push(error.clone());
                                        step.suggested_actions =
                                            suggested_actions_for(&code, "search_detail");
                                        report
                                            .errors
                                            .push(format!("search result detail validation failed: {error}"));
                                        report.valid = false;
                                        step_results.push(step);
                                    }
                                }
                            }
                            None => {
                                let mut step = make_step("search_detail", false, "no search result candidate");
                                step.failure_code = Some("detail_mismatch".to_string());
                                step.warnings
                                    .push("search returned items but none could be selected for detail validation".to_string());
                                step.suggested_actions =
                                    suggested_actions_for("detail_mismatch", "search_detail");
                                report.valid = false;
                                step_results.push(step);
                            }
                        }
                    }
                }
                Err(error) => {
                    let mut step = make_step("search", false, "search failed");
                    let code = classify_fetch_error(&error).to_string();
                    step.failure_code = Some(code.clone());
                    step.errors.push(error.clone());
                    step.suggested_actions = suggested_actions_for(&code, "search");
                    report.errors.push(format!("sample search failed: {error}"));
                    report.valid = false;
                    step_results.push(step);
                }
            }
        }
        if let Some(book_url) = samples.book_url {
            match engine.book_info(&book_url).await.map_err(|e| e.to_string()) {
                Ok(info) => {
                    let ok = !info.name.trim().is_empty();
                    let mut step = make_step("book_info", ok, format!("name={}", info.name));
                    if !ok {
                        step.failure_code = Some("selector_miss".to_string());
                        step.warnings.push("sample book_info has empty name".to_string());
                        step.suggested_actions = suggested_actions_for("selector_miss", "book_info");
                        report.warnings.push("sample book_info has empty name".to_string());
                    } else {
                        passed_steps += 1;
                    }
                    step_results.push(step);
                }
                Err(error) => {
                    let mut step = make_step("book_info", false, "book_info failed");
                    let code = classify_fetch_error(&error).to_string();
                    step.failure_code = Some(code.clone());
                    step.errors.push(error.clone());
                    step.suggested_actions = suggested_actions_for(&code, "book_info");
                    report.errors.push(format!("sample book_info failed: {error}"));
                    report.valid = false;
                    step_results.push(step);
                }
            }
        }
        if let Some(toc_url) = samples.toc_url {
            match engine.chapters(&toc_url).await.map_err(|e| e.to_string()) {
                Ok(chapters) => {
                    let mut step =
                        make_step("chapters", !chapters.is_empty(), format!("{} chapters", chapters.len()));
                    step.item_count = Some(chapters.len());
                    if chapters.is_empty() {
                        step.failure_code = Some("empty_result".to_string());
                        step.warnings.push("sample chapters returned empty".to_string());
                        step.suggested_actions = suggested_actions_for("empty_result", "chapters");
                        report.warnings.push("sample chapters returned empty".to_string());
                    } else {
                        passed_steps += 1;
                    }
                    step_results.push(step);
                }
                Err(error) => {
                    let mut step = make_step("chapters", false, "chapters failed");
                    let code = classify_fetch_error(&error).to_string();
                    step.failure_code = Some(code.clone());
                    step.errors.push(error.clone());
                    step.suggested_actions = suggested_actions_for(&code, "chapters");
                    report.errors.push(format!("sample chapters failed: {error}"));
                    report.valid = false;
                    step_results.push(step);
                }
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
                    let ok = quality.score >= 0.4 && !content.trim().is_empty();
                    let mut step = make_step(
                        "content",
                        ok,
                        format!("chars={} quality={:.3}", content.chars().count(), quality.score),
                    );
                    step.quality_score = Some(quality.score);
                    if quality.score < 0.55 {
                        step.failure_code = Some("manual_review".to_string());
                        step.manual_review_recommended = true;
                        step.suggested_actions = suggested_actions_for("manual_review", "content");
                        report.manual_review_required = true;
                        report
                            .warnings
                            .push(format!("sample content quality is low (score={:.3})", quality.score));
                    }
                    if !ok {
                        step.failure_code = Some("low_quality".to_string());
                        step.errors.push("content quality below threshold".to_string());
                        step.suggested_actions = suggested_actions_for("low_quality", "content");
                        report.valid = false;
                    } else {
                        passed_steps += 1;
                    }
                    step_results.push(step);
                }
                Err(error) => {
                    let mut step = make_step("content", false, "content failed");
                    let code = classify_fetch_error(&error).to_string();
                    step.failure_code = Some(code.clone());
                    step.errors.push(error.clone());
                    step.suggested_actions = suggested_actions_for(&code, "content");
                    report.errors.push(format!("sample content failed: {error}"));
                    report.valid = false;
                    step_results.push(step);
                }
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
    report
}

async fn fetch_seed_html(seed_url: &str) -> Result<String, String> {
    static SOURCE_BUILDER_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    let client = if let Some(existing) = SOURCE_BUILDER_HTTP_CLIENT.get() {
        existing
    } else {
        let built = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?;
        let _ = SOURCE_BUILDER_HTTP_CLIENT.set(built);
        SOURCE_BUILDER_HTTP_CLIENT
            .get()
            .expect("source-builder HTTP client must be initialized")
    };
    let resp = client
        .get(seed_url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (compatible; source-builder/1.0; +https://nexuslite.local)",
        )
        .send()
        .await
        .map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

fn source_builder_http_client() -> Result<&'static reqwest::Client, String> {
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

async fn replay_curl_request(parsed: &ParsedCurl) -> Result<CurlReplay, String> {
    let client = source_builder_http_client()?;
    let method = reqwest::Method::from_bytes(parsed.method.as_bytes()).map_err(|e| e.to_string())?;
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

async fn load_fetch_session(
    state: &AppState,
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

fn apply_session_to_parsed(parsed: &ParsedCurl, session: &FetchSessionProfile) -> ParsedCurl {
    let mut merged = parsed.clone();
    for (key, value) in &session.headers {
        merged.headers.entry(key.clone()).or_insert_with(|| value.clone());
    }
    for (key, value) in &session.cookies {
        merged.cookies.entry(key.clone()).or_insert_with(|| value.clone());
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

fn resolve_external_service_url(profile: Option<&SourceFetchProfile>) -> Option<String> {
    profile
        .and_then(|it| it.service_url.clone())
        .or_else(|| std::env::var("NEXUS_EXTERNAL_FETCH_URL").ok())
        .or_else(|| std::env::var("CF_BYPASS_URL").ok())
}

fn resolve_external_service_api_key() -> Option<String> {
    std::env::var("NEXUS_EXTERNAL_FETCH_API_KEY")
        .ok()
        .or_else(|| std::env::var("CF_API_KEY").ok())
}

async fn fetch_via_external_service(
    parsed: &ParsedCurl,
    profile: &SourceFetchProfile,
) -> Result<CurlReplay, String> {
    let Some(service_url) = resolve_external_service_url(Some(profile)) else {
        return Err(
            "external fetch provider requires fetchServiceUrl or NEXUS_EXTERNAL_FETCH_URL"
                .to_string(),
        );
    };
    let client = source_builder_http_client()?;
    let payload = ExternalFetchRequest {
        url: parsed.url.clone(),
        method: parsed.method.clone(),
        headers: if parsed.headers.is_empty() {
            None
        } else {
            Some(parsed.headers.clone())
        },
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

async fn execute_fetch(
    parsed: &ParsedCurl,
    fetch_profile: Option<&SourceFetchProfile>,
    state: &AppState,
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

fn build_temp_chain(fetch_profile: Option<&SourceFetchProfile>) -> Result<Arc<FallbackChain>, String> {
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
        headers
            .entry("cookie".to_string())
            .or_insert(cookie_header);
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

async fn validate_same_site_generalization(
    state: &AppState,
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
        }
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
            }
            Err(error) => {
                warnings.push(format!("同站章节验证失败: {} ({})", candidate, error));
            }
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

fn api_error<T>(message: impl AsRef<str>) -> Json<ApiResponse<T>> {
    Json(ApiResponse::error(message.as_ref()))
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
        }
        EngineOperation::BookInfo => {
            let url = resolve_and_validate_target_url("book_info", target_url)?;
            let info: BookInfo = engine.book_info(&url).await.map_err(|e| e.to_string())?;
            serde_json::to_value(info).map_err(|e| format!("serialize result failed: {e}"))
        }
        EngineOperation::Chapters => {
            let url = resolve_and_validate_target_url("chapters", target_url)?;
            let chapters: Vec<Chapter> = engine.chapters(&url).await.map_err(|e| e.to_string())?;
            serde_json::to_value(chapters).map_err(|e| format!("serialize result failed: {e}"))
        }
        EngineOperation::Content => {
            let url = resolve_and_validate_target_url("content", target_url)?;
            let content = engine
                .content(&url, &[] as &[ReplaceRule])
                .await
                .map_err(|e| e.to_string())?;
            serde_json::to_value(content).map_err(|e| format!("serialize result failed: {e}"))
        }
    }
}

/// Build source package from a target URL with HTML probing.
pub async fn build_source_package(Json(req): Json<SourceBuildRequest>) -> Json<ApiResponse<SourceBuildResponse>> {
    let parsed = match validate_url(&req.seed_url) {
        Ok(url) => url,
        Err(e) => return api_error(format!("invalid seedUrl: {e}")),
    };
    let fetched_html = fetch_seed_html(&req.seed_url).await.ok();

    let (source, probe_insights) = build_source_from_seed(&req, &parsed, fetched_html.as_deref());
    let mut metadata = HashMap::new();
    metadata.insert("seedUrl".to_string(), req.seed_url.clone());
    metadata.insert("generatedBy".to_string(), "source-builder-skill".to_string());
    if let Some(insights) = probe_insights {
        metadata.insert(
            "probe.chapterLikeLinks".to_string(),
            insights.chapter_like_links.to_string(),
        );
        metadata.insert(
            "probe.bestContentSelector".to_string(),
            insights.best_content_selector,
        );
    } else {
        metadata.insert("probe.failed".to_string(), "true".to_string());
    }

    let mut pkg = SourceRulePackage {
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
            score: 0.0,
            steps: Vec::new(),
            importable: false,
            manual_review_required: false,
        },
        tags: req.tags.clone(),
        metadata,
        documentation: None,
        samples: None,
        capabilities: None,
        import_policy: None,
        search_profile: None,
        fetch_profile: None,
    };
    pkg.validation = validate_package_shape(&pkg);

    let package_json = serde_json::to_string_pretty(&pkg).ok();
    Json(ApiResponse::success(SourceBuildResponse { package: pkg, package_json }))
}

pub async fn build_source_package_from_samples(
    State(state): State<AppState>,
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

    let book_replay = match execute_fetch(&parsed_book, Some(&fetch_profile), &state, 900).await {
        Ok(value) => value,
        Err(message) => return api_error(format!("bookCurl replay failed: {message}")),
    };
    let chapter_replay = match execute_fetch(&parsed_chapter, Some(&fetch_profile), &state, 900).await {
        Ok(value) => value,
        Err(message) => return api_error(format!("chapterCurl replay failed: {message}")),
    };

    if !(200..300).contains(&book_replay.status) {
        return api_error(format!("bookCurl replay returned HTTP {}", book_replay.status));
    }
    if !(200..300).contains(&chapter_replay.status) {
        return api_error(format!(
            "chapterCurl replay returned HTTP {}",
            chapter_replay.status
        ));
    }
    let search_sample = if let Some(parsed_search) = parsed_search.as_ref() {
        let search_replay = match execute_fetch(parsed_search, Some(&fetch_profile), &state, 900).await {
            Ok(value) => value,
            Err(message) => return api_error(format!("searchCurl replay failed: {message}")),
        };
        if !(200..300).contains(&search_replay.status) {
            return api_error(format!("searchCurl replay returned HTTP {}", search_replay.status));
        }
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
    let (mut package, diagnostics) = build_source_from_samples(
        &req,
        &final_book_url,
        &book_replay.body,
        &final_chapter_url,
        &chapter_replay.body,
        search_sample.as_ref(),
    );

    package.metadata.insert(
        "request.book.headerCount".to_string(),
        book_replay.request_headers.len().to_string(),
    );
    package.metadata.insert(
        "request.chapter.headerCount".to_string(),
        chapter_replay.request_headers.len().to_string(),
    );
    package.metadata.insert(
        "request.book.cookieCount".to_string(),
        book_replay.request_cookies.len().to_string(),
    );
    package.metadata.insert(
        "request.chapter.cookieCount".to_string(),
        chapter_replay.request_cookies.len().to_string(),
    );
    if let Some(keyword) = req.search_keyword.as_ref() {
        package
            .metadata
            .insert("sample.searchKeyword".to_string(), keyword.clone());
    }
    package.fetch_profile = Some(fetch_profile);
    if let Some(hints) = merge_hints(req.structured_hints.clone(), req.free_text_hints.as_deref()) {
        let applied = apply_hints_to_package(&mut package, &hints);
        if !applied.is_empty() {
            package
                .metadata
                .insert("builder.appliedHints".to_string(), applied.join(" | "));
        }
    }
    package
        .metadata
        .insert("request.book.url".to_string(), book_replay.request_url);
    package
        .metadata
        .insert("request.chapter.url".to_string(), chapter_replay.request_url);
    package
        .metadata
        .insert("request.book.status".to_string(), book_replay.status.to_string());
    package
        .metadata
        .insert("request.chapter.status".to_string(), chapter_replay.status.to_string());
    package
        .metadata
        .insert("request.book.finalUrl".to_string(), book_replay.final_url.clone());
    package
        .metadata
        .insert("request.chapter.finalUrl".to_string(), chapter_replay.final_url.clone());
    if let Some(search_sample) = search_sample.as_ref() {
        package
            .metadata
            .insert("request.search.url".to_string(), search_sample.request_url.clone());
        package
            .metadata
            .insert("request.search.finalUrl".to_string(), search_sample.final_url.clone());
        package
            .metadata
            .insert("request.search.status".to_string(), search_sample.status.to_string());
        if let Some(body_template) = search_sample.body_template.as_ref() {
            package
                .metadata
                .insert("request.search.bodyTemplate".to_string(), body_template.clone());
        }
    }

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
    package.metadata.insert(
        "probe.sameSiteCandidateCount".to_string(),
        same_site_validation.candidate_count.to_string(),
    );
    if let Some(url) = same_site_validation.validated_url.as_ref() {
        package
            .metadata
            .insert("probe.sameSiteValidatedUrl".to_string(), url.clone());
    }
    if same_site_validation.score > 0.0 {
        package.metadata.insert(
            "probe.sameSiteValidationScore".to_string(),
            format!("{:.3}", same_site_validation.score),
        );
    }

    let package_json = if req.emit_package_json {
        serde_json::to_string_pretty(&package).ok()
    } else {
        None
    };

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
                step
                    .suggested_actions
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
    let diagnostics = SourceBuildDiagnostics {
        book_fetch_status: book_replay.status,
        chapter_fetch_status: chapter_replay.status,
        book_final_url: book_replay.final_url.clone(),
        chapter_final_url: chapter_replay.final_url.clone(),
        same_site_validation_score: Some(same_site_validation.score),
        same_site_candidate_count: same_site_validation.candidate_count,
        same_site_validated_url: same_site_validation.validated_url.clone(),
        same_site_validation_warnings: same_site_validation.warnings.clone(),
        search_detail_validated_url,
        search_detail_resolved_name,
        search_detail_passed,
        search_detail_failure_code,
        search_detail_summary,
        search_detail_warnings,
        suggested_fixes,
        failure_categories,
        ..diagnostics
    };

    Json(ApiResponse::success(SourceBuildFromSamplesResponse {
        package,
        package_json,
        diagnostics,
    }))
}

pub async fn import_fetch_session(
    State(state): State<AppState>,
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
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<FetchSessionProfile>> {
    match state.store.get_fetch_session(id).await {
        Ok(Some(session)) => Json(ApiResponse::success(session)),
        Ok(None) => Json(ApiResponse::error("fetch session not found")),
        Err(error) => api_error(format!("get fetch session failed: {error}")),
    }
}

pub async fn fetch_html_with_session(
    State(state): State<AppState>,
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
        mode: "human_session".to_string(),
        provider: "session_replay".to_string(),
        service_url: None,
        engine: None,
        session_key: req.session_key.clone(),
        note: Some("human-assisted session fetch".to_string()),
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
                mode: fetch_profile.mode,
                provider: fetch_profile.provider,
                service_url: None,
                engine: None,
                request_url: Some(parsed.url),
                final_url: Some(entry.final_url),
                http_status: Some(entry.status),
                session_key: req.session_key,
                cache_hit: true,
                session_state: Some("active".to_string()),
            },
        }));
    }
    let replay = match execute_fetch(&parsed, Some(&fetch_profile), &state, req.cache_ttl_seconds).await {
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
            mode: fetch_profile.mode,
            provider: fetch_profile.provider,
            service_url: None,
            engine: None,
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
        },
    }))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidatePackageRequest {
    pub package: SourceRulePackage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub samples: Option<ValidationSamples>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationSamples {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toc_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidatePackageResponse {
    pub package_id: String,
    pub report: SourceRuleValidationReport,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_debug: Option<SourceFetchDebugInfo>,
}

/// Validate source package by structural checks + engine compile check.
pub async fn validate_source_package(
    State(state): State<AppState>,
    Json(req): Json<ValidatePackageRequest>,
) -> Json<ApiResponse<ValidatePackageResponse>> {
    let report = run_validation(&state, &req.package, req.samples).await;

    Json(ApiResponse::success(ValidatePackageResponse {
        package_id: req.package.package_id,
        report,
        fetch_debug: req.package.fetch_profile.as_ref().map(|profile| SourceFetchDebugInfo {
            mode: profile.mode.clone(),
            provider: profile.provider.clone(),
            service_url: profile.service_url.clone(),
            engine: profile.engine.clone(),
            request_url: req
                .package
                .metadata
                .get("request.book.url")
                .cloned(),
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
            session_state: profile
                .session_key
                .as_ref()
                .map(|_| "active".to_string()),
        }),
    }))
}

pub async fn refine_source_package(
    State(state): State<AppState>,
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
    package.validation = run_validation(
        &state,
        &package,
        req.samples.map(validation_samples_from_presets),
    )
    .await;
    if !auto_applied_actions.is_empty() {
        package.metadata.insert(
            "builder.lastAutoRefineActions".to_string(),
            auto_applied_actions.join(" | "),
        );
    }
    package.metadata.insert(
        "builder.lastRefineHints".to_string(),
        applied_hints.join(" | "),
    );

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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineRunByPackageRequest {
    pub package: SourceRulePackage,
    pub operation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineRunByPackageResponse {
    pub package_id: String,
    pub operation: String,
    pub result: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<SourceValidationStepReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fetch_debug: Option<SourceFetchDebugInfo>,
}

/// Run engine operations against an explicit source package (no registry coupling).
pub async fn run_engine_by_package(
    State(state): State<AppState>,
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
                failure_code: if ok { None } else { Some("empty_result".to_string()) },
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
        }
        EngineOperation::BookInfo => Some(make_step("book_info", true, "book_info executed")),
        EngineOperation::Chapters => {
            let count = result.as_array().map(|items| items.len());
            let ok = count.unwrap_or(0) > 0;
            Some(SourceValidationStepReport {
                step: "chapters".to_string(),
                ok,
                summary: format!("{} chapters", count.unwrap_or(0)),
                failure_code: if ok { None } else { Some("empty_result".to_string()) },
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
        }
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
        }
    };

    Json(ApiResponse::success(EngineRunByPackageResponse {
        package_id: req.package.package_id,
        operation: operation.as_str().to_string(),
        result,
        step,
        fetch_debug: req.package.fetch_profile.as_ref().map(|profile| SourceFetchDebugInfo {
            mode: profile.mode.clone(),
            provider: profile.provider.clone(),
            service_url: profile.service_url.clone(),
            engine: profile.engine.clone(),
            request_url: debug_target_url.clone().or(debug_query.clone()),
            final_url: debug_target_url,
            http_status: None,
            session_key: profile.session_key.clone(),
            cache_hit: false,
            session_state: profile
                .session_key
                .as_ref()
                .map(|_| "active".to_string()),
        }),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
        routing::post,
        Router,
    };
    use tower::ServiceExt;

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
        let curl = "curl 'https://example.com/book/1' -H 'accept: text/html' -b 'cf_clearance=abc; foo=bar'";
        let parsed = parse_curl_command(curl).expect("curl should parse");
        assert_eq!(parsed.url, "https://example.com/book/1");
        assert_eq!(
            parsed.headers.get("accept").map(String::as_str),
            Some("text/html")
        );
        assert_eq!(
            parsed.cookies.get("cf_clearance").map(String::as_str),
            Some("abc")
        );
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

        let (package, diagnostics) =
            build_source_from_samples(&req, &book_url, book_html, &chapter_url, chapter_html, None);

        assert_eq!(package.source.id, "example");
        assert!(package.documentation.is_some());
        assert!(package.capabilities.is_some());
        assert_eq!(diagnostics.host, "example.com");
        assert!(
            diagnostics
                .noise_patterns_detected
                .iter()
                .any(|it| it.contains("最新网址"))
        );
        assert!(
            package
                .source
                .content
                .replace
                .iter()
                .any(|rule| rule.pattern.contains("最新网址") || rule.pattern.contains("本章完"))
        );
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
        assert_eq!(diagnostics.same_site_candidate_count, 0);
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
        let (selector, score) = derive_best_content_selector(&mut probe, CONTENT_SELECTOR_CANDIDATES, 3);

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

        assert!(insights.list_selector.contains(".search-list > li"), "selector={}", insights.list_selector);
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

        let urls = extract_same_site_chapter_candidates(&book_url, book_html, "#list a", &chapter_url, 5);

        assert_eq!(urls.len(), 2);
        assert_eq!(urls[0].as_str(), "https://example.com/book/1/2.html");
    }

    #[test]
    fn select_search_result_for_validation_prefers_sample_match() {
        let items = vec![
            nexus_core::BookItem {
                name: "A".into(),
                author: None,
                cover_url: None,
                book_url: "https://example.com/book/999.html".into(),
                intro: None,
                source_id: "example".into(),
                source_name: "Example".into(),
                latest_chapter: None,
            },
            nexus_core::BookItem {
                name: "B".into(),
                author: None,
                cover_url: None,
                book_url: "https://example.com/book/123.html".into(),
                intro: None,
                source_id: "example".into(),
                source_name: "Example".into(),
                latest_chapter: None,
            },
        ];

        let selected = select_search_result_for_validation(&items, Some("https://example.com/book/123.html"));

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
            },
            tags: vec![],
            metadata: HashMap::new(),
            documentation: None,
            samples: None,
            capabilities: None,
            import_policy: None,
            search_profile: None,
            fetch_profile: None,
        };

        let temp_root = std::env::temp_dir().join(format!("nexus-source-builder-test-{}", Uuid::new_v4()));
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
        let state = crate::app::build_app_state(&config)
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
        assert_eq!(
            body.pointer("/data/packageId").and_then(|v| v.as_str()),
            Some("pkg-1")
        );
        assert!(
            body.pointer("/data/report").is_some(),
            "validate endpoint should return report"
        );
    }
}
