//! Native API Modules - Specialized implementations for native Rust execution
//!
//! This module provides modular implementations of java.* APIs:
//! - encoding: Base64, Hex, URI encoding
//! - storage: Cache, KvStore operations
//! - string_ops: String manipulation
//! - time: Time formatting
//! - misc: UUID, logging
//! - api_handler: Trait-based API dispatch

pub mod api_handler;
pub mod encoding;
pub mod misc;
pub mod storage;
pub mod string_ops;
pub mod time;

// Re-export handlers for convenience
pub use api_handler::{
    ApiHandler, EncodingHandler, HandlerRegistry, HashHandler, JsonHandler, MiscHandler,
    StringOpsHandler, TimeHandler,
};
