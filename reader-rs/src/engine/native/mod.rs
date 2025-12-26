//! Native API Modules - Specialized implementations for native Rust execution
//!
//! This module provides modular implementations of java.* APIs:
//! - encoding: Base64, Hex, URI encoding
//! - storage: Cache, KvStore operations
//! - string_ops: String manipulation
//! - time: Time formatting
//! - misc: UUID, logging

pub mod encoding;
pub mod misc;
pub mod storage;
pub mod string_ops;
pub mod time;
