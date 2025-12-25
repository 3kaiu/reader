use anyhow::{Result, anyhow};
use scraper::{Html, Selector, ElementRef};
use super::Parser;

pub struct JsoupDefaultParser;

impl Parser for JsoupDefaultParser {
    fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let (selector_str, attr) = split_rule(rule);
        
        tracing::debug!("JsoupDefaultParser.get_string: rule='{}', selector='{}', attr='{}', content_len={}", 
            rule, selector_str, attr, content.len());
        
        let document = Html::parse_document(content);
        let root = document.root_element();
        
        // Special handling for pure attribute rules (no @ separator)
        // e.g. "href", "src", "text" - extract directly from root/first element
        if !rule.contains('@') {
            // Check if it's a known attribute name
            let attr_names = ["href", "src", "text", "textNodes", "ownText", "html", "outerHtml", "innerHtml", "title", "alt", "class", "id", "data-src"];
            if attr_names.iter().any(|&a| a == rule) {
                // Find the first real content element (not html/head/body wrappers)
                if let Some(first_element) = root.descendants()
                    .filter_map(|n| ElementRef::wrap(n))
                    .find(|el| {
                        let name = el.value().name();
                        // Skip document structure tags
                        name != "html" && name != "head" && name != "body"
                    }) {
                    return extract_content(&first_element, rule);
                }
                // Fallback to root
                return extract_content(&root, rule);
            }
        }
        
