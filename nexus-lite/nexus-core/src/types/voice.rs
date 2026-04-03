use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Voice model metadata for TTS
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceModelMetadata {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub metadata: HashMap<String, String>,
    pub model_size: u64,
    pub sample_duration: f32,
    pub created_at: i64,
    pub updated_at: i64,
}
