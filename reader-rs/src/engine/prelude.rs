//! Engine Prelude - Convenient re-exports for common types
//!
//! Import everything commonly needed with:
//! ```rust
//! use crate::engine::prelude::*;
//! ```

// Configuration
pub use super::config::EngineConfig;

// Error types
pub use super::error::{EngineError, EngineResult};

// Analysis
pub use super::analysis::UnifiedJsAnalyzer;

// Native API
pub use super::native::HandlerRegistry;
pub use super::native_api::{ExecutionContext, NativeApiProvider};

// Parsers
pub use super::parsers::{Parser, ParserFactory, RuleType};

// Core types
pub use super::book_source::{
    BookItem, BookSource, BookSourceEngine, Chapter, ContentRule, SearchRule, TocRule,
};
