//! @js: block translator — translates Legado JS blocks to modern ES6+.
//!
//! Handles java.* → modern JS API translation, data flow analysis,
//! and state management conversion.

use super::css;
use regex::Regex;

/// Check if a rule string contains a @js: or <js> block.
pub fn contains_js_block(rule: &str) -> bool {
    rule.contains("@js:") || rule.contains("<js>")
}

/// Extract and translate a @js: or <js> block from a rule string.
///
/// Returns (before, translated_js, after) where before/after are the
/// parts of the rule string surrounding the JS block.
pub fn extract_js_block(rule: &str) -> Option<(&str, &str, &str)> {
    let trimmed = rule.trim();

    // Full block: entire string is JS
    if let Some(code) = trimmed.strip_prefix("@js:") {
        return Some(("", code.trim(), ""));
    }
    if trimmed.starts_with("<js>") && trimmed.ends_with("</js>") {
        let inner = &trimmed[4..trimmed.len() - 5];
        return Some(("", inner.trim(), ""));
    }

    // Inline: JS block inside a rule string (usually as fallback)
    // e.g. "class.foo || <js>...</js>"
    if let Some(js_start) = trimmed.find("<js>") {
        let before = &trimmed[..js_start];
        let after_js_start = &trimmed[js_start + 4..];
        if let Some(js_end) = after_js_start.find("</js>") {
            let js_code = &after_js_start[..js_end];
            let after = &after_js_start[js_end + 5..];
            return Some((before.trim(), js_code.trim(), after.trim()));
        }
    }
    if let Some(js_start) = trimmed.find("@js:") {
        let before = &trimmed[..js_start];
        // @js: until end of string (or next operator)
        let js_code = &trimmed[js_start + 4..].trim();
        return Some((before.trim(), js_code, ""));
    }

    None
}

/// Translate a java.* API call to modern ES6+.
///
/// This performs simple string-level replacement for known patterns.
/// Complex JS blocks that mix java.* with arbitrary logic are preserved
/// with targeted replacements.
pub fn translate_java_apis(js_code: &str) -> String {
    let mut code = js_code.to_string();

    // Ordered replacements: longer patterns first to avoid partial matches

    // ===== java.ajax() — sync HTTP → await fetch =====
    code = replace_java_ajax(&code);

    // ===== java.startBrowserAwait() → browser signal =====
    code = replace_java_start_browser(&code);
    code = replace_java_start_browser_await(&code);

    // ===== java.setContent() + java.getElements() → DOM query =====
    code = replace_java_set_content_get_elements(&code);

    // ===== java.getElements() standalone =====
    code = replace_java_get_elements(&code);

    // ===== java.setContent() standalone =====
    code = replace_java_set_content(&code);

    // ===== java.put() / java.get() — state =====
    code = replace_java_put(&code);
    code = replace_java_get(&code);

    // ===== source.getVariable() / source.setVariable() =====
    code = replace_source_variable(&code);
    code = replace_source_login_info(&code);

    // ===== cookie.* API =====
    code = replace_cookie_apis(&code);

    // ===== java.toast() / java.longToast() =====
    code = replace_all_regex(&code, r"java\.(long)?toast\s*\(([^)]*)\)", "console.log($2)");

    // ===== java.androidId() / java.deviceID() / java.qread() =====
    code = replace_all_regex(
        &code,
        r"java\.(androidId|deviceID|qread)\s*\(\)",
        "'00000000-0000-0000-0000-000000000000'",
    );

    // ===== java.md5Encode() =====
    code = replace_all_regex(&code, r"java\.md5Encode\s*\(([^)]*)\)", "crypto.md5($1)");

    // ===== java.base64Encode() / java.base64Decode() =====
    code = replace_all_regex(&code, r"java\.base64Encode\s*\(([^)]*)\)", "btoa($1)");
    code = replace_all_regex(&code, r"java\.base64Decode\s*\(([^)]*)\)", "atob($1)");

    // ===== list.size() → .length =====
    code = replace_all_regex(&code, r"\.size\s*\(\s*\)", ".length");

    // ===== java.getElements(rule) in CSS rule context =====
    // This must be handled AFTER setContent+getElements combo
    // as the combo pattern is more specific

    // ===== Packages.java.* → try/catch dummy =====
    code = replace_all_regex(&code, r"Packages\.[a-zA-Z0-9_.]+", "undefined /* java class ref */");

    // ===== java.longToast → console.log =====
    code = replace_all_regex(&code, r"java\.longToast\s*\(([^)]*)\)", "console.log($1)");

    code
}

