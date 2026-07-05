//! Legado JSON → ES6+ JS translator.
//!
//! Converts Legado book source rules at import time into
//! modern JavaScript functions that run directly on Bun/Node.js,
//! eliminating the need for a runtime compatibility layer.

pub mod audit;
pub mod css;
pub mod js_block;
pub mod rules;
pub mod template;