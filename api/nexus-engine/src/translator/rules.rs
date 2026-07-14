//! Core rules translator — translates LegadoSource fields into JS functions.
//!
//! Uses css, template, and js_block translators to convert each rule field,
//! then assembles the results into a complete ES6+ module.

use nexus_core::legado::LegadoSource;

use super::css;
use super::js_block;
use super::template;

/// Error during translation.
#[derive(Debug)]
pub enum TranslateError {
    NoSearchUrl,
    NoBookList,
    NoContent,
    NoChapterList,
    UnsupportedRule(String),
}

impl std::fmt::Display for TranslateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TranslateError::NoSearchUrl => write!(f, "no searchUrl"),
            TranslateError::NoBookList => write!(f, "no bookList"),
            TranslateError::NoContent => write!(f, "no content rule"),
            TranslateError::NoChapterList => write!(f, "no chapterList"),
            TranslateError::UnsupportedRule(r) => write!(f, "unsupported rule: {}", r),
        }
    }
}

/// Translated source metadata.
pub struct SourceMeta {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub group: String,
    pub source_type: String,
    pub header_json: String,
    pub has_search: bool,
    pub has_explore: bool,
    pub charset: Option<String>,
    pub has_browser: bool,
}

/// Translated search function.
pub struct SearchFn {
    pub js_code: String,
    pub needs_browser: bool,
}

/// Translated book info function.
pub struct BookInfoFn {
    pub js_code: String,
    pub needs_browser: bool,
}

/// Translated chapters function.
pub struct ChaptersFn {
    pub js_code: String,
    pub needs_browser: bool,
}

/// Translated content function.
pub struct ContentFn {
    pub js_code: String,
    pub has_web_js: bool,
}

/// Translate a rule field (CSS selector, @js: block, or combined).
fn translate_rule_field(field: &Option<String>) -> String {
    match field {
        None => "''".to_string(),
        Some(rule) => {
            if rule.trim().is_empty() {
                return "''".to_string();
            }
            if js_block::contains_js_block(rule) {
                // Extract JS block and translate
                if let Some((before, js_code, after)) = js_block::extract_js_block(rule) {
                    let (translated_js, _is_async, _needs_browser) =
                        js_block::translate_js_block(js_code);
                    let mut result = String::new();
                    if !before.is_empty() {
                        result.push_str(&translate_selector_or_operator(before));
                        result.push_str(" + ");
                    }
                    result.push_str(&format!("(async () => {{ {} }})()", translated_js));
                    if !after.is_empty() {
                        result.push_str(" + ");
                        result.push_str(&translate_selector_or_operator(after));
                    }
                    return result;
                }
            }
            translate_selector_or_operator(rule)
        },
    }
}

/// Translate a selector expression that may contain ||, &&, ## operators.
fn translate_selector_or_operator(rule: &str) -> String {
    let trimmed = rule.trim();
    if trimmed.is_empty() {
        return "''".to_string();
    }

    // Handle ## regex clean suffix
    // Pattern: expression##pattern##replacement
    if let Some(first_sharp) = trimmed.find("##") {
        if first_sharp > 0 {
            let expr = &trimmed[..first_sharp];
            let rest = &trimmed[first_sharp + 2..];
            if let Some(second_sharp) = rest.find("##") {
                let pattern = &rest[..second_sharp];
                let replacement = &rest[second_sharp + 2..];
                let translated_before = translate_fallback_concat(expr);
                return format!(
                    "({})?.replace(/{}/g, '{}')",
                    translated_before,
                    pattern.replace('/', "\\/"),
                    replacement.replace('\'', "\\'")
                );
            }
        }
    }

    translate_fallback_concat(trimmed)
}

/// Handle || (fallback) and && (concat) operators.
fn translate_fallback_concat(rule: &str) -> String {
    // Check for top-level || or && (not inside @js: blocks or parenthesized groups)
    let parts = split_top_level_ops(rule);

    if parts.is_empty() {
        return translate_simple_selector(rule);
    }

    // Detect operator type
    let has_fallback = parts.iter().any(|(op, _)| *op == "||");
    let has_concat = parts.iter().any(|(op, _)| *op == "&&");

    if has_fallback {
        // A ?? B ?? C
        let selectors: Vec<String> = parts
            .iter()
            .map(|(_, expr)| translate_simple_selector(expr))
            .collect();
        format!("({})", selectors.join(" ?? "))
    } else if has_concat {
        // A + B + C
        let selectors: Vec<String> = parts
            .iter()
            .map(|(_, expr)| translate_simple_selector(expr))
            .collect();
        selectors.join(" + ")
    } else {
        translate_simple_selector(rule)
    }
}

