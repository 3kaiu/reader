//! NexusLite Engine
//!
//! High-performance book source engine for NXS format:
//! - Compiled selectors with fallback (| syntax)
//! - CF bypass via cf-bypass-service
//! - URL resolution and query encoding
//! - Content processing with cached regex
//! - Circuit breaker for reliability
//! - Domain-aware connection pooling

pub mod anti_crawl;
pub mod circuit_breaker;
pub mod content;
pub mod domain_pool;
pub mod fetcher;
pub mod nxs_engine;
pub mod purifier;
pub mod selector_cache;
pub mod uri;

// Public exports
pub use anti_crawl::{CfBypassStrategy, FallbackChain};
pub use circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState};
pub use domain_pool::{DomainPooledClient, PoolStats};
pub use nxs_engine::NxsEngine;
pub use selector_cache::FallbackSelector;
