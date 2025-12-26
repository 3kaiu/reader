// New engine modules (rquickjs-based)
pub mod book_source;
pub mod config;
pub mod cookie;
pub mod http_client;
pub mod js_executor;
pub mod login;
pub mod parsers;
pub mod query_ttf;
pub mod rule_analyzer;
pub mod utils;
pub mod webview;

// New Rust-native architecture modules
pub mod crypto;
pub mod error;
pub mod js_analyzer;
pub mod native_api;
pub mod native_api_registry;
pub mod native_executor;
pub mod native_file;
pub mod native_http;
pub mod preprocessor;
pub mod source_transformer;
pub mod template;

// Java API transpilation modules
pub mod java_api_mapping;
pub mod source_rewriter;
pub mod stats;

// AST-based JavaScript analysis (Oxc)
pub mod ast;

// Modular native implementations
pub mod native;

// Modular JS registration
pub mod js;

// Execution framework (Refactored)
pub mod execution;

// Unified analysis framework (Phase 2)
pub mod analysis;

// Benchmark tests
#[cfg(test)]
mod benchmarks;
