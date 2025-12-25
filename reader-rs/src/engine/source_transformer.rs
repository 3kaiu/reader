//! Source Transformer - Transform book source rules at import time
//!
//! This module transforms Legado book source rules during import to optimize
//! for native Rust execution. It analyzes rules and generates compiled
//! execution plans that minimize JS engine usage.

use super::js_analyzer::{AnalysisResult, ExprValue, JsPatternAnalyzer, NativeExecution};
use super::parsers::RuleType;
use super::preprocessor::{NativeApi, SourcePreprocessor, TemplateExpr};
use crate::models::{
    BookInfoRule, BookSourceFull, ContentRule, ExploreRule, SearchRule, TocRule,
};

/// Compiled rule that can be executed
#[derive(Debug, Clone)]
pub enum CompiledRule {
    /// Empty rule - no operation
    Empty,
    /// Pure CSS/XPath/JSON selector
    Selector { rule_type: RuleType, selector: String },
    /// Native Rust execution
    Native(NativeExecution),
    /// Chain of native operations
    NativeChain(Vec<NativeExecution>),
    /// Needs JS engine
    JavaScript(String),
    /// Multi-part rule with composite operations
    Composite {
        parts: Vec<CompiledRule>,
        /// Join with || (first match) or && (concatenate)
        join_type: JoinType,
    },
}

/// How to join multiple rule parts
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum JoinType {
    /// Use first successful result
    FirstMatch,
    /// Concatenate all results
    Concatenate,
}

/// Compiled URL with template parts
#[derive(Debug, Clone)]
pub struct CompiledUrl {
    /// Original URL template
    pub original: String,
    /// Whether this URL requires JS execution
    pub requires_js: bool,
    /// Compiled template parts (if no JS needed)
    pub parts: Option<Vec<UrlPart>>,
}

/// URL template part
#[derive(Debug, Clone)]
pub enum UrlPart {
    /// Literal text
    Literal(String),
    /// Variable substitution
    Variable(String),
    /// Native API call result
    NativeCall(NativeExecution),
}

/// Transformed book source with optimization metadata
#[derive(Debug)]
pub struct TransformedSource {
    /// Original source data
    pub original: BookSourceFull,
    /// Complexity score (0 = pure Rust, 100 = heavy JS)
    pub complexity_score: u8,
    /// Whether source requires JS engine
    pub requires_js: bool,
    /// Specific APIs that require JS fallback
    pub js_required_apis: Vec<String>,
    /// Compiled search URL
    pub search_url: Option<CompiledUrl>,
    /// Compiled search rules
    pub search_rules: CompiledSearchRules,
    /// Compiled book info rules
    pub book_info_rules: CompiledBookInfoRules,
    /// Compiled TOC rules
    pub toc_rules: CompiledTocRules,
    /// Compiled content rules
    pub content_rules: CompiledContentRules,
}

/// Compiled search rules
#[derive(Debug, Default)]
pub struct CompiledSearchRules {
    pub book_list: CompiledRule,
    pub name: CompiledRule,
    pub author: CompiledRule,
    pub kind: CompiledRule,
    pub last_chapter: CompiledRule,
    pub intro: CompiledRule,
    pub cover_url: CompiledRule,
    pub book_url: CompiledRule,
    pub word_count: CompiledRule,
}

/// Compiled book info rules
#[derive(Debug, Default)]
pub struct CompiledBookInfoRules {
    pub name: CompiledRule,
    pub author: CompiledRule,
    pub kind: CompiledRule,
    pub intro: CompiledRule,
    pub cover_url: CompiledRule,
    pub toc_url: CompiledRule,
    pub last_chapter: CompiledRule,
    pub word_count: CompiledRule,
}

/// Compiled TOC rules
#[derive(Debug, Default)]
pub struct CompiledTocRules {
    pub chapter_list: CompiledRule,
    pub chapter_name: CompiledRule,
    pub chapter_url: CompiledRule,
    pub is_volume: CompiledRule,
    pub next_toc_url: CompiledRule,
}

/// Compiled content rules
#[derive(Debug, Default)]
pub struct CompiledContentRules {
    pub content: CompiledRule,
    pub next_content_url: CompiledRule,
    pub replace_regex: Vec<(String, String)>,
}

impl Default for CompiledRule {
    fn default() -> Self {
        CompiledRule::Empty
    }
}

