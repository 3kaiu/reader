use super::analysis::extract_selector_candidates;
use super::*;

fn build_get_search_template(
    action_url: &str,
    keyword_param: &str,
    hidden_fields: &[(String, String)],
) -> String {
    let mut parsed = match Url::parse(action_url) {
        Ok(url) => url,
        Err(_) => {
            return action_url.to_string();
        },
    };
    let mut pairs = parsed
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();

    for (key, value) in hidden_fields {
        if !pairs.iter().any(|(existing_key, _)| existing_key == key) {
            pairs.push((key.clone(), value.clone()));
        }
    }
    if let Some((_, value)) = pairs
        .iter_mut()
        .find(|(existing_key, _)| existing_key == keyword_param)
    {
        *value = "{q}".to_string();
    } else {
        pairs.push((keyword_param.to_string(), "{q}".to_string()));
    }

    parsed.query_pairs_mut().clear().extend_pairs(
        pairs
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str())),
    );
    parsed.to_string()
}

fn build_post_search_body(
    keyword_param: &str,
    hidden_fields: &[(String, String)],
) -> Option<String> {
    let mut pairs = hidden_fields
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>();
    pairs.push(format!("{keyword_param}={{q}}"));
    if pairs.is_empty() {
        None
    } else {
        Some(pairs.join("&"))
    }
}

pub(crate) fn infer_search_entry_from_html(
    html: &str,
    base_url: &Url,
) -> Option<SearchEntryProbeInsights> {
    let doc = Html::parse_document(html);
    let form_selector = Selector::parse("form").ok()?;
    let input_selector = Selector::parse("input, textarea, button").ok()?;
    let mut best: Option<(i32, SearchEntryProbeInsights)> = None;

    for (index, form) in doc.select(&form_selector).enumerate() {
        let method = form
            .value()
            .attr("method")
            .unwrap_or("GET")
            .trim()
            .to_uppercase();
        let action_url = form
            .value()
            .attr("action")
            .and_then(|value| base_url.join(value).ok())
            .unwrap_or_else(|| base_url.clone())
            .to_string();

        let mut keyword_param: Option<String> = None;
        let mut hidden_fields = Vec::new();
        let mut score = 0i32;

        for input in form.select(&input_selector) {
            let value = input.value();
            let field_name = value.attr("name").unwrap_or("").trim();
            let field_type = value
                .attr("type")
                .unwrap_or("text")
                .trim()
                .to_ascii_lowercase();
            let placeholder = value.attr("placeholder").unwrap_or("").to_ascii_lowercase();
            let input_value = value.attr("value").unwrap_or("");

            let likely_keyword_name = [
                "q",
                "searchkey",
                "search_key",
                "keyword",
                "keywords",
                "wd",
                "query",
                "key",
                "search",
            ]
            .iter()
            .any(|candidate| field_name.eq_ignore_ascii_case(candidate));
            let likely_keyword_input = matches!(field_type.as_str(), "search" | "text" | "")
                && (likely_keyword_name
                    || field_name.to_ascii_lowercase().contains("search")
                    || placeholder.contains("search")
                    || placeholder.contains("搜索"));

            if likely_keyword_input && !field_name.is_empty() {
                keyword_param = Some(field_name.to_string());
                score += if likely_keyword_name { 8 } else { 5 };
                continue;
            }

            if field_type == "hidden" && !field_name.is_empty() {
                hidden_fields.push((field_name.to_string(), input_value.to_string()));
                score += 1;
                continue;
            }

            if matches!(field_type.as_str(), "submit" | "button") {
                let button_text = input.text().collect::<String>().to_ascii_lowercase();
                if input_value.contains("搜索")
                    || input_value.to_ascii_lowercase().contains("search")
                    || button_text.contains("搜索")
                    || button_text.contains("search")
                {
                    score += 2;
                }
            }
        }

        if keyword_param.is_none() {
            let text_inputs = form
                .select(&input_selector)
                .filter(|input| {
                    let value = input.value();
                    let field_type = value
                        .attr("type")
                        .unwrap_or("text")
                        .trim()
                        .to_ascii_lowercase();
                    matches!(field_type.as_str(), "search" | "text" | "")
                        && value.attr("name").is_some()
                })
                .collect::<Vec<_>>();
            if text_inputs.len() == 1 {
                if let Some(name) = text_inputs[0].value().attr("name") {
                    keyword_param = Some(name.to_string());
                    score += 3;
                }
            }
        }

        let Some(keyword_param) = keyword_param else {
            continue;
        };

        if action_url.contains(base_url.host_str().unwrap_or_default()) {
            score += 2;
        }

        let body_template = if method == "GET" {
            None
        } else {
            build_post_search_body(&keyword_param, &hidden_fields)
        };
        let final_action_url = if method == "GET" {
            build_get_search_template(&action_url, &keyword_param, &hidden_fields)
        } else {
            action_url
        };

        let insight = SearchEntryProbeInsights {
            action_url: final_action_url,
            method,
            keyword_param,
            body_template,
            form_selector: Some(format!("form:nth-of-type({})", index + 1)),
        };

        if best
            .as_ref()
            .map(|(best_score, _)| score > *best_score)
            .unwrap_or(true)
        {
            best = Some((score, insight));
        }
    }

    best.map(|(_, insight)| insight)
}

