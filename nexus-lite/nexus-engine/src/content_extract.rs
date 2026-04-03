//! Content extraction helpers for NXS engines.
//!
//! Goal: turn an extracted content DOM element into structured (paragraph-ish)
//! plain text, while applying basic filter/visibility constraints and providing
//! a readability-like fallback.
//!
//! Enhanced with advanced content cleaning:
//! - Zero-width character removal
//! - Text deduplication
//! - Font decryption support

use scraper::{ElementRef, Html, Selector};
use std::sync::LazyLock;

// Import dynamic noise detection and ML scoring
use crate::dynamic_noise::{DynamicNoiseDetector, ExtractionContext};
use crate::ml_scorer::{EnsembleScorer, FeatureExtractor};
use crate::readability_wrapper::ReadabilityExtractor;

// Import enhanced content cleaning modules
use crate::text_cleaner::{CleanConfig as TextCleanConfig, TextCleaner};
use crate::text_dedup::{DedupConfig, TextDeduplicator};

#[derive(Debug, Clone)]
pub struct ContentExtractConfig<'a> {
    pub filter_selectors: &'a [Selector],
    pub visible_only: bool,
}

fn normalize_whitespace_keep_newlines(input: &str) -> String {
    // Collapse whitespace other than '\n' into single spaces.
    let mut out = String::with_capacity(input.len());
    let mut last_was_space = false;
    for ch in input.chars() {
        if ch == '\n' || ch == '\r' {
            if !last_was_space {
                // keep as-is; we'll trim later
            }
            out.push('\n');
            last_was_space = false;
            continue;
        }

        if ch.is_whitespace() {
            if !last_was_space {
                out.push(' ');
                last_was_space = true;
            }
        } else {
            out.push(ch);
            last_was_space = false;
        }
    }
    out.trim().to_string()
}

fn is_hidden_element(el: &ElementRef<'_>, config: &ContentExtractConfig<'_>) -> bool {
    if !config.visible_only {
        return false;
    }

    if let Some(hidden) = el.value().attr("hidden") {
        if !hidden.is_empty() && hidden != "false" {
            return true;
        }
    }

    if let Some(aria_hidden) = el.value().attr("aria-hidden") {
        if aria_hidden.eq_ignore_ascii_case("true") {
            return true;
        }
    }

    if let Some(style) = el.value().attr("style") {
        let s = style.to_ascii_lowercase();
        if s.contains("display:none")
            || s.contains("visibility:hidden")
            || s.contains("visibility: hidden")
            || s.contains("opacity:0")
        {
            return true;
        }
    }

    if let Some(class) = el.value().attr("class") {
        let c = class.to_ascii_lowercase();
        if c.contains("hidden") || c.contains("sr-only") {
            return true;
        }
    }

    false
}

fn matches_any_filter(el: &ElementRef<'_>, selectors: &[Selector]) -> bool {
    selectors.iter().any(|sel| sel.matches(el))
}

fn is_block_tag(name: &str) -> bool {
    matches!(
        name,
        "p" | "li" | "blockquote" | "dd" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "pre"
    )
}

fn collect_leaf_text<'a>(
    el: ElementRef<'a>,
    config: &ContentExtractConfig<'_>,
    hidden_ancestor: bool,
    out: &mut Vec<String>,
) {
    if hidden_ancestor
        || matches_any_filter(&el, config.filter_selectors)
        || is_hidden_element(&el, config)
    {
        return;
    }

    if el.value().name() == "br" {
        out.push("\n".to_string());
        return;
    }

    let mut has_element_children = false;
    for child in el.child_elements() {
        has_element_children = true;
        collect_leaf_text(child, config, hidden_ancestor, out);
    }

    // When there are no element-children, scraper's leaf node `.text()` is effectively direct text.
    if !has_element_children {
        let txt = normalize_whitespace_keep_newlines(&el.text().collect::<Vec<_>>().join(""));
        if !txt.is_empty() {
            out.push(txt);
        }
    }
}

