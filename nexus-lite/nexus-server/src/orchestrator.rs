use crate::engine_registry::EngineRegistry;
use nexus_core::{BookItem, HealthTracker};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tracing::{debug, warn};

/// Search result stream item
#[derive(Debug, Clone)]
pub enum SearchResult {
    /// Found a book
    Item(BookItem),
    /// Error occurred for a specific source
    Error { source_id: String, error: String },
    /// All tasks completed
    Done,
}

/// Orchestrator for handling concurrent searches across multiple sources
#[derive(Clone)]
pub struct SearchOrchestrator {
    registry: Arc<EngineRegistry>,
    health: Arc<HealthTracker>,
}

impl SearchOrchestrator {
    pub fn new(registry: Arc<EngineRegistry>, health: Arc<HealthTracker>) -> Self {
        Self { registry, health }
    }

    /// Get health tracker reference
    pub fn health_tracker(&self) -> &Arc<HealthTracker> {
        &self.health
    }

    /// Perform a concurrent search across specified sources
    /// Sources are sorted by health score (best first)
    pub fn search(
        &self,
        mut source_ids: Vec<String>,
        keyword: String,
    ) -> mpsc::Receiver<SearchResult> {
        // Sort sources by health score (best first)
        self.health.sort_by_health(&mut source_ids);
        debug!("Searching {} sources (sorted by health)", source_ids.len());

        let (tx, rx) = mpsc::channel(100);
        let orchestrator = self.clone();

        tokio::spawn(async move {
            let mut handles = Vec::new();

            for id in source_ids {
                // Get cached engine from registry
                if let Some(engine) = orchestrator.registry.get_engine(&id) {
                    let tx_clone = tx.clone();
                    let keyword_clone = keyword.clone();
                    let health_clone = orchestrator.health.clone();
                    let source_id = id.clone();

                    let handle = tokio::spawn(async move {
                        debug!("Starting search for source: {}", engine.id());
                        let start = Instant::now();

                        // 120s timeout per source to allow for L6 slow bypass
                        match tokio::time::timeout(
                            Duration::from_secs(120),
                            engine.search(&keyword_clone),
                        )
                        .await
                        {
                            Ok(Ok(items)) => {
                                let latency = start.elapsed();
                                health_clone.record_success(&source_id, latency);
                                debug!(
                                    "Source {} found {} items in {:?}",
                                    engine.id(),
                                    items.len(),
                                    latency
                                );
                                for item in items {
                                    if tx_clone.send(SearchResult::Item(item)).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            Ok(Err(e)) => {
                                health_clone.record_failure(&source_id);
                                warn!("Source {} error: {}", engine.id(), e);
                                let _ = tx_clone
                                    .send(SearchResult::Error {
                                        source_id: engine.id().to_string(),
                                        error: e.to_string(),
                                    })
                                    .await;
                            }
                            Err(_) => {
                                health_clone.record_failure(&source_id);
                                warn!("Source {} timeout", engine.id());
                                let _ = tx_clone
                                    .send(SearchResult::Error {
                                        source_id: engine.id().to_string(),
                                        error: "Timeout".to_string(),
                                    })
                                    .await;
                            }
                        }
                    });
                    handles.push(handle);
                } else {
                    let _ = tx
                        .send(SearchResult::Error {
                            source_id: id,
                            error: "Source not found".to_string(),
                        })
                        .await;
                }
            }

            // Wait for all tasks to complete
            for handle in handles {
                let _ = handle.await;
            }

            let _ = tx.send(SearchResult::Done).await;
        });

        rx
    }
}
