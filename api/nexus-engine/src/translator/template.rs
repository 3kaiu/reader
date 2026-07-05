//! Legado URL template parser.
//!
//! Handles Legado's URL template syntax used in searchUrl and exploreUrl:
//!   - `{{key}}`, `{key}`, `%s` → search keyword
//!   - `{{page}}`, `{page}` → page number
//!   - `{{java.put('key', val)}}` → java method in template
//!   - `url,{method:'POST',body:'...',charset:'gbk'}` → compound URL
//!   - `{{$.jsonpath}}` → JSONPath result insertion

/// A parsed component of a URL template.
#[derive(Debug, Clone, PartialEq)]
pub enum UrlPart {
    /// Literal string
    Literal(String),
    /// Search keyword placeholder: {{key}}, {key}, %s
    Keyword,
    /// Page number placeholder: {{page}}, {page}
    Page,
    /// Java method invocation in template: {{java.put('key', val)}}
    JavaCall {
        method: String,
        args: Vec<String>,
    },
    /// JSONPath placeholder: {{$.store.book[0].title}}
    JsonPath(String),
}

/// The result of parsing a search URL: URL + optional HTTP options.
#[derive(Debug, Clone, PartialEq)]
pub struct CompoundUrl {
    /// URL path or template parts
    pub url_parts: Vec<UrlPart>,
    /// HTTP method (GET/POST)
    pub method: String,
    /// POST body template parts (empty for GET)
    pub body: Vec<UrlPart>,
    /// Response charset (e.g. "gbk", "utf-8")
    pub charset: Option<String>,
}

/// Parse a Legado compound URL template.
///
/// Format: "path/to/search.php,{method:'POST',body:'searchkey={{key}}&type=all',charset:'gbk'}"
/// Or simple: "/search?q={{key}}"
pub fn parse_compound_url(input: &str) -> CompoundUrl {
    let trimmed = input.trim();

    // Check for compound format: URL,{options}
    if let Some(comma_pos) = trimmed.find(",{") {
        let url_part = &trimmed[..comma_pos];
        let options_part = &trimmed[comma_pos + 1..];

        let mut method = "GET".to_string();
        let mut body = String::new();
        let mut charset: Option<String> = None;

        // Parse method
        if options_part.contains("'method':'POST'") || options_part.contains("\"method\":\"POST\"") {
            method = "POST".to_string();
        }

        // Parse body
        if let Some(body_start) = options_part.find("'body':'") {
            let rest = &options_part[body_start + 8..];
            if let Some(body_end) = rest.find('\'') {
                body = rest[..body_end].to_string();
            }
        } else if let Some(body_start) = options_part.find("\"body\":\"") {
            let rest = &options_part[body_start + 8..];
            if let Some(body_end) = rest.find('"') {
                body = rest[..body_end].to_string();
            }
        }

        // Parse charset
        if options_part.contains("'charset':'gbk'") || options_part.contains("\"charset\":\"gbk\"") {
            charset = Some("gbk".to_string());
        } else if options_part.contains("'charset':'utf-8'") || options_part.contains("\"charset\":\"utf-8\"") {
            charset = Some("utf-8".to_string());
        }

        CompoundUrl {
            url_parts: parse_template(url_part),
            method,
            body: if body.is_empty() {
                Vec::new()
            } else {
                parse_template(&body)
            },
            charset,
        }
    } else {
        // Simple URL
        CompoundUrl {
            url_parts: parse_template(trimmed),
            method: "GET".to_string(),
            body: Vec::new(),
            charset: None,
        }
    }
}

