//! Legado book source engine — Rust native implementation
//!
//! This module provides a Legado-compatible rule execution engine that can
//! directly read and execute Legado book source JSON files without conversion.
//!
//! ## Architecture
//!
//! ```text
//! Legado JSON → LegadoEngine (implements BookEngine trait)
//!   ├── rule_parser: parse rule strings → CompiledLegadoRule
//!   ├── selector/css: CSS selectors via scraper
//!   ├── selector/js: JS execution via rquickjs (sandboxed)
//!   ├── selector/json: JSONPath via serde_json_path
//!   ├── selector/regex: regex operations via regex crate
//!   ├── operator/fallback: || combine
//!   ├── operator/concat: && combine
//!   └── operator/regex_clean: ##pattern##replacement
//! ```

pub mod engine;
pub mod operator;
pub mod rule_parser;
pub mod selector;
pub use engine::LegadoEngine;