/// Split a rule string by top-level || and && operators.
/// Returns Vec<(operator, expression)> where first expression has empty operator.
fn split_top_level_ops(rule: &str) -> Vec<(String, String)> {
    let mut result = Vec::new();
    let remaining = rule.trim();
    let mut depth = 0;
    let mut in_js = false;
    let mut last_split = 0;
    let mut last_op = "";

    for (i, _) in remaining.char_indices() {
        if remaining[i..].starts_with("<js>") || remaining[i..].starts_with("@js:") {
            in_js = true;
        }
        if in_js && remaining[i..].starts_with("</js>") {
            in_js = false;
        }
        if in_js {
            continue;
        }

        match remaining.as_bytes().get(i) {
            Some(b'(') => depth += 1,
            Some(b')') => depth -= 1,
            Some(b'|')
                if depth == 0 && i + 1 < remaining.len() && remaining.as_bytes()[i + 1] == b'|' =>
            {
                let expr = &remaining[last_split..i];
                if !expr.trim().is_empty() {
                    result.push((last_op.to_string(), expr.trim().to_string()));
                }
                last_split = i + 2;
                last_op = "||";
            },
            Some(b'&')
                if depth == 0 && i + 1 < remaining.len() && remaining.as_bytes()[i + 1] == b'&' =>
            {
                let expr = &remaining[last_split..i];
                if !expr.trim().is_empty() {
                    result.push((last_op.to_string(), expr.trim().to_string()));
                }
                last_split = i + 2;
                last_op = "&&";
            },
            _ => {},
        }
    }

    let last_expr = &remaining[last_split..];
    if !last_expr.trim().is_empty() {
        result.push((last_op.to_string(), last_expr.trim().to_string()));
    }

    result
}

/// Translate a single selector expression (no operators).
fn translate_simple_selector(rule: &str) -> String {
    let trimmed = rule.trim();
    if trimmed.is_empty() || trimmed == "@text:未知" || trimmed == "@text:默认标题" {
        return format!("'{}'", trimmed.trim_start_matches("@text:"));
    }

    // Handle @text: constants
    if let Some(text) = trimmed.strip_prefix("@text:") {
        return format!("'{}'", text.trim());
    }

    // Handle @css: prefix
    let css_rule = if let Some(r) = trimmed.strip_prefix("@css:") {
        r.trim()
    } else {
        trimmed
    };

    // Parse as CSS DSL
    let steps = css::parse_chain(css_rule);
    if !steps.is_empty() {
        return css::to_js_expression(&steps);
    }

    // Fallback: treat as literal
    format!("'{}'", trimmed)
}

