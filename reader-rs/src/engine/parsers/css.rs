//! CSS Selector Parser using scraper crate

use anyhow::{Result, anyhow};
use scraper::{Html, Selector};
use super::Parser;

pub struct CssParser;

impl Parser for CssParser {
    fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let rule = rule.trim_start_matches("@css:");
        let (selector_str, attr) = parse_css_rule(rule);
        
        let document = Html::parse_document(content);
        let selector = Selector::parse(&selector_str)
            .map_err(|e| anyhow!("CSS parse error: {:?}", e))?;
        
        if let Some(element) = document.select(&selector).next() {
            match attr.as_str() {
                "text" | "" => Ok(element.text().collect::<String>().trim().to_string()),
                "html" | "outerHtml" => Ok(element.html()),
                "innerHtml" => Ok(element.inner_html()),
                _ => {
                    element.value().attr(&attr)
                        .map(|v| v.to_string())
                        .ok_or_else(|| anyhow!("Attribute '{}' not found", attr))
                }
            }
        } else {
            Err(anyhow!("No element found for selector: {}", selector_str))
        }
    }
    
    fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = rule.trim_start_matches("@css:");
        let (selector_str, attr) = parse_css_rule(rule);
        
        let document = Html::parse_document(content);
        let selector = Selector::parse(&selector_str)
            .map_err(|e| anyhow!("CSS parse error: {:?}", e))?;
        
        let results: Vec<String> = document.select(&selector)
            .map(|element| {
                match attr.as_str() {
                    "text" | "" => element.text().collect::<String>().trim().to_string(),
                    "html" | "outerHtml" => element.html(),
                    "innerHtml" => element.inner_html(),
                    _ => element.value().attr(&attr).unwrap_or("").to_string(),
                }
            })
            .filter(|s| !s.is_empty())
            .collect();
        
        Ok(results)
    }
    
    fn get_elements(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = rule.trim_start_matches("@css:");
        let (selector_str, _) = parse_css_rule(rule);
        
        let document = Html::parse_document(content);
        let selector = Selector::parse(&selector_str)
            .map_err(|e| anyhow!("CSS parse error: {:?}", e))?;
        
        let results: Vec<String> = document.select(&selector)
            .map(|element| element.html())
            .collect();
        
        Ok(results)
    }
}

/// Parse CSS rule to extract selector and attribute
/// Format: selector@attr or selector (default text)
fn parse_css_rule(rule: &str) -> (String, String) {
    if let Some(pos) = rule.rfind('@') {
        let selector = &rule[..pos];
        let attr = &rule[pos + 1..];
        (selector.trim().to_string(), attr.trim().to_string())
    } else {
        (rule.trim().to_string(), "text".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_css_parser_text() {
        let html = r#"<html><body><div class="title">Hello World</div></body></html>"#;
        let parser = CssParser;
        
        let result = parser.get_string(html, "@css:div.title").unwrap();
        assert_eq!(result, "Hello World");
    }
    
    #[test]
    fn test_css_parser_attr() {
        let html = r#"<html><body><a href="https://example.com">Link</a></body></html>"#;
        let parser = CssParser;
        
        let result = parser.get_string(html, "@css:a@href").unwrap();
        assert_eq!(result, "https://example.com");
    }
}
