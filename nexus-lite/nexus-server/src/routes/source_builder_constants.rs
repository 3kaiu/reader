pub(super) const CONTENT_SELECTOR_CANDIDATES: &[&str] = &[
    "article",
    ".content",
    "#content",
    ".chapter-content",
    "#txtcontent",
    ".txtnav",
    ".yd_text2",
    ".Readarea",
    ".read-content-text",
    ".txt",
    ".read-content",
    ".content-body",
    ".chapter-body",
    ".article-content",
];

pub(super) const BOOK_NAME_SELECTOR_CANDIDATES: &[&str] = &[
    "h1",
    ".book-title",
    ".title",
    ".info h1",
    "meta[property='og:title']",
];

pub(super) const AUTHOR_SELECTOR_CANDIDATES: &[&str] = &[
    ".author",
    ".book-author",
    ".info .author",
    "p.author",
    ".book-meta",
];

pub(super) const INTRO_SELECTOR_CANDIDATES: &[&str] =
    &[".intro", ".book-intro", "#intro", ".desc", ".book-summary"];

pub(super) const TOC_SELECTOR_CANDIDATES: &[&str] = &[
    ".chapter-list a",
    "#list a",
    ".listmain a",
    ".catalog a",
    ".dirlist a",
    "#catalog a",
    "#chapterList a",
    ".chapters a",
    "a[href*='chapter']",
    "a[href*='/book/'][href*='/']",
];

pub(super) const SEARCH_RESULT_SELECTOR_FALLBACKS: &[&str] = &[
    ".search-list > li",
    ".search-result a",
    ".result-list li",
    ".book-list li",
    ".bookbox",
    ".result-item",
    ".search-item",
    "li",
    "a[href]",
];

pub(super) const TOC_SELECTOR_FALLBACKS: &[&str] =
    &[".chapter-list a", "#list a", ".catalog a", "a[href]"];

pub(super) const CONTENT_SELECTOR_FALLBACKS: &[&str] = &[
    "#content",
    ".content",
    ".txtnav",
    ".read-content",
    "article",
];

pub(super) const BOOK_TITLE_SELECTOR_FALLBACKS: &[&str] =
    &["h1", ".book-title", ".title", "meta[property='og:title']"];

pub(super) const AUTHOR_SELECTOR_FALLBACKS: &[&str] = &[".author", ".book-author", ".info .author"];

pub(super) const COMMON_CONTENT_FILTERS: &[&str] =
    &["script", "style", "ins", ".ads", ".advert", ".banner"];