/// Translate a search rule to JS code.
pub fn translate_search(source: &LegadoSource) -> Result<SearchFn, TranslateError> {
    let search_url = source.search_url.as_deref().unwrap_or("");
    let rule_search = &source.rule_search;

    if search_url.is_empty() && rule_search.is_none() {
        // No search — generate empty function
        return Ok(SearchFn {
            js_code: "return []".to_string(),
            needs_browser: false,
        });
    }

    let mut js = String::new();
    let mut needs_browser = false;

    // Parse compound URL
    let compound = if !search_url.is_empty() {
        Some(template::parse_compound_url(search_url))
    } else {
        None
    };

    if let Some(url) = &compound {
        // Generate URL
        let js_url = template::generate_js_url(&url.url_parts, "keyword", "page");
        js.push_str(&format!("const url = {};\n", js_url));

        if url.method == "POST" {
            let js_body = template::generate_js_body(&url.body, "keyword");
            js.push_str(&format!(
                "const body = {};\nconst html = await __fetch(url, {{ method: 'POST', headers: {{ ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }}, body }}",
                js_body
            ));
            if let Some(charset) = &url.charset {
                js.push_str(&format!(", encoding: '{}'", charset));
            }
            js.push_str(");\n");
        } else {
            js.push_str("const html = await __fetch(url, { headers: HEADERS });\n");
        }
    } else {
        // No searchUrl — use keyword directly
        js.push_str("const html = '';\n");
    }

    // Parse book list
    if let Some(search) = rule_search {
        if let Some(book_list) = &search.base.book_list {
            if js_block::contains_js_block(book_list) {
                let (_translated_js, _is_async, _needs_browser) =
                    js_block::translate_js_block(book_list);
                needs_browser = needs_browser || _needs_browser;
                js.push_str(&_translated_js);
                js.push('\n');
                // The JS block provides the items directly
                js.push_str("return items || [];\n");
            } else {
                // Plain CSS selector for bookList
                let steps = css::parse_chain(book_list);
                if !steps.is_empty() {
                    js.push_str("const doc = __parseHTML(html);\n");
                    js.push_str(&format!("const items = {};\n", css::to_js_all_expression(&steps)));

                    // Extract fields for each item
                    js.push_str("return items.map(item => ({\n");

                    let fields = [
                        ("name", &search.base.name),
                        ("author", &search.base.author),
                        ("bookUrl", &search.base.book_url),
                        ("coverUrl", &search.base.cover_url),
                        ("intro", &search.base.intro),
                        ("lastChapter", &search.base.last_chapter),
                        ("kind", &search.base.kind),
                    ];

                    for (field_name, field_rule) in &fields {
                        if let Some(rule) = field_rule {
                            if !rule.is_empty() {
                                js.push_str(&format!(
                                    "  {}: {},\n",
                                    field_name,
                                    translate_rule_field(&Some(rule.clone()))
                                        .replace("el.", "item.")
                                ));
                            }
                        }
                    }

                    if let Some(keyword) = &search.check_key_word {
                        if !keyword.is_empty() {
                            js.push_str(&format!("  // checkKeyWord: {}\n", keyword));
                        }
                    }

                    js.push_str("}));\n");
                }
            }
        } else {
            // No bookList — try to parse search results differently
            js.push_str("return [];\n");
        }
    } else {
        js.push_str("return [];\n");
    }

    Ok(SearchFn {
        js_code: js,
        needs_browser,
    })
}

/// Translate a book info rule to JS code.
pub fn translate_book_info(source: &LegadoSource) -> BookInfoFn {
    let rule = &source.rule_book_info;
    let mut js = String::new();

    js.push_str("const html = await __fetch(bookUrl, { headers: HEADERS });\n");
    js.push_str("const doc = __parseHTML(html);\n");

    if let Some(info) = rule {
        let fields = [
            ("name", &info.name),
            ("author", &info.author),
            ("coverUrl", &info.cover_url),
            ("intro", &info.intro),
            ("kind", &info.kind),
            ("lastChapter", &info.last_chapter),
            ("tocUrl", &info.toc_url),
            ("wordCount", &info.word_count),
        ];

        js.push_str("return {\n");
        for (field_name, field_rule) in &fields {
            let translated = translate_rule_field(field_rule);
            js.push_str(&format!("  {}: {},\n", field_name, translated));
        }
        js.push_str("  bookUrl,\n");
        js.push_str("};\n");
    } else {
        js.push_str("return { name: '', author: '', coverUrl: '', intro: '', bookUrl };\n");
    }

    BookInfoFn {
        js_code: js,
        needs_browser: false,
    }
}