/// Parse a template string into parts.
///
/// Handles: {{key}}, {key}, %s, {{page}}, {page}, {{java.method(args)}}, {{$.jsonpath}}
fn parse_template(input: &str) -> Vec<UrlPart> {
    let mut parts = Vec::new();
    let mut remaining = input;

    while !remaining.is_empty() {
        // Check for {{...}} (double curly brace)
        if let Some(start) = remaining.find("{{") {
            // Add text before {{
            if start > 0 {
                parts.push(UrlPart::Literal(remaining[..start].to_string()));
            }
            let after_open = &remaining[start + 2..];

            if let Some(end) = after_open.find("}}") {
                let inner = &after_open[..end];

                // Determine what's inside
                if inner == "key" || inner == "search" || inner == "keyword" {
                    parts.push(UrlPart::Keyword);
                } else if inner == "page" {
                    parts.push(UrlPart::Page);
                } else if let Some(java_call) = inner.strip_prefix("java.") {
                    let (method, args) = parse_java_call(java_call);
                    parts.push(UrlPart::JavaCall { method, args });
                } else if inner.starts_with("$.") {
                    parts.push(UrlPart::JsonPath(inner.to_string()));
                } else {
                    parts.push(UrlPart::Literal(format!("{{{{{}}}}}", inner)));
                }

                remaining = &after_open[end + 2..];
            } else {
                parts.push(UrlPart::Literal(remaining.to_string()));
                remaining = "";
            }
        }
        // Check for {key} (single curly brace)
        else if let Some(start) = remaining.find('{') {
            if start > 0 {
                parts.push(UrlPart::Literal(remaining[..start].to_string()));
            }
            let after_open = &remaining[start + 1..];

            if let Some(end) = after_open.find('}') {
                let inner = &after_open[..end];
                if inner == "key" || inner == "search" || inner == "keyword" {
                    parts.push(UrlPart::Keyword);
                } else if inner == "page" {
                    parts.push(UrlPart::Page);
                } else {
                    parts.push(UrlPart::Literal(format!("{{{}}}", inner)));
                }
                remaining = &after_open[end + 1..];
            } else {
                parts.push(UrlPart::Literal(remaining.to_string()));
                remaining = "";
            }
        }
        // Check for %s (legacy format)
        else if let Some(start) = remaining.find("%s") {
            if start > 0 {
                parts.push(UrlPart::Literal(remaining[..start].to_string()));
            }
            parts.push(UrlPart::Keyword);
            remaining = &remaining[start + 2..];
        } else {
            // Plain text
            parts.push(UrlPart::Literal(remaining.to_string()));
            remaining = "";
        }
    }

    // Remove trailing empty literals
    while let Some(UrlPart::Literal(s)) = parts.last() {
        if s.is_empty() {
            parts.pop();
        } else {
            break;
        }
    }

    parts
}

/// Parse a java method call from template: "put('69key',key)" → ("put", ["69key", "key"])
fn parse_java_call(input: &str) -> (String, Vec<String>) {
    let input = input.trim();

    if let Some(paren_open) = input.find('(') {
        let method = input[..paren_open].trim().to_string();
        let args_str = &input[paren_open + 1..];

        // Find matching close paren
        let mut depth = 1;
        let mut paren_close = args_str.len();
        for (i, c) in args_str.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        paren_close = i;
                        break;
                    }
                }
                _ => {}
            }
        }

        let args_body = &args_str[..paren_close];
        let args: Vec<String> = parse_arguments(args_body);
        (method, args)
    } else {
        (input.to_string(), Vec::new())
    }
}

/// Parse comma-separated arguments, handling quoted strings.
fn parse_arguments(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut depth = 0;

    for c in input.chars() {
        match c {
            '\'' if !in_double_quote => {
                in_single_quote = !in_single_quote;
                if !in_single_quote {
                    // End of quoted string
                }
            }
            '"' if !in_single_quote => {
                in_double_quote = !in_double_quote;
            }
            '(' if !in_single_quote && !in_double_quote => depth += 1,
            ')' if !in_single_quote && !in_double_quote => depth -= 1,
            ',' if !in_single_quote && !in_double_quote && depth == 0 => {
                let trimmed = current.trim().to_string();
                if !trimmed.is_empty() {
                    args.push(trimmed);
                }
                current.clear();
                continue;
            }
            _ => {}
        }
        current.push(c);
    }

    let trimmed = current.trim().to_string();
    if !trimmed.is_empty() {
        args.push(trimmed);
    }

    args
}

