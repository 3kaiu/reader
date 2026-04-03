//! NexusLite 核心模块
//!
//! 这是简化后的核心模块，整合了业务主线和必要的抽象。
//! 新代码应该优先使用这个模块的接口。

pub mod cache;
pub mod config;
pub mod errors;
pub mod event_bus;
pub mod interfaces;
pub mod types;

// 重新导出主要接口
pub use cache::*;
pub use config::*;
pub use errors::*;
pub use event_bus::*;
pub use interfaces::*;
pub use types::*;
