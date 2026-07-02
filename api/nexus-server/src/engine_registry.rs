use dashmap::DashMap;
use nexus_core::{BookEngine, BookEngineRuntime};
use nexus_engine::anti_crawl::FallbackChain;
use nexus_engine::legado::LegadoEngine;
use nexus_engine::NxsEngine;
use nexus_storage::{LegadoSourceStore, SourceStore};
use std::sync::Arc;
use tracing::{info, warn};

/// Registry for caching compiled engine instances of different types.
///
/// Supports both NXS (native) and Legado (community) book source formats.
/// Both engine types implement the `BookEngine` and `BookEngineRuntime` traits,
/// so callers can use the trait-object accessors without knowing the engine type.
pub struct EngineRegistry {
    source_store: Arc<SourceStore>,
    legado_store: Arc<LegadoSourceStore>,
    nxs_cache: DashMap<String, Arc<NxsEngine>>,
    legado_cache: DashMap<String, Arc<LegadoEngine>>,
    anti_crawl: Arc<FallbackChain>,
}

impl EngineRegistry {
    pub fn new(
        source_store: Arc<SourceStore>,
        legado_store: Arc<LegadoSourceStore>,
        anti_crawl: Arc<FallbackChain>,
    ) -> Self {
        Self {
            source_store,
            legado_store,
            nxs_cache: DashMap::new(),
            legado_cache: DashMap::new(),
            anti_crawl,
        }
    }

    /// Get a compiled NXS engine for the given source ID.
    /// Returns None if the source does not exist.
    pub fn get_engine(&self, source_id: &str) -> Option<Arc<NxsEngine>> {
        // 1. Check cache
        if let Some(engine) = self.nxs_cache.get(source_id) {
            return Some(engine.clone());
        }

        // 2. Load from NXS store
        let source = self.source_store.get(source_id)?;

        // 3. Compile
        match NxsEngine::new(source, self.anti_crawl.clone()) {
            Ok(engine) => {
                let engine_arc: Arc<NxsEngine> = Arc::new(engine);
                self.nxs_cache
                    .insert(source_id.to_string(), engine_arc.clone());
                info!("Cached NXS engine for source: {}", source_id);
                Some(engine_arc)
            }
            Err(e) => {
                warn!("Failed to compile NXS engine for source {}: {}", source_id, e);
                None
            }
        }
    }

    /// Get a compiled Legado engine for the given source ID.
    pub fn get_legado_engine(&self, source_id: &str) -> Option<Arc<LegadoEngine>> {
        // 1. Check cache
        if let Some(engine) = self.legado_cache.get(source_id) {
            return Some(engine.clone());
        }

        // 2. Load from Legado store
        let source = self.legado_store.get(source_id)?;

        // 3. Compile
        match LegadoEngine::new(source, self.anti_crawl.clone()) {
            Ok(engine) => {
                let engine_arc: Arc<LegadoEngine> = Arc::new(engine);
                self.legado_cache
                    .insert(source_id.to_string(), engine_arc.clone());
                info!("Cached Legado engine for source: {}", source_id);
                Some(engine_arc)
            }
            Err(e) => {
                warn!(
                    "Failed to compile Legado engine for source {}: {}",
                    source_id, e
                );
                None
            }
        }
    }

    /// Get a book-engine trait object — resolves the correct engine type automatically.
    /// Tries NXS first, then Legado.
    pub fn get_book_engine(&self, source_id: &str) -> Option<Arc<dyn BookEngine>> {
        // Check NXS cache/store first
        if self.source_store.get(source_id).is_some() || self.nxs_cache.contains_key(source_id) {
            self.get_engine(source_id)
                .map(|e| -> Arc<dyn BookEngine> { e })
        } else if self.legado_store.get(source_id).is_some()
            || self.legado_cache.contains_key(source_id)
        {
            self.get_legado_engine(source_id)
                .map(|e| -> Arc<dyn BookEngine> { e })
        } else {
            None
        }
    }

    /// Get a runtime-capable engine trait object for diagnostics/content pipelines.
    pub fn get_runtime_engine(&self, source_id: &str) -> Option<Arc<dyn BookEngineRuntime>> {
        if self.source_store.get(source_id).is_some() || self.nxs_cache.contains_key(source_id) {
            self.get_engine(source_id)
                .map(|e| -> Arc<dyn BookEngineRuntime> { e })
        } else if self.legado_store.get(source_id).is_some()
            || self.legado_cache.contains_key(source_id)
        {
            self.get_legado_engine(source_id)
                .map(|e| -> Arc<dyn BookEngineRuntime> { e })
        } else {
            None
        }
    }

    /// Invalidate cache for a specific source
    pub fn invalidate(&self, source_id: &str) {
        let mut removed = false;
        if self.nxs_cache.remove(source_id).is_some() {
            removed = true;
        }
        if self.legado_cache.remove(source_id).is_some() {
            removed = true;
        }
        if removed {
            info!("Invalidated engine cache for: {}", source_id);
        }
    }

    /// Access the underlying NXS source store
    pub fn source_store(&self) -> &Arc<SourceStore> {
        &self.source_store
    }

    /// Access the underlying Legado source store
    pub fn legado_store(&self) -> &Arc<LegadoSourceStore> {
        &self.legado_store
    }

    /// Get the number of available sources (both stores)
    pub fn source_count(&self) -> usize {
        self.source_store.count() + self.legado_store.count()
    }
}