        // 1. Try Standard CSS Selector first
        if let Ok(selector) = Selector::parse(&selector_str) {
            let matches: Vec<ElementRef> = root.select(&selector).collect();
            tracing::debug!("JsoupDefaultParser: CSS selector '{}' matched {} elements", selector_str, matches.len());
            if !matches.is_empty() {
                if attr == "text" || attr == "" {
                    // Join all matching elements for text
                    let texts: Vec<String> = matches.iter()
                        .map(|el| el.text().collect::<String>().trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                    tracing::debug!("JsoupDefaultParser: Joining {} non-empty texts", texts.len());
                    return Ok(texts.join("\n"));
                } else if let Some(element) = matches.first() {
                    return extract_content(element, &attr);
                }
            }
        }
        
        // 2. Fallback to Custom Jsoup Parser
        let (segments, _) = parse_jsoup_rule(rule)?;
        let matches = apply_selectors(root, &segments)?;
        
        if !matches.is_empty() {
            if attr == "text" || attr == "" {
                let texts: Vec<String> = matches.iter()
                    .map(|el| el.text().collect::<String>().trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                return Ok(texts.join("\n"));
            } else {
                // Find first match that has the valid attribute
                for element in matches {
                    if let Ok(val) = extract_content(&element, &attr) {
                        return Ok(val);
                    }
                }
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
        // For get_elements, we want all parts of the rule to be part of the selector chain
        // NOT splitting at the last @ to extract attr (that's for get_string)
        // The entire rule is the selector - we return the HTML of matched elements
        
        let document = Html::parse_document(content);
        let root = document.root_element();
        
        // Check if rule ends with a known attribute name - if so, split it
        // Otherwise use full rule as selector
        let (selector_to_use, _attr) = {
            let (sel, attr) = split_rule(rule);
            // Known attributes that should be split off
            let attr_names = ["text", "textNodes", "ownText", "html", "outerHtml", "innerHtml"];
            if attr_names.contains(&attr.as_str()) {
                (sel, attr)
            } else {
                // The "attr" is actually part of the selector (e.g. @li@a where 'a' is a tag)
                // Use full rule as selector
                (rule.to_string(), String::new())
            }
        };
        
        // 1. Try Standard CSS Selector first (replace @ with space for CSS)
        // Also convert Legado syntax: id.xxx -> #xxx, class.xxx -> .xxx
        let css_selector = {
            let mut parts: Vec<String> = Vec::new();
            for part in selector_to_use.split('@') {
                let part = part.trim();
                if part.is_empty() { continue; }
                
                // Convert id.xxx to #xxx
                if part.starts_with("id.") {
                    parts.push(format!("#{}", &part[3..]));
                }
                // Convert class.xxx to .xxx  
                else if part.starts_with("class.") {
                    parts.push(format!(".{}", &part[6..]));
                }
                else {
                    parts.push(part.to_string());
                }
            }
            parts.join(" ")
        };
        
        tracing::debug!("get_elements: rule='{}', css_selector='{}'", rule, css_selector);
        
        if let Ok(selector) = Selector::parse(&css_selector) {
             let results: Vec<String> = root.select(&selector)
                .map(|element| element.html())
                .collect();
             if !results.is_empty() {
                 return Ok(results);
             }
        }
        
        // 2. Fallback to custom Jsoup parser
        let (segments, _) = parse_jsoup_rule(&selector_to_use)?;
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
    
    // Special handling for "id.xxx" syntax which means ID selector, not tag "id" + class "xxx"
    // In Legado Jsoup syntax: id.yulan means #yulan, class.foo means .foo
    if pieces[0] == "id" && pieces.len() >= 2 {
        // This is id.xxx = ID selector #xxx
        let id_name = pieces[1];
        let mut modifiers = vec![SelectorModifier::Id(id_name.to_string())];
        
        // Remaining pieces after id.xxx are class or index modifiers
        for piece in pieces.iter().skip(2) {
            if piece.is_empty() { continue; }
            if piece.parse::<isize>().is_ok() {
                modifiers.push(SelectorModifier::Ambiguous(piece.to_string()));
            } else {
                modifiers.push(SelectorModifier::Class(piece.to_string()));
            }
        }
        
        return Some(SelectorSegment {
            tag: "*".to_string(),  // Match any tag with this ID
            modifiers,
        });
    }
    
    // Special handling for "class.xxx" syntax
    if pieces[0] == "class" && pieces.len() >= 2 {
        let class_name = pieces[1];
        let mut modifiers = vec![SelectorModifier::Class(class_name.to_string())];
        
        for piece in pieces.iter().skip(2) {
            if piece.is_empty() { continue; }
            if piece.parse::<isize>().is_ok() {
                modifiers.push(SelectorModifier::Ambiguous(piece.to_string()));
            } else {
                modifiers.push(SelectorModifier::Class(piece.to_string()));
            }
        }
        
        return Some(SelectorSegment {
            tag: "*".to_string(),
            modifiers,
        });
    }
    
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
    
    #[test]
    fn test_jsoup_id_selector() {
        let html = r#"
        <div id="yulan">
            <li><a href="http://example.com/chapter1">Chapter 1</a></li>
            <li><a href="http://example.com/chapter2">Chapter 2</a></li>
        </div>
        "#;
        let parser = JsoupDefaultParser;
        
        // Test id.yulan selector
        let elements = parser.get_elements(html, "id.yulan@li@a").unwrap();
        
        assert_eq!(elements.len(), 2, "Should find 2 <a> elements");
        
        // Each element should be an <a> tag
        assert!(elements[0].contains("<a"), "First element should be <a>, got: {}", elements[0]);
        assert!(elements[0].contains("href="), "First element should have href, got: {}", elements[0]);
        
        // The element is already <a>...</a>, so the pure attribute rule should work
        let href = parser.get_string(&elements[0], "href").unwrap();
        assert_eq!(href, "http://example.com/chapter1");
        
        // Extract text
        let text = parser.get_string(&elements[0], "text").unwrap();
        assert_eq!(text, "Chapter 1");
    }
    
    #[test]
    fn test_jsoup_class_selector() {
        let html = r#"
        <div class="content">
            <span class="title">Hello</span>
        </div>
        "#;
        let parser = JsoupDefaultParser;
        
        // Test class.content selector
        let result = parser.get_string(html, "class.content@text").unwrap();
        assert!(result.contains("Hello"));
    }
}

