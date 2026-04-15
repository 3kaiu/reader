//! Content processing utilities for NXS Engine
//!
//! Handles:
//! - Regex replacement rules (cached)
//! - Content cleaning

use aho_corasick::AhoCorasick;
use dashmap::DashMap;
use nexus_core::ReplaceRule;
use regex::Regex;
use std::sync::{Arc, LazyLock};

/// Global regex cache - avoids recompiling the same patterns
static REGEX_CACHE: LazyLock<DashMap<String, Arc<Regex>>> = LazyLock::new(DashMap::new);
type AcCacheValue = (Arc<AhoCorasick>, Vec<String>);

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
        },
        Err(_) => None,
    }
}

/// Global Aho-Corasick cache
static AC_CACHE: LazyLock<DashMap<u64, AcCacheValue>> = LazyLock::new(DashMap::new);

/// Calculate a stable hash for a set of replace rules
fn hash_rules(rules: &[ReplaceRule], source_id: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    source_id.hash(&mut hasher);
    for rule in rules {
        if rule.is_enabled && !rule.is_regex {
            rule.pattern.hash(&mut hasher);
            rule.replacement.hash(&mut hasher);
        }
    }
    hasher.finish()
}

/// Apply replacement rules to content (Optimized via Aho-Corasick for batch string matching)
pub fn apply_replace_rules(content: String, rules: &[ReplaceRule], source_id: &str) -> String {
    use std::borrow::Cow;

    if rules.is_empty() {
        return content;
    }

    // 1. Check AC cache for string patterns
    let ac_key = hash_rules(rules, source_id);
    let ac_result = if let Some(cached) = AC_CACHE.get(&ac_key) {
        Some(cached.clone())
    } else {
        // Build new automaton
        let mut patterns = Vec::new();
        let mut replacements = Vec::new();
        for rule in rules {
            if !rule.is_enabled || rule.is_regex {
                continue;
            }
            if let Some(scope) = &rule.scope {
                if scope != "all" && scope != source_id {
                    continue;
                }
            }
            patterns.push(rule.pattern.clone());
            replacements.push(rule.replacement.as_deref().unwrap_or("").to_string());
        }

        if !patterns.is_empty() {
            if let Ok(ac) = AhoCorasick::new(&patterns) {
                let entry = (Arc::new(ac), replacements);
                AC_CACHE.insert(ac_key, entry.clone());
                Some(entry)
            } else {
                None
            }
        } else {
            None
        }
    };

    let mut current_content: Cow<str> = Cow::Owned(content);

    // 2. Apply Aho-Corasick if available
    if let Some((ac, replacements)) = ac_result {
        let mut result = String::with_capacity(current_content.len());
        ac.replace_all_with(&current_content, &mut result, |mat, _, w| {
            w.push_str(&replacements[mat.pattern().as_usize()]);
            true
        });
        current_content = Cow::Owned(result);
    }

    // 3. Sequential process Regex patterns (Fallback for non-string rules)
    for rule in rules {
        if !rule.is_enabled || !rule.is_regex {
            continue;
        }

        if let Some(scope) = &rule.scope {
            if scope != "all" && scope != source_id {
                continue;
            }
        }

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

/// Chunk content for AI analysis or client-side context management
///
/// Splits content into approximately `max_chars` chunks, favoring paragraph boundaries.
pub fn chunk_content(content: &str, max_chars: usize) -> Vec<Arc<str>> {
    if content.len() <= max_chars {
        return vec![Arc::from(content)];
    }

    let mut chunks = Vec::new();
    let mut current_chunk = String::with_capacity(max_chars);

    // Split by double newline (paragraphs) first
    for paragraph in content.split("\n\n") {
        if current_chunk.len() + paragraph.len() > max_chars && !current_chunk.is_empty() {
            chunks.push(Arc::from(current_chunk.as_str()));
            current_chunk = String::with_capacity(max_chars);
        }

        if paragraph.len() > max_chars {
            // Paragraph itself is too long, split by line
            for line in paragraph.split('\n') {
                if current_chunk.len() + line.len() > max_chars && !current_chunk.is_empty() {
                    chunks.push(Arc::from(current_chunk.as_str()));
                    current_chunk = String::with_capacity(max_chars);
                }

                if line.len() > max_chars {
                    // Line still too long, hard split (fallback)
                    let mut start = 0;
                    while start < line.len() {
                        let end = (start + max_chars).min(line.len());
                        chunks.push(Arc::from(&line[start..end]));
                        start = end;
                    }
                } else {
                    if !current_chunk.is_empty() {
                        current_chunk.push('\n');
                    }
                    current_chunk.push_str(line);
                }
            }
        } else {
            if !current_chunk.is_empty() {
                current_chunk.push_str("\n\n");
            }
            current_chunk.push_str(paragraph);
        }
    }

    if !current_chunk.is_empty() {
        chunks.push(Arc::from(current_chunk.as_str()));
    }

    chunks
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
