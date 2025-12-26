//! Core types for AST-based JavaScript analysis
//!
//! Defines the data structures used throughout the AST analysis pipeline.

use crate::engine::preprocessor::NativeApi;
use serde::{Deserialize, Serialize};

/// Result of AST analysis
#[derive(Debug, Clone)]
pub enum AstAnalysisResult {
    /// Can be executed entirely in Rust
    Native(NativeExecutionPlan),

    /// Chain of native operations
    NativeChain(Vec<NativeExecutionPlan>),

    /// Partially native execution with some JS parts
    Partial {
        native_parts: Vec<NativeExecutionPlan>,
        js_parts: Vec<JsFragment>,
    },

    /// Must use JS execution
    RequiresJs {
        code: String,
        reason: JsRequiredReason,
    },
}

/// A fragment of JavaScript that needs JS engine execution
#[derive(Debug, Clone)]
pub struct JsFragment {
    pub code: String,
    pub output_var: Option<String>,
}

/// Reason why JavaScript engine is required
#[derive(Debug, Clone, PartialEq)]
pub enum JsRequiredReason {
    /// Uses an unsupported API
    UnsupportedApi(String),
    /// Contains control flow statements
    ControlFlow(ControlFlowKind),
    /// Contains dynamic property access
    DynamicPropertyAccess,
    /// Contains function definition
    FunctionDefinition,
    /// Contains complex conditional logic
    ComplexConditional,
    /// Contains unsupported expression type
    UnsupportedExpression,
    /// Parse error
    ParseError(String),
}

/// Control flow statement types
#[derive(Debug, Clone, PartialEq)]
pub enum ControlFlowKind {
    If,
    For,
    While,
    Switch,
    TryCatch,
    Return,
}

/// Native execution plan - a sequence of operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeExecutionPlan {
    /// Sequence of operations to execute
    pub operations: Vec<Operation>,
    /// How to bind input (result, content, etc.)
    pub input_binding: InputBinding,
    /// Expected output type
    pub output_type: ValueType,
}

impl NativeExecutionPlan {
    /// Create a plan with a single literal value
    pub fn literal(value: Operand) -> Self {
        Self {
            operations: vec![Operation::Literal(value)],
            input_binding: InputBinding::None,
            output_type: ValueType::String,
        }
    }

    /// Create a plan with a single API call
    pub fn api_call(api: NativeApi, args: Vec<Operand>) -> Self {
        Self {
            operations: vec![Operation::ApiCall { api, args }],
            input_binding: InputBinding::None,
            output_type: ValueType::String,
        }
    }

    /// Create a plan with a method call on an object
    pub fn method_call(object: Operand, method: String, args: Vec<Operand>) -> Self {
        Self {
            operations: vec![Operation::MethodCall {
                object: Box::new(object),
                method,
                args,
            }],
            input_binding: InputBinding::None,
            output_type: ValueType::String,
        }
    }
}

/// A single operation in the execution plan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Operation {
    /// A literal value
    Literal(Operand),

    /// API call: java.xxx(args)
    ApiCall { api: NativeApi, args: Vec<Operand> },

    /// Property access: obj.prop or obj[key]
    PropertyAccess {
        object: Box<Operand>,
        property: PropKey,
    },

    /// Method call: obj.method(args)
    MethodCall {
        object: Box<Operand>,
        method: String,
        args: Vec<Operand>,
    },

    /// Binary operation: left op right
    BinaryOp {
        left: Box<Operand>,
        op: BinaryOperator,
        right: Box<Operand>,
    },

    /// Conditional (ternary): condition ? then : else
    Conditional {
        condition: Box<Operand>,
        then_branch: Box<Operand>,
        else_branch: Box<Operand>,
    },

    /// Template literal
    TemplateLiteral { parts: Vec<TemplatePart> },
}

/// An operand (value) in an operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Operand {
    /// String literal
    StringLiteral(String),
    /// Number literal
    NumberLiteral(f64),
    /// Boolean literal
    BooleanLiteral(bool),
    /// Null
    Null,
    /// Undefined
    Undefined,
    /// Variable reference
    Variable(String),
    /// Context value (result, content, src, etc.)
    ContextValue(ContextKey),
    /// Result of previous operation in chain
    PreviousResult,
    /// Nested execution plan
    Nested(Box<NativeExecutionPlan>),
    /// Array literal
    ArrayLiteral(Vec<Operand>),
    /// Object literal
    ObjectLiteral(Vec<(String, Operand)>),
}

/// Context keys available in JavaScript rules
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ContextKey {
    /// Current result/content
    Result,
    /// Source content
    Content,
    /// Source URL
    Src,
    /// Base URL
    BaseUrl,
    /// Key variable (search keyword)
    Key,
    /// Page number
    Page,
    /// Book object
    Book,
    /// Chapter object
    Chapter,
    /// Source object
    Source,
}

impl ContextKey {
    /// Parse a string to ContextKey
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "result" => Some(Self::Result),
            "content" => Some(Self::Content),
            "src" => Some(Self::Src),
            "baseUrl" => Some(Self::BaseUrl),
            "key" => Some(Self::Key),
            "page" => Some(Self::Page),
            "book" => Some(Self::Book),
            "chapter" => Some(Self::Chapter),
            "source" => Some(Self::Source),
            _ => None,
        }
    }
}

/// Property key for property access (renamed to avoid oxc conflict)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PropKey {
    /// Static property: obj.name
    Static(String),
    /// Computed property with literal: obj["name"]
    ComputedLiteral(String),
    /// Computed property with index: obj[0]
    ComputedIndex(i64),
    /// Computed property with dynamic expression
    Dynamic(Box<Operand>),
}

/// Binary operators
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum BinaryOperator {
    // Arithmetic
    Add,
    Sub,
    Mul,
    Div,
    Mod,

    // Comparison
    Eq,
    Ne,
    StrictEq,
    StrictNe,
    Lt,
    Le,
    Gt,
    Ge,

    // Logical
    And,
    Or,

    // String
    Concat,
}

/// Template literal parts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TemplatePart {
    /// Static string part
    Static(String),
    /// Expression part
    Expression(Box<Operand>),
}

/// Input binding specification
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum InputBinding {
    /// No input binding
    #[default]
    None,
    /// Bind to 'result' variable
    Result,
    /// Bind to 'content' variable
    Content,
    /// Bind to specific variable name
    Variable(String),
}

/// Value types for type tracking
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub enum ValueType {
    #[default]
    String,
    Number,
    Boolean,
    Array,
    Object,
    Null,
    Unknown,
}
