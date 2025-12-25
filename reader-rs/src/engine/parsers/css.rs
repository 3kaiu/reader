//! CSS Selector Parser using scraper crate

use anyhow::{Result, anyhow};
use scraper::{Html, Selector};
use super::Parser;

pub struct CssParser;

impl Parser for CssParser {
    fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let rule = strip_css_prefix(rule);
        let (selector_str, attr) = parse_css_rule(rule);
        
        let document = Html::parse_document(content);
        
        if selector_str.is_empty() {
             return Ok(String::new());
        }

        let selector = match Selector::parse(&selector_str) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("CSS parse error for '{}': {:?}", selector_str, e);
                return Ok(String::new());
            }
        };
        
        let matches: Vec<_> = document.select(&selector).collect();
        if !matches.is_empty() {
            if attr == "text" || attr == "" {
                let texts: Vec<String> = matches.iter()
                    .map(|element| element.text().collect::<String>().trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                return Ok(texts.join("\n"));
            } else if let Some(element) = matches.first() {
                match attr.as_str() {
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
        } else {
            Err(anyhow!("No element found for selector: {}", selector_str))
        }
    }
    
    fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = strip_css_prefix(rule);
        let (selector_str, attr) = parse_css_rule(rule);
        
        let document = Html::parse_document(content);
        
        if selector_str.is_empty() {
             return Ok(vec![]);
        }

        let selector = match Selector::parse(&selector_str) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("CSS parse error for '{}': {:?}", selector_str, e);
                return Ok(vec![]);
            }
        };
        
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
        let rule = strip_css_prefix(rule);
        let (selector_str, _) = parse_css_rule(rule);
        
        let document = Html::parse_document(content);
        
        if selector_str.is_empty() {
             return Ok(vec![]);
        }

        let selector = match Selector::parse(&selector_str) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("CSS parse error for '{}': {:?}", selector_str, e);
                return Ok(vec![]);
            }
        };
        
        let results: Vec<String> = document.select(&selector)
            .map(|element| element.html())
            .collect();
        
        Ok(results)
    }
}

/// Strip CSS prefixes from rule
fn strip_css_prefix(rule: &str) -> &str {
    let rule_lower = rule.to_lowercase();
    if rule_lower.starts_with("@css:") {
        &rule[5..]
    } else if rule_lower.starts_with("css:") {
        &rule[4..]
    } else if rule_lower.starts_with("css#") || rule_lower.starts_with("css.") {
        &rule[3..]
    } else {
        rule
    }
}

/// Parse CSS rule to extract selector and attribute
/// Format: selector@attr or selector (default text)
fn parse_css_rule(rule: &str) -> (String, String) {
    if let Some(pos) = rule.rfind('@') {
        let mut selector = rule[..pos].trim();
        // Handle double @@ or multiple @
        while selector.ends_with('@') {
             selector = &selector[..selector.len()-1];
        }
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
