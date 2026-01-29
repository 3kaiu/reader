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

/// Apply replacement rules to content (Optimized via Aho-Corasick for batch string matching)
pub fn apply_replace_rules(content: String, rules: &[ReplaceRule], source_id: &str) -> String {
    use aho_corasick::AhoCorasick;
    use std::borrow::Cow;

    // 1. Separate rules into String patterns and Regex patterns
    let mut string_patterns = Vec::new();
    let mut string_replacements = Vec::new();
    let mut regex_rules = Vec::new();

    for rule in rules {
        if !rule.is_enabled {
            continue;
        }

        if let Some(scope) = &rule.scope {
            if scope != "all" && scope != source_id {
                continue;
            }
        }

        if rule.is_regex {
            regex_rules.push(rule);
        } else {
            string_patterns.push(rule.pattern.clone());
            string_replacements.push(rule.replacement.as_deref().unwrap_or("").to_string());
        }
    }

    let mut current_content: std::borrow::Cow<str> = Cow::Owned(content);

    // 2. Batch process String patterns using Aho-Corasick (O(N) Complexity)
    if !string_patterns.is_empty() {
        if let Ok(ac) = AhoCorasick::new(&string_patterns) {
            let mut result = String::with_capacity(current_content.len());
            ac.replace_all_with(&current_content, &mut result, |mat, _, w| {
                w.push_str(&string_replacements[mat.pattern().as_usize()]);
                true
            });
            current_content = Cow::Owned(result);
        }
    }

    // 3. Sequential process Regex patterns (Fallback for non-string rules)
    for rule in regex_rules {
        let replacement = rule.replacement.as_deref().unwrap_or("");
        if let Some(re) = get_or_compile_regex(&rule.pattern) {
            let result = re.replace_all(&current_content, replacement);
            if let Cow::Owned(new_s) = result {
                current_content = Cow::Owned(new_s);
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
