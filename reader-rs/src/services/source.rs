use axum::response::sse::Event;
use futures::stream::Stream;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::models::{BookSource, BookSourceFull};
use crate::storage::FileStorage;

use crate::storage::kv::KvStore;

/// 书源存储文件名
const SOURCES_FILE: &str = "bookSources.json";

pub struct SourceService {
    storage: FileStorage,
    sources: Arc<RwLock<Vec<BookSourceFull>>>,
    kv_store: Arc<KvStore>,
}

impl SourceService {
    pub fn new() -> Self {
        let storage = FileStorage::default();
        let kv_store = Arc::new(KvStore::new(storage.clone(), "kv_store.json"));
        Self {
            storage,
            sources: Arc::new(RwLock::new(Vec::new())),
            kv_store,
        }
    }

    /// 初始化加载书源
    pub async fn init(&self) -> anyhow::Result<()> {
        let sources: Vec<BookSourceFull> = self.storage.read_json_or_default(SOURCES_FILE).await;
        let mut cache = self.sources.write().await;
        *cache = sources;
        Ok(())
    }

    /// 获取所有书源 (完整版本)
    pub async fn get_all_sources(&self) -> Result<Vec<BookSourceFull>, anyhow::Error> {
        let sources = self.sources.read().await;

        if sources.is_empty() {
            // 从文件加载
            drop(sources);
            let loaded: Vec<BookSourceFull> = self.storage.read_json_or_default(SOURCES_FILE).await;
            let mut cache = self.sources.write().await;
            *cache = loaded.clone();
            return Ok(loaded);
        }

        Ok(sources.clone())
    }

    /// 获取完整书源 (用于解析)
    pub async fn get_source_by_url(&self, source_url: &str) -> Option<BookSourceFull> {
        let sources = self.sources.read().await;
        sources
            .iter()
            .find(|s| s.book_source_url == source_url)
            .cloned()
    }

    /// 获取可用书源
    pub async fn get_available_sources(
        &self,
        _book_url: &str,
        _refresh: bool,
    ) -> Result<Vec<BookSource>, anyhow::Error> {
        // TODO: 实现书源搜索匹配
        Ok(vec![])
    }

    /// 切换书源
    pub async fn set_book_source(
        &self,
        _book_url: &str,
        _new_url: &str,
        _source_url: &str,
    ) -> Result<(), anyhow::Error> {
        // TODO: 实现书源切换
        Ok(())
    }

