use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    /// Master switch — AI features are opt-in
    pub enabled: bool,

    /// URL of the ai-inference Python service (e.g. "http://localhost:8001")
    pub inference_url: String,

    /// Model identifier passed to inference backend
    pub model: String,

    /// Number of recent chapters to include in context window
    pub max_context_chapters: u32,

    /// Automatically scan newly fetched chapters
    pub auto_scan_on_fetch: bool,

    /// Directory for knowledge base files
    pub knowledge_dir: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            inference_url: "http://localhost:8001".to_string(),
            model: "qwen2.5-7b-q4".to_string(),
            max_context_chapters: 5,
            auto_scan_on_fetch: false,
            knowledge_dir: "/app/data/ai-knowledge".to_string(),
        }
    }
}