fn extract_paragraph_from_block<'a>(
    block_el: ElementRef<'a>,
    block_tag: &str,
    config: &ContentExtractConfig<'_>,
) -> Option<String> {
    let mut parts = Vec::<String>::new();
    collect_leaf_text(block_el, config, false, &mut parts);
    if parts.is_empty() {
        return None;
    }

    let joined = parts.join("");
    let normalized = normalize_whitespace_keep_newlines(&joined);
    if normalized.is_empty() {
        None
    } else {
        // Keep list items recognizable; avoid heavy formatting but add a bullet prefix.
        if block_tag.eq_ignore_ascii_case("li") {
            if normalized.starts_with('•') || normalized.starts_with('-') {
                Some(normalized)
            } else {
                Some(format!("• {}", normalized))
            }
        } else if block_tag.eq_ignore_ascii_case("blockquote") {
            // Quote formatting: prefix each line.
            let lines: Vec<&str> = normalized.split('\n').collect();
            if lines.is_empty() {
                Some(normalized)
            } else {
                Some(
                    lines
                        .into_iter()
                        .map(|l| format!("> {}", l.trim_end()))
                        .collect::<Vec<_>>()
                        .join("\n"),
                )
            }
        } else if block_tag.eq_ignore_ascii_case("pre") {
            // Keep code-like blocks separated.
            // Do not add an extra trailing newline here; the outer join
            // already inserts paragraph separators.
            Some(normalized)
        } else {
            Some(normalized)
        }
    }
}

fn extract_list_group<'a>(
    list_el: ElementRef<'a>,
    config: &ContentExtractConfig<'_>,
) -> Option<String> {
    let mut items: Vec<String> = Vec::new();
    for li in list_el.child_elements() {
        if li.value().name().eq_ignore_ascii_case("li") {
            // Reuse the `li` formatting rule (bullet prefix).
            if let Some(item_text) = extract_paragraph_from_block(li, "li", config) {
                // Avoid extra blank lines inside list.
                let item_text = item_text.trim().to_string();
                if !item_text.is_empty() {
                    items.push(item_text);
                }
            }
        }
    }

    if items.is_empty() {
        None
    } else {
        // Keep items close to each other; the outer join will add paragraph separation.
        Some(items.join("\n"))
    }
}

/// Extract structured text (paragraph-ish) from a selected root element.
///
/// This walks the subtree, and whenever it finds a block tag (`p`, `li`, `h1`-`h6`, `pre`)
/// it extracts text from that block, then joins blocks with `\n\n`.
pub fn extract_structured_text_from_root<'a>(
    root: ElementRef<'a>,
    config: &ContentExtractConfig<'_>,
) -> String {
    let mut paragraphs: Vec<String> = Vec::new();

    // Depth-first traversal. For block tags, we extract them as one paragraph
    // and don't recurse further into their children to avoid double counting.
    fn dfs<'b>(
        el: ElementRef<'b>,
        config: &ContentExtractConfig<'_>,
        paragraphs: &mut Vec<String>,
        hidden_ancestor: bool,
    ) {
        if hidden_ancestor
            || matches_any_filter(&el, config.filter_selectors)
            || is_hidden_element(&el, config)
        {
            return;
        }

        let name = el.value().name();
        // Lists: treat `ul/ol` as one group to reduce paragraph fragmentation.
        if name.eq_ignore_ascii_case("ul") || name.eq_ignore_ascii_case("ol") {
            if let Some(list_group) = extract_list_group(el, config) {
                if !list_group.trim().is_empty() {
                    paragraphs.push(list_group);
                }
            }
            return;
        }

        if is_block_tag(name) {
            if let Some(p) = extract_paragraph_from_block(el, name, config) {
                paragraphs.push(p);
            }
            return;
        }

        for child in el.child_elements() {
            dfs(child, config, paragraphs, hidden_ancestor || is_hidden_element(&child, config));
        }
    }

    dfs(root, config, &mut paragraphs, false);

    if paragraphs.is_empty() {
        // Fallback: inline extraction by leaf text.
        let mut parts = Vec::<String>::new();
        collect_leaf_text(root, config, false, &mut parts);
        let joined = parts.join("");
        return normalize_whitespace_keep_newlines(&joined);
    }

    paragraphs
        .into_iter()
        .map(|p| normalize_whitespace_keep_newlines(&p))
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// Post-process extracted content:
/// - trim paragraphs
/// - remove obvious non-content "noise" short paragraphs
/// - collapse excessive blank lines
/// - smart paragraph merging based on context
pub fn post_clean_content(text: String) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return trimmed.to_string();
    }

    // First, apply smart paragraph merging before noise removal
    let merged_text = smart_merge_paragraphs(trimmed);

    // Then apply noise removal and cleanup
    let cleaned = remove_noise_paragraphs(&merged_text);

    // Finally, collapse excessive blank lines
    let mut final_text = cleaned.trim().to_string();
    while final_text.contains("\n\n\n") {
        final_text = final_text.replace("\n\n\n", "\n\n");
    }
    final_text
}