/// Source transformer for optimizing book source rules
pub struct SourceTransformer {
    analyzer: JsPatternAnalyzer,
    preprocessor: SourcePreprocessor,
}

impl Default for SourceTransformer {
    fn default() -> Self {
        Self::new()
    }
}

impl SourceTransformer {
    /// Create a new transformer
    pub fn new() -> Self {
        Self {
            analyzer: JsPatternAnalyzer::new(),
            preprocessor: SourcePreprocessor::new(),
        }
    }

    /// Transform a book source for optimized execution
    pub fn transform(&self, source: &BookSourceFull) -> TransformedSource {
        let mut requires_js = false;
        let mut js_apis = Vec::new();
        
        // Transform search URL
        let search_url = if !source.search_url.is_empty() {
            Some(self.transform_url(&source.search_url, &mut requires_js, &mut js_apis))
        } else {
            None
        };
        
        // Transform search rules
        let search_rules = source.rule_search.as_ref()
            .map(|r| self.transform_search_rules(r, &mut requires_js, &mut js_apis))
            .unwrap_or_default();
        
        // Transform book info rules
        let book_info_rules = source.rule_book_info.as_ref()
            .map(|r| self.transform_book_info_rules(r, &mut requires_js, &mut js_apis))
            .unwrap_or_default();
        
        // Transform TOC rules
        let toc_rules = source.rule_toc.as_ref()
            .map(|r| self.transform_toc_rules(r, &mut requires_js, &mut js_apis))
            .unwrap_or_default();
        
        // Transform content rules
        let content_rules = source.rule_content.as_ref()
            .map(|r| self.transform_content_rules(r, &mut requires_js, &mut js_apis))
            .unwrap_or_default();
        
        // Check jsLib - if present, likely needs JS
        if source.js_lib.as_ref().map(|s: &String| !s.is_empty()).unwrap_or(false) {
            requires_js = true;
            js_apis.push("jsLib".to_string());
        }
        
        // Calculate complexity score
        let complexity_score = self.calculate_complexity(
            &search_rules, 
            &book_info_rules, 
            &toc_rules, 
            &content_rules,
            requires_js
        );
        
        TransformedSource {
            original: source.clone(),
            complexity_score,
            requires_js,
            js_required_apis: js_apis,
            search_url,
            search_rules,
            book_info_rules,
            toc_rules,
            content_rules,
        }
    }

    /// Transform a URL template
    fn transform_url(&self, url: &str, requires_js: &mut bool, js_apis: &mut Vec<String>) -> CompiledUrl {
        let preprocessed = self.preprocessor.preprocess_url(url);
        
        let mut parts = Vec::new();
        let mut url_requires_js = false;
        
        for part in &preprocessed.parts {
            match part {
                TemplateExpr::Literal(s) => {
                    parts.push(UrlPart::Literal(s.clone()));
                }
                TemplateExpr::Variable(name) => {
                    parts.push(UrlPart::Variable(name.clone()));
                }
                TemplateExpr::NativeCall { api, args } => {
                    // Convert to NativeExecution
                    let exec = NativeExecution {
                        api: api.clone(),
                        args: args.iter().map(|a| self.template_to_expr_value(a)).collect(),
                    };
                    parts.push(UrlPart::NativeCall(exec));
                }
                TemplateExpr::JsExpr(code) => {
                    url_requires_js = true;
                    *requires_js = true;
                    js_apis.push(format!("URL JS: {}", &code[..code.len().min(30)]));
                }
            }
        }
        
        CompiledUrl {
            original: url.to_string(),
            requires_js: url_requires_js,
            parts: if url_requires_js { None } else { Some(parts) },
        }
    }

    /// Transform search rules
    fn transform_search_rules(&self, rules: &SearchRule, requires_js: &mut bool, js_apis: &mut Vec<String>) -> CompiledSearchRules {
        CompiledSearchRules {
            book_list: self.transform_rule_str(&rules.book_list, requires_js, js_apis),
            name: self.transform_rule_str(&rules.name, requires_js, js_apis),
            author: self.transform_rule_str(&rules.author, requires_js, js_apis),
            kind: self.transform_rule_str(&rules.kind, requires_js, js_apis),
            last_chapter: self.transform_rule_str(&rules.last_chapter, requires_js, js_apis),
            intro: self.transform_rule_str(&rules.intro, requires_js, js_apis),
            cover_url: self.transform_rule_str(&rules.cover_url, requires_js, js_apis),
            book_url: self.transform_rule_str(&rules.book_url, requires_js, js_apis),
            word_count: CompiledRule::Empty, // Not in current model
        }
    }

