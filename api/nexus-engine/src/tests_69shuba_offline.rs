use std::path::PathBuf;

use nexus_core::NxsSource;
use scraper::{Html, Selector};

use crate::content_extract::{extract_structured_text_from_root, ContentExtractConfig};
use crate::selector_cache::FallbackSelector;

fn fixture_path(rel: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn load_text(rel: &str) -> String {
    std::fs::read_to_string(fixture_path(rel))
        .unwrap_or_else(|e| panic!("failed to read fixture {rel}: {e}"))
}

/// Canonical on-disk source: same shape as runtime `.nxs` under `api/sources/`.
fn load_nxs() -> NxsSource {
    let raw = load_text("../sources/69shuba.nxs");
    serde_json::from_str::<NxsSource>(&raw).expect("parse 69shuba.nxs")
}

#[test]
fn offline_search_extracts_book_name_author_url_cover_intro() {
    let src = load_nxs();
    let html = load_text("tests/fixtures/69shuba/search-方仙外道.sample.html");
    let doc = Html::parse_document(&html);

    let list_sel = Selector::parse(&src.search.list).expect("parse search.list");
    let first_item = doc
        .select(&list_sel)
        .next()
        .expect("expected at least one search result item");

    let name = FallbackSelector::compile(&src.search.item.name)
        .unwrap()
        .select_from_and_extract(&first_item)
        .unwrap_or_default();
    assert!(name.contains("方仙外道"), "name={name:?}");

    // Sanity: ensure we are operating on the expected list item.
    let labelbox_sel = Selector::parse(".labelbox").unwrap();
    let labelbox = first_item
        .select(&labelbox_sel)
        .next()
        .expect("expected .labelbox within search result item");
    let labelbox_text = labelbox.text().collect::<Vec<_>>().join("");
    assert!(labelbox_text.contains("布谷聊"), "unexpected labelbox text: {labelbox_text:?}");

    let author_rule = src.search.item.author.clone().unwrap_or_default();
    let author = FallbackSelector::compile(&author_rule)
        .unwrap()
        .select_from_and_extract(&first_item)
        .unwrap_or_default();
    assert!(author.contains("布谷聊"), "author={author:?}");

    let url = FallbackSelector::compile(&src.search.item.url)
        .unwrap()
        .select_from_and_extract(&first_item)
        .unwrap_or_default();
    assert!(url.contains("/book/90431.htm"), "expected book url, got {url:?}");

    let cover_rule = src.search.item.cover.clone().unwrap_or_default();
    let cover = FallbackSelector::compile(&cover_rule)
        .unwrap()
        .select_from_and_extract(&first_item)
        .unwrap_or_default();
    assert!(cover.contains("90431s.jpg"), "expected cover url, got {cover:?}");

    let intro_rule = src.search.item.intro.clone().unwrap_or_default();
    let intro = FallbackSelector::compile(&intro_rule)
        .unwrap()
        .select_from_and_extract(&first_item)
        .unwrap_or_default();
    assert!(!intro.trim().is_empty(), "intro should not be empty");
}

#[test]
fn offline_book_extracts_name_author_cover_and_toc_url() {
    let src = load_nxs();
    let html = load_text("tests/fixtures/69shuba/book-90442.sample.html");
    let doc = Html::parse_document(&html);

    let name = FallbackSelector::compile(&src.book.name)
        .unwrap()
        .select_and_extract(&doc)
        .unwrap_or_default();
    assert!(name.contains("霍格沃茨"), "name={name:?}");

    let author_rule = src.book.author.clone().unwrap_or_default();
    let author = FallbackSelector::compile(&author_rule)
        .unwrap()
        .select_and_extract(&doc)
        .unwrap_or_default();
    assert!(author.contains("林曦遇鹿"), "author={author:?}");

    let cover_rule = src.book.cover.clone().unwrap_or_default();
    let cover = FallbackSelector::compile(&cover_rule)
        .unwrap()
        .select_and_extract(&doc)
        .unwrap_or_default();
    assert!(cover.contains("90442s.jpg"), "expected cover url, got {cover:?}");

    let toc_rule = src.book.toc.clone().unwrap_or_default();
    let toc_url = FallbackSelector::compile(&toc_rule)
        .unwrap()
        .select_and_extract(&doc)
        .unwrap_or_default();
    assert!(toc_url.contains("/book/90442/"), "expected toc url, got {toc_url:?}");

    // Book page should also expose at least one chapter url via toc.list fallback
    let toc_list = FallbackSelector::compile(&src.toc.list).expect("compile toc.list");
    let toc_count = toc_list.select_all(&doc).len();
    assert!(toc_count >= 1, "expected toc items, got {toc_count}");
}

#[test]
fn offline_chapter_extracts_clean_text_without_ads() {
    let src = load_nxs();
    let html = load_text("tests/fixtures/69shuba/chapter-90431-41044003.sample.html");
    let doc = Html::parse_document(&html);

    let body_sel = Selector::parse(&src.content.body).expect("parse content.body");
    let root = doc
        .select(&body_sel)
        .next()
        .expect("content.body should match");

    let filters: Vec<Selector> = src
        .content
        .filter
        .iter()
        .map(|raw| Selector::parse(raw).unwrap_or_else(|e| panic!("bad filter {raw}: {e}")))
        .collect();

    let extracted = extract_structured_text_from_root(
        root,
        &ContentExtractConfig {
            filter_selectors: &filters,
            visible_only: src.content.visible_only,
        },
    );

    assert!(extracted.contains("方束裹着桃花烟云"), "expected story text, got {extracted:?}");
    assert!(
        !extracted.contains("loadAdv"),
        "should not contain ad scripts, got {extracted:?}"
    );
}
