use memmap2::Mmap;
use metrics::{counter, histogram};
use moka::future::Cache;
use nexus_core::EngineError;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, info};

const METRIC_CHAPTER_CACHE_REQUESTS: &str = "nexus_chapter_cache_requests_total";
const METRIC_CHAPTER_CACHE_GET_DURATION: &str = "nexus_chapter_cache_get_duration_seconds";

/// Two-level chapter content cache
pub struct ChapterCache {
    /// L1: In-memory cache (fast, limited)
    memory: Cache<String, Arc<str>>,
    /// L2: Disk cache directory
    disk_dir: PathBuf,
    /// Maximum disk cache size in MB
    max_disk_mb: usize,
    /// Current disk size tracking
    disk_size: AtomicU64,
    /// Cache hit/miss stats
    hits: AtomicU64,
    misses: AtomicU64,
}

impl ChapterCache {
    /// Create a new two-level cache
    pub fn new(cache_dir: &Path, max_disk_mb: usize) -> Self {
        Self::with_memory_limit(cache_dir, 64, max_disk_mb)
    }

    /// Create cache with custom memory limit
    pub fn with_memory_limit(cache_dir: &Path, max_memory_mb: usize, max_disk_mb: usize) -> Self {
        let memory = Cache::builder()
            .max_capacity((max_memory_mb * 1024 * 1024) as u64)
            .time_to_idle(Duration::from_secs(3600))
            .build();

        info!(
            "ChapterCache initialized: L1={}MB memory, L2={}MB disk",
            max_memory_mb, max_disk_mb
        );

        Self {
            memory,
            disk_dir: cache_dir.to_path_buf(),
            max_disk_mb,
            disk_size: AtomicU64::new(0),
            hits: AtomicU64::new(0),
            misses: AtomicU64::new(0),
        }
    }

    /// Generate cache key
    fn cache_key(&self, book_id: &str, chapter_index: usize) -> String {
        format!("{}_{}", book_id, chapter_index)
    }

    /// Get disk cache file path
    fn disk_path(&self, key: &str) -> PathBuf {
        self.disk_dir.join(format!("{}.txt", key))
    }

    /// Get cached content (L1 memory -> L2 disk via Mmap)
    pub async fn get(&self, book_id: &str, chapter_index: usize) -> Option<Arc<str>> {
        let key = self.cache_key(book_id, chapter_index);
        let start = std::time::Instant::now();

        // L1: Try memory first
        if let Some(content) = self.memory.get(&key).await {
            self.hits.fetch_add(1, Ordering::Relaxed);
            counter!(METRIC_CHAPTER_CACHE_REQUESTS, "result" => "hit".to_string(), "level" => "l1".to_string()).increment(1);
            histogram!(METRIC_CHAPTER_CACHE_GET_DURATION, "result" => "hit".to_string(), "level" => "l1".to_string()).record(start.elapsed().as_secs_f64());
            debug!("Cache HIT (L1 memory): {}", key);
            return Some(content);
        }

        // L2: Try disk via Mmap
        let path = self.disk_path(&key);
        if path.exists() {
            let path_clone = path.clone();
            let content = tokio::task::spawn_blocking::<_, Option<Arc<str>>>(move || {
                let file = File::open(&path_clone).ok()?;
                let mmap = unsafe { Mmap::map(&file).ok()? };
                // Optimized: from_utf8_lossy on slice, then into Arc<str>
                let s = String::from_utf8_lossy(&mmap);
                Some(Arc::from(s.as_ref()))
            })
            .await
            .ok()
            .flatten();

            if let Some(content) = content {
                // Promote to L1 memory
                self.memory.insert(key.clone(), content.clone()).await;
                self.hits.fetch_add(1, Ordering::Relaxed);
                counter!(METRIC_CHAPTER_CACHE_REQUESTS, "result" => "hit".to_string(), "level" => "l2".to_string()).increment(1);
                histogram!(METRIC_CHAPTER_CACHE_GET_DURATION, "result" => "hit".to_string(), "level" => "l2".to_string()).record(start.elapsed().as_secs_f64());
                debug!("Cache HIT (L2 disk/mmap, promoted to L1): {}", key);
                return Some(content);
            }
        }

        self.misses.fetch_add(1, Ordering::Relaxed);
        counter!(METRIC_CHAPTER_CACHE_REQUESTS, "result" => "miss".to_string(), "level" => "none".to_string()).increment(1);
        histogram!(METRIC_CHAPTER_CACHE_GET_DURATION, "result" => "miss".to_string(), "level" => "none".to_string()).record(start.elapsed().as_secs_f64());
        debug!("Cache MISS: {}", key);
        None
    }

    /// Store content in cache (both L1 and L2)
    pub async fn set(
        &self,
        book_id: &str,
        chapter_index: usize,
        content: Arc<str>,
    ) -> Result<(), EngineError> {
        let key = self.cache_key(book_id, chapter_index);

        // L1: Memory
        self.memory.insert(key.clone(), content.clone()).await;

        // L2: Disk (async write)
        self.write_to_disk(&key, &content).await?;

        debug!("Cached chapter: {}/{}", book_id, chapter_index);
        Ok(())
    }

