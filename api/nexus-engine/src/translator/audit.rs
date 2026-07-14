//! Source quality audit — scores Legado sources, filters junk, classifies capability.
//!
//! Each source gets a quality score (0-100) and a capability classification
//! that determines which backend can execute it.

use nexus_core::legado::LegadoSource;

/// Source capability classification.
#[derive(Debug, Clone, PartialEq)]
pub enum SourceCapability {
    /// Pure CSS selectors only — can run in Rust native backend
    PureCss,
    /// Contains @js: or <js> blocks — needs JS runtime
    NeedsJsRuntime,
    /// Uses java.ajax() — needs async HTTP
    NeedsAsyncHttp,
    /// Uses java.startBrowser / webJs — needs browser
    NeedsBrowser,
    /// Uses java.* APIs — needs full java.* polyfill
    NeedsJavaPolyfill,
}

/// Audit result for a single source.
#[derive(Debug)]
pub struct SourceAudit {
    pub name: String,
    pub url: String,
    pub group: String,
    pub score: u32,
    pub capability: Vec<SourceCapability>,
    pub has_search: bool,
    pub has_explore: bool,
    pub has_js: bool,
    pub has_web_js: bool,
    pub has_browser: bool,
    pub has_encoding: bool,
    pub has_login: bool,
    pub has_cookie_jar: bool,
    pub has_content_cleaning: bool,
    pub has_pagination: bool,
    pub has_format_js: bool,
    pub has_pre_update_js: bool,
    pub has_next_toc: bool,
    pub book_source_type: i32,
    pub download_count: u64,
    pub issues: Vec<String>,
}

impl SourceAudit {
    pub fn is_usable(&self) -> bool {
        self.score >= 40 && self.has_content() && self.has_toc()
    }

    pub fn is_auto_enable(&self) -> bool {
        self.score >= 60 && self.has_content() && self.has_toc()
    }

    pub fn has_content(&self) -> bool {
        !self.issues.iter().any(|i| i.contains("missing content"))
    }

    pub fn has_toc(&self) -> bool {
        !self
            .issues
            .iter()
            .any(|i| i.contains("missing chapter list"))
    }

    pub fn recommended_backend(&self) -> &str {
        if self.has_web_js || self.has_browser {
            "browser"
        } else if self.has_js
            || self
                .capability
                .contains(&SourceCapability::NeedsJavaPolyfill)
        {
            "js-runtime"
        } else {
            "native"
        }
    }
}

