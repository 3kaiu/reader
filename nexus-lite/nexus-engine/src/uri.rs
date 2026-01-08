//! URL resolution utilities for NXS Engine
//!
//! Handles:
//! - Absolute URL resolution
//! - Redirect URL extraction (DuckDuckGo, etc.)
//! - Query encoding (UTF-8, GBK)

/// Resolve a relative URL to absolute based on source base URL
pub fn resolve_url(url: &str, base_url: &str) -> String {
    // 1. Handle common redirect patterns (like DuckDuckGo)
    let url = if url.contains("uddg=") {
        extract_redirect_param(url, "uddg")
    } else {
        url.to_string()
    };

    // 2. Resolve relative URLs
    if url.starts_with("http://") || url.starts_with("https://") {
        url
    } else if url.starts_with("//") {
        format!("https:{}", url)
    } else if url.starts_with('/') {
        format!("{}{}", base_url.trim_end_matches('/'), url)
    } else {
        // Check if it's already a full URL (some might not start with http but are valid)
        if url.contains('.') && !url.contains('/') {
            format!("https://{}", url)
        } else {
            format!("{}/{}", base_url.trim_end_matches('/'), url)
        }
    }
}

/// Extract URL from redirect parameter (e.g., DuckDuckGo's uddg parameter)
pub fn extract_redirect_param(url: &str, param: &str) -> String {
    let search_pattern = format!("{}=", param);
    if let Some(start) = url.find(&search_pattern) {
        let param_value = &url[start + search_pattern.len()..];
        let end = param_value.find('&').unwrap_or(param_value.len());
        let encoded = &param_value[..end];
        urlencoding::decode(encoded)
            .map(|s| s.into_owned())
            .unwrap_or_else(|_| url.to_string())
    } else {
        url.to_string()
    }
}

/// Encode query string based on specified encoding
pub fn encode_query(query: &str, encoding: Option<&str>) -> String {
    match encoding {
        Some("GBK") | Some("gbk") => {
            let (cow, _, _) = encoding_rs::GBK.encode(query);
            let bytes = cow.into_owned();
            bytes
                .iter()
                .map(|&b| format!("%{:02X}", b))
                .collect::<Vec<_>>()
                .join("")
        }
        _ => urlencoding::encode(query).into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_absolute_url() {
        let base = "https://example.com";
        assert_eq!(
            resolve_url("https://other.com/page", base),
            "https://other.com/page"
        );
    }

    #[test]
    fn test_resolve_relative_url() {
        let base = "https://example.com";
        assert_eq!(resolve_url("/page/1", base), "https://example.com/page/1");
    }

    #[test]
    fn test_resolve_protocol_relative() {
        let base = "https://example.com";
        assert_eq!(
            resolve_url("//cdn.example.com/img.jpg", base),
            "https://cdn.example.com/img.jpg"
        );
    }
}
