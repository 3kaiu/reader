use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use nexus_core::SourceRulePackage;
use tokio::sync::RwLock;

use super::sort_packages_for_search;
use crate::app::AppState;
use crate::error::ApiErrorResponse;
use crate::routes::search::ranking::package_search_rank;

const SEARCH_PACKAGE_SNAPSHOT_TTL: Duration = Duration::from_secs(30);
static SEARCH_PACKAGE_SNAPSHOT: LazyLock<RwLock<Option<SearchPackageSnapshot>>> =
    LazyLock::new(|| RwLock::new(None));

#[derive(Clone)]
struct SearchPackageSnapshot {
    created_at: Instant,
    packages: Vec<SourceRulePackage>,
}

pub(super) fn build_package_ranks(packages: &[SourceRulePackage]) -> HashMap<String, i64> {
    packages
        .iter()
        .map(|package| (package.source.id.clone(), package_search_rank(package)))
        .collect()
}

pub(super) async fn runtime_search_packages(
    state: &AppState,
    requested_sources: &[String],
    light_mode: bool,
) -> Result<Vec<SourceRulePackage>, ApiErrorResponse> {
    let mut packages = load_packages_for_search(state, requested_sources, light_mode).await?;

    if !requested_sources.is_empty() {
        packages.retain(|pkg| requested_sources.iter().any(|id| id == &pkg.source.id));
    }

    let mut filtered = Vec::new();
    for package in packages {
        let readiness = package.effective_readiness();
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
        let has_fallback_search_mode = package
            .search_profile
            .as_ref()
            .map(|profile| {
                profile.strategies.iter().any(|strategy| {
                    strategy.enabled
                        && matches!(
                            strategy.mode,
                            nexus_core::SourceSearchMode::DirectDetail
                                | nexus_core::SourceSearchMode::ExternalDiscovery
                        )
                })
            })
            .unwrap_or(false);
        if enabled
            && allow_search
            && profile_enabled
            && readiness.importable
            && (readiness.searchable || has_fallback_search_mode)
        {
            filtered.push(package);
        }
    }

    sort_packages_for_search(&mut filtered);

    Ok(filtered)
}

async fn load_packages_for_search(
    state: &AppState,
    requested_sources: &[String],
    light_mode: bool,
) -> Result<Vec<SourceRulePackage>, ApiErrorResponse> {
    if light_mode && !requested_sources.is_empty() {
        return load_requested_source_packages(state, requested_sources).await;
    }

    if !light_mode {
        return state
            .store
            .list_source_packages()
            .await
            .map_err(|e| crate::error::internal_error(e.to_string()));
    }

    if let Some(cached) = read_cached_packages().await {
        return Ok(cached);
    }

    let fresh = state
        .store
        .list_source_packages()
        .await
        .map_err(|e| crate::error::internal_error(e.to_string()))?;
    write_cached_packages(fresh.clone()).await;
    Ok(fresh)
}

async fn load_requested_source_packages(
    state: &AppState,
    requested_sources: &[String],
) -> Result<Vec<SourceRulePackage>, ApiErrorResponse> {
    let mut packages = Vec::with_capacity(requested_sources.len());
    for source_id in requested_sources {
        if let Some(package) = state
            .store
            .get_source_package(source_id.clone())
            .await
            .map_err(|e| crate::error::internal_error(e.to_string()))?
        {
            packages.push(package);
        }
    }
    Ok(packages)
}

async fn read_cached_packages() -> Option<Vec<SourceRulePackage>> {
    let guard = SEARCH_PACKAGE_SNAPSHOT.read().await;
    let snapshot = guard.as_ref()?;
    if snapshot.created_at.elapsed() > SEARCH_PACKAGE_SNAPSHOT_TTL {
        return None;
    }
    Some(snapshot.packages.clone())
}

async fn write_cached_packages(packages: Vec<SourceRulePackage>) {
    let mut guard = SEARCH_PACKAGE_SNAPSHOT.write().await;
    *guard = Some(SearchPackageSnapshot {
        created_at: Instant::now(),
        packages,
    });
}
