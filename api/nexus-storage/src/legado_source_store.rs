//! Legado Source Storage
//!
//! Dedicated storage for Legado book sources loaded from JSON files
//! (e.g. the AOAOSTAR / yckceo community source repositories).

use nexus_core::LegadoSource;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tracing::{error, info, warn};

/// Storage for Legado format book sources
pub struct LegadoSourceStore {
    sources_dir: PathBuf,
    sources: RwLock<HashMap<String, Arc<LegadoSource>>>,
}

impl LegadoSourceStore {
    /// Create a new Legado source store
    pub fn new(sources_dir: &Path) -> Self {
        Self {
            sources_dir: sources_dir.to_path_buf(),
            sources: RwLock::new(HashMap::new()),
        }
    }

    /// Load all .json legado source files from directory
    pub fn load_all(&self) -> usize {
        if !self.sources_dir.exists() {
            warn!("Legado sources directory does not exist: {:?}", self.sources_dir);
            return 0;
        }

        let mut count = 0;
        let entries = match std::fs::read_dir(&self.sources_dir) {
            Ok(entries) => entries,
            Err(e) => {
                error!("Failed to read legado sources dir {:?}: {}", self.sources_dir, e);
                return 0;
            },
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path
                .extension()
                .is_some_and(|ext| ext == "json" || ext == "legado")
            {
                continue;
            }
            // Skip known non-source files
            let fname = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if fname == "legado-quality.json" || fname == "ALL.json" || fname == "all.json" {
                continue;
            }
            match self.load_file(&path) {
                Ok(n) => count += n,
                Err(e) => warn!("Skipped {:?}: {}", path, e),
            }
        }

        info!("Loaded {} Legado sources from {:?}", count, self.sources_dir);
        count
    }

    /// Load sources from a single JSON file
    ///
    /// The file may contain either a single LegadoSource or `Vec<LegadoSource>`.
    fn load_file(&self, path: &Path) -> Result<usize, String> {
        let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| e.to_string())?;
        let content = content.trim();

        // Try as Vec first (e.g. yckceo bulk exports), then as single object
        if let Ok(sources) = serde_json::from_str::<Vec<LegadoSource>>(content) {
            let count = sources.len();
            for source in sources {
                self.add(source);
            }
            Ok(count)
        } else if let Ok(source) = serde_json::from_str::<LegadoSource>(content) {
            self.add(source);
            Ok(1)
        } else {
            Err("file is neither LegadoSource nor Vec<LegadoSource>".to_string())
        }
    }

    /// Add a source to memory, warning on ID collision
    pub fn add(&self, source: LegadoSource) -> String {
        let id = source.infer_id();
        let existing = self.sources.read().get(&id).cloned();
        if let Some(prev) = existing {
            warn!(
                "Legado source ID collision: '{}' ('{}') overwriting '{}' ('{}')",
                id, source.book_source_name, prev.book_source_name, prev.book_source_url
            );
        }
        info!("Loaded Legado source: {} ({})", source.book_source_name, id);
        let arc_source = Arc::new(source);
        self.sources.write().insert(id.clone(), arc_source);
        id
    }

    /// Get a source by ID
    pub fn get(&self, id: &str) -> Option<Arc<LegadoSource>> {
        self.sources.read().get(id).cloned()
    }

    /// Get all sources (cheap clones via Arc)
    pub fn get_all(&self) -> Vec<Arc<LegadoSource>> {
        self.sources.read().values().cloned().collect()
    }

    /// Save a source (or multiple) to a JSON file
    pub async fn save(&self, source: &LegadoSource) -> Result<String, nexus_core::EngineError> {
        let id = source.infer_id();
        // Validate ID to prevent directory traversal
        if id.contains("..") || id.contains('/') || id.contains('\\') || id.contains('\0') {
            return Err(nexus_core::EngineError::FileIo {
                message: format!("Invalid source ID (contains path separators): {}", id),
            });
        }
        // Avoid collisions with NXS sources
        let path = self.sources_dir.join(format!("{}.json", id));
        let content = serde_json::to_string_pretty(source)?;

        tokio::fs::write(&path, content)
            .await
            .map_err(|e| nexus_core::EngineError::FileIo {
                message: e.to_string(),
            })?;

        self.sources.write().insert(id.clone(), Arc::new(source.clone()));
        Ok(id)
    }

    /// Save multiple sources to individual files
    pub async fn save_bulk(
        &self,
        sources: &[LegadoSource],
    ) -> Result<Vec<String>, nexus_core::EngineError> {
        let mut ids = Vec::with_capacity(sources.len());
        for source in sources {
            let id = self.save(source).await?;
            ids.push(id);
        }
        Ok(ids)
    }

    /// Delete a source
    pub async fn delete(&self, id: &str) -> Result<(), nexus_core::EngineError> {
        // Validate ID to prevent directory traversal
        if id.contains("..") || id.contains('/') || id.contains('\\') || id.contains('\0') {
            return Err(nexus_core::EngineError::FileIo {
                message: format!("Invalid source ID (contains path separators): {}", id),
            });
        }
        let path = self.sources_dir.join(format!("{}.json", id));

        if path.exists() {
            tokio::fs::remove_file(&path)
                .await
                .map_err(|e| nexus_core::EngineError::FileIo {
                    message: e.to_string(),
                })?;
        }

        self.sources.write().remove(id);
        Ok(())
    }

    /// Count sources
    pub fn count(&self) -> usize {
        self.sources.read().len()
    }
}
