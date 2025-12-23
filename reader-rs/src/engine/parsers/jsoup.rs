//! JSOUP Default Syntax Parser
//! 
//! Parses rules like: class.name.0@tag.a.1@text
//! Format: type.name.index[@type.name.index...]@content
//!
//! Types: class, id, tag, text, children
//! Content: text, html, href, src, attr

use anyhow::{Result, anyhow};
use scraper::{Html, Selector, ElementRef};
use super::Parser;

pub struct JsoupDefaultParser;

impl Parser for JsoupDefaultParser {
    fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let document = Html::parse_document(content);
        let root = document.root_element();
        
        let (selectors, attr) = parse_jsoup_rule(rule)?;
        
        // Apply selectors to get elements
        let elements = apply_selectors(root, &selectors)?;
        
        if let Some(element) = elements.first() {
            extract_content(element, &attr)
        } else {
            Err(anyhow!("No element found for rule: {}", rule))
        }
    }
    
    fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let document = Html::parse_document(content);
        let root = document.root_element();
        
        let (selectors, attr) = parse_jsoup_rule(rule)?;
        
        let elements = apply_selectors(root, &selectors)?;
        
        let results: Vec<String> = elements.iter()
            .filter_map(|el| extract_content(el, &attr).ok())
            .filter(|s| !s.is_empty())
            .collect();
        
        Ok(results)
    }
    
    fn get_elements(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let document = Html::parse_document(content);
        let root = document.root_element();
        
        let (selectors, _) = parse_jsoup_rule(rule)?;
        
        let elements = apply_selectors(root, &selectors)?;
        
        let results: Vec<String> = elements.iter()
            .map(|el| el.html())
            .collect();
        
        Ok(results)
    }
}

/// Selector segment
#[derive(Debug)]
struct SelectorSegment {
    selector_type: String,  // class, id, tag, text, children
    name: Option<String>,
    index: Option<isize>,   // negative index supported
}

/// Parse JSOUP default rule into selector segments and content attribute
fn parse_jsoup_rule(rule: &str) -> Result<(Vec<SelectorSegment>, String)> {
    let rule = rule.trim();
    
    // Handle list reversal prefix
    let (rule, _reverse) = if rule.starts_with('-') {
        (&rule[1..], true)
    } else {
        (rule, false)
    };
    
    // Split by @ to get segments
    let parts: Vec<&str> = rule.split('@').collect();
    
    if parts.is_empty() {
        return Err(anyhow!("Empty rule"));
    }
    
    // Last part is content extraction method or another selector
    let mut segments = Vec::new();
    let mut content_attr = "text".to_string();
    
    for (i, part) in parts.iter().enumerate() {
        if i == parts.len() - 1 {
            // Last part: check if it's a content attribute
            if is_content_attr(part) {
                content_attr = part.to_string();
                continue;
            }
        }
        
        if let Some(segment) = parse_segment(part) {
            segments.push(segment);
        }
    }
    
    Ok((segments, content_attr))
}

/// Check if string is a content attribute
fn is_content_attr(s: &str) -> bool {
    matches!(s, "text" | "textNodes" | "ownText" | "html" | "outerHtml" | "innerHtml" | "href" | "src" | "all")
}

/// Parse a single selector segment: type.name.index
fn parse_segment(part: &str) -> Option<SelectorSegment> {
    let pieces: Vec<&str> = part.split('.').collect();
    
    if pieces.is_empty() || pieces[0].is_empty() {
        return None;
    }
    
    let selector_type = pieces[0].to_string();
    let name = pieces.get(1).filter(|s| !s.is_empty() && !is_index(s)).map(|s| s.to_string());
    
    // Find index (last piece that looks like a number)
    let index = pieces.iter()
        .filter_map(|s| s.parse::<isize>().ok())
        .last();
    
    Some(SelectorSegment {
        selector_type,
        name,
        index,
    })
}

fn is_index(s: &str) -> bool {
    s.parse::<isize>().is_ok()
}

/// Apply selectors to get matching elements
fn apply_selectors<'a>(root: ElementRef<'a>, segments: &[SelectorSegment]) -> Result<Vec<ElementRef<'a>>> {
    let mut current: Vec<ElementRef> = vec![root];
    
    for segment in segments {
        let mut next = Vec::new();
        
        for element in &current {
            let css_selector = build_css_selector(segment);
            
            let selector = match Selector::parse(&css_selector) {
                Ok(s) => s,
                Err(_) => continue, // Skip invalid selectors
            };
            
            let matches: Vec<ElementRef> = element.select(&selector).collect();
            
            // Apply index if specified
            if let Some(idx) = segment.index {
                let actual_idx = if idx < 0 {
                    (matches.len() as isize + idx) as usize
                } else {
                    idx as usize
                };
                
                if let Some(el) = matches.get(actual_idx) {
                    next.push(*el);
                }
            } else {
                next.extend(matches);
            }
        }
        
        current = next;
    }
    
    Ok(current)
}

/// Build CSS selector from segment
fn build_css_selector(segment: &SelectorSegment) -> String {
    match segment.selector_type.as_str() {
        "class" => {
            if let Some(ref name) = segment.name {
                format!(".{}", name)
            } else {
                "[class]".to_string()
            }
        }
        "id" => {
            if let Some(ref name) = segment.name {
                format!("#{}", name)
            } else {
                "[id]".to_string()
            }
        }
        "tag" => {
            segment.name.clone().unwrap_or_else(|| "*".to_string())
        }
        "children" => "*".to_string(),
        _ => "*".to_string(),
    }
}

/// Extract content from element
fn extract_content(element: &ElementRef, attr: &str) -> Result<String> {
    match attr {
        "text" => Ok(element.text().collect::<String>().trim().to_string()),
        "textNodes" | "ownText" => {
            // Get only direct text nodes
            Ok(element.text().collect::<String>().trim().to_string())
        }
        "html" | "outerHtml" => Ok(element.html()),
        "innerHtml" => Ok(element.inner_html()),
        "href" => element.value().attr("href")
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow!("href not found")),
        "src" => element.value().attr("src")
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow!("src not found")),
        _ => {
            // Try as custom attribute
            element.value().attr(attr)
                .map(|s| s.to_string())
                .ok_or_else(|| anyhow!("Attribute '{}' not found", attr))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_jsoup_class_text() {
        let html = r#"<div class="title">Hello</div>"#;
        let parser = JsoupDefaultParser;
        
        let result = parser.get_string(html, "class.title@text").unwrap();
        assert_eq!(result, "Hello");
    }
    
    #[test]
    fn test_jsoup_tag_href() {
        let html = r#"<a href="/books/1">Book</a>"#;
        let parser = JsoupDefaultParser;
        
        let result = parser.get_string(html, "tag.a@href").unwrap();
        assert_eq!(result, "/books/1");
    }
}
