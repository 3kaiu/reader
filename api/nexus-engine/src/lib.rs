//! Nexus Engine — book source engine (Legado + translator).
//!
//! Core infrastructure: anti_crawl, fetcher, circuit_breaker
//! Shared utilities: selector_cache, uri, text_cleaner
//! Legado rule parser: legado/
//! Source translator: translator/ (Legado JSON → ES6+ JS)
//! JS runner: script/ (Node.js process pool)
#![cfg_attr(test, allow(dead_code))]

// ===== Infrastructure =====
pub mod anti_crawl;
mod circuit_breaker;
pub mod content;
pub mod extraction_metrics;
pub mod fetcher;
pub mod html_doc_cache;

// ===== Shared utilities =====
pub mod quality_gate;
mod selector_cache;
mod text_cleaner;
mod uri;

// ===== Legado engine (rule parser) =====
pub mod legado;

// ===== New translator & runner =====
pub mod script;
pub mod translator;

// Public exports
pub use anti_crawl::{CfBypassStrategy, DirectHttpStrategy, FallbackChain};
pub use extraction_metrics::{
    configure_max_tracked_sources, record_empty_content_failure, record_low_quality_failure,
    record_quality_score, record_rule_mismatch_failure, record_success,
    record_validation_failure, reset_source, restore_from_snapshot, snapshot,
    snapshot_persisted, stats_for, summary, ExtractionSummary, SourceExtractionStats,
};
pub use quality_gate::{evaluate_content_quality, passes_quality_gate};
pub use legado::LegadoEngine;