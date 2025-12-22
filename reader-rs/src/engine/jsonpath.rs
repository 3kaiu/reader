use jsonpath_rust::JsonPath;
use serde_json::Value;

pub struct JsonPathParser;

impl JsonPathParser {
    /// 使用 JSONPath 获取单个字符串
    pub fn get_string(content: &str, rule: &str) -> Result<String, anyhow::Error> {
        let json: Value = serde_json::from_str(content)?;
        let path = JsonPath::try_from(rule)?;
        let result = path.find_slice(&json);
        
        Ok(result.first()
            .map(|v| {
                let data = v.clone().to_data();
                match data {
                    Value::String(s) => s,
                    v => v.to_string().trim_matches('"').to_string(),
                }
            })
            .unwrap_or_default())
    }

    /// 使用 JSONPath 获取列表
    pub fn get_list(content: &str, rule: &str) -> Result<Vec<String>, anyhow::Error> {
        let json: Value = serde_json::from_str(content)?;
        let path = JsonPath::try_from(rule)?;
        let result = path.find_slice(&json);
        
        Ok(result.iter()
            .map(|v| {
                let data = v.clone().to_data();
                match data {
                    Value::String(s) => s,
                    v => v.to_string().trim_matches('"').to_string(),
                }
            })
            .collect())
    }
}
