use crate::engine_registry::EngineRegistry;
use futures::{stream, StreamExt};
use nexus_core::{BookItem, EngineError, HealthFailureKind, HealthTracker};
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
    max_concurrent_searches: usize,
}

impl SearchOrchestrator {
    fn classify_failure(error: &EngineError) -> HealthFailureKind {
        match error {
            EngineError::Timeout => HealthFailureKind::Timeout,
            EngineError::Network { .. }
            | EngineError::DnsError { .. }
            | EngineError::ConnectionRefused { .. }
            | EngineError::TlsHandshakeFailed { .. }
            | EngineError::RateLimited { .. }
            | EngineError::CloudflareChallenge
            | EngineError::CloudflareChallengeFailed
            | EngineError::IpBanned
            | EngineError::AllStrategiesFailed => HealthFailureKind::Network,
            EngineError::CircuitOpen { .. } => HealthFailureKind::CircuitOpen,
            EngineError::RuleMismatch { .. } => HealthFailureKind::RuleMismatch,
            EngineError::EmptyContent => HealthFailureKind::EmptyContent,
            _ => HealthFailureKind::Unknown,
        }
    }

    pub fn new(
        registry: Arc<EngineRegistry>,
        health: Arc<HealthTracker>,
        max_concurrent_searches: usize,
    ) -> Self {
        Self {
            registry,
            health,
            max_concurrent_searches: max_concurrent_searches.max(1),
        }
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
                        },
                    };

                    debug!("Starting search for source: {}", engine.id());
                    let start = Instant::now();
                    let source_id = engine.id().to_string();

                    // 45s timeout per source + one controlled retry for retryable errors/timeouts
                    let mut attempt: u8 = 0;
                    let max_attempts: u8 = 2;
                    loop {
                        attempt += 1;
                        let result = tokio::time::timeout(
                            Duration::from_secs(45),
                            engine.search(&keyword_clone),
                        )
                        .await;

                        match result {
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
                                break;
                            },
                            Ok(Err(e)) => {
                                let can_retry = e.is_retryable() && attempt < max_attempts;
                                if can_retry {
                                    let delay = e.retry_delay().unwrap_or(1);
                                    warn!(
                                        "Source {} retryable error (attempt {}/{}): {} (sleep {}s)",
                                        source_id, attempt, max_attempts, e, delay
                                    );
                                    tokio::time::sleep(Duration::from_secs(delay)).await;
                                    continue;
                                }

                                health_clone
                                    .record_failure_kind(&source_id, Self::classify_failure(&e));
                                warn!(
                                    "Source {} error (attempt {}/{}): {}",
                                    source_id, attempt, max_attempts, e
                                );
                                let _ = tx_clone
                                    .send(SearchResult::Error {
                                        source_id,
                                        error: e.to_string(),
                                    })
                                    .await;
                                break;
                            },
                            Err(_) => {
                                let can_retry = attempt < max_attempts;
                                if can_retry {
                                    warn!(
                                        "Source {} timeout (attempt {}/{}), retrying after 1s",
                                        source_id, attempt, max_attempts
                                    );
                                    tokio::time::sleep(Duration::from_secs(1)).await;
                                    continue;
                                }

                                health_clone
                                    .record_failure_kind(&source_id, HealthFailureKind::Timeout);
                                warn!(
                                    "Source {} timeout (attempt {}/{}), giving up",
                                    source_id, attempt, max_attempts
                                );
                                let _ = tx_clone
                                    .send(SearchResult::Error {
                                        source_id,
                                        error: "Timeout".to_string(),
                                    })
                                    .await;
                                break;
                            },
                        }
                    } // retry loop
                }
            }));

            // Process stream with limited concurrency
            // Only configured max concurrent futures run at a time
            search_stream
                .buffer_unordered(orchestrator.max_concurrent_searches)
                .collect::<Vec<_>>()
                .await;

            let _ = tx.send(SearchResult::Done).await;
        });

        rx
    }
}
