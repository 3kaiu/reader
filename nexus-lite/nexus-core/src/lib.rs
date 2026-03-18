// ===== Compiler Warning Suppression =====
// Note: Some warnings are suppressed for intentional reasons:
// - dead_code: Public API items not yet used by other crates
// - unused_variables: Variables reserved for future use
// - unused_imports: Imports for public API exports
// - unused_mut: Mutable variables for future features
// - ambiguous_glob_reexports: Intentional re-exports for convenience
// - static_mut_refs: Static mutable refs for singleton patterns (with proper synchronization)
// - unused_must_use: Result values intentionally ignored in certain contexts

// Temporarily suppress warnings during development
// TODO: Gradually remove these as the library stabilizes
#![allow(dead_code)]
#![allow(unused_variables)]
#![allow(unused_imports)]
#![allow(unused_mut)]
#![allow(ambiguous_glob_reexports)]
#![allow(static_mut_refs)]
#![allow(unused_must_use)]

// ===== 业务主线模块 (Lean Business Modules) =====
// 新业务优先使用这 4 个模块，避免继续扩张平台化抽象。
pub mod business_modules;

// ===== 兼容层：DDD 与平台化模块 =====
// 这些模块保留用于兼容现有调用，不再作为新增功能默认入口。
pub mod domain;

// ===== 应用层 (Application Layer) =====
// 用例和应用服务
pub mod application;

// ===== 基础设施层 (Infrastructure Layer) =====
// 外部接口和实现
pub mod infrastructure;

// ===== 展示层 (Presentation Layer) =====
// API和用户界面
pub mod presentation;

// ===== 跨切关注点 (Cross-Cutting Concerns) =====
// 日志、缓存、安全、配置等
pub mod cross_cutting;

// ===== 核心系统模块 =====
pub mod cache;                // 统一缓存系统
pub mod optimizer;            // 统一性能优化系统
pub mod algorithm_optimizer;  // 算法性能优化器
pub mod workflow_optimizer;   // 工作流程优化器

// ===== 核心业务模块 =====
// 保留的核心业务逻辑
pub mod book_engine;  // 书籍引擎
pub mod nxs;          // NXS格式处理

// ===== 基础支撑模块 =====
// 基础的支撑功能
pub mod config;       // 配置处理
pub mod error;        // 错误定义
pub mod event_bus;    // 事件总线
pub mod health_tracker;
pub mod interfaces;   // 接口定义
pub mod traits;       // 特质定义
pub mod types;        // 类型定义

// ===== 已整合移除的模块 =====
// 下列模块的功能已整合到统一系统中，不再单独维护：
// - auto_tuner → optimizer.rs
// - config_manager → infrastructure.rs
// - error_recovery → cross_cutting.rs
// - health_tracker → infrastructure.rs
// - middleware → cross_cutting.rs
// - performance_optimizer → optimizer.rs
// - plugin → infrastructure.rs
// - predictive_maintenance → optimizer.rs
// - system_integrator → infrastructure.rs
// - intelligent_monitoring → infrastructure.rs
// - ml_models → optimizer.rs
// - config_optimizer → optimizer.rs

// ===== 新架构导出 =====
pub use business_modules::*;
pub use domain::*;
pub use application::*;
pub use infrastructure::*;
pub use presentation::*;
pub use cross_cutting::*;

// ===== 核心导出 =====
pub use book_engine::*;
pub use config::*;
pub use error::EngineError;
pub use event_bus::{EventBus, SystemEvent, EngineEvent, StorageEvent, SystemControlEvent};
pub use health_tracker::*;
pub use interfaces::*;
pub use nxs::NxsSource;
pub use traits::*;
pub use types::*;
