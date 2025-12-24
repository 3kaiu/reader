//! Parser module for parsing HTML/JSON/XML content
//! Supports CSS, JSONPath, XPath, Regex, and JSOUP Default syntax

pub mod css;
pub mod jsonpath;
pub mod regex;
pub mod jsoup;
pub mod xpath;

use anyhow::Result;

/// Parser trait for rule-based content extraction
pub trait Parser: Send + Sync {
    /// Get a single string value from content using a rule
    fn get_string(&self, content: &str, rule: &str) -> Result<String>;
    
    /// Get a list of strings from content using a rule
    fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>>;
    
    /// Get a list of elements (HTML fragments) from content using a rule
    fn get_elements(&self, content: &str, rule: &str) -> Result<Vec<String>>;
}

/// Rule type detection
#[derive(Debug, Clone, PartialEq)]
pub enum RuleType {
    /// CSS selector: @css:div.class
    Css,
    /// JSONPath: $.data.list or @json:$.data
    JsonPath,
    /// XPath: @xpath://div or //div
    XPath,
    /// Regex: ##pattern##
    Regex,
    /// JSOUP Default: class.name.0@text
    JsoupDefault,
    /// JavaScript: @js:code or <js>code</js>
    JavaScript,
}

impl RuleType {
    /// Detect rule type from rule string
    pub fn detect(rule: &str, content: &str) -> Self {
        let rule = rule.trim();
        
        let rule_type = if rule.starts_with("@js:") || rule.starts_with("<js>") {
            RuleType::JavaScript
        } else if rule.starts_with("@css:") {
            RuleType::Css
        } else if rule.starts_with("@xpath:") || rule.starts_with("//") {
            RuleType::XPath
        } else if rule.starts_with("@json:") || rule.starts_with("$.") || rule.starts_with("$[") {
            RuleType::JsonPath
        } else if rule.starts_with("##") {
            RuleType::Regex
        } else {
            // Intelligent fallback: if content looks like JSON, use JsonPath
            let content_trimmed = content.trim();
            if content_trimmed.starts_with('{') || content_trimmed.starts_with('[') {
                RuleType::JsonPath
            } else {
                // Default to JSOUP Default syntax (class.tag.0@text)
                RuleType::JsoupDefault
            }
        };
        
        tracing::debug!("Detected rule type {:?} for rule: '{}' (content starts with: {})", 
            rule_type, rule, content.chars().take(20).collect::<String>());
            
        rule_type
    }
}
