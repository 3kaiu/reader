use super::*;

pub(crate) struct ProbeDoc<'a> {
    pub(crate) doc: &'a Html,
    selectors: HashMap<String, Option<Selector>>,
    text_scores: HashMap<String, usize>,
    count_scores: HashMap<String, usize>,
}

impl<'a> ProbeDoc<'a> {
    pub(crate) fn new(doc: &'a Html) -> Self {
        Self {
            doc,
            selectors: HashMap::new(),
            text_scores: HashMap::new(),
            count_scores: HashMap::new(),
        }
    }

    pub(crate) fn selector(&mut self, selector: &str) -> Option<&Selector> {
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

    pub(crate) fn score(&mut self, selector: &str, prefer_count: bool) -> usize {
        if prefer_count {
            self.selector_match_count(selector)
        } else {
            self.selector_text_weight(selector)
        }
    }

    pub(crate) fn warm_scores(&mut self, candidates: &[&str], prefer_count: bool) {
        let mut seen = std::collections::HashSet::new();
        for candidate in candidates {
            if seen.insert(*candidate) {
                let _ = self.score(candidate, prefer_count);
            }
        }
    }

    pub(crate) fn likely_chapter_links(&mut self) -> usize {
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

pub(crate) fn choose_best_selector(
    probe: &mut ProbeDoc<'_>,
    candidates: &[&str],
    prefer_count: bool,
) -> String {
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

pub(crate) fn count_pattern_hits(text: &str, patterns: &[&str]) -> usize {
    let lower = text.to_ascii_lowercase();
    patterns
        .iter()
        .filter(|pattern| lower.contains(&pattern.to_ascii_lowercase()))
        .count()
}

pub(crate) fn score_content_selector(probe: &mut ProbeDoc<'_>, selector: &str) -> f64 {
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

pub(crate) fn derive_best_content_selector(
    probe: &mut ProbeDoc<'_>,
    candidates: &[&str],
    top_n: usize,
) -> (String, f64) {
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

pub(crate) fn score_toc_selector(probe: &mut ProbeDoc<'_>, selector: &str) -> f64 {
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
        chapter_like_count +=
            count_pattern_hits(&text, &["第", "章", "节", "回", "卷", "chapter"]).min(1);
        noise_like_count += count_pattern_hits(
            &text,
            &[
                "最新",
                "推荐",
                "作者",
                "分类",
                "简介",
                "目录",
                "排行",
                "相关阅读",
                "猜你喜欢",
            ],
        )
        .min(1);
        if let Some(href) = el.value().attr("href") {
            href_hits +=
                count_pattern_hits(href, &["chapter", "book", ".html", "/read", "/chapter"]).min(1);
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

pub(crate) fn derive_best_toc_selector(
    probe: &mut ProbeDoc<'_>,
    candidates: &[&str],
    top_n: usize,
) -> (String, f64) {
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

pub(crate) fn score_search_result_selector(probe: &mut ProbeDoc<'_>, selector: &str) -> f64 {
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

pub(crate) fn derive_best_search_result_selector(
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

pub(crate) fn derive_selector_chain(
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
