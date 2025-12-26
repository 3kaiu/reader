//! Parser Factory - Centralized parser management
//!
//! This module provides a factory pattern for creating and managing parsers,
//! reducing coupling between RuleAnalyzer and individual parser implementations.

use anyhow::Result;
use std::sync::Arc;

use super::css::CssParser;
use super::jsonpath::JsonPathParser;
use super::jsoup::JsoupDefaultParser;
use super::regex::RegexParser;
use super::xpath::XPathParser;
use super::{Parser, RuleType};

/// Parser Factory - Creates and manages parser instances
///
/// This factory provides a unified interface for obtaining parsers based on
/// rule types, abstracting away the details of parser instantiation.
pub struct ParserFactory {
    css: CssParser,
    jsonpath: JsonPathParser,
    regex: RegexParser,
    jsoup: JsoupDefaultParser,
    xpath: XPathParser,
}

impl Default for ParserFactory {
    fn default() -> Self {
        Self::new()
    }
}

impl ParserFactory {
    /// Create a new ParserFactory with all parsers initialized
    pub fn new() -> Self {
        Self {
            css: CssParser,
            jsonpath: JsonPathParser,
            regex: RegexParser,
            jsoup: JsoupDefaultParser,
            xpath: XPathParser,
        }
    }

    /// Get the appropriate parser for a rule type
    ///
    /// Returns a reference to the parser that handles the given rule type.
    /// For JavaScript rules, this returns the CSS parser as a fallback
    /// (JS execution should be handled separately).
    pub fn get_parser(&self, rule_type: &RuleType) -> &dyn Parser {
        match rule_type {
            RuleType::Css => &self.css,
            RuleType::JsonPath => &self.jsonpath,
            RuleType::XPath => &self.xpath,
            RuleType::Regex => &self.regex,
            RuleType::JsoupDefault => &self.jsoup,
            RuleType::JavaScript => &self.css, // Fallback, JS should be handled separately
        }
    }

    /// Parse content using the appropriate parser for the detected rule type
    ///
    /// This is a convenience method that detects the rule type and
    /// uses the appropriate parser to extract a single string value.
    pub fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let rule_type = RuleType::detect(rule, content);

        // JavaScript rules need special handling
        if rule_type == RuleType::JavaScript {
            return Err(anyhow::anyhow!(
                "JavaScript rules should be handled by JsExecutor"
            ));
        }

        let parser = self.get_parser(&rule_type);
        parser.get_string(content, rule)
    }

    /// Parse content and return a list of strings
    pub fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule_type = RuleType::detect(rule, content);

        if rule_type == RuleType::JavaScript {
            return Err(anyhow::anyhow!(
                "JavaScript rules should be handled by JsExecutor"
            ));
        }

        let parser = self.get_parser(&rule_type);
        parser.get_list(content, rule)
    }

    /// Parse content and return a list of elements (HTML fragments)
    pub fn get_elements(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule_type = RuleType::detect(rule, content);

        if rule_type == RuleType::JavaScript {
            return Err(anyhow::anyhow!(
                "JavaScript rules should be handled by JsExecutor"
            ));
        }

        let parser = self.get_parser(&rule_type);
        parser.get_elements(content, rule)
    }

    /// Get CSS parser directly
    pub fn css(&self) -> &CssParser {
        &self.css
    }

    /// Get JSONPath parser directly
    pub fn jsonpath(&self) -> &JsonPathParser {
        &self.jsonpath
    }

    /// Get XPath parser directly
    pub fn xpath(&self) -> &XPathParser {
        &self.xpath
    }

    /// Get Regex parser directly
    pub fn regex(&self) -> &RegexParser {
        &self.regex
    }

    /// Get Jsoup parser directly
    pub fn jsoup(&self) -> &JsoupDefaultParser {
        &self.jsoup
    }
}

/// Thread-safe shared ParserFactory
pub type SharedParserFactory = Arc<ParserFactory>;

/// Create a new shared ParserFactory
pub fn create_shared_parser_factory() -> SharedParserFactory {
    Arc::new(ParserFactory::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parser_factory_css() {
        let factory = ParserFactory::new();
        let html = r#"<div class="title">Hello World</div>"#;
        let result = factory.get_string(html, "@css:.title");
        assert!(result.is_ok());
        assert!(result.unwrap().contains("Hello World"));
    }

    #[test]
    fn test_parser_factory_json() {
        let factory = ParserFactory::new();
        let json = r#"{"name": "Test", "value": 42}"#;
        let result = factory.get_string(json, "$.name");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Test");
    }

    #[test]
    fn test_parser_factory_js_error() {
        let factory = ParserFactory::new();
        let content = "some content";
        let result = factory.get_string(content, "@js:result.trim()");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("JavaScript"));
    }

    #[test]
    fn test_get_parser_for_rule_type() {
        let factory = ParserFactory::new();

        // Test that we get the right parser type
        let _css_parser = factory.get_parser(&RuleType::Css);
        let _json_parser = factory.get_parser(&RuleType::JsonPath);
        let _xpath_parser = factory.get_parser(&RuleType::XPath);
        let _regex_parser = factory.get_parser(&RuleType::Regex);
        let _jsoup_parser = factory.get_parser(&RuleType::JsoupDefault);
    }
}
