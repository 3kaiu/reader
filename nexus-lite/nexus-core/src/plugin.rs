//! Plugin Architecture for Nexus Components
//!
//! Provides a dynamic plugin system for:
//! - Book source engines
//! - Cache backends
//! - Storage providers
//! - Authentication providers
//! - Custom middleware

use async_trait::async_trait;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use libloading::{Library, Symbol};
use crate::error::{EngineError, ErrorCode};
use crate::interfaces::{BookSourceEngine, Cache, Storage, HealthMonitor, MetricsCollector};

/// Plugin metadata
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PluginMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub plugin_type: PluginType,
    pub dependencies: Vec<String>,
    pub capabilities: Vec<String>,
}

/// Plugin type enumeration
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PluginType {
    BookSource,
    Cache,
    Storage,
    Authentication,
    Middleware,
    HealthMonitor,
    Metrics,
    Custom,
}

/// Plugin state
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginState {
    Unloaded,
    Loading,
    Loaded,
    Active,
    Error,
    Disabled,
}

/// Plugin instance
pub struct PluginInstance {
    pub metadata: PluginMetadata,
    pub state: PluginState,
    pub library: Option<Arc<Library>>,
    pub instance: Option<Arc<dyn Plugin>>,
}

/// Core plugin trait
#[async_trait]
pub trait Plugin: Send + Sync {
    /// Get plugin metadata
    fn metadata(&self) -> PluginMetadata;

    /// Initialize the plugin
    async fn initialize(&mut self, config: serde_json::Value) -> Result<(), EngineError>;

    /// Start the plugin
    async fn start(&mut self) -> Result<(), EngineError>;

    /// Stop the plugin
    async fn stop(&mut self) -> Result<(), EngineError>;

    /// Get plugin health status
    fn health_status(&self) -> PluginHealthStatus;

    /// Handle plugin-specific commands
    async fn handle_command(&self, command: &str, args: serde_json::Value) -> Result<serde_json::Value, EngineError>;
}

/// Plugin health status
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PluginHealthStatus {
    pub healthy: bool,
    pub message: Option<String>,
    pub last_check: chrono::DateTime<chrono::Utc>,
    pub metrics: HashMap<String, f64>,
}

/// Plugin manager for loading and managing plugins
pub struct PluginManager {
    plugins: RwLock<HashMap<String, PluginInstance>>,
    plugin_directories: Vec<PathBuf>,
    loaded_libraries: Vec<Library>, // Keep libraries alive
}

impl PluginManager {
    pub fn new() -> Self {
        Self {
            plugins: RwLock::new(HashMap::new()),
            plugin_directories: vec![
                PathBuf::from("./plugins"),
                PathBuf::from("./nexus-lite/plugins"),
            ],
            loaded_libraries: Vec::new(),
        }
    }

    /// Add plugin search directory
    pub fn add_plugin_directory(&mut self, dir: PathBuf) {
        self.plugin_directories.push(dir);
    }

    /// Load plugin from file
    pub async fn load_plugin(&self, plugin_path: PathBuf) -> Result<String, EngineError> {
        let plugin_id = plugin_path.file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| EngineError::InvalidConfig {
                message: format!("Invalid plugin path: {}", plugin_path.display())
            })?
            .to_string();

        // Check if plugin is already loaded
        {
            let plugins = self.plugins.read().await;
            if plugins.contains_key(&plugin_id) {
                return Err(EngineError::InvalidConfig {
                    message: format!("Plugin {} already loaded", plugin_id)
                });
            }
        }

        // Load the dynamic library
        let library = unsafe {
            Library::new(plugin_path)
        }.map_err(|e| EngineError::Internal {
            message: format!("Failed to load plugin library: {}", e)
        })?;

        // Get plugin constructor function
        let constructor: Symbol<fn() -> *mut dyn Plugin> = unsafe {
            library.get(b"create_plugin")
        }.map_err(|e| EngineError::Internal {
            message: format!("Failed to find plugin constructor: {}", e)
        })?;

        // Create plugin instance
        let plugin_ptr = constructor();
        let plugin = unsafe { Box::from_raw(plugin_ptr) };
        let metadata = plugin.metadata();

        // Verify plugin ID matches
        if metadata.id != plugin_id {
            return Err(EngineError::InvalidConfig {
                message: format!("Plugin ID mismatch: expected {}, got {}", plugin_id, metadata.id)
            });
        }

        // Initialize plugin
        plugin.initialize(serde_json::Value::Null).await?;

        let instance = PluginInstance {
            metadata: metadata.clone(),
            state: PluginState::Loaded,
            library: Some(Arc::new(library)),
            instance: Some(Arc::from(plugin)),
        };

