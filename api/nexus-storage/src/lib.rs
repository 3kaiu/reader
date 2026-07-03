//! Nexus Storage Layer - 存储模块
//!
//! 提供存储实现：
//! - 基于sled的持久化存储
//! - 两级章节缓存（内存+磁盘）
//! - 基于JSON的源配置存储

// ===== 基础设施层 (Infrastructure Layer) =====
// 外部接口实现
pub mod cache;
pub mod cache_model;
pub mod legado_source_store;
pub mod sled_store;
pub mod source_store;

// Public exports - 保持向后兼容
pub use cache::ChapterCache;
pub use cache_model::{FetchSessionProfile, RawHtmlCacheEntry};
pub use legado_source_store::LegadoSourceStore;
pub use sled_store::SledStore;
pub use source_store::SourceStore;

// Error type re-export — removed. Downstream should use `nexus_core::EngineError` directly.
// pub use nexus_core::EngineError;

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
                .map_err(|e| EngineError::FileIo {
                    message: e.to_string(),
                })?;
            info!("Created directory: {:?}", dir);
        }
    }

    // sled database directory (db_path is now used as sled directory)
    let sled_path = &config.storage.db_path;
    if let Some(parent) = sled_path.parent() {
        if !parent.exists() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| EngineError::FileIo {
                    message: e.to_string(),
                })?;
        }
    }

    info!("Storage initialized. sled path: {:?}", sled_path);
    Ok(())
}
