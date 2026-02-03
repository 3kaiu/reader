//! Centralized Configuration Management System
//!
//! Provides unified configuration management with:
//! - Multi-environment support
//! - Runtime configuration updates
//! - Configuration validation
//! - Hot reload capabilities
//! - Distributed configuration synchronization

use crate::config::{EngineConfig, ServerConfig, ResourceLimits, StorageConfig, LoggingConfig, CloudflareBypassConfig};
use crate::error::{EngineError, ErrorCode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use tracing::{info, warn, error};
use chrono::{DateTime, Utc};

/// Configuration environment
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConfigEnvironment {
    Development,
    Staging,
    Production,
    Testing,
}

/// Configuration source type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigSource {
    File,
    Environment,
    Remote,
    Runtime,
}

/// Configuration entry with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigEntry<T> {
    pub value: T,
    pub source: ConfigSource,
    pub last_updated: DateTime<Utc>,
    pub version: u64,
    pub checksum: String,
}

/// Configuration validation result
#[derive(Debug, Clone)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

/// Centralized configuration manager
pub struct ConfigManager {
    config: Arc<RwLock<EngineConfig>>,
    environment: ConfigEnvironment,
    entries: Arc<RwLock<HashMap<String, serde_json::Value>>>,
    update_channel: broadcast::Sender<ConfigUpdateEvent>,
    _update_receiver: broadcast::Receiver<ConfigUpdateEvent>,
    validation_rules: HashMap<String, Box<dyn Fn(&serde_json::Value) -> ValidationResult + Send + Sync>>,
}

/// Configuration update event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigUpdateEvent {
    pub key: String,
    pub old_value: Option<serde_json::Value>,
    pub new_value: serde_json::Value,
    pub source: ConfigSource,
    pub timestamp: DateTime<Utc>,
}

impl ConfigManager {
    /// Create a new configuration manager
    pub fn new(environment: ConfigEnvironment) -> Result<Self, EngineError> {
        let (tx, rx) = broadcast::channel(100);

        let mut manager = Self {
            config: Arc::new(RwLock::new(EngineConfig::default())),
            environment,
            entries: Arc::new(RwLock::new(HashMap::new())),
            update_channel: tx,
            _update_receiver: rx,
            validation_rules: HashMap::new(),
        };

        manager.register_default_validators();
        Ok(manager)
    }

    /// Load configuration from file
    pub async fn load_from_file<P: AsRef<Path>>(&self, path: P) -> Result<(), EngineError> {
        let path = path.as_ref();

        if !path.exists() {
            return Err(EngineError::ConfigNotFound {
                key: path.to_string_lossy().to_string()
            });
        }

        let content = fs::read_to_string(path)
            .map_err(|e| EngineError::FileIo {
                message: format!("Failed to read config file {}: {}", path.display(), e)
            })?;

        let config: EngineConfig = serde_json::from_str(&content)
            .map_err(|e| EngineError::Deserialization {
                message: format!("Failed to parse config file {}: {}", path.display(), e)
            })?;

        // Validate configuration
        let validation = self.validate_config(&config).await?;
        if !validation.is_valid {
            return Err(EngineError::ConfigValidationFailed {
                details: validation.errors.join("; ")
            });
        }

        // Apply configuration
        let mut current_config = self.config.write().await;
        *current_config = config;

        info!("Configuration loaded from file: {}", path.display());
        Ok(())
    }

    /// Load configuration from environment variables
    pub async fn load_from_env(&self, prefix: &str) -> Result<(), EngineError> {
        let mut updates = HashMap::new();

        // Server configuration
        if let Ok(host) = std::env::var(format!("{}_HOST", prefix)) {
            updates.insert("server.host".to_string(), serde_json::json!(host));
        }

        if let Ok(port_str) = std::env::var(format!("{}_PORT", prefix)) {
            if let Ok(port) = port_str.parse::<u16>() {
                updates.insert("server.port".to_string(), serde_json::json!(port));
            }
        }

        if let Ok(cors_str) = std::env::var(format!("{}_CORS_ENABLED", prefix)) {
            if let Ok(cors) = cors_str.parse::<bool>() {
                updates.insert("server.enable_cors".to_string(), serde_json::json!(cors));
            }
        }

        // Apply updates
        for (key, value) in updates {
            self.update_config(&key, value, ConfigSource::Environment).await?;
        }

        if !updates.is_empty() {
            info!("Configuration loaded from environment variables (prefix: {})", prefix);
        }

        Ok(())
    }