fn derive_stable_path_filter(sample_book_url: &Url) -> Option<String> {
    let segments = sample_book_url
        .path_segments()
        .map(|it| {
            it.filter(|segment| !segment.trim().is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if segments.is_empty() {
        return None;
    }

    for marker in ["book", "novel", "novels", "n", "xiaoshuo", "shu"] {
        if let Some(found) = segments
            .iter()
            .find(|segment| segment.eq_ignore_ascii_case(marker))
        {
            return Some(format!("/{found}/"));
        }
    }

    let first = segments.first()?;
    if first.chars().any(|ch| ch.is_ascii_alphabetic()) && first.len() <= 20 {
        Some(format!("/{first}/"))
    } else {
        None
    }
}

fn infer_search_result_filter(
    doc: &Html,
    list_selector_chain: &str,
    url_selector: &str,
    sample_book_url: Option<&Url>,
) -> Option<String> {
    let expected_filter = sample_book_url.and_then(derive_stable_path_filter)?;
    let url_attr_selector = url_selector.split('@').next().unwrap_or("a").trim();
    let attr_name = url_selector
        .split('@')
        .nth(1)
        .map(str::trim)
        .filter(|it| !it.is_empty())
        .unwrap_or("href");

    let mut hits = 0usize;
    let mut misses = 0usize;
    for selector_text in extract_selector_candidates(list_selector_chain) {
        let Ok(item_selector) = Selector::parse(&selector_text) else {
            continue;
        };
        let Ok(url_sel) = Selector::parse(url_attr_selector) else {
            continue;
        };
        for item in doc.select(&item_selector).take(20) {
            let Some(node) = item.select(&url_sel).next() else {
                continue;
            };
            let Some(raw_url) = node.value().attr(attr_name) else {
                continue;
            };
            if raw_url.contains(&expected_filter) {
                hits += 1;
            } else {
                misses += 1;
            }
        }
    }

    if hits == 0 {
        return None;
    }
    if misses > hits * 2 {
        return None;
    }
    Some(expected_filter)
}

fn infer_search_next_page_selector(doc: &Html) -> Option<String> {
    let candidates = [
        ".pagination a",
        ".page a",
        ".pager a",
        "#pagelink a",
        ".pages a",
        "a[href*='page=']",
    ];

    for candidate in candidates {
        let Ok(selector) = Selector::parse(candidate) else {
            continue;
        };
        let mut next_like_hits = 0usize;
        let mut numeric_hits = 0usize;
        for el in doc.select(&selector).take(24) {
            let text = el.text().collect::<String>().trim().to_string();
            let href = el.value().attr("href").unwrap_or_default().to_string();
            if text.is_empty() && href.is_empty() {
                continue;
            }
            if count_pattern_hits(
                &format!("{text} {href}"),
                &["下一页", "下页", "next", ">", "›", "»"],
            ) > 0
            {
                next_like_hits += 1;
            }
            if text.chars().all(|ch| ch.is_ascii_digit()) {
                numeric_hits += 1;
            }
        }
        if next_like_hits > 0 || numeric_hits >= 2 {
            return Some(candidate.to_string());
        }
    }

    None
}

fn selector_looks_specific(tag: &str, class_attr: &str, id_attr: &str) -> bool {
    !class_attr.trim().is_empty()
        || !id_attr.trim().is_empty()
        || matches!(tag, "h2" | "h3" | "h4" | "a" | "p" | "span")
}

fn preferred_relative_selector(
    tag: &str,
    class_attr: &str,
    id_attr: &str,
    attr: Option<&str>,
) -> String {
    let base = if !id_attr.trim().is_empty() {
        format!("#{id_attr}")
    } else if let Some(class_name) = class_attr
        .split_whitespace()
        .find(|name| !name.trim().is_empty() && name.len() <= 32)
    {
        format!(".{class_name}")
    } else {
        tag.to_string()
    };
    match attr {
        Some(attr) if !attr.is_empty() => format!("{base}@{attr}"),
        _ => base,
    }
}

fn infer_search_item_fields(
    doc: &Html,
    list_selector_chain: &str,
) -> (String, String, Option<String>, Option<String>) {
    let mut best_anchor_selector = None::<String>;
    let mut best_author_selector = None::<String>;
    let mut best_intro_selector = None::<String>;

    for selector_text in extract_selector_candidates(list_selector_chain) {
        let Ok(item_selector) = Selector::parse(&selector_text) else {
            continue;
        };
        let anchor_selector = Selector::parse("a[href]").expect("selector");
        let author_candidates = Selector::parse("span, p, div, small, em, i").expect("selector");

        for item in doc.select(&item_selector).take(12) {
            if best_anchor_selector.is_none() {
                let mut best_local_anchor = None::<(String, usize)>;
                for anchor in item.select(&anchor_selector).take(6) {
                    let text = anchor.text().collect::<String>().trim().to_string();
                    if text.is_empty() {
                        continue;
                    }
                    let href = anchor.value().attr("href").unwrap_or_default();
                    if href.is_empty() {
                        continue;
                    }
                    let tag = anchor.value().name();
                    let class_attr = anchor.value().attr("class").unwrap_or_default();
                    let id_attr = anchor.value().attr("id").unwrap_or_default();
                    if !selector_looks_specific(tag, class_attr, id_attr) {
                        continue;
                    }
                    let score = text.chars().count()
                        + count_pattern_hits(&text, &["书", "小说", "章", "卷", "第"]).min(2) * 6;
                    let selector =
                        preferred_relative_selector(tag, class_attr, id_attr, Some("href"));
                    match &best_local_anchor {
                        Some((_, best_score)) if *best_score >= score => {},
                        _ => best_local_anchor = Some((selector, score)),
                    }
                }
                if let Some((selector, _)) = best_local_anchor {
                    best_anchor_selector = Some(selector);
                }
            }

            if best_author_selector.is_none() || best_intro_selector.is_none() {
                for node in item.select(&author_candidates).take(10) {
                    let text = node.text().collect::<String>().trim().to_string();
                    if text.is_empty() {
                        continue;
                    }
                    let tag = node.value().name();
                    let class_attr = node.value().attr("class").unwrap_or_default();
                    let id_attr = node.value().attr("id").unwrap_or_default();
                    if !selector_looks_specific(tag, class_attr, id_attr) {
                        continue;
                    }

                    if best_author_selector.is_none()
                        && count_pattern_hits(&text, &["作者", "author"]) > 0
                    {
                        best_author_selector =
                            Some(preferred_relative_selector(tag, class_attr, id_attr, None));
                    }

                    if best_intro_selector.is_none()
                        && text.chars().count() >= 12
                        && count_pattern_hits(
                            &text,
                            &["简介", "更新", "连载", "最新", "字数", "状态"],
                        ) == 0
                    {
                        best_intro_selector =
                            Some(preferred_relative_selector(tag, class_attr, id_attr, None));
                    }

                    if best_author_selector.is_some() && best_intro_selector.is_some() {
                        break;
                    }
                }
            }

            if best_anchor_selector.is_some()
                && best_author_selector.is_some()
                && best_intro_selector.is_some()
            {
                break;
            }
        }
    }

    let name_selector = best_anchor_selector
        .as_ref()
        .map(|selector| selector.trim_end_matches("@href").to_string())
        .unwrap_or_else(|| "a".to_string());
    let url_selector = best_anchor_selector.unwrap_or_else(|| "a@href".to_string());

    (name_selector, url_selector, best_author_selector, best_intro_selector)
}

pub(crate) fn infer_search_selector_from_html(
    html: &str,
    sample_book_url: Option<&Url>,
) -> SearchProbeInsights {
    let doc = Html::parse_document(html);
    let mut probe = ProbeDoc::new(&doc);
    let candidates = [
        ".search-list > li",
        ".result-list > li",
        ".book-list > li",
        ".bookbox",
        ".search-item",
        ".result-item",
        "ul > li",
        "tbody > tr",
        "a[href]",
    ];
    let (list_selector, list_score) =
        derive_best_search_result_selector(&mut probe, &candidates, 3);
    let result_count = extract_selector_candidates(&list_selector)
        .into_iter()
        .filter_map(|item| Selector::parse(&item).ok())
        .map(|selector| doc.select(&selector).count())
        .max()
        .unwrap_or(0);

    let (name_selector, url_selector, author_selector, intro_selector) =
        infer_search_item_fields(&doc, &list_selector);
    let result_filter =
        infer_search_result_filter(&doc, &list_selector, &url_selector, sample_book_url);
    let next_page_selector = infer_search_next_page_selector(&doc);

    SearchProbeInsights {
        list_selector,
        list_score,
        result_count,
        name_selector,
        url_selector,
        author_selector,
        intro_selector,
        result_filter,
        next_page_selector,
    }
}
