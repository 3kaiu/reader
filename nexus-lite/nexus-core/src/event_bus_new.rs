//! Advanced Event-Driven Architecture for Nexus Components
//!
//! Provides sophisticated event system with:
//! - Typed events with metadata
//! - Event filtering and routing
//! - Asynchronous event handlers
//! - Event persistence and replay
//! - Event correlation and tracing

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock, Semaphore};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use crate::error::EngineError;

/// Event priority levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum EventPriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3,
}

/// Base event trait
#[async_trait]
pub trait Event: Send + Sync + Clone + 'static {
    fn event_type(&self) -> &'static str;
    fn priority(&self) -> EventPriority { EventPriority::Normal }
    fn metadata(&self) -> HashMap<String, serde_json::Value> { HashMap::new() }
}

/// Event envelope for metadata and tracing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEnvelope<T: Event> {
    pub id: Uuid,
    pub event: T,
    pub timestamp: DateTime<Utc>,
    pub correlation_id: Option<Uuid>,
    pub causation_id: Option<Uuid>,
    pub source: String,
    pub tags: Vec<String>,
}

/// Event handler trait
#[async_trait]
pub trait EventHandler<E: Event>: Send + Sync {
    async fn handle(&self, envelope: EventEnvelope<E>) -> Result<(), EngineError>;

    /// Get handler priority (higher numbers run first)
    fn priority(&self) -> i32 { 0 }

    /// Check if handler can handle this event
    fn can_handle(&self, event: &E) -> bool { true }

    /// Get filter predicate for event types this handler wants
    fn filter(&self) -> Box<dyn Fn(&E) -> bool + Send + Sync> {
        Box::new(|_| true)
    }
}

/// System-wide events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SystemEvent {
    Startup { version: String, config_hash: String },
    Shutdown { reason: String, graceful: bool },
    HealthCheck { component: String, healthy: bool, details: HashMap<String, serde_json::Value> },
    ConfigReload { changes: Vec<String>, triggered_by: String },
    PluginLoaded { plugin_id: String, plugin_type: String, version: String },
    PluginUnloaded { plugin_id: String, reason: String },
    Error { message: String, severity: String, component: String, stack_trace: Option<String> },
    PerformanceAlert { metric: String, value: f64, threshold: f64, component: String },
    ResourceExhausted { resource: String, current: f64, limit: f64 },
}

#[async_trait]
impl Event for SystemEvent {
    fn event_type(&self) -> &'static str {
        match self {
            SystemEvent::Startup { .. } => "system.startup",
            SystemEvent::Shutdown { .. } => "system.shutdown",
            SystemEvent::HealthCheck { .. } => "system.health_check",
            SystemEvent::ConfigReload { .. } => "system.config_reload",
            SystemEvent::PluginLoaded { .. } => "system.plugin_loaded",
            SystemEvent::PluginUnloaded { .. } => "system.plugin_unloaded",
            SystemEvent::Error { .. } => "system.error",
            SystemEvent::PerformanceAlert { .. } => "system.performance_alert",
            SystemEvent::ResourceExhausted { .. } => "system.resource_exhausted",
        }
    }

    fn priority(&self) -> EventPriority {
        match self {
            SystemEvent::Error { severity, .. } if severity == "critical" => EventPriority::Critical,
            SystemEvent::ResourceExhausted { .. } => EventPriority::Critical,
            SystemEvent::PerformanceAlert { .. } => EventPriority::High,
            SystemEvent::HealthCheck { healthy: false, .. } => EventPriority::High,
            _ => EventPriority::Normal,
        }
    }

    fn metadata(&self) -> HashMap<String, serde_json::Value> {
        match self {
            SystemEvent::Startup { version, config_hash } => {
                let mut meta = HashMap::new();
                meta.insert("version".to_string(), serde_json::json!(version));
                meta.insert("config_hash".to_string(), serde_json::json!(config_hash));
                meta
            },
            SystemEvent::HealthCheck { component, healthy, details } => {
                let mut meta = HashMap::new();
                meta.insert("component".to_string(), serde_json::json!(component));
                meta.insert("healthy".to_string(), serde_json::json!(healthy));
                meta.insert("details".to_string(), serde_json::json!(details));
                meta
            },
            _ => HashMap::new(),
        }
    }
}