    /// Update configuration at runtime
    pub async fn update_config(
        &self,
        key: &str,
        value: serde_json::Value,
        source: ConfigSource
    ) -> Result<(), EngineError> {
        // Validate the update
        let validation = self.validate_config_value(key, &value).await?;
        if !validation.is_valid {
            return Err(EngineError::ConfigValidationFailed {
                details: validation.errors.join("; ")
            });
        }

        // Store old value for event
        let old_value = {
            let entries = self.entries.read().await;
            entries.get(key).cloned()
        };

        // Update entries
        {
            let mut entries = self.entries.write().await;
            entries.insert(key.to_string(), value.clone());
        }

        // Update actual config structure
        self.apply_config_update(key, &value).await?;

        // Send update event
        let event = ConfigUpdateEvent {
            key: key.to_string(),
            old_value,
            new_value: value,
            source,
            timestamp: Utc::now(),
        };

        let _ = self.update_channel.send(event);

        info!("Configuration updated: {} = {}", key, value);
        Ok(())
    }

    /// Get configuration value
    pub async fn get_config_value(&self, key: &str) -> Option<serde_json::Value> {
        let entries = self.entries.read().await;
        entries.get(key).cloned()
    }

    /// Get current configuration
    pub async fn get_config(&self) -> EngineConfig {
        self.config.read().await.clone()
    }

    /// Watch configuration changes
    pub fn watch_config(&self) -> broadcast::Receiver<ConfigUpdateEvent> {
        self.update_channel.subscribe()
    }

    /// Export configuration to file
    pub async fn export_to_file<P: AsRef<Path>>(&self, path: P) -> Result<(), EngineError> {
        let config = self.get_config().await;
        let content = serde_json::to_string_pretty(&config)
            .map_err(|e| EngineError::Serialization {
                message: format!("Failed to serialize config: {}", e)
            })?;

        fs::write(path, content)
            .map_err(|e| EngineError::FileIo {
                message: format!("Failed to write config file: {}", e)
            })?;

        Ok(())
    }

    /// Register configuration validator
    pub fn register_validator<F>(&mut self, key_pattern: &str, validator: F)
    where
        F: Fn(&serde_json::Value) -> ValidationResult + Send + Sync + 'static,
    {
        self.validation_rules.insert(key_pattern.to_string(), Box::new(validator));
    }

    /// Validate entire configuration
    async fn validate_config(&self, config: &EngineConfig) -> Result<ValidationResult, EngineError> {
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        // Server validation
        if config.server.port == 0 {
            errors.push("Server port cannot be 0".to_string());
        }

        // Resource limits validation
        if config.limits.max_concurrent_searches == 0 {
            warnings.push("Max concurrent searches is 0, no searches will be allowed".to_string());
        }

        // Cloudflare bypass validation
        if config.cf_bypass.enabled && config.cf_bypass.service_url.is_empty() {
            errors.push("CF bypass service URL is required when enabled".to_string());
        }

        Ok(ValidationResult {
            is_valid: errors.is_empty(),
            errors,
            warnings,
        })
    }

    /// Validate single configuration value
    async fn validate_config_value(&self, key: &str, value: &serde_json::Value) -> Result<ValidationResult, EngineError> {
        // Check registered validators
        for (pattern, validator) in &self.validation_rules {
            if key.contains(pattern) {
                let result = validator(value);
                if !result.is_valid {
                    return Ok(result);
                }
            }
        }

        // Default validation based on key
        let result = match key {
            "server.port" => {
                if let Some(port) = value.as_u64() {
                    if port == 0 || port > 65535 {
                        ValidationResult {
                            is_valid: false,
                            errors: vec!["Port must be between 1 and 65535".to_string()],
                            warnings: vec![],
                        }
                    } else {
                        ValidationResult {
                            is_valid: true,
                            errors: vec![],
                            warnings: vec![],
                        }
                    }
                } else {
                    ValidationResult {
                        is_valid: false,
                        errors: vec!["Port must be a number".to_string()],
                        warnings: vec![],
                    }
                }
            },
            "server.enable_cors" => {
                if value.is_boolean() {
                    ValidationResult {
                        is_valid: true,
                        errors: vec![],
                        warnings: vec![],
                    }
                } else {
                    ValidationResult {
                        is_valid: false,
                        errors: vec!["enable_cors must be a boolean".to_string()],
                        warnings: vec![],
                    }
                }
            },
            _ => ValidationResult {
                is_valid: true,
                errors: vec![],
                warnings: vec![],
            },
        };

        Ok(result)
    }

