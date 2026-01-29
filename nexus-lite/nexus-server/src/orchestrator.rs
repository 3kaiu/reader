use crate::engine_registry::EngineRegistry;
use futures::{stream, StreamExt};
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

/// Maximum concurrent search tasks
const MAX_CONCURRENT_SEARCHES: usize = 10;

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
    /// Uses stream-based concurrency limiting to avoid spawning all tasks upfront
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
            // Create a stream of search futures and limit concurrency with buffer_unordered
            // This ensures only MAX_CONCURRENT_SEARCHES tasks are spawned at any time
            let search_stream = stream::iter(source_ids.into_iter().map(|id| {
                let tx_clone = tx.clone();
                let keyword_clone = keyword.clone();
                let health_clone = orchestrator.health.clone();
                let registry = orchestrator.registry.clone();

                async move {
                    // Check if client disconnected before starting
                    if tx_clone.is_closed() {
                        debug!("Client disconnected, skipping source {}", id);
                        return;
                    }

                    // Get engine from registry
                    let engine = match registry.get_engine(&id) {
                        Some(e) => e,
                        None => {
                            let _ = tx_clone
                                .send(SearchResult::Error {
                                    source_id: id.clone(),
                                    error: "Source not found".to_string(),
                                })
                                .await;
                            return;
                        }
                    };

                    debug!("Starting search for source: {}", engine.id());
                    let start = Instant::now();
                    let source_id = engine.id().to_string();

                    // 45s timeout per source
                    match tokio::time::timeout(
                        Duration::from_secs(45),
                        engine.search(&keyword_clone),
                    )
                    .await
                    {
                        Ok(Ok(items)) => {
                            let latency = start.elapsed();
                            health_clone.record_success(&source_id, latency);
                            debug!(
                                "Source {} found {} items in {:?}",
                                source_id,
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
                            warn!("Source {} error: {}", source_id, e);
                            let _ = tx_clone
                                .send(SearchResult::Error {
                                    source_id,
                                    error: e.to_string(),
                                })
                                .await;
                        }
                        Err(_) => {
                            health_clone.record_failure(&source_id);
                            warn!("Source {} timeout", source_id);
                            let _ = tx_clone
                                .send(SearchResult::Error {
                                    source_id,
                                    error: "Timeout".to_string(),
                                })
                                .await;
                        }
                    }
                }
            }));

            // Process stream with limited concurrency
            // Only MAX_CONCURRENT_SEARCHES futures run at a time
            search_stream
                .buffer_unordered(MAX_CONCURRENT_SEARCHES)
                .collect::<Vec<_>>()
                .await;

            let _ = tx.send(SearchResult::Done).await;
        });

        rx
    }
}