/// Engine-specific events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EngineEvent {
    BookSourceAdded { source_id: String, source_type: String, capabilities: Vec<String> },
    BookSourceRemoved { source_id: String, reason: String },
    SearchStarted { query: String, source_ids: Vec<String>, user_id: Option<String> },
    SearchCompleted { query: String, result_count: usize, duration_ms: u64, source_id: String },
    SearchFailed { query: String, error: String, source_id: String },
    FetchStarted { url: String, method: String, source_id: String },
    FetchCompleted { url: String, status_code: u16, content_length: usize, duration_ms: u64, source_id: String },
    FetchFailed { url: String, error: String, retry_count: u32, source_id: String },
    CacheHit { key: String, cache_type: String, size_bytes: usize },
    CacheMiss { key: String, cache_type: String, reason: Option<String> },
    CircuitBreakerOpened { component: String, failure_rate: f64 },
    CircuitBreakerClosed { component: String },
    RateLimitExceeded { component: String, limit: usize, window_seconds: u64 },
}

#[async_trait]
impl Event for EngineEvent {
    fn event_type(&self) -> &'static str {
        match self {
            EngineEvent::BookSourceAdded { .. } => "engine.book_source_added",
            EngineEvent::BookSourceRemoved { .. } => "engine.book_source_removed",
            EngineEvent::SearchStarted { .. } => "engine.search_started",
            EngineEvent::SearchCompleted { .. } => "engine.search_completed",
            EngineEvent::SearchFailed { .. } => "engine.search_failed",
            EngineEvent::FetchStarted { .. } => "engine.fetch_started",
            EngineEvent::FetchCompleted { .. } => "engine.fetch_completed",
            EngineEvent::FetchFailed { .. } => "engine.fetch_failed",
            EngineEvent::CacheHit { .. } => "engine.cache_hit",
            EngineEvent::CacheMiss { .. } => "engine.cache_miss",
            EngineEvent::CircuitBreakerOpened { .. } => "engine.circuit_breaker_opened",
            EngineEvent::CircuitBreakerClosed { .. } => "engine.circuit_breaker_closed",
            EngineEvent::RateLimitExceeded { .. } => "engine.rate_limit_exceeded",
        }
    }

    fn priority(&self) -> EventPriority {
        match self {
            EngineEvent::CircuitBreakerOpened { .. } => EventPriority::High,
            EngineEvent::RateLimitExceeded { .. } => EventPriority::High,
            EngineEvent::FetchFailed { .. } => EventPriority::Normal,
            _ => EventPriority::Low,
        }
    }
}

/// Storage events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StorageEvent {
    DataStored { key: String, size_bytes: usize, storage_type: String, compression_ratio: Option<f64> },
    DataRetrieved { key: String, size_bytes: usize, storage_type: String, cache_hit: bool },
    DataDeleted { key: String, storage_type: String, cascade_delete: bool },
    CacheCleared { storage_type: String, cleared_entries: usize },
    StorageQuotaExceeded { storage_type: String, current_usage: u64, limit: u64 },
    BackupCompleted { storage_type: String, duration_ms: u64, size_bytes: u64 },
    BackupFailed { storage_type: String, error: String },
    MigrationStarted { from_type: String, to_type: String, total_items: usize },
    MigrationCompleted { from_type: String, to_type: String, migrated_items: usize, duration_ms: u64 },
}

#[async_trait]
impl Event for StorageEvent {
    fn event_type(&self) -> &'static str {
        match self {
            StorageEvent::DataStored { .. } => "storage.data_stored",
            StorageEvent::DataRetrieved { .. } => "storage.data_retrieved",
            StorageEvent::DataDeleted { .. } => "storage.data_deleted",
            StorageEvent::CacheCleared { .. } => "storage.cache_cleared",
            StorageEvent::StorageQuotaExceeded { .. } => "storage.quota_exceeded",
            StorageEvent::BackupCompleted { .. } => "storage.backup_completed",
            StorageEvent::BackupFailed { .. } => "storage.backup_failed",
            StorageEvent::MigrationStarted { .. } => "storage.migration_started",
            StorageEvent::MigrationCompleted { .. } => "storage.migration_completed",
        }
    }

    fn priority(&self) -> EventPriority {
        match self {
            StorageEvent::StorageQuotaExceeded { .. } => EventPriority::Critical,
            StorageEvent::BackupFailed { .. } => EventPriority::High,
            StorageEvent::MigrationStarted { .. } => EventPriority::Normal,
            _ => EventPriority::Low,
        }
    }
}

/// System control events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SystemControlEvent {
    PauseProcessing { component: Option<String>, reason: String, estimated_duration: Option<u64> },
    ResumeProcessing { component: Option<String>, reason: String },
    ThrottleRequests { component: Option<String>, rate_limit: usize, duration_seconds: Option<u64> },
    ResetMetrics { component: Option<String>, metrics: Vec<String> },
    EnableDebugMode { component: Option<String>, log_level: String },
    DisableDebugMode { component: Option<String> },
    ReloadConfiguration { component: Option<String>, config_keys: Vec<String> },
    GracefulShutdown { timeout_seconds: u64, reason: String },
    EmergencyStop { reason: String, component: Option<String> },
}

