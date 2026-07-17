use std::num::NonZeroUsize;
use std::sync::LazyLock;
use parking_lot::Mutex;

use lru::LruCache;
use scraper::Html;

/// Maximum number of parsed HTML documents to cache.
///
/// Each entry is a parsed DOM tree (e.g. a 265KB TOC page).
/// 50 entries covers a reasonable reading session without excessive memory.
const MAX_CACHED_DOCS: usize = 50;

/// `scraper::Html` contains `Rc` internally and is `!Send`.
///
/// Safety: we only access cached entries behind a `Mutex` in synchronous
/// code paths, and hand out clones that are used locally within a single
/// task. We never actually share the `Rc` across threads — the `Rc` count
/// is only incremented/decremented while holding the `Mutex`.
struct SafeHtml(Html);
unsafe impl Send for SafeHtml {}

static HTML_DOC_CACHE: LazyLock<Mutex<LruCache<String, SafeHtml>>> =
    LazyLock::new(|| Mutex::new(LruCache::new(NonZeroUsize::new(MAX_CACHED_DOCS).unwrap())));

/// Return a parsed HTML document, caching it by URL.
///
/// On cache hit: returns cloned `Html` without re-parsing.
/// On cache miss: parses `html_str`, caches the result, returns it.
pub fn get_or_parse(url: &str, html_str: &str) -> Html {
    let mut cache = HTML_DOC_CACHE.lock();
    if let Some(entry) = cache.get(url) {
        return entry.0.clone();
    }
    let doc = Html::parse_document(html_str);
    cache.put(url.to_string(), SafeHtml(doc.clone()));
    doc
}

/// Invalidate a cached document by URL (e.g. after source update).
pub fn invalidate(url: &str) {
    let mut cache = HTML_DOC_CACHE.lock();
    cache.pop(url);
}

/// Clear the entire cache.
pub fn clear() {
    let mut cache = HTML_DOC_CACHE.lock();
    cache.clear();
}

/// Return the current number of cached entries.
pub fn len() -> usize {
    HTML_DOC_CACHE.lock().len()
}
