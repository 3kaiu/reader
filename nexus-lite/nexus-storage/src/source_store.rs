//! NXS Source Storage
//!
//! Exclusive storage for .nxs source files.
//! Replaces legacy JSON storage.

use nexus_core::{EngineError, NxsSource};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tracing::{error, info, warn};

/// Storage for NXS book sources
pub struct SourceStore {
    sources_dir: PathBuf,
    sources: RwLock<HashMap<String, NxsSource>>,
}

impl SourceStore {
    /// Create a new NXS source store
    pub fn new(sources_dir: &Path) -> Self {
        Self {
            sources_dir: sources_dir.to_path_buf(),
            sources: RwLock::new(HashMap::new()),
        }
    }

    /// Load all .nxs sources from directory
    pub async fn load_all(&self) -> Result<usize, EngineError> {
        if !self.sources_dir.exists() {
            warn!("Sources directory does not exist: {:?}", self.sources_dir);
            return Ok(0);
        }

        let mut count = 0;
        let mut entries = tokio::fs::read_dir(&self.sources_dir)
            .await
            .map_err(|e| EngineError::FileIo { message: e.to_string() })?;

        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| EngineError::FileIo(e.to_string()))?
        {
            let path = entry.path();
            // Only load .nxs files
            if path.extension().is_some_and(|ext| ext == "nxs") {
                match self.load_file(&path).await {
                    Ok(n) => count += n,
                    Err(e) => error!("Failed to load {:?}: {}", path, e),
                }
            }
        }

        info!("Loaded {} NXS sources", count);
        Ok(count)
    }

    /// Load sources from a single .nxs file
    async fn load_file(&self, path: &Path) -> Result<usize, EngineError> {
        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| EngineError::FileIo { message: e.to_string() })?;

        let content = content.trim();

        // NXS files should contain a single source object
        let source: NxsSource = serde_json::from_str(content)?;
        self.add(source);

        Ok(1)
    }

    /// Add a source to memory
    pub fn add(&self, source: NxsSource) {
        let id = source.id.clone();
        info!("Loaded NXS source: {} ({})", source.name, id);
        self.sources.write().insert(id, source);
    }

    /// Get a source by ID
    pub fn get(&self, id: &str) -> Option<NxsSource> {
        self.sources.read().get(id).cloned()
    }

    /// Get all sources
    pub fn get_all(&self) -> Vec<NxsSource> {
        self.sources.read().values().cloned().collect()
    }

    /// Save a source to .nxs file
    pub async fn save(&self, source: &NxsSource) -> Result<(), EngineError> {
        let path = self.sources_dir.join(format!("{}.nxs", source.id));
        let content = serde_json::to_string_pretty(source)?;

        tokio::fs::write(&path, content)
            .await
            .map_err(|e| EngineError::FileIo { message: e.to_string() })?;

        self.add(source.clone());
        Ok(())
    }

    /// Delete a source
    pub async fn delete(&self, id: &str) -> Result<(), EngineError> {
        let path = self.sources_dir.join(format!("{}.nxs", id));

        if path.exists() {
            tokio::fs::remove_file(&path)
                .await
                .map_err(|e| EngineError::FileIo { message: e.to_string() })?;
        }

        self.sources.write().remove(id);
        Ok(())
    }

    /// Count sources
    pub fn count(&self) -> usize {
        self.sources.read().len()
    }
}
