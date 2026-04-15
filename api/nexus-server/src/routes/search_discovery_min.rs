use nexus_core::{BookInfo, BookItem, SourceRulePackage};
use url::Url;

use super::{keyword_looks_like_url, AppState};
use crate::routes::search::ranking::build_direct_detail_explain;

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

        let Some(engine) = state.engine_registry.get_book_engine(&package.source.id) else {
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
