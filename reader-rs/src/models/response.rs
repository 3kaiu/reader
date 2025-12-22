use serde::{Deserialize, Serialize};

/// 统一 API 响应格式
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse<T> {
    pub is_success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_msg: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            is_success: true,
            error_msg: None,
            data: Some(data),
        }
    }

    pub fn error(msg: &str) -> Self {
        Self {
            is_success: false,
            error_msg: Some(msg.to_string()),
            data: None,
        }
    }
}
