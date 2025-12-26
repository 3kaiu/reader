//! Regex Parser using regex crate

use super::Parser;
use anyhow::{anyhow, Result};
use regex::Regex;

pub struct RegexParser;

impl Parser for RegexParser {
    fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let (pattern, replacement) = parse_regex_rule(rule)?;
        let re = Regex::new(&pattern)?;

        if let Some(captures) = re.captures(content) {
            // If there's a replacement, apply it
            if let Some(ref repl) = replacement {
                Ok(re.replace_all(content, repl.as_str()).to_string())
            } else {
                // Return first capture group or entire match
                if captures.len() > 1 {
                    Ok(captures
                        .get(1)
                        .map(|m| m.as_str())
                        .unwrap_or("")
                        .to_string())
                } else {
                    Ok(captures
                        .get(0)
                        .map(|m| m.as_str())
                        .unwrap_or("")
                        .to_string())
                }
            }
        } else {
            Err(anyhow!("No match found for regex: {}", pattern))
        }
    }

    fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let (pattern, _) = parse_regex_rule(rule)?;
        let re = Regex::new(&pattern)?;

        let results: Vec<String> = re
            .captures_iter(content)
            .map(|cap| {
                if cap.len() > 1 {
                    cap.get(1).map(|m| m.as_str()).unwrap_or("").to_string()
                } else {
                    cap.get(0).map(|m| m.as_str()).unwrap_or("").to_string()
                }
            })
            .collect();

        Ok(results)
    }

    fn get_elements(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        self.get_list(content, rule)
    }
}

/// Parse regex rule: ##pattern## or ##pattern##replacement
fn parse_regex_rule(rule: &str) -> Result<(String, Option<String>)> {
    let has_prefix = rule.starts_with("##");
    let rule_content = rule.trim_start_matches("##");

    // Split by ## to get pattern and optional replacement
    let mut parts: Vec<&str> = rule_content.split("##").collect();

    // Handle trailing ## resulting in empty last part
    // Only strip it if we had a prefix (implying ##pattern## extraction syntax)
    // If no prefix, "pattern##" implies replacement with empty string
    if has_prefix {
        if let Some(&last) = parts.last() {
            if last.is_empty() && parts.len() > 1 {
                parts.pop();
            }
        }
    }

    match parts.len() {
        1 => Ok((parts[0].to_string(), None)),
        2 => Ok((parts[0].to_string(), Some(parts[1].to_string()))),
        _ => Err(anyhow!("Invalid regex rule format: {:?}", parts)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_regex_extract() {
        let content = "Hello 123 World 456";
        let parser = RegexParser;

        // Rule format: ##pattern## - remove trailing to avoid replacement mode
        let result = parser.get_string(content, r"##(\d+)").unwrap();
        assert_eq!(result, "123");
    }

    #[test]
    fn test_regex_list() {
        let content = "item1, item2, item3";
        let parser = RegexParser;

        let result = parser.get_list(content, "##(item\\d)##").unwrap();
        assert_eq!(result, vec!["item1", "item2", "item3"]);
    }
}
