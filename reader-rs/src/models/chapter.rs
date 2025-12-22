use serde::{Deserialize, Serialize};

/// 章节模型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    pub title: String,
    pub url: String,
    pub index: i32,
}