/// Generate JS code for a URL template.
pub fn generate_js_url(parts: &[UrlPart], keyword_var: &str, page_var: &str) -> String {
    if parts.is_empty() {
        return format!("`${{{}}}`", keyword_var);
    }

    let mut js = String::from("`");
    for part in parts {
        match part {
            UrlPart::Literal(s) => js.push_str(&escape_template_literal(s)),
            UrlPart::Keyword => js.push_str(&format!("${{encodeURIComponent({})}}", keyword_var)),
            UrlPart::Page => js.push_str(&format!("${{{}}}", page_var)),
            UrlPart::JavaCall { method, args } => {
                // java.put/get in template → translate to context store
                if method == "put" && args.len() >= 2 {
                    let key = args[0].trim_matches('\'').trim_matches('"');
                    let val = args[1].trim();
                    let val_expr = if val == "key" || val == keyword_var {
                        keyword_var.to_string()
                    } else {
                        val.to_string()
                    };
                    js.push_str(&format!("${{__ctx.store['{}']={},''}}", key, val_expr));
                } else if method == "get" && args.len() >= 1 {
                    let key = args[0].trim_matches('\'').trim_matches('"');
                    js.push_str(&format!("${{__ctx.store['{}']||''}}", key));
                } else {
                    // Unknown java call — emit warning in comment
                    js.push_str(&format!("${{'' /* TODO: java.{}({:?}) */}}", method, args));
                }
            }
            UrlPart::JsonPath(path) => {
                // JSONPath result — needs to be resolved at runtime
                js.push_str(&format!("${{/* JSONPath: {} */}}", path));
            }
        }
    }
    js.push('`');
    js
}

