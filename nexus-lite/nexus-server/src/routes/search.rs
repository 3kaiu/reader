//! Search routes

#[path = "search_ranking.rs"]
mod ranking;

use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use futures::stream::Stream;
use nexus_core::{BookInfo, BookItem, SearchExplain, SearchExplainStrategy, SourceRulePackage};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::OnceLock;
use tokio_stream::wrappers::ReceiverStream;
use tracing::{error, info};
use url::Url;

use crate::app::AppState;
use crate::error::ApiErrorResponse;
use ranking::{
    annotate_result_rankings, build_direct_detail_explain, build_external_search_explain,
    package_search_rank, sort_packages_for_search, sort_results_for_keyword,
};

#[derive(Deserialize)]
pub struct SearchRequest {
    pub keyword: String,
    #[serde(default)]
    pub sources: Vec<String>, // Empty = all enabled sources
    #[serde(default = "default_page")]
    pub _page: u32,
}

fn default_page() -> u32 {
    1
}

#[derive(Serialize)]
pub struct SearchResponse {
    pub results: Vec<BookItem>,
    pub total: usize,
    pub errors: Vec<SearchError>,
}

#[derive(Serialize)]
pub struct SearchError {
    pub source_id: String,
    pub error: String,
}

/// SSE 搜索事件
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SearchEvent {
    Result { data: BookItem },
    Error { source_id: String, error: String },
    Done { total: usize },
}

fn keyword_looks_like_url(keyword: &str) -> bool {
    keyword.starts_with("http://") || keyword.starts_with("https://")
}

#[derive(Debug, Clone)]
struct JinaSearchHit {
    url: String,
    title: Option<String>,
    content: Option<String>,
}

fn jina_http_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(client) = CLIENT.get() {
        return Ok(client);
    }
    let built = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;
    let _ = CLIENT.set(built);
    CLIENT
        .get()
        .ok_or_else(|| "jina search client not initialized".to_string())
}

fn external_discovery_strategies<'a>(
    package: &'a SourceRulePackage,
) -> impl Iterator<Item = &'a nexus_core::SearchStrategyRule> + 'a {
    package
        .search_profile
        .as_ref()
        .into_iter()
        .flat_map(|profile| profile.strategies.iter())
        .filter(|strategy| {
            strategy.enabled
                && strategy.mode == nexus_core::SourceSearchMode::ExternalDiscovery
                && strategy.provider == "jina_search"
        })
}

async fn fetch_jina_search_hits(keyword: &str, site: &str) -> Result<Vec<JinaSearchHit>, String> {
    let encoded = url::form_urlencoded::byte_serialize(keyword.as_bytes()).collect::<String>();
    let client = jina_http_client()?;
    let response = client
        .get(format!("https://s.jina.ai/{encoded}"))
        .query(&[("site", site)])
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let payload = response
        .json::<serde_json::Value>()
        .await
        .map_err(|error| error.to_string())?;

    let items = payload
        .as_array()
        .cloned()
        .or_else(|| {
            payload
                .get("data")
                .and_then(|value| value.as_array())
                .cloned()
        })
        .or_else(|| {
            payload
                .get("results")
                .and_then(|value| value.as_array())
                .cloned()
        })
        .unwrap_or_default();

    Ok(items
        .into_iter()
        .filter_map(|item| {
            let url = item
                .get("url")
                .or_else(|| item.get("link"))
                .and_then(|value| value.as_str())?
                .to_string();
            Some(JinaSearchHit {
                url,
                title: item
                    .get("title")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
                content: item
                    .get("content")
                    .or_else(|| item.get("description"))
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string()),
            })
        })
        .collect())
}

async fn external_discovery_results(
    state: &AppState,
    packages: &[SourceRulePackage],
    keyword: &str,
) -> (Vec<BookItem>, Vec<SearchError>) {
    if keyword_looks_like_url(keyword) {
        return (Vec::new(), Vec::new());
    }

    let mut items = Vec::new();
    let mut errors = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();

    for package in packages {
        let Some(engine) = state.engine_registry.get_engine(&package.source.id) else {
            continue;
        };
        for strategy in external_discovery_strategies(package) {
            let fallback_host = Url::parse(&package.source.url)
                .ok()
                .and_then(|url| url.host_str().map(|value| value.to_string()));
            let site = strategy
                .book_url_matchers
                .iter()
                .find(|matcher| !matcher.trim().is_empty())
                .cloned()
                .or(fallback_host.clone());
            let Some(site) = site else {
                continue;
            };

            let query = strategy
                .query_template
                .as_ref()
                .map(|template| template.replace("{q}", keyword))
                .unwrap_or_else(|| format!("site:{site} {keyword}"));

            let hits = match fetch_jina_search_hits(&query, &site).await {
                Ok(hits) => hits,
                Err(error) => {
                    errors.push(SearchError {
                        source_id: package.source.id.clone(),
                        error: format!("jina_search failed: {error}"),
                    });
                    continue;
                },
            };

            for hit in hits {
                if !hit.url.contains(&site) {
                    continue;
                }
                if !seen_urls.insert(hit.url.clone()) {
                    continue;
                }
                let info = match engine.book_info(&hit.url).await {
                    Ok(info) => info,
                    Err(_) => continue,
                };
                if info.name.trim().is_empty() {
                    continue;
                }
                items.push(BookItem {
                    name: info.name,
                    author: Some(info.author),
                    cover_url: info.cover_url,
                    book_url: hit.url.into(),
                    intro: info.intro.or(hit.content.map(Into::into)),
                    source_id: package.source.id.clone().into(),
                    source_name: package.source.name.clone().into(),
                    latest_chapter: info.last_chapter.or(hit.title.map(Into::into)),
                    search_explain: Some(build_external_search_explain(
                        strategy.provider.clone(),
                        Some(format!("external discovery via {}", strategy.provider)),
                    )),
                });
            }
        }
    }

    (items, errors)
}

