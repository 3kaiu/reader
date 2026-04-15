use dashmap::DashMap;
use nexus_core::{BookEngine, BookEngineRuntime};
use nexus_engine::anti_crawl::FallbackChain;
use nexus_engine::NxsEngine;
use nexus_storage::SourceStore;
use std::sync::Arc;
use tracing::{info, warn};

/// Registry for caching compiled NxsEngine instances
pub struct EngineRegistry {
    source_store: Arc<SourceStore>,
    cache: DashMap<String, Arc<NxsEngine>>,
    anti_crawl: Arc<FallbackChain>,
}

impl EngineRegistry {
    pub fn new(source_store: Arc<SourceStore>, anti_crawl: Arc<FallbackChain>) -> Self {
        Self {
            source_store,
            cache: DashMap::new(),
            anti_crawl,
        }
    }

    /// Get a compiled engine for the given source ID.
    /// Returns None if the source does not exist.
    /// Compiles and caches on first use.
    pub fn get_engine(&self, source_id: &str) -> Option<Arc<NxsEngine>> {
        // 1. Check cache
        if let Some(engine) = self.cache.get(source_id) {
            return Some(engine.clone());
        }

        // 2. Load from store
        let source = self.source_store.get(source_id)?;

        // 3. Compile
        match NxsEngine::new(source, self.anti_crawl.clone()) {
            Ok(engine) => {
                let engine = Arc::new(engine);
                self.cache.insert(source_id.to_string(), engine.clone());
                info!("Cached engine for source: {}", source_id);
                Some(engine)
            },
            Err(e) => {
                warn!("Failed to compile engine for source {}: {}", source_id, e);
                None
            },
        }
    }

    /// Get a book-engine trait object for callers that should not depend on NXS internals.
    pub fn get_book_engine(&self, source_id: &str) -> Option<Arc<dyn BookEngine>> {
        self.get_engine(source_id)
            .map(|engine| -> Arc<dyn BookEngine> { engine })
    }

    /// Get a runtime-capable engine trait object for diagnostics/content pipelines.
    pub fn get_runtime_engine(&self, source_id: &str) -> Option<Arc<dyn BookEngineRuntime>> {
        self.get_engine(source_id)
            .map(|engine| -> Arc<dyn BookEngineRuntime> { engine })
    }

    /// Invalidate cache for a specific source
    pub fn invalidate(&self, source_id: &str) {
        if self.cache.remove(source_id).is_some() {
            info!("Invalidated engine cache for: {}", source_id);
        }
    }

    /// Access the underlying source store
    pub fn source_store(&self) -> &Arc<SourceStore> {
        &self.source_store
    }

    /// Get the number of available sources
    pub fn source_count(&self) -> usize {
        self.source_store.count()
    }
}
