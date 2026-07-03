//! Nexus Engine - 爬虫引擎模块
//!
//! 高性能书籍源引擎，支持NXS格式：
//! - 编译选择器带回退语法 (|)
//! - 通过 bypass 服务绕过 CF
//! - URL解析和查询编码
//! - 带缓存正则的内容处理
//! - 熔断器可靠性保证
//! - 高级内容清洗（零宽字符、去重、字体解密）
//! - 原生 Legado 书源引擎
#![cfg_attr(test, allow(dead_code))]

// ===== 基础设施层 (Infrastructure Layer) =====
// 外部接口实现
pub mod anti_crawl;
mod circuit_breaker;
pub mod content;
mod content_extract;
mod content_fetch;
mod content_pipeline;
mod dynamic_noise;
pub mod extraction_metrics;
pub mod fetcher;
mod image_processing;
#[cfg(test)]
mod incremental_parser;
#[cfg(test)]
mod kuchiki_wrapper;
#[cfg(test)]
pub mod library_integration_test;
#[cfg(test)]
mod lol_html_parser;
pub mod legado;
mod ml_scorer;
pub mod nxs_engine;
mod nxs_ops;
mod nxs_parser;
mod purifier;
pub mod quality_gate;
mod readability_wrapper;
mod selector_cache;
mod skill_telemetry;
mod skills;
mod uri;
mod visual_features;

// ===== 内容清洗模块 (Content Cleaning) =====
mod font_decryptor;
mod text_cleaner;
mod text_dedup;

// Public exports
pub use anti_crawl::{CfBypassStrategy, DirectHttpStrategy, FallbackChain};
pub use legado::LegadoEngine;
pub use nxs_engine::NxsEngine;

#[cfg(test)]
mod tests_69shuba_offline;
