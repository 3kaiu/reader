use serde::{Deserialize, Serialize};

/// 替换规则模型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    pub name: String,
    pub pattern: String,
    pub replacement: String,
    pub scope: String,
    #[serde(rename = "isEnabled")]
    pub is_enabled: bool,
    #[serde(rename = "isRegex")]
    pub is_regex: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
}
