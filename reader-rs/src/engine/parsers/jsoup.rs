use anyhow::{Result, anyhow};
use scraper::{Html, Selector, ElementRef};
use super::Parser;

pub struct JsoupDefaultParser;

impl Parser for JsoupDefaultParser {
    fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let (selector_str, attr) = split_rule(rule);
        
        let document = Html::parse_document(content);
        let root = document.root_element();
        
        // 1. Try Standard CSS Selector first
        if let Ok(selector) = Selector::parse(&selector_str) {
            let matches: Vec<ElementRef> = root.select(&selector).collect();
             if let Some(element) = matches.first() {
                 return extract_content(element, &attr);
             }
        }
        
        // 2. Fallback to Custom Jsoup Parser
        let (segments, _) = parse_jsoup_rule(rule)?;
        let matches = apply_selectors(root, &segments)?;
        
        // Find first match that has the valid content/attribute
        for element in matches {
            if let Ok(val) = extract_content(&element, &attr) {
                return Ok(val);
            }
        }
        
        Err(anyhow!("No element found for rule: {}", rule))
    }

    fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let (_, attr) = split_rule(rule);
        
        let document = Html::parse_document(content);
        let root = document.root_element();
        
        // 1. Try Standard CSS Selector
        // (Note: get_list implies returning HTML of list items usually, 
        // unless custom attribute processing is needed)
        // But RuleAnalyzer treats list rules as returning elements usually.
        // Or if simple rule, maybe returning list of texts?
        // Usually get_list returns list of outerHtml.
        // But if attribute is "text", it returns list of texts.
        
        // Try CSS
        let (selector_str, _) = split_rule(rule);
        if let Ok(selector) = Selector::parse(&selector_str) {
             let results: Vec<String> = root.select(&selector)
                .filter_map(|el| extract_content(&el, &attr).ok())
                .collect();
             return Ok(results);
        }
        
        // Fallback
        let (segments, _) = parse_jsoup_rule(rule)?;
        let matches = apply_selectors(root, &segments)?;
        
        let results: Vec<String> = matches.iter()
            .filter_map(|el| extract_content(el, &attr).ok())
            .collect();
            
        Ok(results)
    }
    
    fn get_elements(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let (selector_str, _) = split_rule(rule);
        
        let document = Html::parse_document(content);
        let root = document.root_element();
        
        // 1. Try Standard CSS Selector
        if let Ok(selector) = Selector::parse(&selector_str) {
             let results: Vec<String> = root.select(&selector)
                .map(|element| element.html())
                .collect();
             return Ok(results);
        }
        
        // 2. Fallback
        let (segments, _) = parse_jsoup_rule(rule)?;
        let matches = apply_selectors(root, &segments)?;
        
        let results: Vec<String> = matches.iter()
            .map(|el| el.html())
            .collect();
        
        Ok(results)
    }
}

// === Parsing Logic ===

fn split_rule(rule: &str) -> (String, String) {
    if let Some(pos) = rule.rfind('@') {
        let mut selector = rule[..pos].trim();
        // Handle double @@
        while selector.ends_with('@') {
             selector = &selector[..selector.len()-1];
        }
        let attr = &rule[pos + 1..];
        (selector.trim().to_string(), attr.trim().to_string())
    } else {
        (rule.trim().to_string(), "text".to_string())
    }
}

fn extract_content(element: &ElementRef, attr: &str) -> Result<String> {
    match attr {
        "text" | "" => Ok(element.text().collect::<String>().trim().to_string()),
        "textNodes" | "ownText" => Ok(element.text().collect::<String>().trim().to_string()),
        "html" | "outerHtml" => Ok(element.html()),
        "innerHtml" => Ok(element.inner_html()),
        "href" => element.value().attr("href").map(|s| s.to_string()).ok_or_else(|| anyhow!("href not found")),
        "src" => element.value().attr("src").map(|s| s.to_string()).ok_or_else(|| anyhow!("src not found")),
        _ => element.value().attr(attr).map(|s| s.to_string()).ok_or_else(|| anyhow!("Attribute '{}' not found", attr)),
    }
}

#[derive(Debug, Clone)]
enum SelectorModifier {
    Class(String),
    Id(String),
    Index(isize),
    Ambiguous(String), // Could be Class or Index (e.g. "-1", "0")
    TextFilter(String), // For "text" type
}

#[derive(Debug)]
struct SelectorSegment {
    tag: String,
    modifiers: Vec<SelectorModifier>,
}

fn parse_jsoup_rule(rule: &str) -> Result<(Vec<SelectorSegment>, String)> {
    let (selector_raw, attr) = split_rule(rule);
    // Handle Legado syntax where @ separates hierarchal steps (same as space)
    let selector = selector_raw.replace("@", " ");
    
    let segments: Vec<SelectorSegment> = selector.split_whitespace()
        .filter_map(|s| parse_segment(s))
        .collect();
    Ok((segments, attr))
}

