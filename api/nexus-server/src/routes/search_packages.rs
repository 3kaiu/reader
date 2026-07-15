use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use nexus_core::nxs::{
    BookRule, ContentRule, NxsSource, SearchItemFields, SearchRule, TocItemFields, TocRule,
};
use nexus_core::{SourceHealthReport, SourceRulePackage, SourceRuleValidationReport};
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

    // Auto-select high-health sources when no specific sources requested
    let auto_select_enabled = requested_sources.is_empty();

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

        // Auto-select: skip sources with low health score (but allow unprobed sources through)
        if auto_select_enabled {
            let health_score = package.validation.health.overall_score;
            // Allow sources with no health data (score = 0) or high health score
            // Skip sources with low health score (< 0.3)
            if health_score > 0.0 && health_score < 0.3 {
                continue;
            }
        }

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

    // Try to load from sled store first (pre-built packages)
    let mut packages = state
        .store
        .list_source_packages()
        .await
        .unwrap_or_default();

    // Also build packages from Legado sources (dynamic)
    let legado_packages = build_packages_from_legado_sources(state).await;
    packages.extend(legado_packages);

    // Also build packages from NXS sources (dynamic)
    let nxs_packages = build_packages_from_nxs_sources(state).await;
    packages.extend(nxs_packages);

    if packages.is_empty() {
        return Ok(packages);
    }

    // Deduplicate by source ID
    let mut seen = std::collections::HashSet::new();
    packages.retain(|pkg| seen.insert(pkg.source.id.clone()));

    if !light_mode {
        if let Some(cached) = read_cached_packages().await {
            // Merge with cached, preferring fresh data
            let cached_ids: std::collections::HashSet<String> =
                cached.iter().map(|p| p.source.id.clone()).collect();
            for pkg in &packages {
                if !cached_ids.contains(&pkg.source.id) {
                    // New package, add to cache
                }
            }
        }
        write_cached_packages(packages.clone()).await;
    }

    Ok(packages)
}

/// Build SourceRulePackages from Legado sources dynamically
async fn build_packages_from_legado_sources(
    state: &AppState,
) -> Vec<SourceRulePackage> {
    let legado_sources = state.engine_registry.legado_store.get_all();
    let mut packages = Vec::with_capacity(legado_sources.len());

    for source in legado_sources {
        let source_id = source.infer_id();

        // Check if source is enabled
        let enabled = state
            .store
            .get_source_status(source_id.clone())
            .await
            .unwrap_or(true);
        if !enabled {
            continue;
        }

        // Build a minimal NxsSource from LegadoSource
        let nxs_source = NxsSource {
            version: 1,
            id: source_id.clone(),
            name: source.book_source_name.clone(),
            url: source.book_source_url.clone(),
            search: SearchRule {
                path: source.search_url.clone().unwrap_or_default(),
                method: "GET".to_string(),
                body: None,
                encoding: None,
                list: source
                    .rule_search
                    .as_ref()
                    .and_then(|r| r.base.book_list.clone())
                    .unwrap_or_default(),
                result_filter: None,
                item: SearchItemFields {
                    name: source
                        .rule_search
                        .as_ref()
                        .and_then(|r| r.base.name.clone())
                        .unwrap_or_default(),
                    author: source
                        .rule_search
                        .as_ref()
                        .and_then(|r| r.base.author.clone()),
                    url: source
                        .rule_search
                        .as_ref()
                        .and_then(|r| r.base.book_url.clone())
                        .unwrap_or_default(),
                    cover: source
                        .rule_search
                        .as_ref()
                        .and_then(|r| r.base.cover_url.clone()),
                    intro: source
                        .rule_search
                        .as_ref()
                        .and_then(|r| r.base.intro.clone()),
                },
            },
            book: BookRule {
                name: source
                    .rule_book_info
                    .as_ref()
                    .and_then(|r| r.name.clone())
                    .unwrap_or_default(),
                author: source
                    .rule_book_info
                    .as_ref()
                    .and_then(|r| r.author.clone()),
                intro: source
                    .rule_book_info
                    .as_ref()
                    .and_then(|r| r.intro.clone()),
                cover: source
                    .rule_book_info
                    .as_ref()
                    .and_then(|r| r.cover_url.clone()),
                toc: source
                    .rule_book_info
                    .as_ref()
                    .and_then(|r| r.toc_url.clone()),
            },
            toc: TocRule {
                list: source
                    .rule_toc
                    .as_ref()
                    .and_then(|r| r.chapter_list.clone())
                    .unwrap_or_default(),
                reverse: false,
                item: TocItemFields {
                    name: source
                        .rule_toc
                        .as_ref()
                        .and_then(|r| r.chapter_name.clone())
                        .unwrap_or_else(|| "text".to_string()),
                    url: source
                        .rule_toc
                        .as_ref()
                        .and_then(|r| r.chapter_url.clone())
                        .unwrap_or_else(|| "href".to_string()),
                },
            },
            content: ContentRule {
                body: source
                    .rule_content
                    .as_ref()
                    .and_then(|r| r.content.clone())
                    .unwrap_or_default(),
                filter: vec![],
                visible_only: false,
                script: None,
                script_enabled: false,
                replace: vec![],
                clean: None,
                pagination: None,
                font_decrypt: None,
                validation: None,
            },
            protection: None,
            headers: None,
            extra: None,
        };

        // Build health report from tracker
        let mut health = SourceHealthReport::default();
        if let Some(ht) = state.store.health_tracker().get(&source_id) {
            let total = ht.success_count + ht.failure_count;
            if total > 0 {
                health.overall_score = ht.success_count as f64 / total as f64;
                health.recommended = health.overall_score >= 0.8;
            }
        }

        // Set health segment statuses (default to Pass for newly built packages)
        health.search.status = nexus_core::SourceHealthStatus::Pass;
        health.book.status = nexus_core::SourceHealthStatus::Pass;
        health.toc.status = nexus_core::SourceHealthStatus::Pass;
        health.content.status = nexus_core::SourceHealthStatus::Pass;

        // Build validation report
        let validation = SourceRuleValidationReport {
            valid: true,
            compile_ok: true,
            warnings: vec![],
            errors: vec![],
            score: health.overall_score,
            steps: vec![],
            importable: true,
            manual_review_required: false,
            health,
            last_validated_at_ms: Some(chrono::Utc::now().timestamp_millis()),
        };

        let mut package = SourceRulePackage {
            package_id: source_id.clone(),
            engine_version: "1.0.0".to_string(),
            generated_at_ms: chrono::Utc::now().timestamp_millis(),
            generator: "legado-adapter".to_string(),
            source: nxs_source,
            validation,
            readiness: Default::default(),
            tags: vec!["legado".to_string()],
            metadata: Default::default(),
            capabilities: None,
            import_policy: None,
            search_profile: None,
        };

        package.refresh_readiness();
        packages.push(package);
    }

    packages
}