    /// Transform book info rules
    fn transform_book_info_rules(&self, rules: &BookInfoRule, requires_js: &mut bool, js_apis: &mut Vec<String>) -> CompiledBookInfoRules {
        CompiledBookInfoRules {
            name: self.transform_rule_str(&rules.name, requires_js, js_apis),
            author: self.transform_rule_str(&rules.author, requires_js, js_apis),
            kind: CompiledRule::Empty, // Not in model
            intro: self.transform_rule_str(&rules.intro, requires_js, js_apis),
            cover_url: self.transform_rule_str(&rules.cover_url, requires_js, js_apis),
            toc_url: self.transform_rule_str(&rules.toc_url, requires_js, js_apis),
            last_chapter: self.transform_rule_str(&rules.last_chapter, requires_js, js_apis),
            word_count: CompiledRule::Empty, // Not in model
        }
    }

    /// Transform TOC rules
    fn transform_toc_rules(&self, rules: &TocRule, requires_js: &mut bool, js_apis: &mut Vec<String>) -> CompiledTocRules {
        CompiledTocRules {
            chapter_list: self.transform_rule_str(&rules.chapter_list, requires_js, js_apis),
            chapter_name: self.transform_rule_str(&rules.chapter_name, requires_js, js_apis),
            chapter_url: self.transform_rule_str(&rules.chapter_url, requires_js, js_apis),
            is_volume: CompiledRule::Empty, // Not in model
            next_toc_url: self.transform_rule_str(&rules.next_toc_url, requires_js, js_apis),
        }
    }

    /// Transform content rules
    fn transform_content_rules(&self, rules: &ContentRule, requires_js: &mut bool, js_apis: &mut Vec<String>) -> CompiledContentRules {
        // Parse replace regex pairs
        let replace_regex = self.parse_replace_regex(&rules.replace_regex);
        
        CompiledContentRules {
            content: self.transform_rule_str(&rules.content, requires_js, js_apis),
            next_content_url: self.transform_rule_str(&rules.next_content_url, requires_js, js_apis),
            replace_regex,
        }
    }

    /// Transform a rule from String field
    fn transform_rule_str(&self, rule: &str, requires_js: &mut bool, js_apis: &mut Vec<String>) -> CompiledRule {
        if rule.is_empty() {
            return CompiledRule::Empty;
        }
        self.transform_rule(Some(rule), requires_js, js_apis)
    }

    /// Transform a single rule string
    fn transform_rule(&self, rule: Option<&str>, requires_js: &mut bool, js_apis: &mut Vec<String>) -> CompiledRule {
        let rule = match rule {
            Some(r) if !r.is_empty() => r,
            _ => return CompiledRule::Empty,
        };
        
        let rule = rule.trim();
        
        // Check for multi-rule operators
        if rule.contains("||") {
            let parts: Vec<_> = rule.split("||").map(|p| p.trim()).collect();
            let compiled: Vec<_> = parts.iter()
                .map(|p| self.transform_single_rule(p, requires_js, js_apis))
                .collect();
            return CompiledRule::Composite {
                parts: compiled,
                join_type: JoinType::FirstMatch,
            };
        }
        
        if rule.contains("&&") {
            let parts: Vec<_> = rule.split("&&").map(|p| p.trim()).collect();
            let compiled: Vec<_> = parts.iter()
                .map(|p| self.transform_single_rule(p, requires_js, js_apis))
                .collect();
            return CompiledRule::Composite {
                parts: compiled,
                join_type: JoinType::Concatenate,
            };
        }
        
        self.transform_single_rule(rule, requires_js, js_apis)
    }

