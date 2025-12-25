// New engine modules (rquickjs-based)
pub mod parsers;
pub mod js_executor;
pub mod rule_analyzer;
pub mod http_client;
pub mod book_source;
pub mod utils;
pub mod cookie;
pub mod query_ttf;
pub mod login;
pub mod webview;

// New Rust-native architecture modules
pub mod preprocessor;
pub mod native_api;
pub mod template;
pub mod crypto;