/// Build SourceRulePackages from NXS sources dynamically
async fn build_packages_from_nxs_sources(
    state: &AppState,
) -> Vec<SourceRulePackage> {
    let nxs_sources = state.engine_registry.nxs_store.get_all();
    let mut packages = Vec::with_capacity(nxs_sources.len());

    for source in nxs_sources {
        let source_id = source.id.clone();

        // Check if source is enabled
        let enabled = state
            .store
            .get_source_status(source_id.clone())
            .await
            .unwrap_or(true);
        if !enabled {
            continue;
        }

        // Build health report from tracker
        let mut health = SourceHealthReport::default();
        if let Some(ht) = state.store.health_tracker().get(&source_id) {
            let total = ht.success_count + ht.failure_count;
            if total > 0 {
                health.overall_score = ht.success_count as f64 / total as f64;
                health.recommended = health.overall_score >= 0.8;
            }
        }

        // Set health segment statuses (default to Pass for newly built packages)
        health.search.status = nexus_core::SourceHealthStatus::Pass;
        health.book.status = nexus_core::SourceHealthStatus::Pass;
        health.toc.status = nexus_core::SourceHealthStatus::Pass;
        health.content.status = nexus_core::SourceHealthStatus::Pass;

        // Build validation report
        let validation = SourceRuleValidationReport {
            valid: true,
            compile_ok: true,
            warnings: vec![],
            errors: vec![],
            score: health.overall_score,
            steps: vec![],
            importable: true,
            manual_review_required: false,
            health,
            last_validated_at_ms: Some(chrono::Utc::now().timestamp_millis()),
        };

        let mut package = SourceRulePackage {
            package_id: source_id.clone(),
            engine_version: "1.0.0".to_string(),
            generated_at_ms: chrono::Utc::now().timestamp_millis(),
            generator: "nxs-native".to_string(),
            source,
            validation,
            readiness: Default::default(),
            tags: vec!["nxs".to_string()],
            metadata: Default::default(),
            capabilities: None,
            import_policy: None,
            search_profile: None,
        };

        package.refresh_readiness();
        packages.push(package);
    }

    packages
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
