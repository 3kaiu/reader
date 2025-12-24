//! XPath Parser using sxd-xpath crate
//!
//! Parses rules like: @xpath://div[@class='title']/text()

use anyhow::Result;
use sxd_document::parser;
use sxd_xpath::{Factory, Context, Value};
use super::Parser;

pub struct XPathParser;

impl Parser for XPathParser {
    fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let rule = rule.trim_start_matches("@xpath:");
        
        if rule.trim().is_empty() {
            return Ok(String::new());
        }
        
        // Try to parse as XML first, then as HTML
        let content = normalize_html_to_xml(content);
        
        let package = match parser::parse(&content) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("XPath: Failed to parse document: {:?}", e);
                return Ok(String::new());
            }
        };
        
        let document = package.as_document();
        let factory = Factory::new();
        
        let xpath = match factory.build(rule) {
            Ok(Some(xpath)) => xpath,
            Ok(None) => return Ok(String::new()),
            Err(e) => {
                tracing::warn!("XPath: Failed to compile expression '{}': {:?}", rule, e);
                return Ok(String::new());
            }
        };
        
        let context = Context::new();
        
        let value = match xpath.evaluate(&context, document.root()) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("XPath: Failed to evaluate '{}': {:?}", rule, e);
                return Ok(String::new());
            }
        };
        
        Ok(value_to_string(value))
    }
    
    fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = rule.trim_start_matches("@xpath:");
        
        if rule.trim().is_empty() {
            return Ok(vec![]);
        }
        
        let content = normalize_html_to_xml(content);
        
        let package = match parser::parse(&content) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("XPath: Failed to parse document: {:?}", e);
                return Ok(vec![]);
            }
        };
        
        let document = package.as_document();
        let factory = Factory::new();
        
        let xpath = match factory.build(rule) {
            Ok(Some(xpath)) => xpath,
            Ok(None) => return Ok(vec![]),
            Err(e) => {
                tracing::warn!("XPath: Failed to compile expression '{}': {:?}", rule, e);
                return Ok(vec![]);
            }
        };
        
        let context = Context::new();
        
        let value = match xpath.evaluate(&context, document.root()) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("XPath: Failed to evaluate '{}': {:?}", rule, e);
                return Ok(vec![]);
            }
        };
        
        Ok(value_to_list(value))
    }
    
    fn get_elements(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        // For XPath, get_elements returns the same as get_list
        // since we're working with text representations
        self.get_list(content, rule)
    }
}

/// Convert XPath value to string
fn value_to_string(value: Value) -> String {
    match value {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => {
            if n.is_nan() {
                String::new()
            } else {
                n.to_string()
            }
        }
        Value::Boolean(b) => b.to_string(),
        Value::Nodeset(nodes) => {
            nodes.iter()
                .map(|n| n.string_value())
                .collect::<Vec<_>>()
                .join("")
                .trim()
                .to_string()
        }
    }
}

/// Convert XPath value to list of strings
fn value_to_list(value: Value) -> Vec<String> {
    match value {
        Value::String(s) => {
            let s = s.trim();
            if s.is_empty() {
                vec![]
            } else {
                vec![s.to_string()]
            }
        }
        Value::Number(n) => {
            if n.is_nan() {
                vec![]
            } else {
                vec![n.to_string()]
            }
        }
        Value::Boolean(b) => vec![b.to_string()],
        Value::Nodeset(nodes) => {
            nodes.iter()
                .map(|n| n.string_value().trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        }
    }
}

/// Normalize HTML to XML-compatible format
/// sxd-document requires well-formed XML, so we do basic cleanup
fn normalize_html_to_xml(html: &str) -> String {
    // Remove doctype
    let html = regex::Regex::new(r"(?i)<!DOCTYPE[^>]*>")
        .map(|re| re.replace_all(html, ""))
        .unwrap_or_else(|_| html.into());
    
    // Wrap in root element if not already wrapped
    let html = html.trim();
    if !html.starts_with("<?xml") && !html.starts_with("<html") && !html.starts_with("<root") {
        format!("<root>{}</root>", html)
    } else {
        html.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_xpath_simple() {
        let xml = r#"<root><book><title>Test Book</title></book></root>"#;
        let parser = XPathParser;
        
        let result = parser.get_string(xml, "//title/text()").unwrap();
        assert_eq!(result, "Test Book");
    }
    
    #[test]
    fn test_xpath_attribute() {
        let xml = r#"<root><a href="/books/1">Link</a></root>"#;
        let parser = XPathParser;
        
        let result = parser.get_string(xml, "//a/@href").unwrap();
        assert_eq!(result, "/books/1");
    }
    
    #[test]
    fn test_xpath_list() {
        let xml = r#"<root><item>A</item><item>B</item><item>C</item></root>"#;
        let parser = XPathParser;
        
        let result = parser.get_list(xml, "//item/text()").unwrap();
        assert_eq!(result, vec!["A", "B", "C"]);
    }
}