/// Audit a single LegadoSource and return quality score + issues.
pub fn audit_source(source: &LegadoSource) -> SourceAudit {
    let mut score: u32 = 30; // Base score
    let mut issues: Vec<String> = Vec::new();
    let mut capability: Vec<SourceCapability> = Vec::new();

    // === Structural checks ===

    // Must have a name
    if source.book_source_name.is_empty() {
        issues.push("empty source name".to_string());
        score = score.saturating_sub(20);
    }

    // Must have a URL
    if source.book_source_url.is_empty() {
        issues.push("empty source URL".to_string());
        score = score.saturating_sub(20);
    } else if !source.book_source_url.starts_with("http") {
        issues.push("invalid source URL scheme".to_string());
        score = score.saturating_sub(10);
    } else {
        score += 10; // Valid URL
    }

    // Must have content rule
    let has_content = source
        .rule_content
        .as_ref()
        .and_then(|c| c.content.as_ref())
        .map(|c| !c.is_empty())
        .unwrap_or(false);
    if !has_content {
        issues.push("missing content rule".to_string());
        score = score.saturating_sub(30);
    } else {
        score += 15;
    }

    // Must have chapter list
    let has_chapter_list = source
        .rule_toc
        .as_ref()
        .and_then(|t| t.chapter_list.as_ref())
        .map(|c| !c.is_empty())
        .unwrap_or(false);
    if !has_chapter_list {
        issues.push("missing chapter list".to_string());
        score = score.saturating_sub(25);
    } else {
        score += 10;
    }

    // === Feature bonuses ===

    // Search support
    let has_search = source.search_url.is_some()
        || source
            .rule_search
            .as_ref()
            .and_then(|s| s.base.book_list.as_ref())
            .map(|b| !b.is_empty())
            .unwrap_or(false);
    if has_search {
        score += 15;
    }

    // Explore support
    let has_explore = source.explore_url.is_some()
        || source
            .rule_explore
            .as_ref()
            .and_then(|e| e.base.book_list.as_ref())
            .map(|b| !b.is_empty())
            .unwrap_or(false);
    if has_explore {
        score += 10;
    }

    // Custom headers
    if source.header.is_some() {
        score += 5;
    }

    // Content cleaning
    let has_cleaning = source
        .rule_content
        .as_ref()
        .and_then(|c| c.replace_regex.as_ref())
        .map(|r| !r.is_empty())
        .unwrap_or(false)
        || source
            .rule_content
            .as_ref()
            .and_then(|c| c.source_regex.as_ref())
            .map(|r| !r.is_empty())
            .unwrap_or(false);
    if has_cleaning {
        score += 5;
    }

    // Comment/documentation
    if source.book_source_comment.is_some() {
        score += 3;
    }

    // Group classification
    if source.book_source_group.is_some() {
        score += 2;
    }

    // Cookie jar (login session support)
    let has_cookie_jar = source.enabled_cookie_jar.unwrap_or(false);
    if has_cookie_jar {
        score += 3;
    }

    // === Capability detection ===

    // Check for JS blocks in rules
    let all_rule_text = collect_rule_text(source);
    let has_js = all_rule_text.contains("@js:") || all_rule_text.contains("<js>");
    let has_browser =
        all_rule_text.contains("java.startBrowser") || all_rule_text.contains("startBrowserAwait");
    let has_java = all_rule_text.contains("java.")
        || all_rule_text.contains("source.")
        || all_rule_text.contains("cookie.");
    let has_web_js = source
        .rule_content
        .as_ref()
        .and_then(|c| c.web_js.as_ref())
        .map(|w| !w.is_empty())
        .unwrap_or(false);
    let has_pagination = source
        .rule_content
        .as_ref()
        .and_then(|c| c.next_content_url.as_ref())
        .map(|n| !n.is_empty())
        .unwrap_or(false);
    let has_format_js = source
        .rule_toc
        .as_ref()
        .and_then(|t| t.format_js.as_ref())
        .map(|f| !f.is_empty())
        .unwrap_or(false);
    let has_pre_update_js = source
        .rule_toc
        .as_ref()
        .and_then(|t| t.pre_update_js.as_ref())
        .map(|p| !p.is_empty())
        .unwrap_or(false);
    let has_next_toc = source
        .rule_toc
        .as_ref()
        .and_then(|t| t.next_toc_url.as_ref())
        .map(|n| !n.is_empty())
        .unwrap_or(false);
    let has_encoding = all_rule_text.contains("charset")
        || all_rule_text.contains("gbk")
        || all_rule_text.contains("utf-8");

    // Login required
    let has_login = source.login_url.is_some() || source.login_ui.is_some();

    // Penalties
    if has_login {
        score = score.saturating_sub(10);
        issues.push("requires login".to_string());
    }
    if has_web_js {
        score = score.saturating_sub(5);
        issues.push("requires browser rendering".to_string());
    }
    if source.book_source_type == 3 {
        // Download-only source
        score = score.saturating_sub(15);
        issues.push("download-only source type".to_string());
    }

    // Capability classification
    if has_web_js || has_browser {
        capability.push(SourceCapability::NeedsBrowser);
    }
    if has_js || has_java {
        if all_rule_text.contains("java.ajax(") {
            capability.push(SourceCapability::NeedsAsyncHttp);
        }
        if has_java {
            capability.push(SourceCapability::NeedsJavaPolyfill);
        }
        capability.push(SourceCapability::NeedsJsRuntime);
    }
    if !has_js && !has_java && !has_web_js && !has_browser {
        capability.push(SourceCapability::PureCss);
    }

    // Capability bonuses
    if has_pagination {
        score += 5;
    }
    if has_format_js || has_pre_update_js {
        score += 5;
    }

    // Clamp score
    let score = score.min(100);

    SourceAudit {
        name: source.book_source_name.clone(),
        url: source.book_source_url.clone(),
        group: source.book_source_group.clone().unwrap_or_default(),
        score,
        capability,
        has_search,
        has_explore,
        has_js,
        has_web_js,
        has_browser,
        has_encoding,
        has_login,
        has_cookie_jar,
        has_content_cleaning: has_cleaning,
        has_pagination,
        has_format_js,
        has_pre_update_js,
        has_next_toc,
        book_source_type: source.book_source_type,
        download_count: 0,
        issues,
    }
}

