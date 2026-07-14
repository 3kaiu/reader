#![allow(dead_code)]
use dashmap::DashMap;
use scraper::{ElementRef, Html, Selector};
use std::sync::{Arc, LazyLock};

/// Global selector cache - shared across all engine instances
/// Uses DashMap for lock-free concurrent access
static GLOBAL_SELECTOR_CACHE: LazyLock<DashMap<String, Arc<FallbackSelector>>> =
    LazyLock::new(DashMap::new);

/// Translate a Legado DSL selector segment to standard CSS.
/// "class.foo" -> ".foo", "tag.div.0" -> "div", "tag.div" -> "div", "id.foo" -> "#foo"
fn translate_legado_segment(s: &str) -> String {
    if let Some(cls) = s.strip_prefix("class.") {
        format!(".{}", cls)
    } else if let Some(id) = s.strip_prefix("-id.").or_else(|| s.strip_prefix("id.")) {
        format!("#{}", id)
    } else if let Some(tag) = s.strip_prefix("tag.") {
        // Strip index suffix: tag.div.0 -> div, tag.div!0 -> div
        let trimmed = tag.trim_end_matches(|c: char| c.is_ascii_digit());
        if trimmed.ends_with('.') || trimmed.ends_with('!') {
            trimmed[..trimmed.len() - 1].trim_end().to_string()
        } else {
            tag.to_string()
        }
    } else {
        s.to_string()
    }
}

/// A compiled fallback selector - tries each selector in order until one matches
#[derive(Debug)]
pub struct FallbackSelector {
    /// Original rule string (for debugging)
    pub rule: String,
    /// Compiled selectors to try in order
    pub selectors: Vec<Selector>,
    /// Attribute to extract (text, href, src, html, etc.)
    pub attr: String,
    /// Legado-style tag chain for descendant traversal (e.g. ["h1", "a"] for ".booknav2@h1@a@text")
    pub tag_chain: Vec<String>,
}

impl FallbackSelector {
    /// Compile a fallback selector from a rule string (e.g. ".title | h1 | @text")
    /// Also supports inline attribute syntax: "a@href" or ".img@src"
    pub fn compile(rule: &str) -> Result<Self, String> {
        let rule = rule.trim();
        if rule.is_empty() {
            return Ok(Self {
                rule: String::new(),
                selectors: vec![],
                attr: "text".to_string(),
                tag_chain: vec![],
            });
        }

        let parts: Vec<&str> = rule.split('|').map(|s| s.trim()).collect();
        let mut selectors = Vec::new();
        let mut attr = "text".to_string();
        // Tag chain applied to ALL parts (last part with tag chain wins)
        let mut tag_chain: Vec<String> = Vec::new();

        for part in parts {
            if let Some(stripped) = part.strip_prefix('@') {
                // Standalone attribute directive (e.g. "@href" as a fallback separator)
                attr = stripped.to_string();
            } else if !part.is_empty() {
                // Find all @ positions outside CSS brackets for Legado-style chaining
                let mut at_positions = Vec::new();
                let mut bracket_depth = 0i32;
                for (i, ch) in part.char_indices() {
                    match ch {
                        '[' => bracket_depth += 1,
                        ']' => bracket_depth -= 1,
                        '@' if bracket_depth == 0 => at_positions.push(i),
                        _ => {},
                    }
                }

                let (selector_part, chain, inline_attr): (String, Vec<String>, Option<String>) =
                    if at_positions.is_empty() {
                        (part.to_string(), Vec::new(), None)
                    } else {
                        let css_expr = &part[..at_positions[0]];
                        let last_at = at_positions[at_positions.len() - 1];
                        let last_segment = &part[last_at + 1..];

                        // Determine if the last @-segment is an attribute extraction or a tag chain step.
                        // Known extraction keywords: text, href, src, content, html, inner_html, ownText
                        // Simple alphanumeric strings (no ., [, @, etc.) are also treated as attributes.
                        let is_attr = !last_segment.is_empty()
                            && last_segment
                                .chars()
                                .all(|c| c.is_alphanumeric() || c == '-' || c == '_');

                        // Build tag chain from all intermediate @-segments.
                        // If the last segment is NOT an attribute, include it in the chain too.
                        let chain_end = if is_attr {
                            at_positions.len() - 1
                        } else {
                            at_positions.len()
                        };
                        let mut chain = Vec::new();
                        for i in 0..chain_end {
                            let start = at_positions[i] + 1;
                            let end = if i + 1 < at_positions.len() {
                                at_positions[i + 1]
                            } else {
                                part.len()
                            };
                            let tag = &part[start..end];
                            let translated = translate_legado_segment(tag);
                            if !translated.is_empty()
                                && translated
                                    .chars()
                                    .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
                            {
                                chain.push(translated);
                            } else {
                                // Fallback to raw tag if translation yields complex CSS
                                if !tag.is_empty()
                                    && tag
                                        .chars()
                                        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
                                {
                                    chain.push(tag.to_string());
                                }
                            }
                        }

                        let translated_css = translate_legado_segment(css_expr);
                        if is_attr {
                            (translated_css, chain, Some(last_segment.to_string()))
                        } else {
                            (translated_css, chain, None)
                        }
                    };

                // Update attribute if found inline
                if let Some(a) = inline_attr {
                    attr = a.to_string();
                }
                if !chain.is_empty() {
                    tag_chain = chain;
                }

                // Parse the CSS selector (with Legado DSL translation already applied)
                if !selector_part.is_empty() {
                    let selector = Selector::parse(&selector_part)
                        .map_err(|e| format!("Invalid selector '{}': {:?}", &selector_part, e))?;
                    selectors.push(selector);
                }
            }
        }

        Ok(Self {
            rule: rule.to_string(),
            selectors,
            attr,
            tag_chain,
        })
    }