/// Enhanced post-process with advanced content cleaning:
/// - Zero-width character removal
/// - Text deduplication
/// - Unicode normalization
/// - All standard post_clean_content features
pub fn post_clean_content_enhanced(
    text: String,
    clean_config: Option<&nexus_core::nxs::CleanConfig>,
) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return trimmed.to_string();
    }

    // Apply enhanced text cleaning
    let cleaned = if let Some(config) = clean_config {
        apply_enhanced_cleaning(trimmed, config)
    } else {
        // Default enhanced cleaning
        apply_default_enhanced_cleaning(trimmed)
    };

    // Apply standard post-processing
    post_clean_content(cleaned)
}

/// Apply enhanced cleaning with configuration
fn apply_enhanced_cleaning(text: &str, config: &nexus_core::nxs::CleanConfig) -> String {
    let cleaner = TextCleaner::with_config(TextCleanConfig {
        remove_zero_width: config.remove_zero_width,
        remove_control_chars: config.remove_control_chars,
        unicode_normalize: config.unicode_normalize,
        normalize_whitespace: config.normalize_whitespace,
    });

    let mut result = cleaner.clean(text);

    // Apply deduplication if configured
    if let Some(dedup_config) = &config.dedup {
        let deduplicator = TextDeduplicator::with_config(DedupConfig {
            threshold: dedup_config.threshold,
            min_length: dedup_config.min_length,
            max_length_diff_ratio: dedup_config.max_length_diff_ratio,
            use_jaro_winkler: false,
        });

        let paragraphs: Vec<String> = result.lines().map(|s| s.to_string()).collect();

        let deduped = deduplicator.deduplicate(&paragraphs);
        result = deduped.join("\n");
    }

    result
}

/// Apply default enhanced cleaning (zero-width removal + normalization)
fn apply_default_enhanced_cleaning(text: &str) -> String {
    TextCleaner::clean_for_novel(text)
}

/// Smart paragraph merging based on context and sentence completeness
fn smart_merge_paragraphs(text: &str) -> String {
    let paragraphs: Vec<&str> = text.split("\n\n").collect();
    if paragraphs.len() <= 1 {
        return text.to_string();
    }

    let mut merged = Vec::new();
    let mut current = String::new();

    for (i, para) in paragraphs.iter().enumerate() {
        let trimmed = para.trim();
        if trimmed.is_empty() {
            continue;
        }

        if current.is_empty() {
            current = trimmed.to_string();
            continue;
        }

        // Check if we should merge this paragraph with the previous one
        if should_merge_paragraphs(&current, trimmed, i == paragraphs.len() - 1) {
            current.push(' ');
            current.push_str(trimmed);
        } else {
            merged.push(current);
            current = trimmed.to_string();
        }
    }

    if !current.is_empty() {
        merged.push(current);
    }

    merged.join("\n\n")
}

/// Determine if two paragraphs should be merged based on context
fn should_merge_paragraphs(prev: &str, next: &str, is_last: bool) -> bool {
    // Rule 1: Short paragraphs at the end often belong together
    if is_last && next.chars().count() < 50 {
        return true;
    }

    // Rule 2: Check if previous paragraph ends with a complete sentence
    let prev_ends_with_sentence = ends_with_sentence(prev);

    // Rule 3: Check if next paragraph starts with lowercase (continuation)
    let next_starts_lowercase = next.chars().next().map_or(false, |c| c.is_lowercase());

    // Rule 4: Check for common continuation patterns
    let continuation_patterns = ["...", "——", "—", "—", "…"];
    let has_continuation_marker = continuation_patterns.iter().any(|p| prev.ends_with(p));

    // Rule 5: Check content density (avoid merging if both are substantial)
    let prev_len = prev.chars().count();
    let next_len = next.chars().count();
    let both_substantial = prev_len > 200 && next_len > 200;

    // Decision logic
    if has_continuation_marker {
        return true; // Continuation marker always merge
    }

    if !prev_ends_with_sentence && next_starts_lowercase {
        return true; // Incomplete sentence + lowercase start = continuation
    }

    if !prev_ends_with_sentence && !next_starts_lowercase && next_len < 80 {
        return true; // Incomplete sentence + short next paragraph
    }

    if both_substantial {
        return false; // Both paragraphs are substantial, keep separate
    }

    false
}