/// Check if the code uses java.ajax() — which makes the block async.
pub fn has_java_ajax(js_code: &str) -> bool {
    js_code.contains("java.ajax(")
}

/// Check if the code uses browser APIs.
pub fn has_browser_api(js_code: &str) -> bool {
    js_code.contains("java.startBrowser(") || js_code.contains("java.startBrowserAwait(")
}

// ===== Replacement helpers =====

fn replace_java_ajax(code: &str) -> String {
    // Pattern: java.ajax(url) or java.ajax(url, options?)
    let mut result = String::new();
    let mut remaining = code;
    let pattern = "java.ajax(";

    while let Some(pos) = remaining.find(pattern) {
        result.push_str(&remaining[..pos]);
        let after = &remaining[pos + pattern.len()..];

        // Find the matching close paren
        let mut depth = 1;
        let mut end = 0;
        for (i, c) in after.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = i;
                        break;
                    }
                },
                _ => {},
            }
        }

        let args = &after[..end];
        remaining = &after[end + 1..];

        // Check if it's a compound URL: url,{method:'POST',body:'...'}
        if args.contains(",{\"method\"") || args.contains(",'{\"method\"") {
            // Parse compound URL format
            let url_end = args
                .find(",{")
                .or_else(|| args.find(",'{"))
                .unwrap_or(args.len());
            let url = &args[..url_end].trim().trim_matches('\'');
            result.push_str(&format!("await __fetch_with_options({})", url));
        } else {
            result.push_str(&format!("await __fetch({})", args));
        }
    }
    result.push_str(remaining);
    result
}

fn replace_java_start_browser(code: &str) -> String {
    replace_all_regex(code, r"java\.startBrowser\s*\(([^)]*)\)", "null /* needs browser: $1 */")
}

fn replace_java_start_browser_await(code: &str) -> String {
    replace_all_regex(
        code,
        r"java\.startBrowserAwait\s*\(([^)]*)\)",
        "await __browserInteraction($1)",
    )
}

fn replace_java_put(code: &str) -> String {
    let mut result = String::new();
    let mut remaining = code;
    let pattern = "java.put(";

    while let Some(pos) = remaining.find(pattern) {
        result.push_str(&remaining[..pos]);
        let after = &remaining[pos + pattern.len()..];

        let mut depth = 1;
        let mut end = 0;
        for (i, c) in after.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = i;
                        break;
                    }
                },
                _ => {},
            }
        }

        let args = &after[..end];
        remaining = &after[end + 1..];

        // Split on comma (simple)
        if let Some(comma) = args.find(',') {
            let key = args[..comma].trim().trim_matches('\'').trim_matches('"');
            let val = args[comma + 1..].trim();
            result.push_str(&format!("__ctx.store['{}']={}", key, val));
        } else {
            result.push_str("undefined");
        }
    }
    result.push_str(remaining);
    result
}

fn replace_java_get(code: &str) -> String {
    let mut result = String::new();
    let mut remaining = code;
    let pattern = "java.get(";

    while let Some(pos) = remaining.find(pattern) {
        result.push_str(&remaining[..pos]);
        let after = &remaining[pos + pattern.len()..];

        let mut depth = 1;
        let mut end = 0;
        for (i, c) in after.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = i;
                        break;
                    }
                },
                _ => {},
            }
        }

        let key = after[..end].trim().trim_matches('\'').trim_matches('"');
        remaining = &after[end + 1..];
        result.push_str(&format!("__ctx.store['{}']", key));
    }
    result.push_str(remaining);
    result
}

fn replace_java_set_content(code: &str) -> String {
    // java.setContent(html) → parsed as side effect only, HTML already available
    replace_all_regex(code, r"java\.setContent\s*\([^)]*\)\s*;?", "")
}

