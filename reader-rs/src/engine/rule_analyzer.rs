//! Rule Analyzer - Unified rule parsing with multi-rule support
//!
//! Handles Legado rule syntax including:
//! - Rule type detection (@css:, @json:, @xpath:, @js:, ##regex##)
//! - Multi-rule combinations (|| for alternatives, && for concatenation)
//! - JavaScript post-processing (<js>code</js>)
//! - Template variable replacement ({{key}})

use anyhow::{Result, anyhow};
use std::collections::HashMap;
use regex::Regex;

use super::parsers::{Parser, RuleType};
use super::parsers::css::CssParser;
use super::parsers::jsonpath::JsonPathParser;
use super::parsers::regex::RegexParser;
use super::parsers::jsoup::JsoupDefaultParser;
use super::parsers::xpath::XPathParser;
use super::js_executor::JsExecutor;

/// Rule Analyzer for parsing content using Legado rules
pub struct RuleAnalyzer {
    css_parser: CssParser,
    json_parser: JsonPathParser,
    regex_parser: RegexParser,
    jsoup_parser: JsoupDefaultParser,
    xpath_parser: XPathParser,
    js_executor: JsExecutor,
    variables: std::cell::RefCell<HashMap<String, String>>,
    result_list: std::cell::RefCell<Vec<String>>,  // For $1, $2 capture groups
}

impl RuleAnalyzer {
    /// Create a new RuleAnalyzer
    pub fn new() -> Result<Self> {
        Ok(Self {
            css_parser: CssParser,
            json_parser: JsonPathParser,
            regex_parser: RegexParser,
            jsoup_parser: JsoupDefaultParser,
            xpath_parser: XPathParser,
            js_executor: JsExecutor::new()?,
            variables: std::cell::RefCell::new(HashMap::new()),
            result_list: std::cell::RefCell::new(Vec::new()),
        })
    }
    
    /// Set base URL for the JS executor
    pub fn set_base_url(&mut self, url: &str) {
        self.js_executor.set_base_url(url);
    }
    
    /// Preload JavaScript library code (jsLib from book source)
    pub fn preload_lib(&self, js_lib: &str) -> Result<()> {
        self.js_executor.preload_lib(js_lib)
    }
    
    /// Put a variable for @put syntax
    pub fn put_variable(&self, key: &str, value: &str) {
        self.variables.borrow_mut().insert(key.to_string(), value.to_string());
        // Also update JS cache for java.get/put access
        self.js_executor.put_variable(key, value);
    }
    
    /// Get a variable for @get syntax
    pub fn get_variable(&self, key: &str) -> Option<String> {
        self.variables.borrow().get(key).cloned()
    }
    
    /// Set result list for $1, $2 capture group references
    pub fn set_result_list(&self, list: Vec<String>) {
        *self.result_list.borrow_mut() = list;
    }
    
    /// Replace $1, $2 etc. with values from result_list
    fn replace_capture_groups(&self, text: &str) -> String {
        let list = self.result_list.borrow();
        if list.is_empty() {
            return text.to_string();
        }
        
        // Match $1, $2, ... $99
        let re = regex::Regex::new(r"\$(\d{1,2})").unwrap();
        re.replace_all(text, |caps: &regex::Captures| {
            let index: usize = caps[1].parse().unwrap_or(0);
            list.get(index).cloned().unwrap_or_default()
        }).to_string()
    }
    
    /// Replace @get:key and {{key}} placeholders with stored variables
    fn replace_variables(&self, text: &str) -> String {
        let mut result = text.to_string();
        let vars = self.variables.borrow();
        
        for (k, v) in vars.iter() {
            // Replace {{key}}
            result = result.replace(&format!("{{{{{}}}}}", k), v);
            // Replace @get:key
            result = result.replace(&format!("@get:{}", k), v);
        }
        
        result
    }
    
