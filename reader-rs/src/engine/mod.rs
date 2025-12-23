// Legacy modules (for transition)
pub mod analyze;
pub mod css;
pub mod jsonpath;
pub mod regex;
pub mod webbook;
pub mod js;

// New engine modules (rquickjs-based)
pub mod parsers;
pub mod js_executor;
pub mod rule_analyzer;
pub mod http_client;
pub mod book_source;

// Re-exports
pub use analyze::AnalyzeRule;
pub use css::CssParser;
pub use jsonpath::JsonPathParser;
pub use regex::RegexParser;
pub use webbook::WebBook;
pub use js::LegadoJsEngine;

// New exports
pub use js_executor::JsExecutor;
pub use parsers::RuleType;
pub use rule_analyzer::RuleAnalyzer;
pub use http_client::HttpClient;
pub use book_source::{BookSourceEngine, BookSource, BookItem, Chapter};
