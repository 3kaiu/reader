use dashmap::DashMap;
#[cfg(feature = "discovery")]
use nexus_core::ExploreEngine;
use nexus_core::{BookEngine, BookEngineRuntime};
use nexus_engine::anti_crawl::FallbackChain;
use nexus_engine::legado::LegadoEngine;
use nexus_storage::{LegadoSourceStore, SourceStore};
use std::sync::Arc;
use tracing::{info, warn};

const MAX_CACHED_ENGINES: usize = 2000;

pub struct EngineRegistry {
    pub legado_store: Arc<LegadoSourceStore>,
    pub nxs_store: Arc<SourceStore>,
    legado_cache: DashMap<String, Arc<LegadoEngine>>,
    anti_crawl: Arc<FallbackChain>,
}

impl EngineRegistry {
    pub fn new(
        legado_store: Arc<LegadoSourceStore>,
        nxs_store: Arc<SourceStore>,
        anti_crawl: Arc<FallbackChain>,
    ) -> Self {
        Self {
            legado_store,
            nxs_store,
            legado_cache: DashMap::new(),
            anti_crawl,
        }
    }

    pub fn get_legado_engine(&self, source_id: &str) -> Option<Arc<LegadoEngine>> {
        if let Some(engine) = self.legado_cache.get(source_id) {
            return Some(engine.clone());
        }
        let source = self.legado_store.get(source_id)?;
        match LegadoEngine::new(source.clone(), self.anti_crawl.clone()) {
            Ok(engine) => {
                let engine_arc = Arc::new(engine);

                // Evict oldest entry if at capacity (any entry via retire)
                if self.legado_cache.len() >= MAX_CACHED_ENGINES {
                    if let Some(entry) = self.legado_cache.iter().next() {
                        let key = entry.key().clone();
                        drop(entry);
                        self.legado_cache.remove(&key);
                    }
                }

                self.legado_cache
                    .insert(source_id.to_string(), engine_arc.clone());
                info!("Cached Legado engine for: {}", source_id);
                Some(engine_arc)
            },
            Err(e) => {
                warn!("Failed to compile Legado engine for {}: {}", source_id, e);
                None
            },
        }
    }

    pub fn get_book_engine(&self, source_id: &str) -> Option<Arc<dyn BookEngine>> {
        self.get_legado_engine(source_id)
            .map(|e| e as Arc<dyn BookEngine>)
    }

    pub fn get_runtime_engine(&self, source_id: &str) -> Option<Arc<dyn BookEngineRuntime>> {
        self.get_legado_engine(source_id)
            .map(|e| e as Arc<dyn BookEngineRuntime>)
    }

    #[cfg(feature = "discovery")]
    pub fn get_explore_engine(&self, source_id: &str) -> Option<Arc<dyn ExploreEngine>> {
        self.get_legado_engine(source_id)
            .map(|e| e as Arc<dyn ExploreEngine>)
    }

    pub fn source_count(&self) -> (usize, usize) {
        (self.nxs_store.count(), self.legado_store.count())
    }

    pub fn invalidate(&self, source_id: &str) {
        self.legado_cache.remove(source_id);
        self.anti_crawl.remove_breaker(source_id);
    }
}