async fn runtime_search_packages(
    state: &AppState,
    requested_sources: &[String],
) -> Result<Vec<SourceRulePackage>, ApiErrorResponse> {
    let mut packages = state
        .store
        .list_source_packages()
        .await
        .map_err(|e| crate::error::internal_error(e.to_string()))?;

    if !requested_sources.is_empty() {
        packages.retain(|pkg| requested_sources.iter().any(|id| id == &pkg.source.id));
    }

    let mut filtered = Vec::new();
    for package in packages {
        let enabled = state
            .store
            .get_source_status(package.source.id.clone())
            .await
            .unwrap_or(true);
        let allow_search = package
            .import_policy
            .as_ref()
            .map(|it| it.allow_search)
            .unwrap_or(true);
        let profile_enabled = package
            .search_profile
            .as_ref()
            .map(|it| it.enabled)
            .unwrap_or_else(|| {
                package
                    .capabilities
                    .as_ref()
                    .map(|it| it.search_supported)
                    .unwrap_or(true)
            });
        if enabled && allow_search && profile_enabled {
            filtered.push(package);
        }
    }

    sort_packages_for_search(&mut filtered);

    Ok(filtered)
}

async fn direct_detail_results(
    state: &AppState,
    packages: &[SourceRulePackage],
    keyword: &str,
) -> Vec<BookItem> {
    if !keyword_looks_like_url(keyword) {
        return Vec::new();
    }
    let parsed = match Url::parse(keyword) {
        Ok(url) => url,
        Err(_) => return Vec::new(),
    };

    let mut items = Vec::new();
    for package in packages {
        let Some(profile) = package.search_profile.as_ref() else {
            continue;
        };
        let direct_enabled = profile.strategies.iter().any(|strategy| {
            strategy.enabled
                && strategy.mode == nexus_core::SourceSearchMode::DirectDetail
                && strategy
                    .book_url_matchers
                    .iter()
                    .any(|matcher| parsed.as_str().contains(matcher))
        });
        if !direct_enabled {
            continue;
        }

        let Some(engine) = state.engine_registry.get_engine(&package.source.id) else {
            continue;
        };
        let info: BookInfo = match engine.book_info(parsed.as_str()).await {
            Ok(info) => info,
            Err(_) => continue,
        };
        items.push(BookItem {
            name: info.name,
            author: Some(info.author),
            cover_url: info.cover_url,
            book_url: parsed.as_str().to_string().into(),
            intro: info.intro,
            source_id: package.source.id.clone().into(),
            source_name: package.source.name.clone().into(),
            latest_chapter: info.last_chapter,
            search_explain: Some(build_direct_detail_explain(Some(
                "matched direct detail URL".to_string(),
            ))),
        });
    }

    items
}

fn searchable_source_ids(packages: &[SourceRulePackage]) -> Vec<String> {
    packages
        .iter()
        .filter(|package| {
            package
                .search_profile
                .as_ref()
                .map(|profile| {
                    profile.strategies.iter().any(|strategy| {
                        strategy.enabled
                            && matches!(strategy.mode, nexus_core::SourceSearchMode::NativeSearch)
                    })
                })
                .unwrap_or(true)
        })
        .map(|package| package.source.id.clone())
        .collect()
}

