//! AST-based JavaScript Analysis Module
//!
//! This module provides accurate JavaScript code analysis using the Oxc parser.
//! It replaces the regex-based pattern matching approach with proper AST traversal,
//! enabling support for:
//! - Nested function calls: `java.base64Encode(java.md5Encode(key))`
//! - Complex method chains: `result.trim().replace(/\\s+/g, ' ')`
//! - Accurate variable tracking and type inference
//!
//! ## Architecture
//!
//! ```text
//! JavaScript Code
//!       ↓
//! ┌─────────────────┐
//! │   JsAstParser   │  ← Oxc parser wrapper
//! └────────┬────────┘
//!          ↓
//! ┌─────────────────┐
//! │ AstPatternMatcher│  ← Recognizes java.* APIs and methods
//! └────────┬────────┘
//!          ↓
//! ┌─────────────────┐
//! │ExecutionCompiler│  ← Generates native execution plan
//! └────────┬────────┘
//!          ↓
//!   NativeExecutionPlan
//! ```

mod compiler;
mod parser;
mod pattern_matcher;
mod types;

pub use compiler::ExecutionPlanCompiler;
pub use parser::JsAstParser;
