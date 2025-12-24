//! JSONPath Parser using jsonpath-rust crate

use anyhow::{Result, anyhow};
use jsonpath_rust::JsonPath;
use serde_json::Value;
use super::Parser;

pub struct JsonPathParser;

impl Parser for JsonPathParser {
    fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let rule = rule.trim_start_matches("@json:").trim();
        let json: Value = serde_json::from_str(content)?;
        
        let path_str = if rule.starts_with('$') || rule.is_empty() {
            rule.to_string()
        } else {
            format!("$.{}", rule)
        };
        
        let path = JsonPath::try_from(path_str.as_str())?;
        let result = path.find(&json);
        
        // find() returns a Value, which may be an array or single value
        value_to_string(&result)
    }
    
    fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = rule.trim_start_matches("@json:").trim();
        let json: Value = serde_json::from_str(content)?;
        
        let path_str = if rule.starts_with('$') || rule.is_empty() {
            rule.to_string()
        } else {
            format!("$.{}", rule)
        };
        
        let path = JsonPath::try_from(path_str.as_str())?;
        let result = path.find(&json);
        
        // If result is an array, extract each element
        if let Value::Array(arr) = result {
            Ok(arr.iter()
                .map(|v| value_to_string(v).unwrap_or_default())
                .collect())
        } else {
            Ok(vec![value_to_string(&result)?])
        }
    }
    
    fn get_elements(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = rule.trim_start_matches("@json:").trim();
        let json: Value = serde_json::from_str(content)?;
        
        let path_str = if rule.starts_with('$') || rule.is_empty() {
            rule.to_string()
        } else {
            format!("$.{}", rule)
        };
        
        let path = JsonPath::try_from(path_str.as_str())?;
        let result = path.find(&json);
        
        // Return each matched element as JSON string
        if let Value::Array(arr) = result {
            // Check if we have a single result that is itself an array (nested array)
            // This happens when path selects an array field like $.rows -> [[item1, item2]]
            // We want to return [item1, item2] so we can iterate over them
            if arr.len() == 1 {
                if let Some(Value::Array(inner)) = arr.first() {
                    tracing::debug!("JsonPath matched single nested array with {} elements, flattening", inner.len());
                    return Ok(inner.iter()
                        .map(|v| v.to_string())
                        .collect());
                }
            }
            
            Ok(arr.iter()
                .map(|v| v.to_string())
                .collect())
        } else {
            Ok(vec![result.to_string()])
        }
    }
}

/// Convert serde_json Value to String
fn value_to_string(value: &Value) -> Result<String> {
    match value {
        Value::String(s) => Ok(s.clone()),
        Value::Number(n) => Ok(n.to_string()),
        Value::Bool(b) => Ok(b.to_string()),
        Value::Null => Ok(String::new()),
        Value::Array(arr) => {
            // For array, return first element as string
            if let Some(first) = arr.first() {
                value_to_string(first)
            } else {
                Err(anyhow!("Empty array"))
            }
        }
        v => Ok(v.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_jsonpath_string() {
        let json = r#"{"name": "Test Book", "author": "Author"}"#;
        let parser = JsonPathParser;
        
        let result = parser.get_string(json, "$.name").unwrap();
        assert_eq!(result, "Test Book");
    }
    
    #[test]
    fn test_jsonpath_list() {
        let json = r#"{"books": [{"title": "A"}, {"title": "B"}]}"#;
        let parser = JsonPathParser;
        
        let result = parser.get_list(json, "$.books[*].title").unwrap();
        assert_eq!(result, vec!["A", "B"]);
    }
}