        // Store plugin instance
        {
            let mut plugins = self.plugins.write().await;
            plugins.insert(plugin_id.clone(), instance);
        }

        Ok(plugin_id)
    }

    /// Unload plugin
    pub async fn unload_plugin(&self, plugin_id: &str) -> Result<(), EngineError> {
        let mut plugins = self.plugins.write().await;
        let instance = plugins.get_mut(plugin_id)
            .ok_or_else(|| EngineError::SourceNotFound { id: plugin_id.to_string() })?;

        if let Some(plugin) = &instance.instance {
            plugin.stop().await?;
        }

        instance.state = PluginState::Unloaded;
        instance.library = None;
        instance.instance = None;

        Ok(())
    }

    /// Start plugin
    pub async fn start_plugin(&self, plugin_id: &str) -> Result<(), EngineError> {
        let mut plugins = self.plugins.write().await;
        let instance = plugins.get_mut(plugin_id)
            .ok_or_else(|| EngineError::SourceNotFound { id: plugin_id.to_string() })?;

        if let Some(plugin) = &mut instance.instance {
            plugin.start().await?;
            instance.state = PluginState::Active;
        }

        Ok(())
    }

    /// Stop plugin
    pub async fn stop_plugin(&self, plugin_id: &str) -> Result<(), EngineError> {
        let mut plugins = self.plugins.write().await;
        let instance = plugins.get_mut(plugin_id)
            .ok_or_else(|| EngineError::SourceNotFound { id: plugin_id.to_string() })?;

        if let Some(plugin) = &mut instance.instance {
            plugin.stop().await?;
            instance.state = PluginState::Loaded;
        }

        Ok(())
    }

    /// Get plugin instance
    pub async fn get_plugin<T: 'static>(&self, plugin_id: &str) -> Result<Arc<T>, EngineError> {
        let plugins = self.plugins.read().await;
        let instance = plugins.get(plugin_id)
            .ok_or_else(|| EngineError::SourceNotFound { id: plugin_id.to_string() })?;

        if instance.state != PluginState::Active {
            return Err(EngineError::Internal {
                message: format!("Plugin {} is not active", plugin_id)
            });
        }

        if let Some(plugin) = &instance.instance {
            // Try to downcast to the requested type
            // This is a simplified version - in practice you'd need more sophisticated type checking
            Ok(Arc::clone(plugin) as Arc<T>)
        } else {
            Err(EngineError::Internal {
                message: format!("Plugin {} has no instance", plugin_id)
            })
        }
    }

    /// Get all loaded plugins
    pub async fn get_loaded_plugins(&self) -> HashMap<String, PluginMetadata> {
        let plugins = self.plugins.read().await;
        plugins.iter()
            .filter(|(_, instance)| instance.state == PluginState::Active || instance.state == PluginState::Loaded)
            .map(|(id, instance)| (id.clone(), instance.metadata.clone()))
            .collect()
    }

    /// Scan and load all plugins from directories
    pub async fn scan_and_load_plugins(&self) -> Result<Vec<String>, EngineError> {
        let mut loaded_plugins = Vec::new();

        for dir in &self.plugin_directories {
            if !dir.exists() {
                continue;
            }

            let entries = std::fs::read_dir(dir)
                .map_err(|e| EngineError::FileIo {
                    message: format!("Failed to read plugin directory {}: {}", dir.display(), e)
                })?;

            for entry in entries {
                let entry = entry.map_err(|e| EngineError::FileIo {
                    message: format!("Failed to read directory entry: {}", e)
                })?;

                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("so") ||
                   path.extension().and_then(|s| s.to_str()) == Some("dylib") ||
                   path.extension().and_then(|s| s.to_str()) == Some("dll") {

                    match self.load_plugin(path).await {
                        Ok(plugin_id) => {
                            loaded_plugins.push(plugin_id);
                        }
                        Err(e) => {
                            tracing::warn!("Failed to load plugin {}: {:?}", entry.file_name().to_string_lossy(), e);
                        }
                    }
                }
            }
        }

        Ok(loaded_plugins)
    }
}

// ===== Plugin Registry =====

/// Global plugin registry
pub struct PluginRegistry {
    managers: RwLock<HashMap<PluginType, PluginManager>>,
}

