//! AST Pattern Matcher for Legado JavaScript APIs
//!
//! This module traverses the Oxc AST to identify patterns that can be
//! executed natively in Rust, including:
//! - java.* API calls (encoding, crypto, HTTP, storage)
//! - String methods (trim, replace, split, etc.)
//! - JSON methods (parse, stringify)
//! - Nested and chained calls

use oxc_ast::ast::{
    Argument, ArrayExpression, ArrayExpressionElement, BinaryExpression, CallExpression,
    ComputedMemberExpression, ConditionalExpression, Expression, IdentifierReference,
    ObjectExpression, ObjectPropertyKind, Program, PropertyKey as OxcPropertyKey, Statement,
    StaticMemberExpression, TemplateLiteral, UnaryExpression,
};
use oxc_syntax::operator::{BinaryOperator as OxcBinaryOp, UnaryOperator};

use super::types::{
    AstAnalysisResult, BinaryOperator, ContextKey, ControlFlowKind, InputBinding, JsRequiredReason,
    NativeExecutionPlan, Operand, Operation, PropKey, TemplatePart, ValueType,
};
use crate::engine::preprocessor::NativeApi;

/// AST Pattern Matcher - identifies native-executable patterns in JavaScript AST
pub struct AstPatternMatcher {
    /// Whether to allow partial matching (some parts JS, some native)
    allow_partial: bool,
}

impl Default for AstPatternMatcher {
    fn default() -> Self {
        Self::new()
    }
}

impl AstPatternMatcher {
    /// Create a new pattern matcher
    pub fn new() -> Self {
        Self {
            allow_partial: false,
        }
    }

    /// Create a matcher that allows partial native execution
    pub fn with_partial() -> Self {
        Self {
            allow_partial: true,
        }
    }

    /// Analyze a parsed program
    pub fn analyze_program(&self, program: &Program) -> AstAnalysisResult {
        // Handle empty program
        if program.body.is_empty() {
            return AstAnalysisResult::Native(NativeExecutionPlan {
                operations: vec![],
                input_binding: InputBinding::None,
                output_type: ValueType::Null,
            });
        }

        // For single expression statement, analyze the expression
        if program.body.len() == 1 {
            if let Statement::ExpressionStatement(expr_stmt) = &program.body[0] {
                return self.analyze_expression(&expr_stmt.expression);
            }
        }

        // Multiple statements - not yet supported for native execution
        AstAnalysisResult::RequiresJs {
            code: "<multi-statement>".to_string(),
            reason: JsRequiredReason::ControlFlow(ControlFlowKind::Return),
        }
    }

    /// Analyze a single expression
    pub fn analyze_expression(&self, expr: &Expression) -> AstAnalysisResult {
        match expr {
            // Parenthesized expression - unwrap
            Expression::ParenthesizedExpression(paren) => {
                self.analyze_expression(&paren.expression)
            }

            // Call expression: func(), obj.method(), java.api()
            Expression::CallExpression(call) => self.analyze_call_expression(call),

            // Member expression: obj.prop, obj[key]
            Expression::StaticMemberExpression(member) => self.analyze_static_member(member),
            Expression::ComputedMemberExpression(member) => self.analyze_computed_member(member),

            // Literals
            Expression::StringLiteral(lit) => AstAnalysisResult::Native(
                NativeExecutionPlan::literal(Operand::StringLiteral(lit.value.to_string())),
            ),
            Expression::NumericLiteral(lit) => AstAnalysisResult::Native(
                NativeExecutionPlan::literal(Operand::NumberLiteral(lit.value)),
            ),
            Expression::BooleanLiteral(lit) => AstAnalysisResult::Native(
                NativeExecutionPlan::literal(Operand::BooleanLiteral(lit.value)),
            ),
            Expression::NullLiteral(_) => {
                AstAnalysisResult::Native(NativeExecutionPlan::literal(Operand::Null))
            }

            // Identifier (variable reference)
            Expression::Identifier(ident) => self.analyze_identifier(ident),

            // Binary expression: a + b, a === b
            Expression::BinaryExpression(bin) => self.analyze_binary_expression(bin),

            // Conditional (ternary): a ? b : c
            Expression::ConditionalExpression(cond) => self.analyze_conditional_expression(cond),

            // Template literal: `hello ${name}`
            Expression::TemplateLiteral(tmpl) => self.analyze_template_literal(tmpl),

            // Array expression: [1, 2, 3]
            Expression::ArrayExpression(arr) => self.analyze_array_expression(arr),

            // Object expression: { key: value }
            Expression::ObjectExpression(obj) => self.analyze_object_expression(obj),

            // Unary expression: !a, -a
            Expression::UnaryExpression(unary) => self.analyze_unary_expression(unary),

            // Arrow function, function expression - requires JS
            Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {
                AstAnalysisResult::RequiresJs {
                    code: "<function>".to_string(),
                    reason: JsRequiredReason::FunctionDefinition,
                }
            }

            // Other expressions - fallback to JS
            _ => AstAnalysisResult::RequiresJs {
                code: "<unsupported expression>".to_string(),
                reason: JsRequiredReason::UnsupportedExpression,
            },
        }
    }