/// Search across multiple sources (returns all results at once)
pub async fn search(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, ApiErrorResponse> {
    info!("Searching for '{}' in {:?}", req.keyword, req.sources);

    let packages = runtime_search_packages(&state, &req.sources).await?;
    let package_ranks = packages
        .iter()
        .map(|package| (package.source.id.clone(), package_search_rank(package)))
        .collect::<HashMap<_, _>>();
    let search_source_ids = searchable_source_ids(&packages);
    let mut all_results = direct_detail_results(&state, &packages, &req.keyword).await;
    let (external_results, mut external_errors) =
        external_discovery_results(&state, &packages, &req.keyword).await;
    all_results.extend(external_results);

    if search_source_ids.is_empty() && all_results.is_empty() {
        return Ok(Json(SearchResponse {
            results: vec![],
            total: 0,
            errors: vec![],
        }));
    }

    let mut errors = vec![];
    errors.append(&mut external_errors);

    if !search_source_ids.is_empty() {
        let mut rx = state
            .orchestrator
            .search(search_source_ids, req.keyword.clone());

        while let Some(result) = rx.recv().await {
            match result {
                crate::orchestrator::SearchResult::Item(item) => {
                    all_results.push(item);
                },
                crate::orchestrator::SearchResult::Error { source_id, error } => {
                    error!("Search failed for {}: {}", source_id, error);
                    errors.push(SearchError { source_id, error });
                },
                crate::orchestrator::SearchResult::Done => {
                    break;
                },
            }
        }
    }

    let total = all_results.len();
    annotate_result_rankings(&mut all_results, &req.keyword, &package_ranks);
    sort_results_for_keyword(&mut all_results, &req.keyword, &package_ranks);

    Ok(Json(SearchResponse {
        results: all_results,
        total,
        errors,
    }))
}

/// SSE 流式搜索 - 实时推送搜索结果
pub async fn search_stream(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, ApiErrorResponse> {
    info!("SSE Search for '{}' in {:?}", req.keyword, req.sources);

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(100);

    let packages = runtime_search_packages(&state, &req.sources).await?;
    let package_ranks = packages
        .iter()
        .map(|package| (package.source.id.clone(), package_search_rank(package)))
        .collect::<HashMap<_, _>>();
    let search_source_ids = searchable_source_ids(&packages);
    let mut direct_items = direct_detail_results(&state, &packages, &req.keyword).await;
    let (external_items, external_errors) =
        external_discovery_results(&state, &packages, &req.keyword).await;
    direct_items.extend(external_items);
    annotate_result_rankings(&mut direct_items, &req.keyword, &package_ranks);
    sort_results_for_keyword(&mut direct_items, &req.keyword, &package_ranks);

    // Spawn search task
    tokio::spawn(async move {
        if search_source_ids.is_empty() && direct_items.is_empty() {
            let event = SearchEvent::Done { total: 0 };
            let _ = tx
                .send(Ok(Event::default()
                    .event("done")
                    .data(serde_json::to_string(&event).unwrap_or_default())))
                .await;
            return;
        }

        let mut total = 0usize;
        for error in external_errors {
            let event = SearchEvent::Error {
                source_id: error.source_id,
                error: error.error,
            };
            if tx
                .send(Ok(Event::default()
                    .event("error")
                    .data(serde_json::to_string(&event).unwrap_or_default())))
                .await
                .is_err()
            {
                return;
            }
        }
        for item in direct_items {
            total += 1;
            let event = SearchEvent::Result { data: item };
            if tx
                .send(Ok(Event::default()
                    .event("result")
                    .data(serde_json::to_string(&event).unwrap_or_default())))
                .await
                .is_err()
            {
                return;
            }
        }

        let mut search_rx = if search_source_ids.is_empty() {
            None
        } else {
            Some(
                state
                    .orchestrator
                    .search(search_source_ids, req.keyword.clone()),
            )
        };

        while let Some(result) = match search_rx.as_mut() {
            Some(rx) => rx.recv().await,
            None => None,
        } {
            let event = match result {
                crate::orchestrator::SearchResult::Item(item) => {
                    let mut item = item;
                    annotate_result_rankings(
                        std::slice::from_mut(&mut item),
                        &req.keyword,
                        &package_ranks,
                    );
                    total += 1;
                    let event = SearchEvent::Result { data: item };
                    Event::default()
                        .event("result")
                        .data(serde_json::to_string(&event).unwrap_or_default())
                },
                crate::orchestrator::SearchResult::Error { source_id, error } => {
                    let event = SearchEvent::Error { source_id, error };
                    Event::default()
                        .event("error")
                        .data(serde_json::to_string(&event).unwrap_or_default())
                },
                crate::orchestrator::SearchResult::Done => {
                    let event = SearchEvent::Done { total };
                    Event::default()
                        .event("done")
                        .data(serde_json::to_string(&event).unwrap_or_default())
                },
            };

            if tx.send(Ok(event)).await.is_err() {
                // Client disconnected
                break;
            }
        }
    });

    Ok(Sse::new(ReceiverStream::new(rx)).keep_alive(KeepAlive::default()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use nexus_core::nxs::{
        BookRule, ContentRule, SearchItemFields, SearchRule, TocItemFields, TocRule,
    };
    use nexus_core::{
        NxsSource, SourceHealthReport, SourceHealthSegment, SourceHealthStatus, SourceImportPolicy,
        SourceRuleValidationReport,
    };
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
        BookItem {
            name: Arc::<str>::from(name),
            author: Some(Arc::<str>::from("tester")),
            cover_url: None,
            book_url: Arc::<str>::from(format!("https://{source_id}.example.com/book")),
            intro: Some(Arc::<str>::from("intro")),
            source_id: Arc::<str>::from(source_id),
            source_name: Arc::<str>::from(source_id),
            latest_chapter: None,
            search_explain: None,
        }
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
}