    /// Check if the selector is effectively empty
    pub fn is_empty(&self) -> bool {
        self.selectors.is_empty() && self.rule.is_empty()
    }

    /// Get or compile from global cache (thread-safe, cross-engine)
    ///
    /// This is the preferred way to get selectors when working with multiple
    /// engine instances, as it avoids recompiling the same selectors.
    pub fn get_or_compile_global(rule: &str) -> Result<Arc<FallbackSelector>, String> {
        // Fast path: check cache
        if let Some(cached) = GLOBAL_SELECTOR_CACHE.get(rule) {
            return Ok(Arc::clone(cached.value()));
        }

        // Slow path: compile and cache
        let selector = Self::compile(rule)?;
        let arc = Arc::new(selector);
        GLOBAL_SELECTOR_CACHE.insert(rule.to_string(), Arc::clone(&arc));
        Ok(arc)
    }

    /// Get global cache statistics
    pub fn global_cache_size() -> usize {
        GLOBAL_SELECTOR_CACHE.len()
    }

    /// Extract data from the root document
    pub fn select_and_extract(&self, html: &Html) -> Option<String> {
        self.extract(html)
    }

    /// Apply Legado-style tag chain to an element (descendant traversal via tag names)
    fn apply_chain<'a>(element: ElementRef<'a>, chain: &[String]) -> ElementRef<'a> {
        let mut current = element;
        for tag in chain {
            if let Ok(sel) = Selector::parse(tag) {
                if let Some(next) = current.select(&sel).next() {
                    current = next;
                } else {
                    break;
                }
            }
        }
        current
    }

    /// Select the first matched element from the root document.
    ///
    /// Callers can implement their own cleaning/paragraph logic on top of
    /// this element to support more advanced extraction strategies.
    pub fn select_first<'a>(&self, html: &'a Html) -> Option<ElementRef<'a>> {
        for selector in self.selectors.iter() {
            if let Some(element) = html.select(selector).next() {
                let target = if self.tag_chain.is_empty() {
                    element
                } else {
                    Self::apply_chain(element, &self.tag_chain)
                };
                return Some(target);
            }
        }
        None
    }

    /// Select from a parent element and extract
    pub fn select_from_and_extract(&self, el: &ElementRef) -> Option<String> {
        for selector in self.selectors.iter() {
            if let Some(target) = el.select(selector).next() {
                let chained = if self.tag_chain.is_empty() {
                    target
                } else {
                    Self::apply_chain(target, &self.tag_chain)
                };
                return extract_attr(chained, &self.attr);
            }
        }
        None
    }

    /// Extract data using the compiled selectors from the root
    pub fn extract(&self, html: &Html) -> Option<String> {
        for selector in self.selectors.iter() {
            if let Some(element) = html.select(selector).next() {
                let target = if self.tag_chain.is_empty() {
                    element
                } else {
                    Self::apply_chain(element, &self.tag_chain)
                };
                return extract_attr(target, &self.attr);
            }
        }
        None
    }

    /// Select all matching elements as ElementRefs
    pub fn select_all<'a>(&self, html: &'a Html) -> Vec<ElementRef<'a>> {
        for selector in self.selectors.iter() {
            let elements: Vec<_> = html.select(selector).collect();
            if !elements.is_empty() {
                if self.tag_chain.is_empty() {
                    return elements;
                }
                return elements
                    .into_iter()
                    .map(|e| Self::apply_chain(e, &self.tag_chain))
                    .collect();
            }
        }
        Vec::new()
    }

    /// Extract multiple values
    pub fn extract_all(&self, html: &Html) -> Vec<String> {
        let mut results = Vec::new();
        for selector in self.selectors.iter() {
            let elements = html.select(selector);
            for element in elements {
                let target = if self.tag_chain.is_empty() {
                    element
                } else {
                    Self::apply_chain(element, &self.tag_chain)
                };
                if let Some(v) = extract_attr(target, &self.attr) {
                    if !v.is_empty() {
                        results.push(v);
                    }
                }
            }
            if !results.is_empty() {
                break;
            }
        }
        results
    }
}

/// Simple helper to extract an attribute from a single selector
pub fn extract_attr(element: ElementRef, attr: &str) -> Option<String> {
    match attr {
        "text" => {
            // Optimized text extraction:
            // 1. Collect all text nodes
            // 2. Join with newlines only where necessary
            // 3. Avoid redundant trimming of short segments
            let mut result = String::with_capacity(256);
            for part in element.text() {
                let trimmed = part.trim();
                if !trimmed.is_empty() {
                    if !result.is_empty() {
                        result.push('\n');
                    }
                    result.push_str(trimmed);
                }
            }
            if result.is_empty() {
                None
            } else {
                Some(result)
            }
        },
        "html" => Some(element.html().trim().to_string()),
        "inner_html" => Some(element.inner_html().trim().to_string()),
        "textNodes" => {
            let text: String = element.text().collect();
            if text.trim().is_empty() {
                None
            } else {
                Some(text)
            }
        },
        _ => element.value().attr(attr).map(|s| s.to_string()),
    }
}