fn replace_java_set_content_get_elements(code: &str) -> String {
    // Pattern: java.setContent(result); var list = java.getElements(rule);
    // → const doc = parseHTML(result); const list = __queryAll(doc, translated_rule);
    let mut result = String::new();
    let mut remaining = code;
    let combo_pattern = "java.setContent(";

    while let Some(pos) = remaining.find(combo_pattern) {
        result.push_str(&remaining[..pos]);

        // Find the setContent argument
        let after_sc = &remaining[pos + combo_pattern.len()..];
        let mut depth = 1;
        let mut sc_end = 0;
        for (i, c) in after_sc.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        sc_end = i;
                        break;
                    }
                },
                _ => {},
            }
        }
        let html_var = &after_sc[..sc_end].trim();
        let rest = &after_sc[sc_end + 1..];

        // Check if followed by getElements
        if let Some(ge_pos) = rest.find("java.getElements(") {
            let after_ge = &rest[ge_pos + "java.getElements(".len()..];

            let mut ge_depth = 1;
            let mut ge_end = 0;
            for (i, c) in after_ge.char_indices() {
                match c {
                    '(' => ge_depth += 1,
                    ')' => {
                        ge_depth -= 1;
                        if ge_depth == 0 {
                            ge_end = i;
                            break;
                        }
                    },
                    _ => {},
                }
            }

            let rule_arg = &after_ge[..ge_end];
            let remaining_code = &after_ge[ge_end + 1..];

            // Try to extract CSS rule string from the argument
            let (css_rule, needs_parse) = extract_rule_from_arg(rule_arg);

            // Generate: const doc = parseHTML(htmlVar); const list = __queryAll(doc, cssRule);
            result.push_str(&format!(
                "const doc = parseHTML({}); const list = {}",
                html_var,
                if needs_parse {
                    format!("__queryAll(doc, '{}')", css_rule)
                } else {
                    format!("{}", rule_arg)
                }
            ));
            remaining = remaining_code;
        } else {
            result.push_str(&format!("// java.setContent({})", html_var));
            remaining = rest;
        }
    }
    result.push_str(remaining);
    result
}

fn replace_java_get_elements(code: &str) -> String {
    let mut result = String::new();
    let mut remaining = code;
    let pattern = "java.getElements(";

    while let Some(pos) = remaining.find(pattern) {
        result.push_str(&remaining[..pos]);
        let after = &remaining[pos + pattern.len()..];

        let mut depth = 1;
        let mut end = 0;
        for (i, c) in after.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = i;
                        break;
                    }
                },
                _ => {},
            }
        }

        let rule_arg = &after[..end];
        remaining = &after[end + 1..];

        let (css_rule, needs_parse) = extract_rule_from_arg(rule_arg);
        if needs_parse {
            result.push_str(&format!("__queryAll(doc, '{}')", css_rule));
        } else {
            result.push_str(rule_arg);
        }
    }
    result.push_str(remaining);
    result
}

fn replace_source_variable(code: &str) -> String {
    let pattern_set = "source.setVariable(";
    let pattern_get = "source.getVariable(";

    // Check if any pattern exists first
    if !code.contains(&pattern_set) && !code.contains(&pattern_get) {
        return code.to_string();
    }

    // Handle setVariable
    let mut result = String::new();
    let mut remaining = code;

    while let Some(pos) = remaining.find(&pattern_set) {
        result.push_str(&remaining[..pos]);
        let after = &remaining[pos + pattern_set.len()..];
        let mut depth = 1;
        let mut end = 0;
        for (i, c) in after.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = i;
                        break;
                    }
                },
                _ => {},
            }
        }
        let arg = &after[..end];
        remaining = &after[end + 1..];
        result.push_str(&format!("__ctx.variable={}", arg));
    }
    result.push_str(remaining); // Push any remaining text after setVariable

    // Reset for getVariable
    let remaining2 = result;
    result = String::new();
    let mut pos2 = 0;
    while let Some(pos) = remaining2[pos2..].find(&pattern_get) {
        let abs_pos = pos2 + pos;
        result.push_str(&remaining2[pos2..abs_pos]);
        result.push_str("__ctx.variable");
        pos2 = abs_pos + pattern_get.len();
    }
    result.push_str(&remaining2[pos2..]);
    result
}

fn replace_source_login_info(code: &str) -> String {
    replace_all_regex(code, r"source\.getLoginInfoMap\s*\(\s*\)", "(__ctx.loginInfo || {})")
}