    /// Analyze a call expression
    fn analyze_call_expression(&self, call: &CallExpression) -> AstAnalysisResult {
        match &call.callee {
            // Static member call: obj.method() or java.api()
            Expression::StaticMemberExpression(member) => {
                self.analyze_member_call(member, &call.arguments)
            }

            // Direct function call: func()
            Expression::Identifier(ident) => self.analyze_global_call(&ident.name, &call.arguments),

            // Chained call: a().b()
            Expression::CallExpression(inner_call) => {
                // First analyze the inner call
                let inner_result = self.analyze_call_expression(inner_call);

                // This is complex chaining - for now, require JS
                if matches!(inner_result, AstAnalysisResult::Native(_)) {
                    // Could potentially chain, but complex - fallback for now
                }

                AstAnalysisResult::RequiresJs {
                    code: "<chained call>".to_string(),
                    reason: JsRequiredReason::UnsupportedExpression,
                }
            }

            _ => AstAnalysisResult::RequiresJs {
                code: "<complex callee>".to_string(),
                reason: JsRequiredReason::DynamicPropertyAccess,
            },
        }
    }

    /// Analyze a member call: obj.method(args)
    fn analyze_member_call(
        &self,
        member: &StaticMemberExpression,
        arguments: &oxc_allocator::Vec<Argument>,
    ) -> AstAnalysisResult {
        let method_name = member.property.name.as_str();

        // Check if it's a java.* API call
        if let Expression::Identifier(obj) = &member.object {
            let obj_name = obj.name.as_str();

            if obj_name == "java" {
                return self.match_java_api(method_name, arguments);
            }

            if obj_name == "JSON" {
                return self.match_json_api(method_name, arguments);
            }

            if obj_name == "source" {
                return self.match_source_api(method_name, arguments);
            }

            // Could be a variable - try string method matching
            if let Some(context_key) = ContextKey::from_str(obj_name) {
                return self.match_string_method(
                    Operand::ContextValue(context_key),
                    method_name,
                    arguments,
                );
            }

            // Unknown variable - still try string methods
            return self.match_string_method(
                Operand::Variable(obj_name.to_string()),
                method_name,
                arguments,
            );
        }

        // If the object is itself a call expression (method chaining)
        if let Expression::CallExpression(inner_call) = &member.object {
            // Analyze the inner call first
            if let AstAnalysisResult::Native(inner_plan) = self.analyze_call_expression(inner_call)
            {
                // Chain this method call onto the result
                return self.match_string_method(
                    Operand::Nested(Box::new(inner_plan)),
                    method_name,
                    arguments,
                );
            }
        }

        // If the object is a member expression (e.g., JSON.parse(x).data)
        if let Expression::StaticMemberExpression(_) = &member.object {
            // Complex property access - analyze the object first
            if let AstAnalysisResult::Native(obj_plan) = self.analyze_expression(&member.object) {
                return self.match_string_method(
                    Operand::Nested(Box::new(obj_plan)),
                    method_name,
                    arguments,
                );
            }
        }

        AstAnalysisResult::RequiresJs {
            code: format!("<unknown>.{}()", method_name),
            reason: JsRequiredReason::UnsupportedExpression,
        }
    }