fn parse_segment(part: &str) -> Option<SelectorSegment> {
    // Handle shorthand .class and #id
    if part.starts_with('.') {
        // Class shorthand
        return parse_segment(&format!("tag{}", part));
    }
    if part.starts_with('#') {
        // Id shorthand
        return parse_segment(&format!("tag{}", part));
    }

    let pieces: Vec<&str> = part.split('.').collect();
    if pieces.is_empty() { return None; }
    
    let tag = if pieces[0].is_empty() || pieces[0] == "tag" { "*" } else { pieces[0] };
    
    let mut modifiers = Vec::new();
    
    if tag == "text" {
         if let Some(text) = pieces.get(1) {
             modifiers.push(SelectorModifier::TextFilter(text.to_string()));
         }
         return Some(SelectorSegment { tag: "*".to_string(), modifiers });
    }

    for piece in pieces.iter().skip(1) {
        if piece.is_empty() { continue; }
        
        if piece.parse::<isize>().is_ok() {
            // Numeric: Ambiguous
             modifiers.push(SelectorModifier::Ambiguous(piece.to_string()));
        } else {
            // Non-numeric: Class
             modifiers.push(SelectorModifier::Class(piece.to_string()));
        }
    }
    
    // Also handle #id if present in tag part (e.g. div#id.class)
    // Simplified: split '#' not handled here for now, assuming standard Jsoup rules
    // But JsoupDefaultParser mostly sees split-by-dot parts.
    
    Some(SelectorSegment {
        tag: tag.to_string(),
        modifiers,
    })
}

fn apply_selectors<'a>(root: ElementRef<'a>, segments: &[SelectorSegment]) -> Result<Vec<ElementRef<'a>>> {
    let mut current: Vec<ElementRef> = vec![root];
    
    for segment in segments {
        let mut next = Vec::new();
        
        // 1. Select by tag
        // Note: We iterate over 'current' parent elements and find descendants
        for parent in &current {
            let tag_selector = if segment.tag == "*" { "*".to_string() } else { segment.tag.clone() };
            if let Some(selector) = Selector::parse(&tag_selector).ok() {
                let mut candidates: Vec<ElementRef> = parent.select(&selector).collect();
                
                // 2. Apply modifiers
                for modifier in &segment.modifiers {
                     match modifier {
                         SelectorModifier::Class(name) => {
                             let sel = format!("[class~=\"{}\"]", name);
                             if let Some(s) = Selector::parse(&sel).ok() {
                                 candidates.retain(|el| s.matches(el));
                             }
                         },
                         SelectorModifier::Id(name) => {
                             let sel = format!("[id=\"{}\"]", name);
                             if let Some(s) = Selector::parse(&sel).ok() {
                                 candidates.retain(|el| s.matches(el));
                             }
                         },
                         SelectorModifier::TextFilter(text) => {
                             candidates.retain(|el| el.text().collect::<String>().contains(text));
                         },
                         SelectorModifier::Index(idx) => {
                             if let Some(el) = apply_index(&candidates, *idx) {
                                 candidates = vec![el];
                             } else {
                                 candidates.clear();
                             }
                         },
                         SelectorModifier::Ambiguous(val) => {
                             // Try Class
                             let class_sel = format!("[class~=\"{}\"]", val);
                             let mut class_matches = candidates.clone();
                             let mut has_class_match = false;
                             
                             if let Some(s) = Selector::parse(&class_sel).ok() {
                                  class_matches.retain(|el| s.matches(el));
                                  if !class_matches.is_empty() {
                                      has_class_match = true;
                                  }
                             }
                             
                             if has_class_match {
                                 candidates = class_matches;
                             } else {
                                 // No class matches, try Index
                                 if let Ok(idx) = val.parse::<isize>() {
                                      if let Some(el) = apply_index(&candidates, idx) {
                                          candidates = vec![el];
                                      } else {
                                          candidates.clear();
                                      }
                                 }
                             }
                         }
                     }
                }
                
                next.extend(candidates);
            }
        }

        current = next;
    }
    
    Ok(current)
}

fn apply_index<'a>(elements: &[ElementRef<'a>], idx: isize) -> Option<ElementRef<'a>> {
     let actual_idx = if idx < 0 {
         (elements.len() as isize + idx) as usize
     } else {
         idx as usize
     };
     elements.get(actual_idx).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_jsoup_ambiguous() {
        let html = r#"
        <span class="-1">Class -1</span>
        <span class="-2">Class -2</span>
        "#;
        let parser = JsoupDefaultParser;
        let result = parser.get_string(html, "span.-1@text").unwrap();
        assert_eq!(result, "Class -1"); // Should match class
        
        let result2 = parser.get_string(html, "span.-2@text").unwrap();
        assert_eq!(result2, "Class -2"); // Should match class
        
        let result3 = parser.get_string(html, "span.0@text").unwrap();
        assert_eq!(result3, "Class -1"); // Should match index 0
    }
}
