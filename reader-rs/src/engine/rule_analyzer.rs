//! Rule Analyzer - Unified rule parsing with multi-rule support
//!
//! Handles Legado rule syntax including:
//! - Rule type detection (@css:, @json:, @xpath:, @js:, ##regex##)
//! - Multi-rule combinations (|| for alternatives, && for concatenation)
//! - JavaScript post-processing (<js>code</js>)
//! - Template variable replacement ({{key}})

use anyhow::{Result, anyhow};
use std::collections::HashMap;

use super::parsers::{Parser, RuleType};
use super::parsers::css::CssParser;
use super::parsers::jsonpath::JsonPathParser;
use super::parsers::regex::RegexParser;
use super::parsers::jsoup::JsoupDefaultParser;
use super::js_executor::JsExecutor;

/// Rule Analyzer for parsing content using Legado rules
pub struct RuleAnalyzer {
    css_parser: CssParser,
    json_parser: JsonPathParser,
    regex_parser: RegexParser,
    jsoup_parser: JsoupDefaultParser,
    js_executor: JsExecutor,
}

impl RuleAnalyzer {
    /// Create a new RuleAnalyzer
    pub fn new() -> Result<Self> {
        Ok(Self {
            css_parser: CssParser,
            json_parser: JsonPathParser,
            regex_parser: RegexParser,
            jsoup_parser: JsoupDefaultParser,
            js_executor: JsExecutor::new()?,
        })
    }
    
    /// Set base URL for the JS executor
    pub fn set_base_url(&mut self, url: &str) {
        self.js_executor.set_base_url(url);
    }
    
    /// Get a single string value from content using a rule
    pub fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let rule = rule.trim();
        
        if rule.is_empty() {
            return Ok(String::new());
        }
        
        // Handle alternative rules (||)
        if rule.contains("||") {
            return self.get_string_with_alternatives(content, rule);
        }
        
        // Handle concatenation rules (&&)
        if rule.contains("&&") {
            return self.get_string_with_concatenation(content, rule);
        }
        
        // Handle JS post-processing
        let (base_rule, js_code) = self.extract_js_postprocess(rule);
        
        // Execute base rule
        let result = self.execute_single_rule(content, &base_rule)?;
        
