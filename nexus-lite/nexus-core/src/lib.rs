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

pub mod auto_tuner;
pub mod book_engine;
pub mod config;
pub mod config_manager;
pub mod error;
pub mod event_bus;
pub mod health_tracker;
pub mod intelligent_monitoring;
pub mod interfaces;
pub mod middleware;
pub mod ml_models;
pub mod nxs;
pub mod plugin;
pub mod predictive_maintenance;
pub mod traits;
pub mod types;

pub use auto_tuner::*;
pub use book_engine::*;
pub use config::*;
pub use config_manager::*;
pub use error::EngineError;
pub use event_bus::{EventBus, SystemEvent, EngineEvent, StorageEvent, SystemControlEvent};
pub use health_tracker::*;
pub use intelligent_monitoring::*;
pub use interfaces::*;
pub use middleware::*;
pub use ml_models::*;
pub use nxs::NxsSource;
pub use plugin::*;
pub use predictive_maintenance::*;
pub use traits::*;
pub use types::*;