fn escape_template_literal(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${")
}

/// Generate JS code for POST body (used with compound URLs).
pub fn generate_js_body(parts: &[UrlPart], keyword_var: &str) -> String {
    if parts.is_empty() {
        return "undefined".to_string();
    }

    let mut js = String::from("`");
    for part in parts {
        match part {
            UrlPart::Literal(s) => js.push_str(&escape_template_literal(s)),
            UrlPart::Keyword => js.push_str(&format!("${{{}}}", keyword_var)),
            UrlPart::Page => js.push_str(&format!("${{{}}}", keyword_var)),
            UrlPart::JavaCall { method, args } => {
                if method == "put" && args.len() >= 2 {
                    let key = args[0].trim_matches('\'').trim_matches('"');
                    let val = args[1].trim();
                    let val_expr = if val == "key" || val == keyword_var {
                        keyword_var.to_string()
                    } else {
                        val.to_string()
                    };
                    js.push_str(&format!("${{__ctx.store['{}']={},''}}", key, val_expr));
                } else if method == "get" && args.len() >= 1 {
                    let key = args[0].trim_matches('\'').trim_matches('"');
                    js.push_str(&format!("${{__ctx.store['{}']||''}}", key));
                } else {
                    js.push_str("''");
                }
            }
            UrlPart::JsonPath(path) => {
                js.push_str(&format!("${{/* JSONPath: {} */}}", path));
            }
        }
    }
    js.push('`');
    js
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_url() {
        let url = parse_compound_url("/search?q={{key}}");
        assert_eq!(url.url_parts.len(), 2);
        assert_eq!(url.method, "GET");
        assert!(url.body.is_empty());
    }

    #[test]
    fn test_keyword_template() {
        let parts = parse_template("/search?q={{key}}&page={{page}}");
        assert_eq!(parts.len(), 4);
        assert_eq!(parts[0], UrlPart::Literal("/search?q=".to_string()));
        assert_eq!(parts[1], UrlPart::Keyword);
        assert_eq!(parts[2], UrlPart::Literal("&page=".to_string()));
        assert_eq!(parts[3], UrlPart::Page);
    }

    #[test]
    fn test_single_brace_keyword() {
        let parts = parse_template("/search?q={key}");
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0], UrlPart::Literal("/search?q=".to_string()));
        assert_eq!(parts[1], UrlPart::Keyword);
    }

    #[test]
    fn test_percent_s_keyword() {
        let parts = parse_template("/search?q=%s");
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0], UrlPart::Literal("/search?q=".to_string()));
        assert_eq!(parts[1], UrlPart::Keyword);
    }

    #[test]
    fn test_compound_url_post() {
        let url = parse_compound_url(
            "/modules/article/search.php,{\"method\":\"POST\",\"body\":\"searchkey={{key}}&type=all\",\"charset\":\"gbk\"}"
        );
        assert_eq!(url.method, "POST");
        assert_eq!(url.charset, Some("gbk".to_string()));
        assert!(!url.body.is_empty());
    }

    #[test]
    fn test_java_put_in_template() {
        let parts = parse_template("{{java.put('69key',key)}}&searchtype=all");
        assert_eq!(parts.len(), 2);
        assert_eq!(
            parts[0],
            UrlPart::JavaCall {
                method: "put".to_string(),
                args: vec!["'69key'".to_string(), "key".to_string()]
            }
        );
    }

    #[test]
    fn test_generate_js_url_simple() {
        let parts = parse_template("/search?q={{key}}");
        let js = generate_js_url(&parts, "keyword", "page");
        assert_eq!(js, "`/search?q=${encodeURIComponent(keyword)}`");
    }

    #[test]
    fn test_generate_js_url_with_page() {
        let parts = parse_template("/search?q={{key}}&p={{page}}");
        let js = generate_js_url(&parts, "keyword", "page");
        assert_eq!(
            js,
            "`/search?q=${encodeURIComponent(keyword)}&p=${page}`"
        );
    }

    #[test]
    fn test_generate_js_java_put() {
        let parts = parse_template("{{java.put('69key',key)}}&searchtype=all");
        let js = generate_js_url(&parts, "keyword", "page");
        assert!(js.contains("__ctx.store['69key']=keyword"));
    }

    #[test]
    fn test_generate_js_body() {
        let parts = parse_template("searchkey={{key}}&type=all");
        let js = generate_js_body(&parts, "keyword");
        assert_eq!(js, "`searchkey=${keyword}&type=all`");
    }

    #[test]
    fn test_69shuba_search_url() {
        let url = parse_compound_url(
            "/modules/article/search.php,{\"method\":\"POST\",\"body\":\"searchkey={{java.put('69key',key)}}&searchtype=all\",\"charset\":\"gbk\"}"
        );
        assert_eq!(url.method, "POST");
        assert_eq!(url.charset, Some("gbk".to_string()));
        assert_eq!(url.url_parts.len(), 1);
        assert_eq!(
            url.url_parts[0],
            UrlPart::Literal("/modules/article/search.php".to_string())
        );

        let js_body = generate_js_body(&url.body, "keyword");
        assert!(js_body.contains("__ctx.store['69key']=keyword"));
        // The java.put returns empty string in template context, so no keyword in body
        assert!(!js_body.contains("${keyword}"));
    }

    #[test]
    fn test_explore_url_json() {
        // From 69shuba source:
        // exploreUrl: JSON array with {{page}} in each URL
        let template = "/novels/monthvisit_0_0_{{page}}.htm";
        let parts = parse_template(template);
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0], UrlPart::Literal("/novels/monthvisit_0_0_".to_string()));
        assert_eq!(parts[1], UrlPart::Page);
        assert_eq!(parts[2], UrlPart::Literal(".htm".to_string()));
    }
}