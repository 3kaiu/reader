use serde::{Deserialize, Serialize};

/// AI Mapping Rule for homophones/entity resolution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMappingRule {
    pub id: String,
    pub original: String,
    pub target: String,
    pub r#type: String,
    pub confidence: f32,
    pub enabled: bool,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage_count: Option<u32>,
}

/// AI Analysis History
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisHistory {
    pub id: String,
    pub book_title: String,
    pub chapter_title: String,
    pub mappings: Vec<AiMappingRule>,
    pub analyzed_at: i64,
}
