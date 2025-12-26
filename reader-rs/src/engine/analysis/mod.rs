//! Analysis Module - Unified code analysis framework
//!
//! This module provides unified analysis capabilities for JavaScript code,
//! combining multiple analysis strategies for optimal performance.
//!
//! ## Components
//!
//! - `UnifiedJsAnalyzer`: Main analyzer that combines regex and AST analysis
//! - `AnalysisStats`: Statistics tracking for analysis decisions

mod unified_analyzer;

pub use unified_analyzer::{AnalysisStats, UnifiedJsAnalyzer};
