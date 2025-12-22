use serde::{Deserialize, Serialize};

/// 书籍分组模型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookGroup {
    pub group_id: i64,
    pub group_name: String,
    pub order: i32,
    pub show: bool,
}