    /// Transform a single rule (no || or &&)
    fn transform_single_rule(&self, rule: &str, requires_js: &mut bool, js_apis: &mut Vec<String>) -> CompiledRule {
        let rule = rule.trim();
        
        if rule.is_empty() {
            return CompiledRule::Empty;
        }
        
        // Detect rule type
        let rule_type = RuleType::detect(rule, "");
        
        match rule_type {
            RuleType::JavaScript => {
                // Try to analyze for native execution
                let analysis = self.analyzer.analyze(rule);
                match analysis {
                    AnalysisResult::Native(exec) => CompiledRule::Native(exec),
                    AnalysisResult::NativeChain(chain) => CompiledRule::NativeChain(chain),
                    AnalysisResult::RequiresJs(code) => {
                        *requires_js = true;
                        js_apis.push(format!("JS: {}", &code[..code.len().min(30)]));
                        CompiledRule::JavaScript(code)
                    }
                }
            }
            RuleType::Css | RuleType::XPath | RuleType::JsonPath | RuleType::JsoupDefault | RuleType::Regex => {
                // Strip prefix and create selector
                let selector = self.strip_rule_prefix(rule);
                CompiledRule::Selector { rule_type: rule_type.clone(), selector }
            }
        }
    }

    /// Strip rule type prefix (e.g., @css:, @xpath:)
    fn strip_rule_prefix(&self, rule: &str) -> String {
        let prefixes = ["@css:", "css:", "@xpath:", "xpath:", "@json:", "json:", "@js:"];
        for prefix in prefixes {
            if rule.to_lowercase().starts_with(prefix) {
                return rule[prefix.len()..].to_string();
            }
        }
        rule.to_string()
    }

    /// Convert template expression to ExprValue
    fn template_to_expr_value(&self, expr: &TemplateExpr) -> ExprValue {
        match expr {
            TemplateExpr::Literal(s) => ExprValue::Literal(s.clone()),
            TemplateExpr::Variable(name) => ExprValue::Variable(name.clone()),
            TemplateExpr::NativeCall { .. } => ExprValue::CurrentContent,
            TemplateExpr::JsExpr(_) => ExprValue::CurrentContent,
        }
    }

    /// Parse replace regex string into pairs
    fn parse_replace_regex(&self, regex_str: &str) -> Vec<(String, String)> {
        let mut result = Vec::new();
        
        // Format: ["pattern1","replacement1"],["pattern2","replacement2"]
        // Or JSON array: [["pattern", "replacement"], ...]
        if let Ok(arr) = serde_json::from_str::<Vec<Vec<String>>>(regex_str) {
            for pair in arr {
                if pair.len() >= 2 {
                    result.push((pair[0].clone(), pair[1].clone()));
                }
            }
        }
        
        result
    }

    /// Calculate complexity score (0-100)
    fn calculate_complexity(
        &self,
        search_rules: &CompiledSearchRules,
        _book_info_rules: &CompiledBookInfoRules,
        _toc_rules: &CompiledTocRules,
        _content_rules: &CompiledContentRules,
        requires_js: bool,
    ) -> u8 {
        let mut score = 0u8;
        
        // Base score if JS is required
        if requires_js {
            score += 40;
        }
        
        // Add based on rule types
        let all_rules = [
            &search_rules.book_list,
            &search_rules.name,
            &search_rules.author,
        ];
        
        for rule in all_rules {
            match rule {
                CompiledRule::JavaScript(_) => score = score.saturating_add(10),
                CompiledRule::NativeChain(_) => score = score.saturating_add(2),
                CompiledRule::Native(_) => score = score.saturating_add(1),
                CompiledRule::Selector { .. } => {} // Pure selectors don't add complexity
                _ => {}
            }
        }
        
        score.min(100)
    }

    /// Get a compatibility report for the source
    pub fn analyze_compatibility(&self, source: &BookSourceFull) -> CompatibilityReport {
        let transformed = self.transform(source);
        let native_ratio = self.calculate_native_ratio(&transformed);
        
        CompatibilityReport {
            source_name: source.book_source_name.clone(),
            source_url: source.book_source_url.clone(),
            complexity_score: transformed.complexity_score,
            requires_js: transformed.requires_js,
            js_apis: transformed.js_required_apis,
            native_ratio,
        }
    }

