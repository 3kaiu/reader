use super::*;

pub(crate) fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub(crate) fn normalize_source_id(host: &str) -> String {
    host.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

pub(crate) fn infer_source_name(host: &str) -> String {
    host.to_string()
}

pub(crate) fn derive_base_url(url: &Url) -> String {
    let scheme = url.scheme();
    let host = url.host_str().unwrap_or_default();
    let port = url.port().map(|p| format!(":{p}")).unwrap_or_default();
    format!("{scheme}://{host}{port}")
}

pub(crate) fn fingerprint_text(input: &str) -> String {
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

pub(crate) fn cache_key_for_url(session_key: Option<&str>, method: &str, url: &str) -> String {
    fingerprint_text(&format!("{}:{}:{}", session_key.unwrap_or(""), method, url))
}

pub(crate) fn api_error<T>(message: impl AsRef<str>) -> Json<ApiResponse<T>> {
    Json(ApiResponse::error(message.as_ref()))
}