    /// Match java.* API calls
    fn match_java_api(
        &self,
        method: &str,
        args: &oxc_allocator::Vec<Argument>,
    ) -> AstAnalysisResult {
        // Map method name to NativeApi
        let api = match method {
            // Encoding
            "base64Encode" => NativeApi::Base64Encode,
            "base64Decode" => NativeApi::Base64Decode,
            "md5Encode" => NativeApi::Md5Encode,
            "md5Encode16" => NativeApi::Md5Encode16,
            "encodeURI" | "encodeURIComponent" => NativeApi::EncodeUri,
            "htmlFormat" => NativeApi::HtmlFormat,
            "hexEncodeToString" | "hexEncode" => NativeApi::HexEncode,
            "hexDecodeToString" | "hexDecode" => NativeApi::HexDecode,
            "utf8ToGbk" => NativeApi::Utf8ToGbk,

            // Random/Time
            "randomUUID" => NativeApi::RandomUuid,
            "timeFormat" => NativeApi::TimeFormat(None),
            "timeFormatUtc" => NativeApi::TimeFormatUtc,

            // Hash
            "digestHex" => NativeApi::DigestHex("MD5".to_string()),
            "sha1" | "sha1Encode" => NativeApi::DigestHex("SHA1".to_string()),
            "sha256" | "sha256Encode" => NativeApi::DigestHex("SHA256".to_string()),
            "sha512" | "sha512Encode" => NativeApi::DigestHex("SHA512".to_string()),

            // HTTP
            "ajax" | "connect" | "httpGet" => NativeApi::HttpGet,
            "post" | "httpPost" => NativeApi::HttpPost,
            "request" | "httpRequest" => NativeApi::HttpRequest,
            "getAll" | "httpGetAll" => NativeApi::HttpGetAll,

            // Storage
            "put" => NativeApi::CacheSet,
            "get" => NativeApi::CacheGet,
            "putVariable" => NativeApi::SourceVarSet,
            "getVariable" => NativeApi::SourceVarGet,

            // Cookie
            "getCookie" => NativeApi::GetCookie,
            "setCookie" => NativeApi::SetCookie,

            // Crypto - AES
            "aesEncode" => NativeApi::AesEncode,
            "aesDecode" => NativeApi::AesDecode,
            "aesEncodeArgsBase64" => NativeApi::AesEncodeArgsBase64,
            "aesDecodeArgsBase64" => NativeApi::AesDecodeArgsBase64,

            // Crypto - DES
            "desEncode" => NativeApi::DesEncode,
            "desDecode" => NativeApi::DesDecode,

            // Crypto - 3DES
            "tripleDes" | "tripleDesDecodeStr" => NativeApi::TripleDesDecodeStr,
            "tripleDesEncodeBase64" => NativeApi::TripleDesEncodeBase64,
            "tripleDesDecodeArgsBase64" => NativeApi::TripleDesDecodeArgsBase64,
            "tripleDesEncodeArgsBase64" => NativeApi::TripleDesEncodeArgsBase64,

            // File
            "cacheFile" => NativeApi::CacheFile,
            "readFile" => NativeApi::ReadFile,
            "readTxtFile" => NativeApi::ReadTxtFile,
            "readTxtFileWithCharset" => NativeApi::ReadTxtFileWithCharset,
            "getFile" => NativeApi::GetFile,
            "deleteFile" => NativeApi::DeleteFile,
            "importScript" => NativeApi::ImportScript,

            // ZIP
            "zipReadString" => NativeApi::ZipReadString,
            "zipReadStringWithCharset" => NativeApi::ZipReadStringWithCharset,
            "zipReadBytes" => NativeApi::ZipReadBytes,
            "zipExtract" => NativeApi::ZipExtract,

            // JSON path
            "getString" => NativeApi::JsonPath,

            // String operations
            "htmlToText" | "textTrim" => NativeApi::HtmlToText,

            // Logging
            "log" | "logType" => NativeApi::Log,

            // Unknown
            _ => {
                return AstAnalysisResult::RequiresJs {
                    code: format!("java.{}()", method),
                    reason: JsRequiredReason::UnsupportedApi(format!("java.{}", method)),
                };
            }
        };

        // Parse arguments
        let operands = match self.parse_arguments(args) {
            Ok(ops) => ops,
            Err(reason) => {
                return AstAnalysisResult::RequiresJs {
                    code: format!("java.{}(...)", method),
                    reason,
                };
            }
        };

        AstAnalysisResult::Native(NativeExecutionPlan::api_call(api, operands))
    }

    /// Match JSON.* API calls
    fn match_json_api(
        &self,
        method: &str,
        args: &oxc_allocator::Vec<Argument>,
    ) -> AstAnalysisResult {
        let api = match method {
            "parse" => NativeApi::JsonParse,
            "stringify" => NativeApi::JsonStringify,
            _ => {
                return AstAnalysisResult::RequiresJs {
                    code: format!("JSON.{}()", method),
                    reason: JsRequiredReason::UnsupportedApi(format!("JSON.{}", method)),
                };
            }
        };

        let operands = match self.parse_arguments(args) {
            Ok(ops) => ops,
            Err(reason) => {
                return AstAnalysisResult::RequiresJs {
                    code: format!("JSON.{}(...)", method),
                    reason,
                };
            }
        };

        AstAnalysisResult::Native(NativeExecutionPlan::api_call(api, operands))
    }

