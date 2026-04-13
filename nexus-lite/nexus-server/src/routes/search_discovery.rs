use std::collections::HashSet;
use std::sync::OnceLock;

use nexus_core::{BookInfo, BookItem, SourceRulePackage};
use url::Url;

use super::{keyword_looks_like_url, AppState, SearchError};
use crate::routes::search::ranking::{build_direct_detail_explain, build_external_search_explain};

#[derive(Debug, Clone)]
pub(super) struct JinaSearchHit {
    pub(super) url: String,
    pub(super) title: Option<String>,
    pub(super) content: Option<String>,
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

pub(super) async fn external_discovery_results(
    state: &AppState,
    packages: &[SourceRulePackage],
    keyword: &str,
) -> (Vec<BookItem>, Vec<SearchError>) {
    if keyword_looks_like_url(keyword) {
        return (Vec::new(), Vec::new());
    }

    let mut items = Vec::new();
    let mut errors = Vec::new();
    let mut seen_urls = HashSet::new();

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
                    package_id: None,
                });
            }
        }
    }

    (items, errors)
}

pub(super) async fn direct_detail_results(
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
            package_id: None,
        });
    }

    items
}

pub(super) fn searchable_source_ids(packages: &[SourceRulePackage]) -> Vec<String> {
    packages
        .iter()
        .filter(|package| {
            let readiness = package.effective_readiness();
            readiness.importable
                && readiness.searchable
                && package
                    .search_profile
                    .as_ref()
                    .map(|profile| {
                        profile.strategies.iter().any(|strategy| {
                            strategy.enabled
                                && matches!(
                                    strategy.mode,
                                    nexus_core::SourceSearchMode::NativeSearch
                                )
                        })
                    })
                    .unwrap_or(true)
        })
        .map(|package| package.source.id.clone())
        .collect()
}