/// Check if text ends with a complete sentence
fn ends_with_sentence(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }

    // Chinese sentence endings
    let chinese_endings = ['。', '！', '？', '；', '…'];
    // Western sentence endings
    let western_endings = ['.', '!', '?', ';'];

    let last_char = trimmed.chars().last().unwrap();

    chinese_endings.contains(&last_char) || western_endings.contains(&last_char)
}

/// Remove noise paragraphs with enhanced detection
fn remove_noise_paragraphs(text: &str) -> String {
    let paragraphs: Vec<&str> = text.split("\n\n").collect();
    let noise_keywords = [
        // 导航类
        "下一章",
        "上一章",
        "下一页",
        "上一页",
        "下一回",
        "上一回",
        "目录",
        "章节目录",
        "返回",
        "返回顶部",
        "返回首页",
        "首页",
        "书页",
        "书签",
        // 营销类
        "广告",
        "会员",
        "VIP",
        "订阅",
        "打赏",
        "充值",
        "付费",
        "付费章节",
        "VIP章节",
        "会员章节",
        // 操作类
        "点击",
        "下载",
        "加入书架",
        "收藏",
        "分享",
        "评论",
        "举报",
        "举报内容",
        "投诉",
        "反馈",
        // 提示类
        "温馨提示",
        "精彩继续",
        "立即阅读",
        "继续阅读",
        "本章未完",
        "未完待续",
        "请继续阅读",
        "请点击",
        "点击继续",
        // 推广类
        "推荐阅读",
        "热门推荐",
        "相关推荐",
        "猜你喜欢",
        "同类推荐",
        "好书推荐",
        "精选推荐",
        // 社交类
        "点赞",
        "收藏本站",
        "加入收藏",
        "设为首页",
        "手机阅读",
        "APP下载",
        "扫码阅读",
        // 版权类
        "版权声明",
        "免责声明",
        "侵权举报",
        "联系方式",
        "联系我们",
        // 技术类
        "正在加载",
        "加载中",
        "刷新页面",
        "刷新",
        "重新加载",
        // 常见小说网站噪音
        "本章完",
        "本章结束",
        "完",
        "全本完",
        "全文完",
        "完本",
        "完结",
        "已完结",
        // 广告相关
        "赞助商",
        "赞助商链接",
        "广告位",
        "广告合作",
        "商务合作",
        // 域名/推广
        "www.",
        "http://",
        "https://",
        ".com",
        ".cn",
        ".net",
        ".org",
        // 常见按钮文本
        "确定",
        "取消",
        "关闭",
        "提交",
        "发送",
        "搜索",
        "登录",
        "注册",
    ];

    let lowered_keywords: Vec<String> = noise_keywords
        .iter()
        .map(|k| k.to_ascii_lowercase())
        .collect();

    // Initialize dynamic noise detector
    let noise_detector = DynamicNoiseDetector::new();

    fn strip_zero_width_chars(s: &str) -> String {
        // Remove common zero-width / formatting characters without new deps.
        // Keep '\n' intact (we rely on it as delimiter upstream).
        s.chars()
            .filter(|&ch| match ch {
                '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{2060}' | '\u{FEFF}' => false,
                _ => true,
            })
            .collect()
    }

    fn normalize_para(s: &str) -> String {
        let cleaned = strip_zero_width_chars(s);
        let s = cleaned.trim();
        let mut out = String::with_capacity(s.len());
        let mut last_was_space = false;
        for ch in s.chars() {
            if ch.is_whitespace() {
                if !last_was_space {
                    out.push(' ');
                    last_was_space = true;
                }
            } else {
                out.push(ch);
                last_was_space = false;
            }
        }
        out.trim().to_string()
    }

    fn dedup_key(s: &str) -> String {
        // Remove leading bullet/quote markers for better equality.
        let x = s
            .trim()
            .trim_start_matches(|c| c == '•' || c == '-' || c == '*' || c == '>' || c == ' ');
        normalize_para(x)
    }

    fn punctuation_count(s: &str) -> usize {
        s.chars()
            .filter(|c| {
                matches!(
                    c,
                    '。' | '！'
                        | '？'
                        | '；'
                        | '，'
                        | '、'
                        | '!'
                        | '?'
                        | ';'
                        | ','
                        | '.'
                        | ':'
                        | '—'
                        | '-'
                )
            })
            .count()
    }

    fn classify_noise(len_chars: usize, noise_hits: usize) -> u8 {
        // 0=keep, 1=maybe-delete (use context), 2=aggressively delete
        if noise_hits == 0 {
            return 0;
        }
        if (noise_hits >= 2 && len_chars < 200) || (noise_hits >= 1 && len_chars < 90) {
            2
        } else {
            // Even if it is longer, single noise hits are often wrapper text.
            // We only delete after applying context constraints.
            1
        }
    }

    fn starts_with_noise<'a>(s: &str, keywords: &'a [&'a str]) -> Option<&'a str> {
        let t = s.trim_start();
        for k in keywords {
            if t.starts_with(k) {
                return Some(*k);
            }
        }
        None
    }

    fn is_long_content(len_chars: usize, punct: usize, noise_hits: usize) -> bool {
        // Avoid over-deleting: if neighbors look like real reading text,
        // keep level-1 noise paragraphs with light trimming.
        len_chars > 250 && punct > 10 && noise_hits == 0
    }

    fn strip_noise_prefix(mut s: String, keywords: &[&str]) -> String {
        if let Some(k) = starts_with_noise(&s, keywords) {
            s = s.trim_start_matches(k).trim().to_string();
        }
        s
    }

    // Precompute paragraph features.
    // tuple: (len_chars, punct_count, noise_hits, noise_level)
    let mut features: Vec<(usize, usize, usize, u8)> = Vec::with_capacity(paragraphs.len());
    for para in paragraphs.iter() {
        let p = normalize_para(para);
        if p.is_empty() {
            features.push((0, 0, 0, 0));
            continue;
        }
        let len = p.chars().count();
        let punct = punctuation_count(&p);
        let lower = p.to_ascii_lowercase();
        let mut noise_hits = 0usize;
        for (i, k_lower) in lowered_keywords.iter().enumerate() {
            let k = noise_keywords[i];
            if p.contains(k) || lower.contains(k_lower.as_str()) {
                noise_hits += 1;
            }
        }
        let level = classify_noise(len, noise_hits);
        features.push((len, punct, noise_hits, level));
    }

    let mut kept: Vec<String> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (idx, para) in paragraphs.iter().enumerate() {
        let mut p = normalize_para(para);
        if p.is_empty() {
            continue;
        }

        let (len, punct, noise_hits, level) = features[idx];
        if len == 0 {
            continue;
        }

        // Apply dynamic noise detection first
        let context = ExtractionContext::new(paragraphs.len(), idx);
        let dynamic_result = noise_detector.is_noise(&p, &context);

        if dynamic_result.is_noise && dynamic_result.score > 4.0 {
            // High confidence noise from dynamic detector
            continue;
        }

        if level == 2 {
            continue;
        }

        if level == 1 {
            // Context constraints for conservative deletion.
            let left = idx.saturating_sub(1);
            let right = (idx + 1).min(features.len().saturating_sub(1));
            let (llen, lp, lnoise, _) = features[left];
            let (rlen, rp, rnoise, _) = features[right];

            let neighbors_are_long =
                is_long_content(llen, lp, lnoise) && is_long_content(rlen, rp, rnoise);

            // If both neighbors are very likely real content: keep but trim a leading noise prefix.
            if neighbors_are_long {
                p = strip_noise_prefix(p, &noise_keywords);
                if p.is_empty() {
                    continue;
                }
            } else {
                // Otherwise: only keep if this paragraph looks sentence-rich enough.
                let sentence_rich = punct >= 6 || len > 180;
                if !sentence_rich {
                    continue;
                }

                // If it's still very likely wrapper/marketing: drop.
                if noise_hits >= 2 && len < 160 {
                    continue;
                }
            }
        }

        let key = dedup_key(&p);
        if !seen.contains(&key) {
            kept.push(p);
            seen.insert(key);
        }
    }

    kept.join("\n\n")
}

/// Readability-like fallback (static HTML heuristics).
///
/// It picks the "most likely main content" element using simple scores:
/// text length, punctuation frequency, and link density.
/// Now enhanced with ML-based scoring and Readability integration.
pub fn readability_like_extract(doc: &Html, config: &ContentExtractConfig<'_>) -> Option<String> {
    // First, try Mozilla's Readability algorithm
    let html = doc.html();
    let readability_extractor = ReadabilityExtractor::new();

    if let Some(extracted) = readability_extractor.extract(&html) {
        if extracted.is_valid_novel_content() {
            if let Some(cleaned) = extracted.clean_for_reading() {
                return Some(cleaned);
            }
        }
    }

    // Fallback to heuristic scoring
    readability_like_extract_heuristic(doc, config)
}

/// Heuristic-based Readability extraction (original implementation)
fn readability_like_extract_heuristic(
    doc: &Html,
    config: &ContentExtractConfig<'_>,
) -> Option<String> {
    // Candidate containers: prefer "section-like" blocks over single paragraphs.
    // Including `p` tends to pick a random paragraph rather than the whole chapter body.
    static CANDIDATE_SELECTOR_RAW: &str = "article, main, section, div";
    static LINK_SELECTOR_RAW: &str = "a";
    static PARA_SELECTOR_RAW: &str = "p, li";
    static HEADING_SELECTOR_RAW: &str = "h1, h2, h3, h4, h5, h6";
    static WRAPPER_SELECTOR_RAW: &str = "div#__nxs_extract_root";
    static NAV_SELECTOR_RAW: &str = "nav";
    static ASIDE_SELECTOR_RAW: &str = "aside";
    static FOOTER_SELECTOR_RAW: &str = "footer";
    static HEADER_SELECTOR_RAW: &str = "header";
    static IMG_SELECTOR_RAW: &str = "img";
    static FORM_SELECTOR_RAW: &str = "form";
    static BUTTON_LIKE_SELECTOR_RAW: &str = "button";

    static CANDIDATE_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(CANDIDATE_SELECTOR_RAW).expect("valid selector"));
    static LINK_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(LINK_SELECTOR_RAW).expect("valid selector"));
    static PARA_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(PARA_SELECTOR_RAW).expect("valid selector"));
    static HEADING_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(HEADING_SELECTOR_RAW).expect("valid selector"));
    static WRAPPER_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(WRAPPER_SELECTOR_RAW).expect("valid selector"));
    static NAV_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(NAV_SELECTOR_RAW).expect("valid selector"));
    static ASIDE_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(ASIDE_SELECTOR_RAW).expect("valid selector"));
    static FOOTER_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(FOOTER_SELECTOR_RAW).expect("valid selector"));
    static HEADER_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(HEADER_SELECTOR_RAW).expect("valid selector"));
    static IMG_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(IMG_SELECTOR_RAW).expect("valid selector"));
    static FORM_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(FORM_SELECTOR_RAW).expect("valid selector"));
    static BUTTON_LIKE_SELECTOR: LazyLock<Selector> =
        LazyLock::new(|| Selector::parse(BUTTON_LIKE_SELECTOR_RAW).expect("valid selector"));

    // Initialize ML scorer and feature extractor
    let feature_extractor = FeatureExtractor::new();
    let ensemble_scorer = EnsembleScorer::new();

    // Limit candidates to avoid heavy work.
    let mut best_score: f64 = f64::MIN;
    let mut best_html: Option<String> = None;

    let mut checked = 0usize;
    for el in doc.select(&CANDIDATE_SELECTOR) {
        checked += 1;
        if checked > 200 {
            break;
        }

        if matches_any_filter(&el, config.filter_selectors) || is_hidden_element(&el, config) {
            continue;
        }

        let raw_text = el.text().collect::<Vec<_>>().join("");
        let raw_text_norm = normalize_whitespace_keep_newlines(&raw_text);
        let text_len = raw_text_norm.chars().count();
        if text_len < 80 {
            continue;
        }

        let link_count = el.select(&LINK_SELECTOR).count();
        let para_count = el.select(&PARA_SELECTOR).count();
        let heading_count = el.select(&HEADING_SELECTOR).count();
        let nav_count = el.select(&NAV_SELECTOR).count()
            + el.select(&ASIDE_SELECTOR).count()
            + el.select(&FOOTER_SELECTOR).count()
            + el.select(&HEADER_SELECTOR).count();
        let img_count = el.select(&IMG_SELECTOR).count();
        let form_count = el.select(&FORM_SELECTOR).count();
        let button_count = el.select(&BUTTON_LIKE_SELECTOR).count();
        let punct_count = raw_text_norm
            .chars()
            .filter(|c| {
                matches!(
                    *c,
                    // Chinese punctuation
                    '。' | '！' | '？' | '；' | '，' | '、'
                    // Western punctuation
                    | '!' | '?' | ';' | ',' | '.' | ':' | '—' | '-'
                )
            })
            .count();

        // Heuristic: main content tends to have enough text + punctuation,
        // while link-heavy areas are less likely to be the body.
        let link_density = link_count as f64 / (text_len as f64 + 1.0);
        let keyword_bonus = {
            let class = el.value().attr("class").unwrap_or("").to_ascii_lowercase();
            let id = el.value().attr("id").unwrap_or("").to_ascii_lowercase();
            let haystack = format!("{class} {id}");
            let has = [
                "article", "content", "reader", "chapter", "post", "entry", "main", "text",
                "novel", "book", "story", "body", "detail",
            ]
            .iter()
            .any(|k| haystack.contains(k));
            if has {
                300.0
            } else {
                0.0
            }
        };

        // Prefer containers that look like they have multiple paragraphs/lines,
        // not just a single short block.
        let para_bonus = (para_count.min(50) as f64) * 20.0;

        // Base score calculation
        let score = (text_len as f64) + (punct_count as f64) * 50.0
            - (link_count as f64) * 150.0
            - link_density * 700.0
            + para_bonus
            + keyword_bonus;

        // Additional heuristics to better separate "content" vs navigation/TOC.
        let avg_para_len = text_len as f64 / (para_count.max(1) as f64);
        // Very short average paragraphs often indicate TOC/list menus.
        let avg_para_bonus = if avg_para_len < 25.0 {
            -350.0
        } else if avg_para_len > 120.0 {
            200.0
        } else {
            0.0
        };

        // Penalize nav/side/foot/header presence.
        let nav_penalty = (nav_count as f64) * 200.0;

        // Penalize too many images/forms/buttons (common in galleries/search UIs).
        let ui_penalty =
            (img_count as f64) * 20.0 + (form_count as f64) * 300.0 + (button_count as f64) * 70.0;

        // Penalize repeated paging-like and marketing keywords inside the candidate.
        let noise_keywords = [
            "下一页",
            "上一页",
            "下一章",
            "上一章",
            "目录",
            "广告",
            "会员",
            "下载",
            "返回",
            "返回顶部",
            "继续阅读",
            "点击",
            "本章未完",
            "温馨提示",
            "举报",
            "推荐阅读",
            "热门推荐",
            "相关推荐",
            "猜你喜欢",
            "同类推荐",
            "好书推荐",
            "精选推荐",
            "点赞",
            "收藏本站",
            "加入收藏",
            "设为首页",
            "手机阅读",
            "APP下载",
            "扫码阅读",
            "版权声明",
            "免责声明",
            "侵权举报",
            "联系方式",
            "联系我们",
            "正在加载",
            "加载中",
            "刷新页面",
            "刷新",
            "重新加载",
            "本章完",
            "本章结束",
            "完",
            "全本完",
            "全文完",
            "完本",
            "完结",
            "已完结",
            "赞助商",
            "赞助商链接",
            "广告位",
            "广告合作",
            "商务合作",
        ];
        let mut noise_hits = 0usize;
        for k in noise_keywords.iter() {
            if raw_text_norm.contains(k) {
                noise_hits += 1;
            }
        }
        let noise_penalty = (noise_hits.min(6) as f64) * 150.0;

        // Headings help a bit, but too many headings in a small container is often TOC.
        let heading_penalty = if para_count > 0 && heading_count as f64 > (para_count as f64) * 0.6
        {
            300.0
        } else {
            0.0
        };

        let score =
            score + avg_para_bonus - nav_penalty - ui_penalty - noise_penalty - heading_penalty;

        // Small tie-breaker: prefer article/main/section.
        let tag_bonus = match el.value().name() {
            "article" | "main" => 600.0,
            "section" => 250.0,
            _ => 0.0,
        };

        let score = score + tag_bonus;

        // Enhance with ML-based scoring
        let features = feature_extractor.extract_features(&el);
        let ensemble_score = ensemble_scorer.score_ensemble(&features, score);

        if ensemble_score > best_score {
            best_score = ensemble_score;
            best_html = Some(el.html());
        }
    }

    let best_html = best_html?;
    let wrapped = format!("<div id=\"__nxs_extract_root\">{}</div>", best_html);
    let frag = Html::parse_fragment(&wrapped);
    let root = frag.select(&WRAPPER_SELECTOR).next()?;
    Some(extract_structured_text_from_root(root, config))
}