/// Audit a batch of sources and return sorted results.
pub fn audit_batch(sources: &[LegadoSource]) -> Vec<SourceAudit> {
    let mut results: Vec<SourceAudit> = sources.iter().map(|s| audit_source(s)).collect();
    results.sort_by(|a, b| b.score.cmp(&a.score));
    results
}

/// Collect all rule text from a source for pattern matching.
fn collect_rule_text(source: &LegadoSource) -> String {
    let mut text = String::new();

    if let Some(url) = &source.search_url {
        text.push_str(url);
        text.push(' ');
    }
    if let Some(search) = &source.rule_search {
        if let Some(bl) = &search.base.book_list {
            text.push_str(bl);
            text.push(' ');
        }
        if let Some(c) = &search.check_key_word {
            text.push_str(c);
            text.push(' ');
        }
    }
    if let Some(info) = &source.rule_book_info {
        push_opt(&mut text, &info.name);
        push_opt(&mut text, &info.author);
        push_opt(&mut text, &info.intro);
        push_opt(&mut text, &info.cover_url);
        push_opt(&mut text, &info.toc_url);
    }
    if let Some(toc) = &source.rule_toc {
        push_opt(&mut text, &toc.chapter_list);
        push_opt(&mut text, &toc.chapter_name);
        push_opt(&mut text, &toc.chapter_url);
        push_opt(&mut text, &toc.format_js);
        push_opt(&mut text, &toc.pre_update_js);
        push_opt(&mut text, &toc.next_toc_url);
    }
    if let Some(content) = &source.rule_content {
        push_opt(&mut text, &content.content);
        push_opt(&mut text, &content.replace_regex);
        push_opt(&mut text, &content.web_js);
        push_opt(&mut text, &content.next_content_url);
    }
    if let Some(explore) = &source.rule_explore {
        push_opt(&mut text, &explore.base.book_list);
    }

    text
}

fn push_opt(text: &mut String, field: &Option<String>) {
    if let Some(v) = field {
        text.push_str(v);
        text.push(' ');
    }
}

/// Aggregate audit results into summary statistics.
#[derive(Debug, Default)]
pub struct AuditSummary {
    pub total: usize,
    pub usable: usize,
    pub auto_enable: usize,
    pub needs_browser: usize,
    pub needs_js: usize,
    pub pure_css: usize,
    pub has_search: usize,
    pub has_explore: usize,
    pub has_pagination: usize,
    pub has_login: usize,
    pub download_only: usize,
    pub avg_score: f64,
}

impl AuditSummary {
    pub fn from_audits(audits: &[SourceAudit]) -> Self {
        let total = audits.len();
        let usable = audits.iter().filter(|a| a.is_usable()).count();
        let auto_enable = audits.iter().filter(|a| a.is_auto_enable()).count();
        let needs_browser = audits
            .iter()
            .filter(|a| a.has_web_js || a.has_browser)
            .count();
        let needs_js = audits.iter().filter(|a| a.has_js && !a.has_browser).count();
        let pure_css = audits
            .iter()
            .filter(|a| a.capability.contains(&SourceCapability::PureCss))
            .count();
        let has_search = audits.iter().filter(|a| a.has_search).count();
        let has_explore = audits.iter().filter(|a| a.has_explore).count();
        let has_pagination = audits.iter().filter(|a| a.has_pagination).count();
        let has_login = audits.iter().filter(|a| a.has_login).count();
        let download_only = audits.iter().filter(|a| a.book_source_type == 3).count();
        let avg_score = if total > 0 {
            audits.iter().map(|a| a.score as f64).sum::<f64>() / total as f64
        } else {
            0.0
        };

        AuditSummary {
            total,
            usable,
            auto_enable,
            needs_browser,
            needs_js,
            pure_css,
            has_search,
            has_explore,
            has_pagination,
            has_login,
            download_only,
            avg_score,
        }
    }