fn replace_cookie_apis(code: &str) -> String {
    let mut result = String::new();
    let mut remaining = code;
    let pattern_get = "cookie.getCookie(";
    let pattern_rm = "cookie.removeCookie(";

    while !remaining.is_empty() {
        let get_pos = remaining.find(pattern_get);
        let rm_pos = remaining.find(pattern_rm);

        match (get_pos, rm_pos) {
            (Some(gp), Some(rp)) if gp < rp => {
                result.push_str(&remaining[..gp]);
                remaining = &remaining[gp + pattern_get.len()..];
                let (arg, rest) = extract_paren_arg(remaining);
                result.push_str(&format!("__cookieStore.get({})", arg));
                remaining = rest;
            },
            (Some(_), Some(rp)) => {
                result.push_str(&remaining[..rp]);
                remaining = &remaining[rp + pattern_rm.len()..];
                let (arg, rest) = extract_paren_arg(remaining);
                result.push_str(&format!("__cookieStore.delete({})", arg));
                remaining = rest;
            },
            (Some(gp), None) => {
                result.push_str(&remaining[..gp]);
                remaining = &remaining[gp + pattern_get.len()..];
                let (arg, rest) = extract_paren_arg(remaining);
                result.push_str(&format!("__cookieStore.get({})", arg));
                remaining = rest;
            },
            (None, Some(rp)) => {
                result.push_str(&remaining[..rp]);
                remaining = &remaining[rp + pattern_rm.len()..];
                let (arg, rest) = extract_paren_arg(remaining);
                result.push_str(&format!("__cookieStore.delete({})", arg));
                remaining = rest;
            },
            (None, None) => {
                result.push_str(remaining);
                break;
            },
        }
    }

    result
}

/// Extract the argument inside parentheses, returning (arg, rest).
fn extract_paren_arg(s: &str) -> (&str, &str) {
    let mut depth = 1;
    for (i, c) in s.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return (&s[..i], &s[i + 1..]);
                }
            },
            _ => {},
        }
    }
    (s, "")
}

/// Extract a CSS rule string from a java.getElements() argument.
/// The argument is something like "lr" (variable reference) or "'class.foo@tag.li'" (literal string).
fn extract_rule_from_arg(arg: &str) -> (String, bool) {
    let trimmed = arg.trim();

    // If it's a string literal, parse it and translate
    if (trimmed.starts_with('\'') && trimmed.ends_with('\''))
        || (trimmed.starts_with('"') && trimmed.ends_with('"'))
    {
        let rule_str = &trimmed[1..trimmed.len() - 1];
        let steps = css::parse_chain(rule_str);
        if !steps.is_empty() {
            let selector = css::to_css_selector(&steps);
            return (selector, true);
        }
        return (rule_str.to_string(), true);
    }

    // It's a variable reference — can't translate statically
    (trimmed.to_string(), false)
}

/// Replace all regex matches in a string.
fn replace_all_regex(code: &str, pattern: &str, replacement: &str) -> String {
    if let Ok(re) = Regex::new(pattern) {
        re.replace_all(code, replacement).to_string()
    } else {
        tracing::warn!("Invalid regex pattern: {}", pattern);
        code.to_string()
    }
}

/// Generate the final JS code for a @js: block.
/// Returns (js_code, is_async, needs_browser).
pub fn translate_js_block(js_code: &str) -> (String, bool, bool) {
    let needs_browser = has_browser_api(js_code);
    let is_async = has_java_ajax(js_code) || needs_browser;

    let mut result = translate_java_apis(js_code);

    // Normalize: cast to string, etc.
    result = replace_all_regex(&result, r"String\(([^)]+)\)", "$1");
    result = replace_all_regex(&result, r"new Date\(\)\.getTime\(\)", "Date.now()");

    (result, is_async, needs_browser)
}

