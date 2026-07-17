//! # nexus-ai
//!
//! AI decoding engine for Nexus Reader.
//!
//! Provides alias/entity resolution, context-aware inference bridging,
//! and knowledge base management for in-line text decoding in web novels.

pub mod client;
pub mod config;
pub mod context;
pub mod error;
pub mod knowledge;

pub use config::AiConfig;
pub use error::AiError;