    pub fn print(&self) {
        println!("=== Source Audit Summary ===");
        println!("  Total sources:     {}", self.total);
        println!("  Usable (score>=40): {}", self.usable);
        println!("  Auto-enable (>=60): {}", self.auto_enable);
        println!("  Pure CSS:          {}", self.pure_css);
        println!("  Needs JS runtime:  {}", self.needs_js);
        println!("  Needs browser:     {}", self.needs_browser);
        println!("  Has search:        {}", self.has_search);
        println!("  Has explore:       {}", self.has_explore);
        println!("  Has pagination:    {}", self.has_pagination);
        println!("  Has login:         {}", self.has_login);
        println!("  Download-only:     {}", self.download_only);
        println!("  Avg quality score: {:.1}", self.avg_score);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_source() -> LegadoSource {
        LegadoSource {
            book_source_name: "测试源".to_string(),
            book_source_url: "https://example.com".to_string(),
            book_source_group: Some("测试".to_string()),
            rule_content: Some(nexus_core::legado::ContentRule {
                content: Some("class.content@text".to_string()),
                ..Default::default()
            }),
            rule_toc: Some(nexus_core::legado::TocRule {
                chapter_list: Some("class.chapter@tag.a".to_string()),
                ..Default::default()
            }),
            header: Some("{}".to_string()),
            ..Default::default()
        }
    }

    #[test]
    fn test_basic_source_is_usable() {
        let source = make_test_source();
        let audit = audit_source(&source);
        assert!(audit.is_usable());
        assert!(audit.score >= 40);
    }

    #[test]
    fn test_missing_content_is_not_usable() {
        let source = LegadoSource {
            book_source_name: "坏源".to_string(),
            book_source_url: "https://bad.com".to_string(),
            ..Default::default()
        };
        let audit = audit_source(&source);
        assert!(!audit.is_usable());
        assert!(!audit.has_content());
    }

    #[test]
    fn test_has_js_detection() {
        let mut source = make_test_source();
        source.rule_search = Some(nexus_core::legado::SearchRule {
            base: nexus_core::legado::BookListRule {
                book_list: Some("@js: return []".to_string()),
                ..Default::default()
            },
            check_key_word: None,
        });
        let audit = audit_source(&source);
        assert!(audit.has_js);
    }

    #[test]
    fn test_score_bonus_for_search() {
        let mut source = make_test_source();
        source.search_url = Some("/search?q={{key}}".to_string());
        let audit = audit_source(&source);
        assert!(audit.has_search);
    }

    #[test]
    fn test_pure_css_classification() {
        let source = make_test_source();
        let audit = audit_source(&source);
        assert!(audit.capability.contains(&SourceCapability::PureCss));
    }

    #[test]
    fn test_browser_detection() {
        let mut source = make_test_source();
        source.rule_content = Some(nexus_core::legado::ContentRule {
            content: Some("class.content@text".to_string()),
            web_js: Some("document.querySelector('.content').innerHTML".to_string()),
            ..Default::default()
        });
        let audit = audit_source(&source);
        assert!(audit.has_web_js);
        assert_eq!(audit.recommended_backend(), "browser");
    }

    #[test]
    fn test_login_penalty() {
        let mut source = make_test_source();
        source.login_url = Some("https://example.com/login".to_string());
        let audit = audit_source(&source);
        assert!(audit.has_login);
        assert!(audit.score <= 65); // Login penalty applied
    }

    #[test]
    fn test_audit_summary() {
        let sources = vec![make_test_source(), make_test_source()];
        let audits = audit_batch(&sources);
        let summary = AuditSummary::from_audits(&audits);
        assert_eq!(summary.total, 2);
        assert_eq!(summary.auto_enable, 2); // Both should be auto-enable
    }
}
