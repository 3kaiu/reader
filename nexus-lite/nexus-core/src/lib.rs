//! NexusLite Core Library
//!
//! This crate provides the foundational types for the NexusLite book source engine:
//! - Core traits for extensibility
//! - Unified error types
//! - Data models (BookItem, Chapter, etc.)
//! - NXS source format
//! - Configuration structures
//! - Source health tracking
//! - BookEngine trait abstraction

pub mod book_engine;
pub mod config;
pub mod error;
pub mod event_bus;
pub mod health_tracker;
pub mod nxs;
pub mod traits;
pub mod types;

pub use book_engine::*;
pub use config::*;
pub use error::EngineError;
pub use event_bus::{EventBus, SystemEvent, EngineEvent, StorageEvent, SystemControlEvent};
pub use health_tracker::*;
pub use nxs::NxsSource;
pub use traits::*;
pub use types::*;

