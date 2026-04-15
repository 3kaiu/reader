//! Lean business-oriented module surface for Nexus.
//!
//! These modules mirror the current product focus:
//! 1) source management
//! 2) fetch / anti-crawl
//! 3) parse / cache
//! 4) reader library
//!
//! Existing DDD/optimizer/cross-cutting modules remain available for
//! compatibility, but new feature work should prefer this surface.

/// Source definitions and source-side content rules.
pub mod source_management {
    pub use crate::nxs::{
        BookRule, ContentRule, NxsSource, SearchItemFields, SearchRule, TocItemFields, TocRule,
    };
    pub use crate::types::ReplaceRule;
}

/// Fetch contracts and anti-crawl service integration primitives.
pub mod fetch_anti_crawl {
    pub use crate::config::CloudflareBypassConfig;
    pub use crate::error::EngineError;
    pub use crate::traits::{Fetcher, FetcherStatistics};
    pub use crate::types::{FetchContext, FetchResponse};
}

/// Parsing result models and cache abstractions.
pub mod parse_cache {
    pub use crate::cache::{
        get_cache_manager, init_cache_manager, CacheConfig, CacheError, CacheManager,
        CacheMetadata, CachePriority, CacheStats, PutOptions,
    };
    pub use crate::types::{Chapter, ChapterContent, TocItem};
}

/// Reader-facing library models and engine capabilities.
pub mod reader_library {
    pub use crate::book_engine::{BookEngine, EngineMetadata};
    #[cfg(feature = "discovery")]
    pub use crate::book_engine::{ExploreCategory, ExploreEngine};
    pub use crate::types::{BookGroup, BookInfo, BookItem, BookshelfItem, Chapter, ChapterContent};
    #[cfg(feature = "discovery")]
    pub use crate::types::{DiscoveryItem, DiscoveryResponse, DiscoverySection};
}
