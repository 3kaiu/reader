use thiserror::Error;

#[derive(Debug, Error)]
pub enum AiError {
    #[error("inference service unavailable: {0}")]
    InferenceUnavailable(String),

    #[error("inference request failed: {0}")]
    InferenceFailed(String),

    #[error("mapping not found for term '{0}' in book '{1}'")]
    MappingNotFound(String, String),

    #[error("knowledge store error: {0}")]
    StoreError(String),

    #[error("serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("internal error: {0}")]
    Internal(String),
}
