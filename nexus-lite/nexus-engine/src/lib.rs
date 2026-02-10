//! NexusLite Engine - 爬虫引擎模块
//!
//! 高性能书籍源引擎，支持NXS格式：
//! - 编译选择器带回退语法 (|)
//! - 通过cf-bypass-service绕过CF
//! - URL解析和查询编码
//! - 带缓存正则的内容处理
//! - 熔断器可靠性保证
//! - 域名感知连接池

#![allow(dead_code)]
#![allow(unused_variables)]
#![allow(unused_imports)]

// ===== 领域层 (Domain Layer) =====
// 引擎核心业务逻辑
pub mod domain;

// ===== 基础设施层 (Infrastructure Layer) =====
// 外部接口实现
pub mod anti_crawl;
pub mod circuit_breaker;
pub mod content;
pub mod domain_pool;
pub mod fetcher;
pub mod nxs_engine;
#[cfg(target_arch = "wasm32")]
pub mod purifier;
pub mod selector_cache;
pub mod uri;

// Public exports - 保持向后兼容
pub use anti_crawl::{CfBypassStrategy, FallbackChain};
pub use circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState};
pub use domain_pool::{DomainPooledClient, PoolStats};
pub use nxs_engine::NxsEngine;
pub use selector_cache::FallbackSelector;

// 新架构导出
pub use domain::*;
