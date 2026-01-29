//! Content processing utilities for NXS Engine
//!
//! Handles:
//! - Regex replacement rules (cached)
//! - Content cleaning

use dashmap::DashMap;
use nexus_core::ReplaceRule;
use regex::Regex;
use std::sync::{Arc, LazyLock};

/// Global regex cache - avoids recompiling the same patterns
static REGEX_CACHE: LazyLock<DashMap<String, Arc<Regex>>> = LazyLock::new(DashMap::new);

/// Get or compile a regex pattern (cached)
pub fn get_or_compile_regex(pattern: &str) -> Option<Arc<Regex>> {
    // Fast path: check if already cached
    if let Some(cached) = REGEX_CACHE.get(pattern) {
        return Some(cached.clone());
    }

    // Slow path: compile and cache
    match Regex::new(pattern) {
        Ok(re) => {
            let arc_re = Arc::new(re);
            REGEX_CACHE.insert(pattern.to_string(), arc_re.clone());
            Some(arc_re)
        }
        Err(_) => None,
    }
}

/// Apply regex replacement rules to content (uses cached regex compilation)
pub fn apply_replace_rules(content: String, rules: &[ReplaceRule], source_id: &str) -> String {
    use std::borrow::Cow;

    let mut current_content = Cow::Owned(content);

    for rule in rules {
        if !rule.is_enabled {
            continue;
        }

        if let Some(scope) = &rule.scope {
            if scope != "all" && scope != source_id {
                continue;
            }
        }

        let replacement = rule.replacement.as_deref().unwrap_or("");

        if rule.is_regex {
            if let Some(re) = get_or_compile_regex(&rule.pattern) {
                // replace_all returns Cow. If no match, it's Borrowed.
                // We only update if it becomes Owned (meaning a replacement occurred).
                let result = re.replace_all(&current_content, replacement);
                if let Cow::Owned(new_s) = result {
                    current_content = Cow::Owned(new_s);
                }
            }
        } else {
            // Standard replace also returns a new String if matched.
            // We can check contains() first to avoid allocation if no match.
            if current_content.contains(&rule.pattern) {
                current_content = Cow::Owned(current_content.replace(&rule.pattern, replacement));
            }
        }
    }

    current_content.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_regex_cache() {
        let pattern = r"\d+";
        let re1 = get_or_compile_regex(pattern);
        let re2 = get_or_compile_regex(pattern);
        assert!(re1.is_some());
        assert!(re2.is_some());
        // Should be the same Arc (cached)
        assert!(Arc::ptr_eq(&re1.unwrap(), &re2.unwrap()));
    }

    #[test]
    fn test_apply_replace_rules_simple() {
        let rules = vec![ReplaceRule {
            id: "1".to_string(),
            name: "test".to_string(),
            pattern: "foo".to_string(),
            replacement: Some("bar".to_string()),
            scope: Some("all".to_string()),
            is_enabled: true,
            is_regex: false,
        }];
        let result = apply_replace_rules("hello foo world".to_string(), &rules, "test");
        assert_eq!(result, "hello bar world");
    }
}
