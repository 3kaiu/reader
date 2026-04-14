//! NexusLite Engine - 爬虫引擎模块
//!
//! 高性能书籍源引擎，支持NXS格式：
//! - 编译选择器带回退语法 (|)
//! - 通过cf-bypass-service绕过CF
//! - URL解析和查询编码
//! - 带缓存正则的内容处理
//! - 熔断器可靠性保证
//! - 域名感知连接池
//! - 高级内容清洗（零宽字符、去重、字体解密）
#![cfg_attr(test, allow(dead_code))]

// ===== 基础设施层 (Infrastructure Layer) =====
// 外部接口实现
pub mod anti_crawl;
pub mod circuit_breaker;
pub mod content;
mod content_extract;
mod content_fetch;
mod content_pipeline;
mod domain_pool;
mod dynamic_noise;
pub mod extraction_metrics;
pub mod fetcher;
#[cfg(test)]
mod incremental_parser;
#[cfg(test)]
mod kuchiki_wrapper;
#[cfg(test)]
pub mod library_integration_test;
#[cfg(test)]
mod lol_html_parser;
mod ml_scorer;
pub mod nxs_engine;
mod nxs_ops;
mod nxs_parser;
mod purifier;
pub mod quality_gate;
mod readability_wrapper;
mod selector_cache;
pub mod skill_telemetry;
pub mod skills;
mod uri;
mod visual_features;

// ===== 内容清洗模块 (Content Cleaning) =====
mod font_decryptor;
mod text_cleaner;
mod text_dedup;

// Public exports - 保持向后兼容
pub use anti_crawl::{CfBypassStrategy, CloudScraperStrategy, DirectHttpStrategy, FallbackChain};
pub use circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState};
pub use domain_pool::{DomainPooledClient, PoolStats};
pub use nxs_engine::NxsEngine;
pub use selector_cache::FallbackSelector;

// 内容清洗导出
pub use font_decryptor::{CharMapping, FontDecryptError, FontDecryptor};
pub use text_cleaner::{
    clean_text, remove_zero_width_chars, CleanConfig as TextCleanConfig, TextCleaner,
};
pub use text_dedup::{deduplicate_paragraphs, similarity, DedupConfig, TextDeduplicator};

#[cfg(test)]
mod tests_69shuba_offline;