    /// Parse @put:{key:value} syntax and return the rule without @put part
    fn parse_put_rule(&self, rule: &str) -> String {
        // Format: rule@put:{"key":"value"} or rule@put:{key:value}
        if let Some(pos) = rule.find("@put:") {
            let base_rule = rule[..pos].trim();
            let json_part = &rule[pos + 5..];
            
            // Try to parse as JSON
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_part) {
                if let Some(obj) = json.as_object() {
                    for (k, v) in obj {
                        if let Some(val) = v.as_str() {
                            self.put_variable(k, val);
                        } else {
                            self.put_variable(k, &v.to_string());
                        }
                    }
                }
            }
            
            return base_rule.to_string();
        }
        
        rule.to_string()
    }
    
    /// Get a single string value from content using a rule
    pub fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let rule = rule.trim();
        if rule.is_empty() {
            return Ok(String::new());
        }

        // Handle @put:{key:value} syntax - extract and store variables
        let rule = self.parse_put_rule(rule);
        
        // Replace @get:key and {{key}} placeholders
        let rule = self.replace_variables(&rule);
        
        // Replace $1, $2 etc. capture group references
        let rule = self.replace_capture_groups(&rule);
        let rule = rule.as_str();

        // Handle || alternative rules (try each until one succeeds)
        if rule.contains("||") && !rule.starts_with("<js>") {
            for alt in rule.split("||") {
                let alt = alt.trim();
                if alt.is_empty() {
                    continue;
                }
                if let Ok(result) = self.get_string(content, alt) {
                    if !result.is_empty() && result != "null" {
                        return Ok(result);
                    }
                }
            }
            return Ok(String::new());
        }

        // Split by newline for chain rules
        let lines: Vec<&str> = rule.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        let mut current_result = content.to_string();
        let mut first_line = true;

        for line in lines {
            // Check if this line is a pure JS rule (starts with @js: or <js>)
            let is_js = line.starts_with("@js:") || (line.starts_with("<js>") && line.ends_with("</js>"));
            
            let line_result = if is_js {
                 self.execute_single_rule(if first_line { content } else { &current_result }, line)?
            } else {
                let mut vars = HashMap::new();
                // Use original content for first line, previous result for subsequent lines
                let effective_content = if first_line { content } else { &current_result };
                vars.insert("result".to_string(), effective_content.to_string());
                vars.insert("it".to_string(), effective_content.to_string());
                
                let processed_line = self.process_templates(line, &vars);
                let rule_type = RuleType::detect(&processed_line, content);
                
                // Heuristic: If it's a Jsoup rule without @ or . or #, and it's after processing,
                // it might be a literal if it contains spaces or ends with / or is purely numeric.
                let looks_like_literal = rule_type == RuleType::JsoupDefault && (
                    !processed_line.contains('@') && (
                        processed_line.is_empty() || 
                        processed_line.chars().all(|c| c.is_numeric() || c == '.') ||
                        processed_line.contains(' ') ||
                        processed_line.starts_with("http") ||
                        processed_line.starts_with('<')
                    )
                );

                if looks_like_literal {
                    self.process_js_tags(&processed_line, &current_result)?
                } else {
                    self.execute_single_rule(if first_line { content } else { &current_result }, &processed_line)?
                }
            };

            current_result = line_result;
            first_line = false;
        }

        Ok(current_result)
    }
    
    /// Get a list of strings from content using a rule
    pub fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = rule.trim();
        if rule.is_empty() {
            return Ok(vec![]);
        }

        // Split by newline for chain rules
        // For list rules, we chain all but the last line as string transformations, 
        // then execute the last line as a list rule.
        let lines: Vec<&str> = rule.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        if lines.len() > 1 {
            let base_rule_part = lines[..lines.len() - 1].join("\n");
            let list_rule_part = lines[lines.len() - 1];
            
            let base_content = self.get_string(content, &base_rule_part)?;
            return self.get_list(&base_content, list_rule_part);
        }

        // Handle || alternative rules for lists
        if rule.contains("||") && !rule.starts_with("<js>") {
            for alt in rule.split("||") {
                let alt = alt.trim();
                if alt.is_empty() {
                    continue;
                }
                if let Ok(results) = self.get_list(content, alt) {
                    if !results.is_empty() {
                        return Ok(results);
                    }
                }
            }
            return Ok(Vec::new());
        }

        // Check for list reversal prefix (-)
        let (rule, should_reverse) = if rule.starts_with('-') {
            (&rule[1..], true)
        } else {
            (rule, false)
        };
        
        // Handle multi-rule (%%)
        if rule.contains("%%") {
            let mut all_results = Vec::new();
            for sub_rule in rule.split("%%") {
                let sub_rule = sub_rule.trim();
                if sub_rule.is_empty() {
                    continue;
                }
                if let Ok(mut results) = self.execute_list_rule(content, sub_rule) {
                    all_results.append(&mut results);
                }
            }
            if should_reverse {
                all_results.reverse();
            }
            return Ok(all_results);
        }
        
        // Handle JS post-processing
        let (base_rule, js_code) = self.extract_js_postprocess(rule);
        
        // Execute base rule
        let mut results = self.execute_list_rule(content, &base_rule)?;
        
        // Apply list reversal
        if should_reverse {
            results.reverse();
        }
        
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
        
        // Multi-line in elements rule usually doesn't happen for the selector itself,
        // but if it does, we take the last line as the element selector.
        let lines: Vec<&str> = rule.split('\n').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        let (base_content, selector) = if lines.len() > 1 {
            let base_rule_part = lines[..lines.len() - 1].join("\n");
            (self.get_string(content, &base_rule_part)?, lines[lines.len() - 1].to_string())
        } else {
            (content.to_string(), rule.to_string())
        };

        let (base_rule, _) = self.extract_js_postprocess(&selector);
        self.execute_elements_rule(&base_content, &base_rule)
    }
    
    /// Execute a JavaScript rule
    pub(crate) fn eval_js(&self, code: &str, vars: &HashMap<String, String>) -> Result<String> {
        self.js_executor.eval_with_context(code, vars)
    }

    /// Process <js> tags in a rule string
    pub fn process_js_tags(&self, rule: &str, result: &str) -> Result<String> {
        if !rule.contains("<js>") {
            return Ok(rule.to_string());
        }

        let mut output = String::new();
        let mut last_pos = 0;
        
        while let Some(start) = rule[last_pos..].find("<js>") {
            let start = last_pos + start;
            output.push_str(&rule[last_pos..start]);
            
            if let Some(end) = rule[start..].find("</js>") {
                let end = start + end;
                let code = &rule[start + 4..end];
                
                let mut vars = HashMap::new();
                vars.insert("result".to_string(), result.to_string());
                vars.insert("it".to_string(), result.to_string());
                
                let js_result = self.eval_js(code, &vars)?;
                output.push_str(&js_result);
                last_pos = end + 5;
            } else {
                // Unclosed tag
                output.push_str(&rule[start..]);
                last_pos = rule.len();
                break;
            }
        }
        output.push_str(&rule[last_pos..]);
        Ok(output)
    }

    /// Process {{key}} templates or {{ js_expression }} or {{ rule }} in a rule string
    pub fn process_templates(&self, rule: &str, vars: &HashMap<String, String>) -> String {
        let mut output = rule.to_string();
        
        // 1. Simple replacements for variables
        for (key, value) in vars {
            let placeholder = format!("{{{{{}}}}}", key);
            output = output.replace(&placeholder, value);
        }
        
        // 2. Evaluate remaining {{...}} as JavaScript or Rule
        if output.contains("{{") {
             if let Ok(re) = Regex::new(r"\{\{(.+?)\}\}") {
                // Collect matches first to avoid multiple mutable borrows
                let matches: Vec<(String, String)> = re.captures_iter(&output)
                    .map(|cap| (cap[0].to_string(), cap[1].to_string()))
                    .collect();
                
                let content = vars.get("result").map(|s| s.as_str()).unwrap_or("");
                
                tracing::debug!("process_templates: content length={}, has matches={}", 
                    content.len(), matches.len());
                
                for (full_match, inner_rule) in matches {
                    // Try evaluating as a rule first if content is available and it looks like a rule
                    // (starts with $ or @ or //)
                    let mut replaced = false;
                    let inner_trimmed = inner_rule.trim();
                    
                    if !content.is_empty() && (
                        inner_trimmed.starts_with("$.") || 
                        inner_trimmed.starts_with("$[") || 
                        inner_trimmed.starts_with("//") || 
                        inner_trimmed.starts_with("@")
                    ) {
                        if let Ok(result) = self.get_string(content, inner_trimmed) {
                            output = output.replace(&full_match, &result);
                            replaced = true;
                        }
                    }
                    
                    if !replaced {
                        // Fallback to JS evaluation
                        match self.eval_js(&inner_rule, vars) {
                            Ok(result) => {
                                output = output.replace(&full_match, &result);
                            },
                            Err(_) => {
                                // If eval failed, keep original (might be intended)
                            }
                        }
                    }
                }
             }
        }
        
        output
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
        // Set current content for java.getString()
        self.js_executor.set_current_content(result);

        let mut vars = HashMap::new();
        vars.insert("result".to_string(), result.to_string());
        vars.insert("it".to_string(), result.to_string());
        
        self.js_executor.eval_with_context(js_code, &vars)
    }
    
    /// Execute a single rule (no || or &&)
    /// Execute a single rule (no || or &&)
    fn execute_single_rule(&self, content: &str, rule: &str) -> Result<String> {
        let rule = rule.trim();
        if rule.contains("||") {
            return self.get_string_with_alternatives(content, rule);
        }
        if rule.contains("&&") {
            return self.get_string_with_concatenation(content, rule);
        }

        let (base_rule_full, js_post) = self.extract_js_postprocess(rule);
        
        // Handle Regex Replacement Suffix (##)
        // Check if there is a '##' that is NOT at the start (meaning it's a suffix, not a pure regex rule)
        // Note: RuleType::detect handles "##..." as Regex, so we only care if it's "TYPE:RULE##REGEX"
        let (base_rule, regex_suffix) = if !base_rule_full.starts_with("##") {
             if let Some(pos) = base_rule_full.find("##") {
                 let base = base_rule_full[..pos].trim();
                 let suffix = base_rule_full[pos..].trim();
                 (base.to_string(), Some(suffix.to_string()))
             } else {
                 (base_rule_full, None)
             }
        } else {
             (base_rule_full, None)
        };

        let rule_type = RuleType::detect(&base_rule, content);
        
        let initial_result = match rule_type {
            RuleType::JavaScript => {
                let code = if base_rule.starts_with("@js:") {
                    base_rule.trim_start_matches("@js:")
                } else if base_rule.starts_with("<js>") {
                    let s = base_rule.trim_start_matches("<js>");
                    s.trim_end_matches("</js>")
                } else {
                    &base_rule
                };

                // Set current content for java.getString()
                self.js_executor.set_current_content(content);

                let mut vars = HashMap::new();
                vars.insert("result".to_string(), content.to_string());
                vars.insert("it".to_string(), content.to_string());
                self.js_executor.eval_with_context(code, &vars)?
            }
            RuleType::Css => self.css_parser.get_string(content, &base_rule)?,
            RuleType::JsonPath => self.json_parser.get_string(content, &base_rule)?,
            RuleType::Regex => self.regex_parser.get_string(content, &base_rule)?,
            RuleType::JsoupDefault => self.jsoup_parser.get_string(content, &base_rule)?,
            RuleType::XPath => self.xpath_parser.get_string(content, &base_rule)?,
        };

        // Apply regex suffix if present
        let result = if let Some(suffix) = regex_suffix {
            match self.regex_parser.get_string(&initial_result, &suffix) {
                Ok(r) => r,
                Err(_) => {
                    // Regex suffix not matching is common and expected, don't log
                    initial_result
                }
            }
        } else {
            initial_result
        };

        if let Some(js_code) = js_post {
            self.apply_js_postprocess(&result, &js_code)
        } else {
            Ok(result)
        }
    }
    
    /// Execute rule that returns a list
    fn execute_list_rule(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule_type = RuleType::detect(rule, content);
        
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
                self.xpath_parser.get_list(content, rule)
            }
        }
    }
    
    /// Execute rule that returns elements
    fn execute_elements_rule(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule_type = RuleType::detect(rule, content);
        
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
            RuleType::XPath => {
                self.xpath_parser.get_elements(content, rule)
            }
            _ => {
                Err(anyhow!("get_elements not supported for this rule type"))
            }
        }
    }

    /// Evaluate an URL rule, handling @js: if present
    pub fn evaluate_url(&self, raw_url: &str, vars: &HashMap<String, String>) -> Result<String> {
        // If it starts with @js:, evaluate everything else as JS
        if raw_url.starts_with("@js:") {
            let js_code = &raw_url[4..];
            return self.js_executor.eval_with_context(js_code, vars);
        }

        // Otherwise, process line by line
        let mut current_result = String::new();
        let lines: Vec<&str> = raw_url.split('\n').collect();
        
        for (i, line) in lines.iter().enumerate() {
            let mut line_vars = vars.clone();
            // result is passed from previous step
            if i > 0 {
                line_vars.insert("result".to_string(), current_result.clone());
            }
            
            // Process templates in this line
            let processed_line = self.process_templates(line, &line_vars);
            
            // If it contains <js> tags or is explicitly JS, process it
            current_result = if processed_line.contains("<js>") {
                self.process_js_tags(&processed_line, &current_result)?
            } else {
                processed_line
            };
        }
        
        Ok(current_result)
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

    #[test]
    fn test_chain_rules() {
        let analyzer = RuleAnalyzer::new().unwrap();
        let json = r#"{"id": 123}"#;
        
        // Chain: id -> JS transformation -> template
        let rule = "$.id\n<js>Number(result) + 100</js>\nID: {{result}}";
        let result = analyzer.get_string(json, rule).unwrap();
        assert_eq!(result, "ID: 223");
    }

    #[test]
    fn test_js_tags_anywhere() {
        let _analyzer = RuleAnalyzer::new().unwrap();
        
        let rule = "prefix_<js>'a'.toUpperCase()</js>_suffix";
        let result = _analyzer.process_js_tags(rule, "").unwrap();
        assert_eq!(result, "prefix_A_suffix");
    }

    #[test]
    fn test_evaluate_url_complex() {
        let analyzer = RuleAnalyzer::new().unwrap();
        let mut _vars: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        _vars.insert("bid".to_string(), "123".to_string());
        
        let rule = "{{bid}}\n<js>Number(result) + 1000</js>\nhttp://example.com/{{result}}";
        let result = analyzer.evaluate_url(rule, &_vars).unwrap();
        assert_eq!(result, "http://example.com/1123");
    }
    #[test]
    fn test_regex_suffix() {
        let analyzer = RuleAnalyzer::new().unwrap();
        let content = r#"{"key": "prefix_123_suffix"}"#;
        
        // Test extraction
        let result = analyzer.get_string(content, "$.key##_(\\d+)_").unwrap();
        assert_eq!(result, "123");
        
        // Test replacement (remove prefix)
        // ##regex##replacement
        let result = analyzer.get_string(content, "$.key##prefix_##").unwrap();
        assert_eq!(result, "123_suffix");
    }
}