/// Translate a TOC rule to JS code.
pub fn translate_chapters(source: &LegadoSource) -> Result<ChaptersFn, TranslateError> {
    let rule = &source.rule_toc;
    let mut js = String::new();

    if let Some(toc) = rule {
        let toc_url = toc.chapter_list.as_deref().unwrap_or("");

        if toc_url.is_empty() {
            return Err(TranslateError::NoChapterList);
        }

        if js_block::contains_js_block(toc_url) {
            let (translated_js, _is_async, _needs_browser) = js_block::translate_js_block(toc_url);
            js.push_str(&translated_js);
            js.push('\n');
            js.push_str("return items || [];\n");
        } else {
            js.push_str("const html = await __fetch(tocUrl, { headers: HEADERS });\n");
            js.push_str("const doc = __parseHTML(html);\n");

            // Parse chapter list CSS selector
            let steps = css::parse_chain(toc_url);
            if !steps.is_empty() {
                js.push_str(&format!("const items = {};\n", css::to_js_all_expression(&steps)));
            } else {
                js.push_str("const items = [];\n");
            }

            js.push_str("return items.map((item, index) => ({\n");

            // Chapter name
            if let Some(name_rule) = &toc.chapter_name {
                let translated =
                    translate_rule_field(&Some(name_rule.clone())).replace("el.", "item.");
                js.push_str(&format!("  name: {},\n", translated));
            } else {
                js.push_str("  name: item.textContent?.trim() || '',\n");
            }

            // Chapter URL
            if let Some(url_rule) = &toc.chapter_url {
                let translated =
                    translate_rule_field(&Some(url_rule.clone())).replace("el.", "item.");
                js.push_str(&format!("  url: __resolveUrl({}, BASE),\n", translated));
            } else {
                js.push_str("  url: item.getAttribute('href') || '',\n");
            }

            js.push_str("  index,\n");
            js.push_str("}));\n");
        }
    } else {
        js.push_str("return [];\n");
    }

    Ok(ChaptersFn {
        js_code: js,
        needs_browser: false,
    })
}

/// Translate a content rule to JS code.
pub fn translate_content(source: &LegadoSource) -> Result<ContentFn, TranslateError> {
    let rule = &source.rule_content;
    let mut js = String::new();
    let has_web_js;

    if let Some(content) = rule {
        // Check for webJs
        if let Some(web_js) = &content.web_js {
            has_web_js = true;
            js.push_str(&format!(
                "const html = await __browserRender(chapterUrl, '{}');\n",
                web_js.replace('\'', "\\'")
            ));
        } else {
            has_web_js = false;
            js.push_str("const html = await __fetch(chapterUrl, { headers: HEADERS });\n");
        }

        js.push_str("const doc = __parseHTML(html);\n");

        // Content body
        if let Some(content_rule) = &content.content {
            if js_block::contains_js_block(content_rule) {
                let (translated_js, _is_async, _needs_browser) =
                    js_block::translate_js_block(content_rule);
                js.push_str(&translated_js);
                js.push('\n');
            } else {
                let translated = translate_rule_field(&Some(content_rule.clone()));
                js.push_str(&format!("let content = {};\n", translated));
            }
        } else {
            js.push_str("let content = '';\n");
        }

        // Source regex + replace regex
        if let Some(source_regex) = &content.source_regex {
            if let Some(replace_regex) = &content.replace_regex {
                js.push_str(&format!(
                    "content = content.replace(/{}/g, '{}');\n",
                    source_regex.replace('/', "\\/"),
                    replace_regex.replace('\'', "\\'")
                ));
            }
        } else if let Some(replace_regex) = &content.replace_regex {
            // Standalone replaceRegex with ##pattern##replacement format
            if let Some(stripped) = replace_regex.strip_prefix("##") {
                if let Some(end) = stripped.rfind("##") {
                    let pattern = &stripped[..end];
                    let replacement = &stripped[end + 2..];
                    js.push_str(&format!(
                        "content = content.replace(/{}/g, '{}');\n",
                        pattern.replace('/', "\\/"),
                        replacement.replace('\'', "\\'")
                    ));
                }
            }
        }

        // Sub content (if present)
        if let Some(sub) = &content.sub_content {
            if !sub.is_empty() {
                let translated = translate_rule_field(&Some(sub.clone()));
                js.push_str(&format!("const subContent = {};\n", translated));
                js.push_str("if (subContent) content += '\\n' + subContent;\n");
            }
        }

        // Title extraction
        if let Some(title) = &content.title {
            if !title.is_empty() {
                let translated = translate_rule_field(&Some(title.clone()));
                js.push_str(&format!("const chapterTitle = {};\n", translated));
            }
        }

        // Next content URL (pagination)
        if let Some(next_url) = &content.next_content_url {
            if !next_url.is_empty() {
                js.push_str(&format!(
                    "// Pagination via nextContentUrl: {}\n// TODO: implement multi-page loop\n",
                    next_url
                ));
            }
        }

        js.push_str("return content.trim();\n");
    } else {
        has_web_js = false;
        js.push_str("return '';\n");
    }

    Ok(ContentFn {
        js_code: js,
        has_web_js,
    })
}

