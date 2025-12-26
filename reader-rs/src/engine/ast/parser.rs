//! JavaScript AST Parser using Oxc
//!
//! Provides a thin wrapper around Oxc parser for parsing JavaScript expressions
//! commonly found in Legado book source rules.

use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;

use super::pattern_matcher::AstPatternMatcher;
use super::types::*;

/// JavaScript AST Parser wrapper
pub struct JsAstParser {
    /// Whether to parse as expression (wrap in parens)
    expression_mode: bool,
}

impl Default for JsAstParser {
    fn default() -> Self {
        Self::new()
    }
}

impl JsAstParser {
    /// Create a new parser in expression mode (default)
    pub fn new() -> Self {
        Self {
            expression_mode: true,
        }
    }

    /// Create a parser in script mode (for multi-statement scripts)
    pub fn script_mode() -> Self {
        Self {
            expression_mode: false,
        }
    }

    /// Parse and analyze JavaScript code in one step
    ///
    /// This method handles the lifetime issues by doing parsing and analysis
    /// in a single scope where the allocator owns the parsed data.
    pub fn parse_and_analyze(&self, code: &str) -> AstAnalysisResult {
        let code = Self::normalize_code(code);

        // Create allocator in local scope
        let allocator = Allocator::default();

        // Determine if we need expression wrapping
        let parse_code = if self.expression_mode && self.is_simple_expression(&code) {
            format!("({})", code)
        } else {
            code.to_string()
        };

        // Use unambiguous mode for parsing JavaScript
        let source_type = SourceType::unambiguous();

        // Parse using Oxc
        let parser_return = Parser::new(&allocator, &parse_code, source_type).parse();

        // Check for parse errors
        if !parser_return.errors.is_empty() {
            let error_msgs: Vec<String> = parser_return
                .errors
                .iter()
                .map(|e| format!("{:?}", e))
                .collect();
            return AstAnalysisResult::RequiresJs {
                code: code.to_string(),
                reason: JsRequiredReason::ParseError(error_msgs.join("; ")),
            };
        }

        // Analyze the parsed program
        let matcher = AstPatternMatcher::new();
        matcher.analyze_program(&parser_return.program)
    }

    /// Normalize code by removing common prefixes
    fn normalize_code(code: &str) -> String {
        let code = code.trim();

        // Skip common prefixes
        code.strip_prefix("@js:")
            .or_else(|| {
                code.strip_prefix("<js>")
                    .and_then(|s| s.strip_suffix("</js>"))
            })
            .unwrap_or(code)
            .trim()
            .to_string()
    }

    /// Check if code looks like a simple expression (not a statement)
    fn is_simple_expression(&self, code: &str) -> bool {
        let code = code.trim();

        // Not a simple expression if it contains statement keywords at the start
        let statement_starters = [
            "if ",
            "if(",
            "for ",
            "for(",
            "while ",
            "while(",
            "switch ",
            "switch(",
            "try ",
            "try{",
            "function ",
            "class ",
            "const ",
            "let ",
            "var ",
            "return ",
            "throw ",
            "break",
            "continue",
            "import ",
            "export ",
        ];

        for starter in &statement_starters {
            if code.starts_with(starter) {
                return false;
            }
        }

        // Not a simple expression if it contains semicolons (multi-statement)
        if code.contains(';') && !code.ends_with(';') {
            return false;
        }

        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_expression() {
        let parser = JsAstParser::new();
        let result = parser.parse_and_analyze("java.base64Encode(key)");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_parse_method_chain() {
        let parser = JsAstParser::new();
        let result = parser.parse_and_analyze("result.trim()");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_parse_nested_call() {
        let parser = JsAstParser::new();
        let result = parser.parse_and_analyze("java.base64Encode(java.md5Encode(key))");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_parse_with_js_prefix() {
        let parser = JsAstParser::new();
        let result = parser.parse_and_analyze("@js:result.trim()");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_parse_with_js_tags() {
        let parser = JsAstParser::new();
        let result = parser.parse_and_analyze("<js>result.trim()</js>");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_unsupported_expression() {
        let parser = JsAstParser::new();
        let result = parser.parse_and_analyze("function() { return 1; }");
        assert!(matches!(result, AstAnalysisResult::RequiresJs { .. }));
    }
}
