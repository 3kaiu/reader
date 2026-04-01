use dashmap::DashMap;
use scraper::{ElementRef, Html, Selector};
use std::sync::{Arc, LazyLock};

/// Global selector cache - shared across all engine instances
/// Uses DashMap for lock-free concurrent access
static GLOBAL_SELECTOR_CACHE: LazyLock<DashMap<String, Arc<FallbackSelector>>> =
    LazyLock::new(DashMap::new);

/// A compiled fallback selector - tries each selector in order until one matches
#[derive(Debug)]
pub struct FallbackSelector {
    /// Original rule string (for debugging)
    pub rule: String,
    /// Compiled selectors to try in order
    pub selectors: Vec<Selector>,
    /// Attribute to extract (text, href, src, html, etc.)
    pub attr: String,
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
            });
        }

        let parts: Vec<&str> = rule.split('|').map(|s| s.trim()).collect();
        let mut selectors = Vec::new();
        let mut attr = "text".to_string();

        for part in parts {
            if let Some(stripped) = part.strip_prefix('@') {
                // Standalone attribute directive (e.g. "@href" as a fallback separator)
                attr = stripped.to_string();
            } else if !part.is_empty() {
                // Check for inline attribute syntax: "selector@attr"
                // But be careful not to split CSS attribute selectors like [data-id="value"]
                let (selector_part, inline_attr) = if let Some(at_pos) = part.rfind('@') {
                    // Make sure @ is not inside brackets (CSS attribute selector)
                    let before_at = &part[..at_pos];
                    let open_brackets = before_at.matches('[').count();
                    let close_brackets = before_at.matches(']').count();

                    if open_brackets == close_brackets {
                        // @ is not inside a bracket, treat as attribute suffix
                        let attr_str = &part[at_pos + 1..];
                        if !attr_str.is_empty()
                            && attr_str
                                .chars()
                                .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
                        {
                            (before_at, Some(attr_str))
                        } else {
                            (part, None)
                        }
                    } else {
                        (part, None)
                    }
                } else {
                    (part, None)
                };

                // Update attribute if found inline
                if let Some(a) = inline_attr {
                    attr = a.to_string();
                }

                // Parse the CSS selector
                if !selector_part.is_empty() {
                    let selector = Selector::parse(selector_part)
                        .map_err(|e| format!("Invalid selector '{}': {:?}", selector_part, e))?;
                    selectors.push(selector);
                }
            }
        }

        Ok(Self {
            rule: rule.to_string(),
            selectors,
            attr,
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

    /// Select the first matched element from the root document.
    ///
    /// Callers can implement their own cleaning/paragraph logic on top of
    /// this element to support more advanced extraction strategies.
    pub fn select_first<'a>(&self, html: &'a Html) -> Option<ElementRef<'a>> {
        for selector in self.selectors.iter() {
            if let Some(element) = html.select(selector).next() {
                return Some(element);
            }
        }
        None
    }

    /// Select from a parent element and extract
    pub fn select_from_and_extract(&self, el: &ElementRef) -> Option<String> {
        for selector in self.selectors.iter() {
            if let Some(target) = el.select(selector).next() {
                return extract_attr(target, &self.attr);
            }
        }
        None
    }

    /// Extract data using the compiled selectors from the root
    pub fn extract(&self, html: &Html) -> Option<String> {
        for selector in self.selectors.iter() {
            if let Some(element) = html.select(selector).next() {
                return extract_attr(element, &self.attr);
            }
        }
        None
    }

    /// Select all matching elements as ElementRefs
    pub fn select_all<'a>(&self, html: &'a Html) -> Vec<ElementRef<'a>> {
        for selector in self.selectors.iter() {
            let elements: Vec<_> = html.select(selector).collect();
            if !elements.is_empty() {
                return elements;
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
                if let Some(v) = extract_attr(element, &self.attr) {
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
        }
        "html" => Some(element.html().trim().to_string()),
        "inner_html" => Some(element.inner_html().trim().to_string()),
        _ => element.value().attr(attr).map(|s| s.to_string()),
    }
}
