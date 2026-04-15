//! Unified API Error Response

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

/// Unified API error response structure
#[derive(Debug, Serialize)]
pub struct ApiError {
    /// Error code (e.g., "NOT_FOUND", "INTERNAL_ERROR")
    pub code: String,
    /// Human-readable error message
    pub message: String,
    /// Optional additional details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl ApiError {
    /// Create a new API error
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    /// Add details to the error
    #[allow(dead_code)]
    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    // Common error constructors

    /// Resource not found
    pub fn not_found(resource: &str) -> Self {
        Self::new("NOT_FOUND", format!("{} not found", resource))
    }

    /// Internal server error
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("INTERNAL_ERROR", message)
    }

    /// Bad request
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new("BAD_REQUEST", message)
    }

    /// Conflict (e.g., duplicate resource)
    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new("CONFLICT", message)
    }

    /// Forbidden
    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::new("FORBIDDEN", message)
    }

    /// Unauthorized
    #[allow(dead_code)]
    pub fn unauthorized() -> Self {
        Self::new("UNAUTHORIZED", "Authentication required")
    }
}

/// API error with associated HTTP status code
pub struct ApiErrorResponse {
    status: StatusCode,
    error: ApiError,
}

impl ApiErrorResponse {
    pub fn new(status: StatusCode, error: ApiError) -> Self {
        Self { status, error }
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.error.details = Some(details.into());
        self
    }
}

impl IntoResponse for ApiErrorResponse {
    fn into_response(self) -> Response {
        (self.status, Json(self.error)).into_response()
    }
}

// Convenience type alias
#[allow(dead_code)]
pub type ApiResult<T> = Result<T, ApiErrorResponse>;

// Helper functions for common responses
pub fn not_found(resource: &str) -> ApiErrorResponse {
    ApiErrorResponse::new(StatusCode::NOT_FOUND, ApiError::not_found(resource))
}

pub fn internal_error(message: impl Into<String>) -> ApiErrorResponse {
    ApiErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, ApiError::internal(message))
}

pub fn conflict(message: impl Into<String>) -> ApiErrorResponse {
    ApiErrorResponse::new(StatusCode::CONFLICT, ApiError::conflict(message))
}

pub fn bad_request(message: impl Into<String>) -> ApiErrorResponse {
    ApiErrorResponse::new(StatusCode::BAD_REQUEST, ApiError::bad_request(message))
}

pub fn forbidden(message: impl Into<String>) -> ApiErrorResponse {
    ApiErrorResponse::new(StatusCode::FORBIDDEN, ApiError::forbidden(message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_error_serialization() {
        let error = ApiError::not_found("Book");
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("NOT_FOUND"));
        assert!(json.contains("Book not found"));
    }
}