/// Check if a value is a plain CSS selector (no @js: or <js>).
pub fn is_plain_selector(rule: &str) -> bool {
    !contains_js_block(rule)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_translate_ajax() {
        let result = translate_java_apis("var html = java.ajax(url);");
        assert_eq!(result, "var html = await __fetch(url);");
    }

    #[test]
    fn test_detect_js_block() {
        assert!(contains_js_block("@js: return result;"));
        assert!(contains_js_block("<js>return result;</js>"));
        assert!(!contains_js_block("class.foo@text"));
    }

    #[test]
    fn test_extract_js_block_js_prefix() {
        let (before, code, after) = extract_js_block("@js: var x = 1; return x;").unwrap();
        assert_eq!(before, "");
        assert_eq!(code, "var x = 1; return x;");
        assert_eq!(after, "");
    }

    #[test]
    fn test_extract_js_block_tag() {
        let (before, code, after) = extract_js_block("<js>var x = 1;</js>").unwrap();
        assert_eq!(before, "");
        assert_eq!(code, "var x = 1;");
        assert_eq!(after, "");
    }

    #[test]
    fn test_translate_put_get() {
        let result = translate_java_apis("java.put('69key', key); var k = java.get('69key');");
        assert_eq!(result, "__ctx.store['69key']=key; var k = __ctx.store['69key'];");
    }

    #[test]
    fn test_translate_set_content_get_elements() {
        // Argument is a variable `lr` - can't statically translate to __queryAll
        let result =
            translate_java_apis("java.setContent(result); var list = java.getElements(lr);");
        assert!(result.contains("parseHTML(result)"));
        assert!(result.contains("list = lr")); // variable ref, not inlined

        // With a string literal argument, it should be inlined
        let result2 = translate_java_apis(
            "java.setContent(html); var list = java.getElements('class.foo@tag.li');",
        );
        assert!(result2.contains("__queryAll"));
    }

    #[test]
    fn test_translate_start_browser() {
        let result = translate_java_apis("java.startBrowserAwait(url, 'title');");
        assert!(result.contains("__browserInteraction"));
    }

    #[test]
    fn test_translate_cookie() {
        let result = translate_java_apis("cookie.removeCookie(u); cookie.getCookie(base_url);");
        assert!(result.contains("__cookieStore.delete"));
        assert!(result.contains("__cookieStore.get"));
    }

    #[test]
    fn test_translate_toast() {
        let result = translate_java_apis("java.toast('hello'); java.longToast('world');");
        assert_eq!(result, "console.log('hello'); console.log('world');");
    }

    #[test]
    fn test_detect_ajax() {
        assert!(has_java_ajax("java.ajax(url)"));
        assert!(!has_java_ajax("java.put('key', val)"));
    }

    #[test]
    fn test_detect_browser() {
        assert!(has_browser_api("java.startBrowser(url, 't')"));
        assert!(has_browser_api("java.startBrowserAwait(url, 't')"));
        assert!(!has_browser_api("java.ajax(url)"));
    }

    #[test]
    fn test_size_to_length() {
        let result = translate_java_apis("list.size()");
        assert_eq!(result, "list.length");
    }

    #[test]
    fn test_is_plain_selector() {
        assert!(is_plain_selector("class.foo@text"));
        assert!(!is_plain_selector("@js: return x;"));
        assert!(!is_plain_selector("<js>...</js>"));
    }

    #[test]
    fn test_69shuba_booklist_block() {
        let js = r#"
var lr = "class.newbox@tag.li";
java.setContent(result);
var list = java.getElements(lr);
var isCF = /turnstile/.test(String(result));
if ((list == null || list.length == 0) && isCF) {
    var u = "https://www.69shuba.com/modules/article/search.php";
    cookie.removeCookie(u);
    java.startBrowserAwait(u + "?searchkey=verify&_=" + Date.now(), "69书吧");
    var k = java.get("69key");
    var req = 'https://www.69shuba.com/modules/article/search.php,{"method":"POST","body":"searchkey=' + k + '&searchtype=all","charset":"gbk"}';
    var html = java.ajax(req);
    java.setContent(html);
    list = java.getElements(lr);
}
list;
"#;
        let (translated, is_async, needs_browser) = translate_js_block(js);
        assert!(is_async);
        assert!(needs_browser);
        assert!(translated.contains("__fetch"));
        assert!(translated.contains("__browserInteraction"));
        assert!(translated.contains("__cookieStore.delete"));
        assert!(translated.contains("__ctx.store['69key']"));
        assert!(translated.contains("parseHTML"));
        // lr is a variable, not a literal CSS rule string
        assert!(translated.contains("lr"));
    }
}
