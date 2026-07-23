//! Selector dispatchers for Legado rules — CSS / JS / JSONPath / Regex

pub mod css;
pub mod js;
pub mod js_rquickjs;
pub mod json;
pub mod regex;

// Re-export selector functions for convenient access
pub use css::{extract_all_css, extract_css};
pub use js::execute_js;
pub use json::{extract_all_json_path, extract_json_path};
pub use regex::{apply_regex_clean, extract_regex, replace_regex};
