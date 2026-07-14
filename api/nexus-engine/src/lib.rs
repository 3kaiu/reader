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
pub mod content_extract;
pub mod dynamic_noise;
pub mod extraction_metrics;
pub mod fetcher;
pub mod html_doc_cache;
pub mod scoring;
pub mod selector_cache;
pub mod text_cleaner;
mod text_dedup;
pub mod uri;
pub mod content_extract_adapters;
pub mod readability_wrapper;
pub mod quality_gate;

// ===== Legado engine (rule parser) =====
pub mod legado;

// ===== New translator & runner =====
pub mod script;
pub mod translator;

// Public exports
pub use anti_crawl::{CfBypassStrategy, DirectHttpStrategy, FallbackChain};
pub use content_extract::{extract_structured_text_from_root, ContentExtractConfig};
pub use extraction_metrics::{
    configure_max_tracked_sources, record_empty_content_failure, record_low_quality_failure,
    record_quality_score, record_rule_mismatch_failure, record_success,
    record_validation_failure, reset_source, restore_from_snapshot, snapshot,
    snapshot_persisted, stats_for, summary, ExtractionSummary, SourceExtractionStats,
};
pub use quality_gate::{evaluate_content_quality, passes_quality_gate};
pub use legado::{LegadoEngine, selector};
pub use readability_wrapper::ReadabilityExtractor;