#[async_trait]
impl Event for SystemControlEvent {
    fn event_type(&self) -> &'static str {
        match self {
            SystemControlEvent::PauseProcessing { .. } => "control.pause_processing",
            SystemControlEvent::ResumeProcessing { .. } => "control.resume_processing",
            SystemControlEvent::ThrottleRequests { .. } => "control.throttle_requests",
            SystemControlEvent::ResetMetrics { .. } => "control.reset_metrics",
            SystemControlEvent::EnableDebugMode { .. } => "control.enable_debug_mode",
            SystemControlEvent::DisableDebugMode { .. } => "control.disable_debug_mode",
            SystemControlEvent::ReloadConfiguration { .. } => "control.reload_configuration",
            SystemControlEvent::GracefulShutdown { .. } => "control.graceful_shutdown",
            SystemControlEvent::EmergencyStop { .. } => "control.emergency_stop",
        }
    }

    fn priority(&self) -> EventPriority {
        match self {
            SystemControlEvent::EmergencyStop { .. } => EventPriority::Critical,
            SystemControlEvent::GracefulShutdown { .. } => EventPriority::High,
            SystemControlEvent::PauseProcessing { .. } => EventPriority::High,
            _ => EventPriority::Normal,
        }
    }
}

/// Advanced event bus with filtering, routing, and persistence
pub struct AdvancedEventBus {
    channels: HashMap<&'static str, broadcast::Sender<EventEnvelope<Box<dyn Event>>>>,
    handlers: Arc<RwLock<HashMap<&'static str, Vec<Box<dyn EventHandler<Box<dyn Event>>>>>>>,
    persistence_enabled: bool,
    event_history: Arc<RwLock<VecDeque<EventEnvelope<Box<dyn Event>>>>>,
    max_history_size: usize,
    processing_semaphore: Arc<Semaphore>,
}

impl AdvancedEventBus {
    pub fn new() -> Self {
        let mut channels = HashMap::new();

        // Initialize channels for each event type
        let event_types = [
            "system.*", "engine.*", "storage.*", "control.*"
        ];

        for event_type in event_types {
            let (tx, _) = broadcast::channel(1000);
            channels.insert(event_type, tx);
        }

        Self {
            channels,
            handlers: Arc::new(RwLock::new(HashMap::new())),
            persistence_enabled: true,
            event_history: Arc::new(RwLock::new(VecDeque::with_capacity(10000))),
            max_history_size: 10000,
            processing_semaphore: Arc::new(Semaphore::new(50)), // Max 50 concurrent event handlers
        }
    }

    /// Publish event with automatic routing
    pub async fn publish<E: Event + 'static>(&self, event: E, source: &str, correlation_id: Option<Uuid>) -> Result<(), EngineError> {
        let event_type = event.event_type();
        let envelope = EventEnvelope {
            id: Uuid::new_v4(),
            event: Box::new(event) as Box<dyn Event>,
            timestamp: Utc::now(),
            correlation_id,
            causation_id: None,
            source: source.to_string(),
            tags: vec![],
        };

        // Store in history
        if self.persistence_enabled {
            let mut history = self.event_history.write().await;
            history.push_back(envelope.clone());
            if history.len() > self.max_history_size {
                history.pop_front();
            }
        }

        // Route to appropriate channels
        for (pattern, sender) in &self.channels {
            if self.matches_pattern(event_type, pattern) {
                let _ = sender.send(envelope.clone());
            }
        }

        // Trigger async handlers
        self.trigger_handlers(envelope).await?;

