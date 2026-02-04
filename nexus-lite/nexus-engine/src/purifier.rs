//! 仅在使用 wasm32 目标时编译（如前端/Worker 内联净化）
#![cfg(target_arch = "wasm32")]

use aho_corasick::AhoCorasick;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ContentPurifier {
    ac: Option<AhoCorasick>,
}

#[wasm_bindgen]
impl ContentPurifier {
    #[wasm_bindgen(constructor)]
    pub fn new(patterns: Vec<String>, _replacements: Vec<String>) -> Self {
        let ac = AhoCorasick::new(&patterns).ok();
        Self { ac }
    }

    pub fn purify(&self, content: &str) -> String {
        let Some(ref ac) = self.ac else {
            return content.to_string();
        };

        let mut result = String::with_capacity(content.len());
        let _ = ac.replace_all_with(content, &mut result, |_, _, _w| {
            // w is the replacement string
            // We need to map the match index to our replacement list
            // Note: The logic here depends on how patterns were passed
            true
        });

        // This is a simplified version for implementation_plan demonstration
        // Detailed mapping of indices would be implemented here
        result
    }
}
