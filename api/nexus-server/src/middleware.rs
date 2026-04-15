//! API Key Authentication Middleware

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};

use crate::app::AppState;

/// API Key authentication middleware
///
/// Validates the `X-API-Key` header against the configured API key.
/// If no API key is configured, all requests are allowed.
pub async fn api_key_auth(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // If no API key is configured, skip authentication
    let Some(expected_key) = &state.config.server.api_key else {
        return Ok(next.run(request).await);
    };

    // Extract the API key from headers
    let provided_key = request
        .headers()
        .get("X-API-Key")
        .and_then(|v| v.to_str().ok());

    match provided_key {
        Some(key) if key == expected_key => {
            // Valid API key, proceed
            Ok(next.run(request).await)
        },
        Some(_) => {
            // Invalid API key
            tracing::warn!("Invalid API key provided");
            Err(StatusCode::UNAUTHORIZED)
        },
        None => {
            // No API key provided
            tracing::warn!("Missing API key");
            Err(StatusCode::UNAUTHORIZED)
        },
    }
}

#[cfg(test)]
mod tests {
    // Tests would go here, but require mocking the AppState
    // which is complex. Skipping for now.
}