impl PluginRegistry {
    pub fn new() -> Self {
        let mut managers = HashMap::new();

        // Initialize managers for each plugin type
        managers.insert(PluginType::BookSource, PluginManager::new());
        managers.insert(PluginType::Cache, PluginManager::new());
        managers.insert(PluginType::Storage, PluginManager::new());
        managers.insert(PluginType::Authentication, PluginManager::new());
        managers.insert(PluginType::Middleware, PluginManager::new());
        managers.insert(PluginType::HealthMonitor, PluginManager::new());
        managers.insert(PluginType::Metrics, PluginManager::new());
        managers.insert(PluginType::Custom, PluginManager::new());

        Self {
            managers: RwLock::new(managers),
        }
    }

    /// Get plugin manager for a specific type
    pub async fn get_manager(&self, plugin_type: PluginType) -> Arc<PluginManager> {
        let managers = self.managers.read().await;
        if let Some(manager) = managers.get(&plugin_type) {
            Arc::new(manager.clone())
        } else {
            // This shouldn't happen with our initialization
            panic!("Plugin manager not found for type {:?}", plugin_type);
        }
    }

    /// Register a plugin
    pub async fn register_plugin(&self, plugin_type: PluginType, plugin: Box<dyn Plugin>) -> Result<String, EngineError> {
        let manager = self.get_manager(plugin_type).await;
        let metadata = plugin.metadata();
        let plugin_id = metadata.id.clone();

        // For now, we'll store the plugin directly instead of loading from file
        // In a real implementation, you'd serialize and save to disk
        let instance = PluginInstance {
            metadata,
            state: PluginState::Loaded,
            library: None, // Not loaded from file
            instance: Some(Arc::from(plugin)),
        };

        {
            let mut plugins = manager.plugins.write().await;
            plugins.insert(plugin_id.clone(), instance);
        }

        Ok(plugin_id)
    }

    /// Get plugin instance
    pub async fn get_plugin<T: 'static>(&self, plugin_type: PluginType, plugin_id: &str) -> Result<Arc<T>, EngineError> {
        let manager = self.get_manager(plugin_type).await;
        manager.get_plugin(plugin_id).await
    }

    /// List all plugins of a type
    pub async fn list_plugins(&self, plugin_type: PluginType) -> HashMap<String, PluginMetadata> {
        let manager = self.get_manager(plugin_type).await;
        manager.get_loaded_plugins().await
    }
}

// ===== Built-in Plugin Implementations =====

/// Example book source plugin
pub struct ExampleBookSourcePlugin {
    metadata: PluginMetadata,
    config: serde_json::Value,
}

impl ExampleBookSourcePlugin {
    pub fn new() -> Self {
        Self {
            metadata: PluginMetadata {
                id: "example_book_source".to_string(),
                name: "Example Book Source".to_string(),
                version: "1.0.0".to_string(),
                description: "Example book source plugin for demonstration".to_string(),
                author: "Nexus Team".to_string(),
                plugin_type: PluginType::BookSource,
                dependencies: vec![],
                capabilities: vec!["search".to_string(), "details".to_string()],
            },
            config: serde_json::Value::Null,
        }
    }
}

#[async_trait]
impl Plugin for ExampleBookSourcePlugin {
    fn metadata(&self) -> PluginMetadata {
        self.metadata.clone()
    }

    async fn initialize(&mut self, config: serde_json::Value) -> Result<(), EngineError> {
        self.config = config;
        tracing::info!("Example book source plugin initialized");
        Ok(())
    }

    async fn start(&mut self) -> Result<(), EngineError> {
        tracing::info!("Example book source plugin started");
        Ok(())
    }

    async fn stop(&mut self) -> Result<(), EngineError> {
        tracing::info!("Example book source plugin stopped");
        Ok(())
    }

    fn health_status(&self) -> PluginHealthStatus {
        PluginHealthStatus {
            healthy: true,
            message: Some("Plugin is healthy".to_string()),
            last_check: chrono::Utc::now(),
            metrics: HashMap::new(),
        }
    }

    async fn handle_command(&self, command: &str, args: serde_json::Value) -> Result<serde_json::Value, EngineError> {
        match command {
            "status" => Ok(serde_json::json!({
                "status": "ok",
                "plugin": self.metadata.name
            })),
            _ => Err(EngineError::InvalidConfig {
                message: format!("Unknown command: {}", command)
            })
        }
    }
}

#[async_trait]
impl BookSourceEngine for ExampleBookSourcePlugin {
    fn name(&self) -> &str {
        &self.metadata.name
    }

    fn version(&self) -> &str {
        &self.metadata.version
    }

    fn supports_url(&self, _url: &str) -> bool {
        true // For demonstration
    }