        Ok(())
    }

    /// Subscribe to events by pattern
    pub fn subscribe(&self, pattern: &str) -> Result<broadcast::Receiver<EventEnvelope<Box<dyn Event>>>, EngineError> {
        self.channels.get(pattern).map(|sender| sender.subscribe())
            .ok_or_else(|| EngineError::Internal {
                message: format!("No channel found for pattern: {}", pattern)
            })
    }

    /// Register event handler
    pub async fn register_handler<E: Event + 'static, H: EventHandler<E> + 'static>(
        &self,
        event_type_pattern: &str,
        handler: H
    ) -> Result<(), EngineError> {
        let mut handlers = self.handlers.write().await;
        let handler_list = handlers.entry(event_type_pattern)
            .or_insert_with(Vec::new);

        // Wrap handler to work with Box<dyn Event>
        let wrapped_handler = Box::new(WrappedHandler {
            inner: Box::new(handler),
            _phantom: std::marker::PhantomData,
        });

        handler_list.push(wrapped_handler);
        // Sort by priority (higher priority first)
        handler_list.sort_by(|a, b| b.priority().cmp(&a.priority()));

        Ok(())
    }

    /// Get event history
    pub async fn get_history(&self, limit: Option<usize>) -> Vec<EventEnvelope<Box<dyn Event>>> {
        let history = self.event_history.read().await;
        let limit = limit.unwrap_or(history.len());
        history.iter().rev().take(limit).cloned().collect()
    }

    /// Get events by correlation ID
    pub async fn get_events_by_correlation(&self, correlation_id: Uuid) -> Vec<EventEnvelope<Box<dyn Event>>> {
        let history = self.event_history.read().await;
        history.iter()
            .filter(|envelope| envelope.correlation_id == Some(correlation_id))
            .cloned()
            .collect()
    }

    /// Enable/disable event persistence
    pub fn set_persistence(&mut self, enabled: bool) {
        self.persistence_enabled = enabled;
    }

    /// Trigger registered handlers for an event
    async fn trigger_handlers(&self, envelope: EventEnvelope<Box<dyn Event>>) -> Result<(), EngineError> {
        let handlers = self.handlers.read().await;

        for (pattern, handler_list) in &*handlers {
            if self.matches_pattern(envelope.event.event_type(), pattern) {
                for handler in handler_list {
                    // Acquire semaphore to limit concurrent handlers
                    let permit = self.processing_semaphore.acquire().await
                        .map_err(|e| EngineError::Internal {
                            message: format!("Failed to acquire handler semaphore: {}", e)
                        })?;

                    // Spawn handler task
                    let handler = handler.clone();
                    let envelope = envelope.clone();

                    tokio::spawn(async move {
                        let _permit = permit; // Hold permit for duration of handler
                        if let Err(e) = handler.handle(envelope).await {
                            tracing::error!("Event handler error: {:?}", e);
                        }
                    });
                }
            }
        }

        Ok(())
    }

    /// Check if event type matches pattern (simple glob matching)
    fn matches_pattern(&self, event_type: &str, pattern: &str) -> bool {
        if pattern.ends_with(".*") {
            let prefix = &pattern[..pattern.len() - 2];
            return event_type.starts_with(prefix);
        }
        event_type == pattern
    }
}

/// Wrapper to make handlers work with Box<dyn Event>
struct WrappedHandler<E: Event> {
    inner: Box<dyn EventHandler<E>>,
    _phantom: std::marker::PhantomData<E>,
}

#[async_trait]
impl<E: Event> EventHandler<Box<dyn Event>> for WrappedHandler<E> {
    async fn handle(&self, envelope: EventEnvelope<Box<dyn Event>>) -> Result<(), EngineError> {
        // Try to downcast the event
        // This is a simplified version - in practice you'd need better type checking
        if let Ok(typed_event) = envelope.event.as_ref().downcast_ref::<E>() {
            let typed_envelope = EventEnvelope {
                id: envelope.id,
                event: typed_event.clone(),
                timestamp: envelope.timestamp,
                correlation_id: envelope.correlation_id,
                causation_id: envelope.causation_id,
                source: envelope.source.clone(),
                tags: envelope.tags.clone(),
            };

            self.inner.handle(typed_envelope).await
        } else {
            Ok(()) // Skip events that don't match the handler type
        }
    }

    fn priority(&self) -> i32 {
        self.inner.priority()
    }
}

// Simplified clone for the wrapper - in practice this needs proper implementation
impl Clone for Box<dyn EventHandler<Box<dyn Event>>> {
    fn clone(&self) -> Self {
        // This is a placeholder - proper cloning would require Arc or other mechanisms
        panic!("EventHandler cloning not implemented")
    }
}

impl Default for AdvancedEventBus {
    fn default() -> Self {
        Self::new()
    }
}

/// Example event handler
pub struct ExampleEventHandler;

#[async_trait]
impl EventHandler<SystemEvent> for ExampleEventHandler {
    async fn handle(&self, envelope: EventEnvelope<SystemEvent>) -> Result<(), EngineError> {
        match envelope.event {
            SystemEvent::Startup { version, .. } => {
                tracing::info!("System started with version: {}", version);
            },
            SystemEvent::Error { message, severity, .. } => {
                if severity == "critical" {
                    tracing::error!("Critical error: {}", message);
                }
            },
            _ => {}
        }
        Ok(())
    }

    fn priority(&self) -> i32 {
        10 // High priority
    }
}

/// Example usage
pub async fn setup_event_system() -> Result<(), EngineError> {
    let event_bus = AdvancedEventBus::new();

    // Register handler
    event_bus.register_handler("system.*", ExampleEventHandler).await?;

    // Publish event
    event_bus.publish(
        SystemEvent::Startup {
            version: "1.0.0".to_string(),
            config_hash: "abc123".to_string()
        },
        "system",
        None
    ).await?;

    Ok(())
}