    /// Apply configuration update to actual config structure
    async fn apply_config_update(&self, key: &str, value: &serde_json::Value) -> Result<(), EngineError> {
        let mut config = self.config.write().await;

        match key {
            "server.host" => {
                if let Some(host) = value.as_str() {
                    config.server.host = host.to_string();
                }
            },
            "server.port" => {
                if let Some(port) = value.as_u64() {
                    config.server.port = port as u16;
                }
            },
            "server.enable_cors" => {
                if let Some(cors) = value.as_bool() {
                    config.server.enable_cors = cors;
                }
            },
            // Add more key mappings as needed
            _ => {
                warn!("Unknown configuration key: {}", key);
            }
        }

        Ok(())
    }

    /// Register default configuration validators
    fn register_default_validators(&mut self) {
        // Port validator
        self.register_validator("port", |value| {
            if let Some(port) = value.as_u64() {
                if port == 0 || port > 65535 {
                    return ValidationResult {
                        is_valid: false,
                        errors: vec!["Port must be between 1 and 65535".to_string()],
                        warnings: vec![],
                    };
                }
            }
            ValidationResult {
                is_valid: true,
                errors: vec![],
                warnings: vec![],
            }
        });

        // Boolean validator
        self.register_validator("enable", |value| {
            if !value.is_boolean() {
                return ValidationResult {
                    is_valid: false,
                    errors: vec!["Value must be a boolean".to_string()],
                    warnings: vec![],
                };
            }
            ValidationResult {
                is_valid: true,
                errors: vec![],
                warnings: vec![],
            }
        });

        // URL validator
        self.register_validator("url", |value| {
            if let Some(url_str) = value.as_str() {
                if !url_str.starts_with("http") {
                    return ValidationResult {
                        is_valid: false,
                        errors: vec!["URL must start with http or https".to_string()],
                        warnings: vec![],
                    };
                }
            }
            ValidationResult {
                is_valid: true,
                errors: vec![],
                warnings: vec![],
            }
        });
    }
}

impl Default for ConfigEnvironment {
    fn default() -> Self {
        Self::Development
    }
}

/// Global configuration manager instance
lazy_static::lazy_static! {
    static ref GLOBAL_CONFIG_MANAGER: parking_lot::RwLock<Option<Arc<ConfigManager>>> = parking_lot::RwLock::new(None);
}

/// Get global configuration manager
pub fn get_config_manager() -> Result<Arc<ConfigManager>, EngineError> {
    let manager = GLOBAL_CONFIG_MANAGER.read();
    manager.as_ref().cloned().ok_or_else(|| EngineError::Internal {
        message: "Configuration manager not initialized".to_string()
    })
}

/// Initialize global configuration manager
pub fn init_config_manager(environment: ConfigEnvironment) -> Result<Arc<ConfigManager>, EngineError> {
    let manager = ConfigManager::new(environment)?;
    let arc_manager = Arc::new(manager);

    let mut global = GLOBAL_CONFIG_MANAGER.write();
    *global = Some(Arc::clone(&arc_manager));

    Ok(arc_manager)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::runtime::Runtime;

    #[test]
    fn test_config_manager_creation() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let manager = ConfigManager::new(ConfigEnvironment::Testing).unwrap();
            assert_eq!(manager.environment, ConfigEnvironment::Testing);
        });
    }

    #[test]
    fn test_config_validation() {
        let rt = Runtime::new().unwrap();
        rt.block_on(async {
            let manager = ConfigManager::new(ConfigEnvironment::Testing).unwrap();

            // Valid port
            let result = manager.validate_config_value("server.port", &serde_json::json!(8080)).await.unwrap();
            assert!(result.is_valid);

            // Invalid port
            let result = manager.validate_config_value("server.port", &serde_json::json!(70000)).await.unwrap();
            assert!(!result.is_valid);
        });
    }
}