/// Generate the complete JS module code.
pub fn generate_source(source: &LegadoSource) -> Result<String, TranslateError> {
    let meta = parse_metadata(source);
    let search = translate_search(source)?;
    let book_info = translate_book_info(source);
    let chapters = translate_chapters(source)?;
    let content = translate_content(source)?;

    let mut code = String::new();

    // Header
    code.push_str("// Auto-generated from Legado book source\n");
    code.push_str(&format!("// Source: {}\n\n", meta.name));

    code.push_str(&format!("const META = {{\n"));
    code.push_str(&format!("  id: '{}',\n", meta.id));
    code.push_str(&format!("  name: '{}',\n", meta.name));
    code.push_str(&format!("  url: '{}',\n", meta.base_url));
    code.push_str(&format!("  group: '{}',\n", meta.group));
    code.push_str(&format!("  type: '{}',\n", meta.source_type));
    code.push_str("};\n\n");

    code.push_str(&format!("const BASE = '{}';\n", meta.base_url));
    code.push_str(&format!("const HEADERS = {};\n", meta.header_json));
    code.push_str("const TIMEOUT_MS = 30000;\n\n");
    code.push_str("// --- Runtime helpers (injected) ---\n");
    code.push_str(
        "// __fetch, __parseHTML, __browserRender, __resolveUrl, __cookieStore, __ctx\n\n",
    );

    // CF detection helper
    code.push_str(
        r#"function __isCFBlocked(html) {
  return /turnstile\.render|cf-challenge|Just a moment|cf-browser-verification/i.test(html);
}

"#,
    );

    // search function
    code.push_str("export async function search(keyword, page = 1) {\n");
    for line in search.js_code.lines() {
        code.push_str(&format!("  {}\n", line));
    }
    code.push_str("}\n\n");

    // bookInfo function
    code.push_str("export async function bookInfo(bookUrl) {\n");
    for line in book_info.js_code.lines() {
        code.push_str(&format!("  {}\n", line));
    }
    code.push_str("}\n\n");

    // chapterList function
    code.push_str("export async function chapterList(tocUrl) {\n");
    for line in chapters.js_code.lines() {
        code.push_str(&format!("  {}\n", line));
    }
    code.push_str("}\n\n");

    // chapterContent function
    code.push_str("export async function chapterContent(chapterUrl) {\n");
    for line in content.js_code.lines() {
        code.push_str(&format!("  {}\n", line));
    }
    code.push_str("}\n\n");

    Ok(code)
}

