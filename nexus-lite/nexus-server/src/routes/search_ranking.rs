use super::*;

pub(super) fn package_search_rank(package: &SourceRulePackage) -> i64 {
    let health_score = (package.validation.health.overall_score * 1000.0).round() as i64;
    let recommended_bonus = if package.validation.health.recommended {
        20_000
    } else {
        0
    };
    let import_priority_bonus = package
        .import_policy
        .as_ref()
        .map(|policy| 2_000_i64.saturating_sub(policy.priority.max(0) as i64))
        .unwrap_or(0);
    let strategy_priority_bonus = package
        .search_profile
        .as_ref()
        .and_then(|profile| {
            profile
                .strategies
                .iter()
                .filter(|strategy| strategy.enabled)
                .map(|strategy| strategy.priority)
                .min()
        })
        .map(|priority| 1_000_i64.saturating_sub(priority as i64))
        .unwrap_or(0);

    recommended_bonus + health_score + import_priority_bonus + strategy_priority_bonus
}

pub(super) fn sort_packages_for_search(packages: &mut [SourceRulePackage]) {
    packages.sort_by(|a, b| {
        package_search_rank(b)
            .cmp(&package_search_rank(a))
            .then_with(|| a.source.id.cmp(&b.source.id))
    });
}

fn result_keyword_rank(item: &BookItem, keyword: &str) -> i64 {
    if keyword_looks_like_url(keyword) {
        return 0;
    }

    let keyword = keyword.trim().to_lowercase();
    if keyword.is_empty() {
        return 0;
    }

    let name = item.name.to_lowercase();
    let author = item
        .author
        .as_ref()
        .map(|value| value.to_lowercase())
        .unwrap_or_default();
    let intro = item
        .intro
        .as_ref()
        .map(|value| value.to_lowercase())
        .unwrap_or_default();

    let mut score = 0i64;
    if name == keyword {
        score += 10_000;
    } else if name.starts_with(&keyword) {
        score += 7_000;
    } else if name.contains(&keyword) {
        score += 5_000;
    }
    if author == keyword {
        score += 2_000;
    } else if author.contains(&keyword) {
        score += 800;
    }
    if intro.contains(&keyword) {
        score += 200;
    }
    score
}

fn build_search_explain(
    strategy: SearchExplainStrategy,
    provider: impl Into<String>,
    note: Option<String>,
) -> SearchExplain {
    SearchExplain {
        strategy,
        provider: provider.into().into(),
        match_score: None,
        package_rank: None,
        note: note.map(Into::into),
    }
}

pub(super) fn annotate_result_rankings(
    results: &mut [BookItem],
    keyword: &str,
    package_ranks: &HashMap<String, i64>,
) {
    for item in results {
        let match_score = result_keyword_rank(item, keyword);
        let package_rank = package_ranks
            .get(item.source_id.as_ref())
            .copied()
            .unwrap_or(0);
        let explain = item.search_explain.get_or_insert_with(|| SearchExplain {
            strategy: SearchExplainStrategy::NativeSearch,
            provider: "source_search".into(),
            match_score: None,
            package_rank: None,
            note: None,
        });
        explain.match_score = Some(match_score);
        explain.package_rank = Some(package_rank);
    }
}

pub(super) fn sort_results_for_keyword(
    results: &mut [BookItem],
    keyword: &str,
    package_ranks: &HashMap<String, i64>,
) {
    results.sort_by(|a, b| {
        let a_match_rank = result_keyword_rank(a, keyword);
        let b_match_rank = result_keyword_rank(b, keyword);
        let a_package_rank = package_ranks
            .get(a.source_id.as_ref())
            .copied()
            .unwrap_or(0);
        let b_package_rank = package_ranks
            .get(b.source_id.as_ref())
            .copied()
            .unwrap_or(0);
        b_match_rank
            .cmp(&a_match_rank)
            .then_with(|| b_package_rank.cmp(&a_package_rank))
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.source_id.cmp(&b.source_id))
    });
}

pub(super) fn build_external_search_explain(
    provider: impl Into<String>,
    note: Option<String>,
) -> SearchExplain {
    build_search_explain(SearchExplainStrategy::ExternalDiscovery, provider, note)
}

pub(super) fn build_direct_detail_explain(note: Option<String>) -> SearchExplain {
    build_search_explain(SearchExplainStrategy::DirectDetail, "book_info", note)
}