    fn calculate_native_ratio(&self, transformed: &TransformedSource) -> f32 {
        let mut native = 0;
        let mut total = 0;
        
        fn count_rule(rule: &CompiledRule, native: &mut i32, total: &mut i32) {
            *total += 1;
            match rule {
                CompiledRule::Empty => *native += 1,
                CompiledRule::Selector { .. } => *native += 1,
                CompiledRule::Native(_) => *native += 1,
                CompiledRule::NativeChain(_) => *native += 1,
                CompiledRule::JavaScript(_) => {}
                CompiledRule::Composite { parts, .. } => {
                    for part in parts {
                        count_rule(part, native, total);
                    }
                }
            }
        }
        
        count_rule(&transformed.search_rules.book_list, &mut native, &mut total);
        count_rule(&transformed.search_rules.name, &mut native, &mut total);
        count_rule(&transformed.search_rules.author, &mut native, &mut total);
        count_rule(&transformed.toc_rules.chapter_list, &mut native, &mut total);
        count_rule(&transformed.content_rules.content, &mut native, &mut total);
        
        if total == 0 {
            1.0
        } else {
            native as f32 / total as f32
        }
    }
}

/// Compatibility report for a book source
#[derive(Debug)]
pub struct CompatibilityReport {
    pub source_name: String,
    pub source_url: String,
    pub complexity_score: u8,
    pub requires_js: bool,
    pub js_apis: Vec<String>,
    pub native_ratio: f32,
}

impl CompatibilityReport {
    /// Check if source is fully compatible with native execution
    pub fn is_fully_native(&self) -> bool {
        !self.requires_js && self.complexity_score == 0
    }
    
    /// Check if source is mostly native (>80% rules)
    pub fn is_mostly_native(&self) -> bool {
        self.native_ratio >= 0.8
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    fn create_test_source() -> BookSourceFull {
        BookSourceFull {
            book_source_url: "https://test.com".to_string(),
            book_source_name: "Test Source".to_string(),
            book_source_group: String::new(),
            book_source_type: 0,
            weight: 0,
            enabled: true,
            search_url: "https://test.com/search?key={{key}}&page={{page}}".to_string(),
            rule_search: Some(SearchRule {
                book_list: "div.book-list".to_string(),
                name: ".book-name@text".to_string(),
                author: ".book-author@text".to_string(),
                kind: String::new(),
                last_chapter: String::new(),
                intro: String::new(),
                cover_url: String::new(),
                book_url: String::new(),
            }),
            rule_book_info: None,
            rule_toc: None,
            rule_content: None,
            rule_explore: None,
            header: None,
            login_url: None,
            js_lib: None,
        }
    }
    
    #[test]
    fn test_transform_source() {
        let source = create_test_source();
        let transformer = SourceTransformer::new();
        let transformed = transformer.transform(&source);
        
        assert!(!transformed.requires_js);
        assert!(transformed.complexity_score < 50);
    }
    
    #[test]
    fn test_transform_url() {
        let transformer = SourceTransformer::new();
        let mut requires_js = false;
        let mut js_apis = Vec::new();
        
        let url = "https://test.com/search?key={{key}}";
        let compiled = transformer.transform_url(url, &mut requires_js, &mut js_apis);
        
        assert!(!compiled.requires_js);
        assert!(compiled.parts.is_some());
    }
    
    #[test]
    fn test_transform_selector_rule() {
        let transformer = SourceTransformer::new();
        let mut requires_js = false;
        let mut js_apis = Vec::new();
        
        let rule = transformer.transform_rule(Some("div.class@text"), &mut requires_js, &mut js_apis);
        
        match rule {
            CompiledRule::Selector { rule_type, .. } => {
                assert_eq!(rule_type, RuleType::JsoupDefault);
            }
            _ => panic!("Expected Selector rule"),
        }
    }
    
    #[test]
    fn test_transform_js_rule_native() {
        let transformer = SourceTransformer::new();
        let mut requires_js = false;
        let mut js_apis = Vec::new();
        
        let rule = transformer.transform_rule(Some("@js:java.base64Decode(result)"), &mut requires_js, &mut js_apis);
        
        match rule {
            CompiledRule::Native(exec) => {
                assert_eq!(exec.api, NativeApi::Base64Decode);
            }
            _ => panic!("Expected Native rule, got {:?}", rule),
        }
    }
    
    #[test]
    fn test_compatibility_report() {
        let source = create_test_source();
        let transformer = SourceTransformer::new();
        let report = transformer.analyze_compatibility(&source);
        
        assert_eq!(report.source_name, "Test Source");
        assert!(report.native_ratio > 0.5);
    }
}
