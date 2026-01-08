//! NexusLite Storage Layer
//!
//! This crate provides storage implementations:
//! - sled-based persistent storage for all app data
//! - Two-level chapter cache (memory + disk)
//! - JSON-based source configuration store

pub mod cache;
pub mod sled_store;
pub mod source_store;

pub use cache::ChapterCache;
pub use sled_store::SledStore;
pub use source_store::SourceStore;

use nexus_core::{EngineConfig, EngineError};
use tracing::info;

/// Initialize storage directories
pub async fn init_storage(config: &EngineConfig) -> Result<(), EngineError> {
    // Create directories
    let dirs = [
        &config.storage.data_dir,
        &config.storage.sources_dir,
        &config.storage.cache_dir,
    ];

    for dir in dirs {
        if !dir.exists() {
            tokio::fs::create_dir_all(dir)
                .await
                .map_err(|e| EngineError::FileIo(e.to_string()))?;
            info!("Created directory: {:?}", dir);
        }
    }

    // sled database directory (db_path is now used as sled directory)
    let sled_path = &config.storage.db_path;
    if let Some(parent) = sled_path.parent() {
        if !parent.exists() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| EngineError::FileIo(e.to_string()))?;
        }
    }

    info!("Storage initialized. sled path: {:?}", sled_path);
    Ok(())
}

