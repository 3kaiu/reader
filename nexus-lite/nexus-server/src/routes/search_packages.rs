use std::collections::HashMap;

use nexus_core::SourceRulePackage;

use super::sort_packages_for_search;
use crate::app::AppState;
use crate::error::ApiErrorResponse;
use crate::routes::search::ranking::package_search_rank;

pub(super) fn build_package_ranks(packages: &[SourceRulePackage]) -> HashMap<String, i64> {
    packages
        .iter()
        .map(|package| (package.source.id.clone(), package_search_rank(package)))
        .collect()
}

pub(super) async fn runtime_search_packages(
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