fn parse_metadata(source: &LegadoSource) -> SourceMeta {
    let id = source
        .book_source_url
        .replace("https://", "")
        .replace("http://", "")
        .replace('/', "_")
        .replace('.', "_")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    let header_json = source.header.as_deref().unwrap_or("{}").to_string();

    // Parse header JSON string
    let header_json = header_json.replace('\n', " ").replace('\r', " ");

    SourceMeta {
        id,
        name: source.book_source_name.clone(),
        base_url: source.book_source_url.clone(),
        group: source.book_source_group.clone().unwrap_or_default(),
        source_type: "novel".to_string(),
        header_json,
        has_search: source.search_url.is_some() || source.rule_search.is_some(),
        has_explore: source.explore_url.is_some(),
        charset: None,
        has_browser: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use nexus_core::legado;

    fn make_69shuba_source() -> LegadoSource {
        LegadoSource {
            book_source_name: "69书吧".to_string(),
            book_source_url: "https://www.69shuba.com".to_string(),
            book_source_group: Some("🌙 小说".to_string()),
            header: Some(r#"{"Referer":"https://www.69shuba.com/","Accept-Language":"zh-CN,zh;q=0.9"}"#.to_string()),
            search_url: Some(r#"/modules/article/search.php,{"method":"POST","body":"searchkey={{key}}&searchtype=all","charset":"gbk"}"#.to_string()),
            rule_search: Some(legado::SearchRule {
                base: legado::BookListRule {
                    book_list: Some("class.newbox@tag.li".to_string()),
                    name: Some("tag.h3@tag.a@text".to_string()),
                    author: Some("class.labelbox@tag.label.0@text".to_string()),
                    book_url: Some("tag.h3@tag.a@href".to_string()),
                    cover_url: Some("tag.img@data-src".to_string()),
                    last_chapter: Some("class.zxzj@tag.p@ownText".to_string()),
                    kind: Some("class.labelbox@tag.label!0@text".to_string()),
                    ..Default::default()
                },
                check_key_word: None,
            }),
            rule_book_info: Some(legado::BookInfoRule {
                name: Some("[property$=book_name]@content".to_string()),
                author: Some("[property$=author]@content".to_string()),
                cover_url: Some("[property$=image]@content".to_string()),
                intro: Some("class.navtxt@tag.p.0@textNodes".to_string()),
                kind: Some("[property~=category|status|update_time]@content".to_string()),
                last_chapter: Some("[property$=latest_chapter_name]@content".to_string()),
                toc_url: Some("class.more-btn@href||class.addbtn@tag.a.0@href".to_string()),
                word_count: Some("class.booknav2@tag.p.2@text##\\s*\\|.*$##".to_string()),
                ..Default::default()
            }),
            rule_toc: Some(legado::TocRule {
                chapter_list: Some("-id.catalog@tag.li".to_string()),
                chapter_name: Some("tag.a@text".to_string()),
                chapter_url: Some("tag.a@href".to_string()),
                ..Default::default()
            }),
            rule_content: Some(legado::ContentRule {
                content: Some("class.txtnav@textNodes".to_string()),
                replace_regex: Some("##\\s*[（(]?本章完[）)]?\\s*$|新.{0,2}书吧|吧书.{0,2}新|请记住本书首发域名.*|www\\.69shuba\\.com|loadAdv\\([\\d, ]*\\);?".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    #[test]
    fn test_translate_69shuba_search() {
        let source = make_69shuba_source();
        let search = translate_search(&source).unwrap();
        assert!(search.js_code.contains("__fetch"));
        assert!(search.js_code.contains("POST"));
        assert!(search.js_code.contains("gbk"));
        assert!(search.js_code.contains("querySelectorAll"));
        assert!(search.js_code.contains("item.querySelector"));
    }

    #[test]
    fn test_translate_69shuba_book_info() {
        let source = make_69shuba_source();
        let info = translate_book_info(&source);
        assert!(info.js_code.contains("bookUrl"));
        assert!(info.js_code.contains("__parseHTML"));
        assert!(info.js_code.contains("[property$="));
    }

    #[test]
    fn test_translate_69shuba_chapters() {
        let source = make_69shuba_source();
        let chapters = translate_chapters(&source).unwrap();
        assert!(chapters.js_code.contains("__parseHTML"));
        assert!(chapters.js_code.contains("item.querySelector"));
        assert!(chapters.js_code.contains("index"));
    }

    #[test]
    fn test_translate_69shuba_content() {
        let source = make_69shuba_source();
        let content = translate_content(&source).unwrap();
        assert!(content.js_code.contains("__parseHTML"));
        assert!(content.js_code.contains("content.trim"));
        assert!(!content.has_web_js);
    }

    #[test]
    fn test_generate_full_source() {
        let source = make_69shuba_source();
        let js = generate_source(&source).unwrap();
        assert!(js.contains("export async function search"));
        assert!(js.contains("export async function bookInfo"));
        assert!(js.contains("export async function chapterList"));
        assert!(js.contains("export async function chapterContent"));
        assert!(js.contains("__isCFBlocked"));
        assert!(js.contains("BASE"));
        assert!(js.contains("HEADERS"));
    }

    #[test]
    fn test_split_fallback() {
        let parts = split_top_level_ops("class.more-btn@href||class.addbtn@tag.a.0@href");
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[1].0, "||");
    }

    #[test]
    fn test_split_concat() {
        let parts = split_top_level_ops("A && B && C");
        assert_eq!(parts.len(), 3);
    }

    #[test]
    fn test_regex_clean() {
        let result = translate_selector_or_operator("class.foo@text##\\s*test$##");
        assert!(result.contains(".replace("));
    }
}