    /// 搜索书源 (SSE)
    pub fn search_source_sse(
        &self,
        key: String,
        group: Option<String>,
        concurrent: usize,
    ) -> impl Stream<Item = Result<Event, Infallible>> {
        let sources_state = self.sources.clone();
        let kv_store_state = self.kv_store.clone();

        async_stream::stream! {
            yield Ok(Event::default().data(r#"{"type":"start"}"#));

            let sources_guard = sources_state.read().await;
            let target_sources: Vec<BookSourceFull> = sources_guard.iter()
                .filter(|s| {
                     // Filter by group if provided
                     if let Some(ref g) = group {
                         s.book_source_group.contains(g)
                     } else {
                         true
                     }
                })
                .filter(|s| !s.search_url.is_empty())
                .cloned()
                .collect();
            drop(sources_guard);

            let key = Arc::new(key);
            let mut seen_books: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();

            let mut stream = futures::stream::iter(target_sources)
                .map(move |source| {
                    let key = key.clone();
                    let source_name = source.book_source_name.clone();
                    let kv_dist = kv_store_state.clone();
                    async move {
                        // Wrap with 10 second timeout per source
                        let search_future = tokio::task::spawn_blocking(move || {
                            // Convert Model to Engine Source
                            let engine_source: crate::engine::book_source::BookSource = match serde_json::from_value(serde_json::to_value(&source).unwrap()) {
                                Ok(s) => s,
                                Err(_) => return None,
                            };

                            let engine = match crate::engine::book_source::BookSourceEngine::new(engine_source, kv_dist) {
                                Ok(e) => e,
                                Err(_) => return None,
                            };

                            match engine.search(&key, 1) {
                                Ok(books) => {
                                    Some((source.book_source_url, source.book_source_name, books))
                                },
                                Err(e) => {
                                    tracing::warn!("Search failed for source {}: {}", source.book_source_name, e);
                                    None
                                }
                            }
                        });

                        match tokio::time::timeout(std::time::Duration::from_secs(10), search_future).await {
                            Ok(Ok(result)) => result,
                            Ok(Err(e)) => {
                                tracing::warn!("Search task failed for {}: {}", source_name, e);
                                None
                            },
                            Err(_) => {
                                tracing::warn!("Search timeout for source: {}", source_name);
                                None
                            }
                        }
                    }
                })
                .buffer_unordered(concurrent);

            use futures::StreamExt;

            while let Some(result) = stream.next().await {
                // result is now Option directly (not Result from JoinHandle)
                if let Some((origin_url, origin_name, books)) = result {
                    for book in books {
                        // Normalize for deduplication
                        let title_norm = book.name.trim().to_lowercase();
                        let author_norm = book.author.trim().to_lowercase();

                        if seen_books.contains(&(title_norm.clone(), author_norm.clone())) {
                            continue;
                        }

                        seen_books.insert((title_norm, author_norm));

                        // We need to enrich book with origin info to pass to frontend
                        // But Engine BookItem is strict.
                        // We should serialize to JSON and inject origin.
                        let mut book_json = serde_json::to_value(&book).unwrap_or(serde_json::Value::Null);
                        if let Some(obj) = book_json.as_object_mut() {
                            obj.insert("origin".to_string(), serde_json::Value::String(origin_url.clone()));
                            obj.insert("originName".to_string(), serde_json::Value::String(origin_name.clone()));
                        }

                        let data = serde_json::to_string(&book_json).unwrap_or_default();
                        yield Ok(Event::default().event("book").data(data));
                    }
                }
            }

            yield Ok(Event::default().data(r#"{"type":"end"}"#));
        }
    }

    /// 保存书源
    pub async fn save_source(&self, source_json: &str) -> Result<(), anyhow::Error> {
        let source: BookSourceFull = serde_json::from_str(source_json)?;
        let mut sources = self.sources.write().await;

        // 更新或添加
        if let Some(pos) = sources
            .iter()
            .position(|s| s.book_source_url == source.book_source_url)
        {
            sources[pos] = source;
        } else {
            sources.push(source);
        }

        self.storage.write_json(SOURCES_FILE, &*sources).await?;
        Ok(())
    }

    /// 删除书源
    pub async fn delete_source(&self, source_url: &str) -> Result<(), anyhow::Error> {
        let mut sources = self.sources.write().await;
        sources.retain(|s| s.book_source_url != source_url);
        self.storage.write_json(SOURCES_FILE, &*sources).await?;
        Ok(())
    }

    /// 批量导入书源
    pub async fn import_sources(&self, sources_json: &str) -> Result<i32, anyhow::Error> {
        let new_sources: Vec<BookSourceFull> = serde_json::from_str(sources_json)?;
        let count = new_sources.len() as i32;

        let mut sources = self.sources.write().await;

        for source in new_sources {
            if let Some(pos) = sources
                .iter()
                .position(|s| s.book_source_url == source.book_source_url)
            {
                sources[pos] = source;
            } else {
                sources.push(source);
            }
        }

        self.storage.write_json(SOURCES_FILE, &*sources).await?;
        Ok(count)
    }

    /// 从远程 URL 获取并保存书源
    pub async fn save_from_remote_source(&self, url: &str) -> Result<i32, anyhow::Error> {
        let client = reqwest::Client::new();
        let resp = client.get(url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
            .send()
            .await?;

        let text = resp.text().await?;
        self.import_sources(&text).await
    }

    /// 注入登录 Cookie
    /// Note: Cookie injection is handled at the source level by storing cookies in the source config
    pub async fn inject_cookies(
        &self,
        source_url: &str,
        cookies: &str,
    ) -> Result<(), anyhow::Error> {
        let mut sources = self.sources.write().await;

        if let Some(source) = sources.iter_mut().find(|s| s.book_source_url == source_url) {
            // Store cookies in the header field as a JSON object
            let mut headers: serde_json::Value = if let Some(ref h) = source.header {
                serde_json::from_str(h).unwrap_or(serde_json::json!({}))
            } else {
                serde_json::json!({})
            };

            if let Some(obj) = headers.as_object_mut() {
                obj.insert(
                    "Cookie".to_string(),
                    serde_json::Value::String(cookies.to_string()),
                );
            }

            source.header = Some(serde_json::to_string(&headers)?);
            self.storage.write_json(SOURCES_FILE, &*sources).await?;

            tracing::info!("Injected cookies for source: {}", source_url);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Source not found: {}", source_url))
        }
    }

    /// 检测书源有效性
    pub async fn check_source(&self, source_url: &str) -> Result<bool, anyhow::Error> {
        let sources = self.sources.read().await;

        let source = sources
            .iter()
            .find(|s| s.book_source_url == source_url)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Source not found: {}", source_url))?;

        drop(sources);

        // Run check in blocking task since BookSourceEngine is blocking
        let kv_dist = self.kv_store.clone();
        let result = tokio::task::spawn_blocking(move || {
            let engine_source: crate::engine::book_source::BookSource =
                serde_json::from_value(serde_json::to_value(&source)?)?;

            let engine = crate::engine::book_source::BookSourceEngine::new(engine_source, kv_dist)?;
            engine.check_source()
        })
        .await??;

        Ok(result)
    }
}

impl Default for SourceService {
    fn default() -> Self {
        Self::new()
    }
}
