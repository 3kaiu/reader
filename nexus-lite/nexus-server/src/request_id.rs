use axum::{
    body::Body,
    http::{HeaderName, HeaderValue, Request},
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

pub const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

fn parse_request_id(request: &Request<Body>) -> Option<String> {
    request
        .headers()
        .get(&REQUEST_ID_HEADER)
        .or_else(|| request.headers().get("X-Request-ID"))
        .or_else(|| request.headers().get("X-Request-Id"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

pub fn get_or_create_request_id(request: &Request<Body>) -> String {
    parse_request_id(request).unwrap_or_else(|| Uuid::new_v4().to_string())
}

pub async fn ensure_request_id(mut request: Request<Body>, next: Next) -> Response {
    let request_id = get_or_create_request_id(&request);

    // Ensure request header contains the id for downstream services/logging.
    if let Ok(v) = HeaderValue::from_str(&request_id) {
        request.headers_mut().insert(REQUEST_ID_HEADER.clone(), v);
    }

    // Also store it in request extensions for handlers/middleware.
    request.extensions_mut().insert(request_id.clone());

    let mut response = next.run(request).await;
    if response.headers().get(&REQUEST_ID_HEADER).is_none() {
        if let Ok(v) = HeaderValue::from_str(&request_id) {
            response.headers_mut().insert(REQUEST_ID_HEADER.clone(), v);
        }
    }

    response
}
