use axum::response::sse::Event;
use futures::stream::Stream;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::models::{BookSource, BookSourceFull};
use crate::storage::FileStorage;

/// 书源存储文件名
const SOURCES_FILE: &str = "bookSources.json";

pub struct SourceService {
    storage: FileStorage,
    sources: Arc<RwLock<Vec<BookSourceFull>>>,
}

impl SourceService {
    pub fn new() -> Self {
        Self {
            storage: FileStorage::default(),
            sources: Arc::new(RwLock::new(Vec::new())),
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
        sources.iter().find(|s| s.book_source_url == source_url).cloned()
    }

    /// 获取可用书源
    pub async fn get_available_sources(&self, _book_url: &str, _refresh: bool) -> Result<Vec<BookSource>, anyhow::Error> {
        // TODO: 实现书源搜索匹配
        Ok(vec![])
    }

    /// 切换书源
    pub async fn set_book_source(&self, _book_url: &str, _new_url: &str, _source_url: &str) -> Result<(), anyhow::Error> {
        // TODO: 实现书源切换
        Ok(())
    }

    /// 搜索书源 (SSE)
    pub fn search_source_sse(&self, _url: String, _group: Option<String>, _concurrent: i32) -> impl Stream<Item = Result<Event, Infallible>> {
        async_stream::stream! {
            // TODO: 实现书源搜索
            yield Ok(Event::default().data(r#"{"type":"end"}"#));
        }
    }

    /// 保存书源
    pub async fn save_source(&self, source_json: &str) -> Result<(), anyhow::Error> {
        let source: BookSourceFull = serde_json::from_str(source_json)?;
        let mut sources = self.sources.write().await;
        
        // 更新或添加
        if let Some(pos) = sources.iter().position(|s| s.book_source_url == source.book_source_url) {
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
            if let Some(pos) = sources.iter().position(|s| s.book_source_url == source.book_source_url) {
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
}

impl Default for SourceService {
    fn default() -> Self {
        Self::new()
    }
}