    /// Match source.* API calls
    fn match_source_api(
        &self,
        method: &str,
        args: &oxc_allocator::Vec<Argument>,
    ) -> AstAnalysisResult {
        let api = match method {
            "putVariable" => NativeApi::SourceVarSet,
            "getVariable" => NativeApi::SourceVarGet,
            _ => {
                return AstAnalysisResult::RequiresJs {
                    code: format!("source.{}()", method),
                    reason: JsRequiredReason::UnsupportedApi(format!("source.{}", method)),
                };
            }
        };

        let operands = match self.parse_arguments(args) {
            Ok(ops) => ops,
            Err(reason) => {
                return AstAnalysisResult::RequiresJs {
                    code: format!("source.{}(...)", method),
                    reason,
                };
            }
        };

        AstAnalysisResult::Native(NativeExecutionPlan::api_call(api, operands))
    }

    /// Match string methods on an object
    fn match_string_method(
        &self,
        object: Operand,
        method: &str,
        args: &oxc_allocator::Vec<Argument>,
    ) -> AstAnalysisResult {
        let operands = match self.parse_arguments(args) {
            Ok(ops) => ops,
            Err(reason) => {
                return AstAnalysisResult::RequiresJs {
                    code: format!("<obj>.{}(...)", method),
                    reason,
                };
            }
        };

        // Map string methods to operations
        match method {
            "trim" | "trimStart" | "trimEnd" | "trimLeft" | "trimRight" => AstAnalysisResult::Native(
                NativeExecutionPlan::method_call(object, "trim".to_string(), operands),
            ),

            "replace" | "replaceAll" => {
                // Need at least 2 arguments: pattern and replacement
                if operands.len() >= 2 {
                    AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                        object,
                        method.to_string(),
                        operands,
                    ))
                } else {
                    AstAnalysisResult::RequiresJs {
                        code: format!("<obj>.{}(...)", method),
                        reason: JsRequiredReason::UnsupportedExpression,
                    }
                }
            }

