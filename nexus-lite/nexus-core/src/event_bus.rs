//! Event bus for Nexus system-wide messaging
//!
//! Uses tokio::sync::broadcast to dispatch events to subscribers.

use serde::{Deserialize, Serialize};

use tokio::sync::broadcast;

/// Unified system event type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum SystemEvent {
    /// Engine-related events (search, fetch, etc.)
    Engine(EngineEvent),
    /// Storage-related events (cache hit/miss, etc.)
    Storage(StorageEvent),
    /// System-level events (startup, shutdown, config change)
    System(SystemControlEvent),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EngineEvent {
    SearchStarted { query: String },
    SearchCompleted { query: String, count: usize },
    ChapterFetched { url: String, cached: bool },
    Error { source: String, error: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StorageEvent {
    CacheHit { key: String },
    CacheMiss { key: String },
    CleanupStarted,
    CleanupFinished { removed: usize },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SystemControlEvent {
    Startup,
    Shutdown,
    ConfigReloaded,
}

/// Broadcast-based Event Bus
#[derive(Debug, Clone)]
pub struct EventBus {
    sender: broadcast::Sender<SystemEvent>,
}

impl EventBus {
    /// Create a new Event Bus with specified capacity
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    /// Publish an event to all subscribers
    pub fn publish(&self, event: SystemEvent) -> usize {
        // We ignore SendError (no subscribers)
        self.sender.send(event).unwrap_or(0)
    }

    /// Subscribe to the event stream
    pub fn subscribe(&self) -> broadcast::Receiver<SystemEvent> {
        self.sender.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new(1024)
    }
}

// Global instance helper (optional, for simple usage)
// In a real app, this should be passed via AppState
