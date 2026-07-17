use async_trait::async_trait;
use serde::de::DeserializeOwned;

use super::types::*;
use crate::error::AiError;

/// Abstraction over the ai-inference Python service.
#[async_trait]
pub trait InferenceService: Send + Sync {
    /// Single-term decode (on-demand query).
    async fn decode(&self, req: DecodeRequest) -> Result<DecodeResponse, AiError>;

    /// Full chapter scan (batch alias/event extraction).
    async fn scan(&self, req: ScanRequest) -> Result<ScanResult, AiError>;

    /// Decode with enriched chapter context (known mappings + surrounding).
    async fn decode_with_context(
        &self,
        req: DecodeRequest,
        context: &ChapterContext,
    ) -> Result<DecodeResponse, AiError>;
}

/// Context metadata passed alongside decode requests.
#[derive(Debug, Clone)]
pub struct ChapterContext {
    pub book_id: String,
    pub chapter_index: usize,
    pub chapter_title: String,
    pub known_mappings: Vec<AliasMapping>,
    pub recent_chapter_summaries: Vec<String>,
}

/// HTTP-based implementation — bridges to the Python ai-inference service.
pub struct InferenceClient {
    base_url: String,
    client: reqwest::Client,
}

impl InferenceClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: reqwest::Client::new(),
        }
    }

    async fn post<T: DeserializeOwned>(
        &self,
        path: &str,
        body: &impl serde::Serialize,
    ) -> Result<T, AiError> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .client
            .post(&url)
            .json(body)
            .send()
            .await
            .map_err(|e| AiError::InferenceUnavailable(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(AiError::InferenceFailed(format!("HTTP {}: {}", status, text)));
        }

        resp.json()
            .await
            .map_err(|e| AiError::InferenceFailed(e.to_string()))
    }
}

#[async_trait]
impl InferenceService for InferenceClient {
    async fn decode(&self, req: DecodeRequest) -> Result<DecodeResponse, AiError> {
        self.post("/decode", &req).await
    }

    async fn scan(&self, req: ScanRequest) -> Result<ScanResult, AiError> {
        self.post("/scan", &req).await
    }

    async fn decode_with_context(
        &self,
        req: DecodeRequest,
        _context: &ChapterContext,
    ) -> Result<DecodeResponse, AiError> {
        // TODO V2: pack context into req.context_meta before sending
        self.post("/decode", &req).await
    }
}