            "split" => AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                object,
                "split".to_string(),
                operands,
            )),

            "substring" | "substr" | "slice" => AstAnalysisResult::Native(
                NativeExecutionPlan::method_call(object, "substring".to_string(), operands),
            ),

            "indexOf" | "lastIndexOf" => AstAnalysisResult::Native(
                NativeExecutionPlan::method_call(object, method.to_string(), operands),
            ),

            "includes" | "startsWith" | "endsWith" => AstAnalysisResult::Native(
                NativeExecutionPlan::method_call(object, method.to_string(), operands),
            ),

            "toLowerCase" | "toUpperCase" | "toLocaleLowerCase" | "toLocaleUpperCase" => {
                AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                    object,
                    method.to_string(),
                    operands,
                ))
            }

            "match" => {
                // String.match() with regex - can be native if pattern is literal
                AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                    object,
                    "match".to_string(),
                    operands,
                ))
            }

            "charAt" | "charCodeAt" | "codePointAt" => {
                AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                    object,
                    method.to_string(),
                    operands,
                ))
            }

            "concat" => AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                object,
                "concat".to_string(),
                operands,
            )),

            // Padding methods
            "padStart" | "padEnd" => AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                object,
                method.to_string(),
                operands,
            )),

            // Repeat
            "repeat" => AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                object,
                "repeat".to_string(),
                operands,
            )),

            // Normalize
            "normalize" => AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                object,
                "normalize".to_string(),
                operands,
            )),

            // Search
            "search" => AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                object,
                "search".to_string(),
                operands,
            )),

            // Array methods
            "join" | "reverse" | "sort" | "filter" | "map" | "find" | "forEach" | "pop" | "push"
            | "shift" | "unshift" | "splice" | "flat" | "flatMap" | "every" | "some"
            | "reduce" | "reduceRight" | "fill" | "copyWithin" | "entries" | "keys" | "values"
            | "at" => {
                // These could be native for simple cases
                AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                    object,
                    method.to_string(),
                    operands,
                ))
            }

            "length" => {
                // This is actually a property, not a method
                AstAnalysisResult::Native(NativeExecutionPlan {
                    operations: vec![Operation::PropertyAccess {
                        object: Box::new(object),
                        property: PropKey::Static("length".to_string()),
                    }],
                    input_binding: InputBinding::None,
                    output_type: ValueType::Number,
                })
            }

            _ => AstAnalysisResult::RequiresJs {
                code: format!("<obj>.{}()", method),
                reason: JsRequiredReason::UnsupportedApi(method.to_string()),
            },
        }
    }

    /// Analyze global function call
    fn analyze_global_call(
        &self,
        name: &str,
        args: &oxc_allocator::Vec<Argument>,
    ) -> AstAnalysisResult {
        match name {
            "parseInt" | "parseFloat" | "Number" | "String" | "Boolean" => {
                let operands = match self.parse_arguments(args) {
                    Ok(ops) => ops,
                    Err(reason) => {
                        return AstAnalysisResult::RequiresJs {
                            code: format!("{}(...)", name),
                            reason,
                        };
                    }
                };

                AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                    Operand::Null, // Global context
                    name.to_string(),
                    operands,
                ))
            }

            "encodeURI" | "encodeURIComponent" | "decodeURI" | "decodeURIComponent" => {
                let operands = match self.parse_arguments(args) {
                    Ok(ops) => ops,
                    Err(reason) => {
                        return AstAnalysisResult::RequiresJs {
                            code: format!("{}(...)", name),
                            reason,
                        };
                    }
                };

                AstAnalysisResult::Native(NativeExecutionPlan::api_call(
                    NativeApi::EncodeUri,
                    operands,
                ))
            }

            _ => AstAnalysisResult::RequiresJs {
                code: format!("{}()", name),
                reason: JsRequiredReason::UnsupportedApi(name.to_string()),
            },
        }
    }

    /// Parse call arguments to operands
    fn parse_arguments(
        &self,
        args: &oxc_allocator::Vec<Argument>,
    ) -> Result<Vec<Operand>, JsRequiredReason> {
        let mut operands = Vec::with_capacity(args.len());

        for arg in args {
            match arg {
                Argument::SpreadElement(_) => {
                    return Err(JsRequiredReason::UnsupportedExpression);
                }
                _ => {
                    let expr = arg.to_expression();
                    match self.expression_to_operand(expr) {
                        Ok(op) => operands.push(op),
                        Err(reason) => return Err(reason),
                    }
                }
            }
        }

        Ok(operands)
    }

    /// Convert an expression to an operand
    fn expression_to_operand(&self, expr: &Expression) -> Result<Operand, JsRequiredReason> {
        match expr {
            Expression::StringLiteral(lit) => Ok(Operand::StringLiteral(lit.value.to_string())),
            Expression::NumericLiteral(lit) => Ok(Operand::NumberLiteral(lit.value)),
            Expression::BooleanLiteral(lit) => Ok(Operand::BooleanLiteral(lit.value)),
            Expression::NullLiteral(_) => Ok(Operand::Null),
            Expression::Identifier(ident) => {
                let name = ident.name.as_str();
                if let Some(ctx) = ContextKey::from_str(name) {
                    Ok(Operand::ContextValue(ctx))
                } else {
                    Ok(Operand::Variable(name.to_string()))
                }
            }
            Expression::ParenthesizedExpression(paren) => {
                self.expression_to_operand(&paren.expression)
            }

            // Nested call - recursively analyze
            Expression::CallExpression(call) => match self.analyze_call_expression(call) {
                AstAnalysisResult::Native(plan) => Ok(Operand::Nested(Box::new(plan))),
                AstAnalysisResult::RequiresJs { reason, .. } => Err(reason),
                _ => Err(JsRequiredReason::UnsupportedExpression),
            },

            // Member expression - could be property access
            Expression::StaticMemberExpression(member) => {
                match self.analyze_static_member(member) {
                    AstAnalysisResult::Native(plan) => Ok(Operand::Nested(Box::new(plan))),
                    AstAnalysisResult::RequiresJs { reason, .. } => Err(reason),
                    _ => Err(JsRequiredReason::UnsupportedExpression),
                }
            }

            // Regex literal - store as string
            Expression::RegExpLiteral(regex) => Ok(Operand::StringLiteral(format!(
                "/{}/{}",
                regex.regex.pattern, regex.regex.flags
            ))),

            // Template literal
            Expression::TemplateLiteral(tmpl) => {
                if tmpl.expressions.is_empty() {
                    // Simple template with no expressions
                    let s: String = tmpl
                        .quasis
                        .iter()
                        .filter_map(|q| q.value.cooked.as_ref())
                        .map(|s| s.as_str())
                        .collect();
                    Ok(Operand::StringLiteral(s))
                } else {
                    Err(JsRequiredReason::UnsupportedExpression)
                }
            }

            // Binary expression - analyze and wrap as nested
            Expression::BinaryExpression(bin) => match self.analyze_binary_expression(bin) {
                AstAnalysisResult::Native(plan) => Ok(Operand::Nested(Box::new(plan))),
                AstAnalysisResult::RequiresJs { reason, .. } => Err(reason),
                _ => Err(JsRequiredReason::UnsupportedExpression),
            },

            _ => Err(JsRequiredReason::UnsupportedExpression),
        }
    }

    /// Analyze static member expression (property access)
    fn analyze_static_member(&self, member: &StaticMemberExpression) -> AstAnalysisResult {
        let property = member.property.name.as_str();

        // Special case: object.length
        if property == "length" {
            if let Ok(obj_operand) = self.expression_to_operand(&member.object) {
                return AstAnalysisResult::Native(NativeExecutionPlan {
                    operations: vec![Operation::PropertyAccess {
                        object: Box::new(obj_operand),
                        property: PropKey::Static(property.to_string()),
                    }],
                    input_binding: InputBinding::None,
                    output_type: ValueType::Number,
                });
            }
        }

        // General property access
        if let Ok(obj_operand) = self.expression_to_operand(&member.object) {
            return AstAnalysisResult::Native(NativeExecutionPlan {
                operations: vec![Operation::PropertyAccess {
                    object: Box::new(obj_operand),
                    property: PropKey::Static(property.to_string()),
                }],
                input_binding: InputBinding::None,
                output_type: ValueType::Unknown,
            });
        }

        AstAnalysisResult::RequiresJs {
            code: format!("<obj>.{}", property),
            reason: JsRequiredReason::UnsupportedExpression,
        }
    }

    /// Analyze computed member expression (bracket notation)
    fn analyze_computed_member(&self, member: &ComputedMemberExpression) -> AstAnalysisResult {
        let obj_operand = match self.expression_to_operand(&member.object) {
            Ok(op) => op,
            Err(reason) => {
                return AstAnalysisResult::RequiresJs {
                    code: "<obj>[...]".to_string(),
                    reason,
                };
            }
        };

        // Determine property key type
        let property = match &member.expression {
            Expression::NumericLiteral(num) => PropKey::ComputedIndex(num.value as i64),
            Expression::StringLiteral(s) => PropKey::ComputedLiteral(s.value.to_string()),
            _ => {
                // Dynamic property access
                match self.expression_to_operand(&member.expression) {
                    Ok(op) => PropKey::Dynamic(Box::new(op)),
                    Err(reason) => {
                        return AstAnalysisResult::RequiresJs {
                            code: "<obj>[<dynamic>]".to_string(),
                            reason,
                        };
                    }
                }
            }
        };

        AstAnalysisResult::Native(NativeExecutionPlan {
            operations: vec![Operation::PropertyAccess {
                object: Box::new(obj_operand),
                property,
            }],
            input_binding: InputBinding::None,
            output_type: ValueType::Unknown,
        })
    }

    /// Analyze identifier
    fn analyze_identifier(&self, ident: &IdentifierReference) -> AstAnalysisResult {
        let name = ident.name.as_str();

        if let Some(ctx) = ContextKey::from_str(name) {
            AstAnalysisResult::Native(NativeExecutionPlan::literal(Operand::ContextValue(ctx)))
        } else {
            AstAnalysisResult::Native(NativeExecutionPlan::literal(Operand::Variable(
                name.to_string(),
            )))
        }
    }

    /// Analyze binary expression
    fn analyze_binary_expression(&self, expr: &BinaryExpression) -> AstAnalysisResult {
        let left = match self.expression_to_operand(&expr.left) {
            Ok(op) => op,
            Err(reason) => {
                return AstAnalysisResult::RequiresJs {
                    code: "<binary>".to_string(),
                    reason,
                };
            }
        };

        let right = match self.expression_to_operand(&expr.right) {
            Ok(op) => op,
            Err(reason) => {
                return AstAnalysisResult::RequiresJs {
                    code: "<binary>".to_string(),
                    reason,
                };
            }
        };

        let op = match expr.operator {
            OxcBinaryOp::Addition => BinaryOperator::Add,
            OxcBinaryOp::Subtraction => BinaryOperator::Sub,
            OxcBinaryOp::Multiplication => BinaryOperator::Mul,
            OxcBinaryOp::Division => BinaryOperator::Div,
            OxcBinaryOp::Remainder => BinaryOperator::Mod,
            OxcBinaryOp::Equality => BinaryOperator::Eq,
            OxcBinaryOp::Inequality => BinaryOperator::Ne,
            OxcBinaryOp::StrictEquality => BinaryOperator::StrictEq,
            OxcBinaryOp::StrictInequality => BinaryOperator::StrictNe,
            OxcBinaryOp::LessThan => BinaryOperator::Lt,
            OxcBinaryOp::LessEqualThan => BinaryOperator::Le,
            OxcBinaryOp::GreaterThan => BinaryOperator::Gt,
            OxcBinaryOp::GreaterEqualThan => BinaryOperator::Ge,
            _ => {
                return AstAnalysisResult::RequiresJs {
                    code: "<unsupported operator>".to_string(),
                    reason: JsRequiredReason::UnsupportedExpression,
                };
            }
        };

        AstAnalysisResult::Native(NativeExecutionPlan {
            operations: vec![Operation::BinaryOp {
                left: Box::new(left),
                op,
                right: Box::new(right),
            }],
            input_binding: InputBinding::None,
            output_type: ValueType::Unknown,
        })
    }

    /// Analyze conditional (ternary) expression
    fn analyze_conditional_expression(&self, expr: &ConditionalExpression) -> AstAnalysisResult {
        let condition = match self.expression_to_operand(&expr.test) {
            Ok(op) => op,
            Err(reason) => {
                return AstAnalysisResult::RequiresJs {
                    code: "<ternary>".to_string(),
                    reason,
                };
            }
        };

        let then_branch = match self.expression_to_operand(&expr.consequent) {
            Ok(op) => op,
            Err(reason) => {
                return AstAnalysisResult::RequiresJs {
                    code: "<ternary>".to_string(),
                    reason,
                };
            }
        };

        let else_branch = match self.expression_to_operand(&expr.alternate) {
            Ok(op) => op,
            Err(reason) => {
                return AstAnalysisResult::RequiresJs {
                    code: "<ternary>".to_string(),
                    reason,
                };
            }
        };

        AstAnalysisResult::Native(NativeExecutionPlan {
            operations: vec![Operation::Conditional {
                condition: Box::new(condition),
                then_branch: Box::new(then_branch),
                else_branch: Box::new(else_branch),
            }],
            input_binding: InputBinding::None,
            output_type: ValueType::Unknown,
        })
    }

    /// Analyze template literal
    fn analyze_template_literal(&self, tmpl: &TemplateLiteral) -> AstAnalysisResult {
        let mut parts = Vec::new();

        for (i, quasi) in tmpl.quasis.iter().enumerate() {
            // Add static part
            if let Some(cooked) = &quasi.value.cooked {
                if !cooked.is_empty() {
                    parts.push(TemplatePart::Static(cooked.to_string()));
                }
            }

            // Add expression part if exists
            if i < tmpl.expressions.len() {
                match self.expression_to_operand(&tmpl.expressions[i]) {
                    Ok(op) => parts.push(TemplatePart::Expression(Box::new(op))),
                    Err(reason) => {
                        return AstAnalysisResult::RequiresJs {
                            code: "<template literal>".to_string(),
                            reason,
                        };
                    }
                }
            }
        }

        AstAnalysisResult::Native(NativeExecutionPlan {
            operations: vec![Operation::TemplateLiteral { parts }],
            input_binding: InputBinding::None,
            output_type: ValueType::String,
        })
    }

    /// Analyze array expression
    fn analyze_array_expression(&self, arr: &ArrayExpression) -> AstAnalysisResult {
        let mut elements = Vec::new();

        for elem in &arr.elements {
            match elem {
                ArrayExpressionElement::SpreadElement(_) => {
                    return AstAnalysisResult::RequiresJs {
                        code: "<array spread>".to_string(),
                        reason: JsRequiredReason::UnsupportedExpression,
                    };
                }
                ArrayExpressionElement::Elision(_) => {
                    elements.push(Operand::Undefined);
                }
                // Handle expression elements directly
                elem => {
                    // Try to convert to expression - the element is an expression variant
                    let expr_result = match elem {
                        ArrayExpressionElement::SpreadElement(_) => continue,
                        ArrayExpressionElement::Elision(_) => continue,
                        // All other variants are expression types
                        _ => {
                            // Cast element to expression by matching specific patterns
                            if let ArrayExpressionElement::BooleanLiteral(lit) = elem {
                                Ok(Operand::BooleanLiteral(lit.value))
                            } else if let ArrayExpressionElement::NullLiteral(_) = elem {
                                Ok(Operand::Null)
                            } else if let ArrayExpressionElement::NumericLiteral(lit) = elem {
                                Ok(Operand::NumberLiteral(lit.value))
                            } else if let ArrayExpressionElement::StringLiteral(lit) = elem {
                                Ok(Operand::StringLiteral(lit.value.to_string()))
                            } else if let ArrayExpressionElement::Identifier(ident) = elem {
                                if let Some(ctx) = ContextKey::from_str(&ident.name) {
                                    Ok(Operand::ContextValue(ctx))
                                } else {
                                    Ok(Operand::Variable(ident.name.to_string()))
                                }
                            } else {
                                Err(JsRequiredReason::UnsupportedExpression)
                            }
                        }
                    };

                    match expr_result {
                        Ok(op) => elements.push(op),
                        Err(reason) => {
                            return AstAnalysisResult::RequiresJs {
                                code: "<array element>".to_string(),
                                reason,
                            };
                        }
                    }
                }
            }
        }

        AstAnalysisResult::Native(NativeExecutionPlan::literal(Operand::ArrayLiteral(
            elements,
        )))
    }

    /// Analyze object expression
    fn analyze_object_expression(&self, obj: &ObjectExpression) -> AstAnalysisResult {
        let mut properties = Vec::new();

        for prop in &obj.properties {
            match prop {
                ObjectPropertyKind::ObjectProperty(p) => {
                    // Get key
                    let key = match &p.key {
                        OxcPropertyKey::StaticIdentifier(ident) => ident.name.to_string(),
                        OxcPropertyKey::StringLiteral(s) => s.value.to_string(),
                        _ => {
                            return AstAnalysisResult::RequiresJs {
                                code: "<computed property key>".to_string(),
                                reason: JsRequiredReason::DynamicPropertyAccess,
                            };
                        }
                    };

                    // Get value
                    match self.expression_to_operand(&p.value) {
                        Ok(val) => properties.push((key, val)),
                        Err(reason) => {
                            return AstAnalysisResult::RequiresJs {
                                code: "<object property>".to_string(),
                                reason,
                            };
                        }
                    }
                }
                ObjectPropertyKind::SpreadProperty(_) => {
                    return AstAnalysisResult::RequiresJs {
                        code: "<object spread>".to_string(),
                        reason: JsRequiredReason::UnsupportedExpression,
                    };
                }
            }
        }

        AstAnalysisResult::Native(NativeExecutionPlan::literal(Operand::ObjectLiteral(
            properties,
        )))
    }

    /// Analyze unary expression
    fn analyze_unary_expression(&self, expr: &UnaryExpression) -> AstAnalysisResult {
        match expr.operator {
            UnaryOperator::LogicalNot => {
                // !x - could be native
                match self.expression_to_operand(&expr.argument) {
                    Ok(op) => AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                        op,
                        "!".to_string(),
                        vec![],
                    )),
                    Err(reason) => AstAnalysisResult::RequiresJs {
                        code: "!<expr>".to_string(),
                        reason,
                    },
                }
            }
            UnaryOperator::UnaryNegation => {
                // -x - could be native
                match self.expression_to_operand(&expr.argument) {
                    Ok(op) => AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                        op,
                        "-".to_string(),
                        vec![],
                    )),
                    Err(reason) => AstAnalysisResult::RequiresJs {
                        code: "-<expr>".to_string(),
                        reason,
                    },
                }
            }
            UnaryOperator::Typeof => match self.expression_to_operand(&expr.argument) {
                Ok(op) => AstAnalysisResult::Native(NativeExecutionPlan::method_call(
                    op,
                    "typeof".to_string(),
                    vec![],
                )),
                Err(reason) => AstAnalysisResult::RequiresJs {
                    code: "typeof <expr>".to_string(),
                    reason,
                },
            },
            _ => AstAnalysisResult::RequiresJs {
                code: "<unary>".to_string(),
                reason: JsRequiredReason::UnsupportedExpression,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::ast::parser::JsAstParser;

    fn analyze_code(code: &str) -> AstAnalysisResult {
        let parser = JsAstParser::new();
        parser.parse_and_analyze(code)
    }

    #[test]
    fn test_java_base64_encode() {
        let result = analyze_code("java.base64Encode(key)");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_nested_java_call() {
        let result = analyze_code("java.base64Encode(java.md5Encode(key))");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_string_trim() {
        let result = analyze_code("result.trim()");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_string_replace() {
        let result = analyze_code("result.replace('old', 'new')");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_json_parse() {
        let result = analyze_code("JSON.parse(result)");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_property_access() {
        let result = analyze_code("result.length");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_array_index() {
        let result = analyze_code("result[0]");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_ternary() {
        // Use simpler case without unary in expression context
        let result = analyze_code("x > 0 ? 'positive' : 'not positive'");
        assert!(matches!(result, AstAnalysisResult::Native(_)));
    }

    #[test]
    fn test_function_requires_js() {
        let result = analyze_code("function() { return 1; }");
        assert!(matches!(result, AstAnalysisResult::RequiresJs { .. }));
    }
}
