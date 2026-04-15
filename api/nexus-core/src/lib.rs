// ===== 业务主线模块 (Lean Business Modules) =====
pub mod business_modules;

// ===== 核心系统模块 =====
pub mod cache; // 统一缓存系统

// ===== 核心业务模块 =====
pub mod book_engine; // 书籍引擎
pub mod nxs; // NXS格式处理

// ===== 基础支撑模块 =====
pub mod config; // 配置处理
pub mod error; // 错误定义
pub mod event_bus; // 事件总线
pub mod health_tracker;
pub mod interfaces; // 兼容层，保留旧接口导出
pub mod legacy_interfaces; // 历史接口定义，非主架构入口
pub mod traits; // 特质定义
pub mod types; // 类型定义

// ===== 核心导出 =====
pub use book_engine::*;
pub use business_modules::parse_cache;
pub use config::*;
pub use error::EngineError;
pub use event_bus::{EngineEvent, EventBus, StorageEvent, SystemControlEvent, SystemEvent};
pub use health_tracker::*;
pub use nxs::NxsSource;
pub use traits::{AntiCrawlStrategy, Fetcher, FetcherStatistics};
pub use types::*;