        // Apply JS post-processing if present
        if let Some(code) = js_code {
            self.apply_js_postprocess(&result, &code)
        } else {
            Ok(result)
        }
    }
    
    /// Get a list of strings from content using a rule
    pub fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = rule.trim();
        
        if rule.is_empty() {
            return Ok(vec![]);
        }
        
        // Handle JS post-processing
        let (base_rule, js_code) = self.extract_js_postprocess(rule);
        
        // Execute base rule
        let results = self.execute_list_rule(content, &base_rule)?;
        
        // Apply JS post-processing if present
        if let Some(code) = js_code {
            results.into_iter()
                .map(|item| self.apply_js_postprocess(&item, &code))
                .collect()
        } else {
            Ok(results)
        }
    }
    
    /// Get elements (HTML fragments) from content using a rule
    pub fn get_elements(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = rule.trim();
        
        if rule.is_empty() {
            return Ok(vec![]);
        }
        
        let (base_rule, _) = self.extract_js_postprocess(rule);
        self.execute_elements_rule(content, &base_rule)
    }
    
    /// Execute a pure JavaScript rule
    pub fn eval_js(&self, code: &str, vars: &HashMap<String, String>) -> Result<String> {
        self.js_executor.eval_with_context(code, vars)
    }
    
    // === Private methods ===
    
    /// Handle alternative rules separated by ||
    fn get_string_with_alternatives(&self, content: &str, rule: &str) -> Result<String> {
        for part in rule.split("||") {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            
            if let Ok(result) = self.get_string(content, part) {
                if !result.is_empty() {
                    return Ok(result);
                }
            }
        }
        
        Err(anyhow!("No alternative rule matched"))
    }
    
    /// Handle concatenation rules separated by &&
    fn get_string_with_concatenation(&self, content: &str, rule: &str) -> Result<String> {
        let mut results = Vec::new();
        
        for part in rule.split("&&") {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            
            match self.get_string(content, part) {
                Ok(result) => results.push(result),
                Err(_) => results.push(String::new()),
            }
        }
        
        Ok(results.join(""))
    }
    
    /// Extract JS post-processing code from rule
    /// Returns (base_rule, Option<js_code>)
    fn extract_js_postprocess(&self, rule: &str) -> (String, Option<String>) {
        // Handle <js>code</js> at end of rule
        if let Some(js_start) = rule.find("<js>") {
            if let Some(js_end) = rule.find("</js>") {
                let base_rule = rule[..js_start].trim().to_string();
                let js_code = rule[js_start + 4..js_end].trim().to_string();
                return (base_rule, Some(js_code));
            }
        }
        
        (rule.to_string(), None)
    }
    
    /// Apply JS post-processing to a result
    fn apply_js_postprocess(&self, result: &str, js_code: &str) -> Result<String> {
        let mut vars = HashMap::new();
        vars.insert("result".to_string(), result.to_string());
        vars.insert("it".to_string(), result.to_string());
        
        self.js_executor.eval_with_context(js_code, &vars)
    }
    
    /// Execute a single rule (no || or &&)
    fn execute_single_rule(&self, content: &str, rule: &str) -> Result<String> {
        let rule_type = RuleType::detect(rule);
        
        match rule_type {
            RuleType::JavaScript => {
                // @js:code
                let code = rule.trim_start_matches("@js:");
                let mut vars = HashMap::new();
                vars.insert("result".to_string(), content.to_string());
                self.js_executor.eval_with_context(code, &vars)
            }
            RuleType::Css => {
                self.css_parser.get_string(content, rule)
            }
            RuleType::JsonPath => {
                self.json_parser.get_string(content, rule)
            }
            RuleType::Regex => {
                self.regex_parser.get_string(content, rule)
            }
            RuleType::JsoupDefault => {
                self.jsoup_parser.get_string(content, rule)
            }
            RuleType::XPath => {
                // XPath not yet implemented, fallback to CSS
                Err(anyhow!("XPath not yet implemented"))
            }
        }
    }
    
    /// Execute rule that returns a list
    fn execute_list_rule(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule_type = RuleType::detect(rule);
        
        match rule_type {
            RuleType::JavaScript => {
                // For JS, return the result as single-item list
                let code = rule.trim_start_matches("@js:");
                let mut vars = HashMap::new();
                vars.insert("result".to_string(), content.to_string());
                let result = self.js_executor.eval_with_context(code, &vars)?;
                Ok(vec![result])
            }
            RuleType::Css => {
                self.css_parser.get_list(content, rule)
            }
            RuleType::JsonPath => {
                self.json_parser.get_list(content, rule)
            }
            RuleType::Regex => {
                self.regex_parser.get_list(content, rule)
            }
            RuleType::JsoupDefault => {
                self.jsoup_parser.get_list(content, rule)
            }
            RuleType::XPath => {
                Err(anyhow!("XPath not yet implemented"))
            }
        }
    }
    
    /// Execute rule that returns elements
    fn execute_elements_rule(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule_type = RuleType::detect(rule);
        
        match rule_type {
            RuleType::Css => {
                self.css_parser.get_elements(content, rule)
            }
            RuleType::JsonPath => {
                self.json_parser.get_elements(content, rule)
            }
            RuleType::JsoupDefault => {
                self.jsoup_parser.get_elements(content, rule)
            }
            _ => {
                Err(anyhow!("get_elements not supported for this rule type"))
            }
        }
    }
}

impl Default for RuleAnalyzer {
    fn default() -> Self {
        Self::new().expect("Failed to create RuleAnalyzer")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_css_rule() {
        let analyzer = RuleAnalyzer::new().unwrap();
        let html = r#"<div class="title">Hello</div>"#;
        
        let result = analyzer.get_string(html, "@css:div.title").unwrap();
        assert_eq!(result, "Hello");
    }
    
    #[test]
    fn test_jsonpath_rule() {
        let analyzer = RuleAnalyzer::new().unwrap();
        let json = r#"{"name": "Test"}"#;
        
        let result = analyzer.get_string(json, "$.name").unwrap();
        assert_eq!(result, "Test");
    }
    
    #[test]
    fn test_alternative_rules() {
        let analyzer = RuleAnalyzer::new().unwrap();
        let html = r#"<div class="author">Author Name</div>"#;
        
        // First rule fails, second succeeds
        let result = analyzer.get_string(html, "@css:.nonexistent || @css:.author").unwrap();
        assert_eq!(result, "Author Name");
    }
    
    #[test]
    fn test_js_postprocess() {
        let analyzer = RuleAnalyzer::new().unwrap();
        let html = r#"<div class="name">hello world</div>"#;
        
        let result = analyzer.get_string(html, "@css:.name<js>result.toUpperCase()</js>").unwrap();
        assert_eq!(result, "HELLO WORLD");
    }
}