    /// Write content to disk
    async fn write_to_disk(&self, key: &str, content: &str) -> Result<(), EngineError> {
        if !self.disk_dir.exists() {
            tokio::fs::create_dir_all(&self.disk_dir)
                .await
                .map_err(|e| EngineError::FileIo {
                    message: e.to_string(),
                })?;
        }

        let path = self.disk_path(key);
        let old_size = if path.exists() {
            tokio::fs::metadata(&path)
                .await
                .map(|m| m.len())
                .unwrap_or(0)
        } else {
            0
        };

        tokio::fs::write(&path, content)
            .await
            .map_err(|e| EngineError::FileIo {
                message: e.to_string(),
            })?;

        let new_size = content.len() as u64;
        self.disk_size
            .fetch_add(new_size.saturating_sub(old_size), Ordering::Relaxed);

        Ok(())
    }

    /// Check if chapter is cached (any level)
    pub async fn has(&self, book_id: &str, chapter_index: usize) -> bool {
        let key = self.cache_key(book_id, chapter_index);
        if self.memory.contains_key(&key) {
            return true;
        }
        self.disk_path(&key).exists()
    }

    /// Clear cache for a book
    pub async fn clear_book(&self, book_id: &str) -> Result<(), EngineError> {
        let pattern = format!("{}_", book_id);
        let _ = self
            .memory
            .invalidate_entries_if(move |k, _| k.starts_with(&pattern));

        if let Ok(mut entries) = tokio::fs::read_dir(&self.disk_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with(&format!("{}_", book_id)) {
                    if let Ok(meta) = entry.metadata().await {
                        self.disk_size.fetch_sub(meta.len(), Ordering::Relaxed);
                    }
                    let _ = tokio::fs::remove_file(entry.path()).await;
                }
            }
        }
        Ok(())
    }

    /// Clear all cache
    pub async fn clear_all(&self) -> Result<(), EngineError> {
        self.memory.invalidate_all();
        if self.disk_dir.exists() {
            tokio::fs::remove_dir_all(&self.disk_dir)
                .await
                .map_err(|e| EngineError::FileIo {
                    message: e.to_string(),
                })?;
            tokio::fs::create_dir_all(&self.disk_dir)
                .await
                .map_err(|e| EngineError::FileIo {
                    message: e.to_string(),
                })?;
        }
        self.disk_size.store(0, Ordering::Relaxed);
        self.hits.store(0, Ordering::Relaxed);
        self.misses.store(0, Ordering::Relaxed);
        info!("Cleared all cache");
        Ok(())
    }

    /// Cleanup disk cache if size limit exceeded (LRU)
    pub async fn cleanup(&self) -> Result<(), EngineError> {
        if !self.disk_dir.exists() {
            return Ok(());
        }

        let max_bytes = (self.max_disk_mb * 1024 * 1024) as u64;
        let mut entries = Vec::new();
        let mut total_size = 0u64;

        let mut dir =
            tokio::fs::read_dir(&self.disk_dir)
                .await
                .map_err(|e| EngineError::FileIo {
                    message: e.to_string(),
                })?;

        while let Some(entry) =
            dir.next_entry()
                .await
                .map_err(|e: std::io::Error| EngineError::FileIo {
                    message: e.to_string(),
                })?
        {
            let metadata =
                entry
                    .metadata()
                    .await
                    .map_err(|e: std::io::Error| EngineError::FileIo {
                        message: e.to_string(),
                    })?;
            let size = metadata.len();
            let modified = metadata
                .modified()
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            entries.push((entry.path(), size, modified));
            total_size += size;
        }

        self.disk_size.store(total_size, Ordering::Relaxed);
        if total_size <= max_bytes {
            return Ok(());
        }

        entries.sort_by_key(|k| k.2);
        let mut removed_size = 0u64;
        for (path, size, _) in entries {
            if total_size - removed_size <= max_bytes {
                break;
            }
            if tokio::fs::remove_file(&path).await.is_ok() {
                removed_size += size;
            }
        }
        self.disk_size
            .store(total_size - removed_size, Ordering::Relaxed);
        info!(
            "Disk cache cleanup: removed {}MB",
            removed_size / 1024 / 1024
        );
        Ok(())
    }

    /// Get cache statistics
    pub fn stats(&self) -> CacheStats {
        let hits = self.hits.load(Ordering::Relaxed);
        let misses = self.misses.load(Ordering::Relaxed);
        let total = hits + misses;
        CacheStats {
            hits,
            misses,
            hit_rate: if total > 0 {
                hits as f64 / total as f64
            } else {
                0.0
            },
            disk_size_mb: self.disk_size.load(Ordering::Relaxed) / 1024 / 1024,
            memory_entry_count: self.memory.entry_count(),
        }
    }
}

/// Cache statistics
#[derive(Debug, Clone)]
pub struct CacheStats {
    pub hits: u64,
    pub misses: u64,
    pub hit_rate: f64,
    pub disk_size_mb: u64,
    pub memory_entry_count: u64,
}