    async fn search_books(&self, query: &str, _page: Option<u32>) -> Result<Vec<crate::types::BookItem>, EngineError> {
        // Return mock search results
        Ok(vec![
            crate::types::BookItem {
                id: format!("example_{}", query),
                title: format!("Example Book for '{}'", query),
                author: "Example Author".to_string(),
                description: Some(format!("This is an example book about {}", query)),
                cover: Some("https://example.com/cover.jpg".to_string()),
                url: format!("https://example.com/book/{}", query),
                tags: vec!["example".to_string()],
                status: Some("completed".to_string()),
                word_count: Some(100000),
                update_time: Some(chrono::Utc::now()),
            }
        ])
    }

    async fn get_book_details(&self, url: &str) -> Result<crate::types::BookItem, EngineError> {
        // Return mock book details
        Ok(crate::types::BookItem {
            id: url.split('/').last().unwrap_or("unknown").to_string(),
            title: "Example Book Details".to_string(),
            author: "Example Author".to_string(),
            description: Some("Detailed description of the example book".to_string()),
            cover: Some("https://example.com/cover.jpg".to_string()),
            url: url.to_string(),
            tags: vec!["example".to_string(), "detailed".to_string()],
            status: Some("completed".to_string()),
            word_count: Some(150000),
            update_time: Some(chrono::Utc::now()),
        })
    }

    async fn get_table_of_contents(&self, _url: &str) -> Result<Vec<crate::types::TocItem>, EngineError> {
        // Return mock TOC
        Ok(vec![
            crate::types::TocItem {
                id: "chapter_1".to_string(),
                title: "Chapter 1: Introduction".to_string(),
                url: "https://example.com/chapter/1".to_string(),
                index: 0,
                is_vip: Some(false),
                update_time: Some(chrono::Utc::now()),
            },
            crate::types::TocItem {
                id: "chapter_2".to_string(),
                title: "Chapter 2: Getting Started".to_string(),
                url: "https://example.com/chapter/2".to_string(),
                index: 1,
                is_vip: Some(false),
                update_time: Some(chrono::Utc::now()),
            }
        ])
    }

    async fn get_chapter_content(&self, url: &str) -> Result<crate::types::Chapter, EngineError> {
        // Return mock chapter content
        Ok(crate::types::Chapter {
            id: url.split('/').last().unwrap_or("unknown").to_string(),
            title: "Example Chapter".to_string(),
            content: "This is the content of an example chapter.\n\nIt contains multiple paragraphs and demonstrates the plugin system.".to_string(),
            url: url.to_string(),
            index: 0,
            word_count: Some(150),
            update_time: Some(chrono::Utc::now()),
        })
    }

    async fn test_connectivity(&self) -> Result<(), EngineError> {
        Ok(()) // Always succeeds for example plugin
    }

    fn get_health_status(&self) -> crate::interfaces::EngineHealthStatus {
        crate::interfaces::EngineHealthStatus {
            status: crate::interfaces::HealthState::Healthy,
            last_check: chrono::Utc::now(),
            response_time_ms: Some(50),
            error_count: 0,
            success_count: 100,
        }
    }

    fn get_statistics(&self) -> crate::interfaces::EngineStatistics {
        crate::interfaces::EngineStatistics {
            total_requests: 100,
            successful_requests: 95,
            failed_requests: 5,
            average_response_time_ms: 50.0,
            uptime_seconds: 3600,
            memory_usage_bytes: Some(1024 * 1024), // 1MB
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::runtime::Runtime;

    #[test]
    fn test_plugin_registry() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let registry = PluginRegistry::new();
            let manager = registry.get_manager(PluginType::BookSource).await;

            // Register example plugin
            let plugin = Box::new(ExampleBookSourcePlugin::new());
            let plugin_id = registry.register_plugin(PluginType::BookSource, plugin).await.unwrap();

            assert_eq!(plugin_id, "example_book_source");

            // Get plugin back
            let retrieved: Arc<ExampleBookSourcePlugin> = registry.get_plugin(PluginType::BookSource, &plugin_id).await.unwrap();
            assert_eq!(retrieved.metadata().name, "Example Book Source");
        });
    }

    #[test]
    fn test_example_plugin() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let plugin = ExampleBookSourcePlugin::new();

            // Test metadata
            let metadata = plugin.metadata();
            assert_eq!(metadata.name, "Example Book Source");
            assert_eq!(metadata.plugin_type, PluginType::BookSource);

            // Test health status
            let health = plugin.health_status();
            assert!(health.healthy);

            // Test search
            let results = plugin.search_books("test query", None).await.unwrap();
            assert_eq!(results.len(), 1);
            assert!(results[0].title.contains("test query"));
        });
    }
}