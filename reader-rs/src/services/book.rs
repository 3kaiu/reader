use axum::response::sse::Event;
use futures::stream::Stream;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::models::{Book, Chapter, SearchResult, BookSourceFull};
use crate::storage::FileStorage;
use crate::engine::book_source::{BookSource, BookSourceEngine};

/// 书架存储文件名
const BOOKSHELF_FILE: &str = "bookshelf.json";
const SOURCES_FILE: &str = "bookSources.json";

#[derive(Clone)]
pub struct BookService {
    storage: FileStorage,
    bookshelf: Arc<RwLock<Vec<Book>>>,
    sources: Arc<RwLock<Vec<BookSourceFull>>>,
}

impl BookService {
    pub fn new() -> Self {
        Self {
            storage: FileStorage::default(),
            bookshelf: Arc::new(RwLock::new(Vec::new())),
            sources: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// 初始化加载数据
    pub async fn init(&self) -> anyhow::Result<()> {
        let books: Vec<Book> = self.storage.read_json_or_default(BOOKSHELF_FILE).await;
        let sources: Vec<BookSourceFull> = self.storage.read_json_or_default(SOURCES_FILE).await;
        
        let mut shelf = self.bookshelf.write().await;
        *shelf = books;
        
        let mut src = self.sources.write().await;
        *src = sources;
        
        Ok(())
    }

    /// 获取书架列表
    pub async fn get_bookshelf(&self, _refresh: bool) -> Result<Vec<Book>, anyhow::Error> {
        {
            let shelf = self.bookshelf.read().await;
            if !shelf.is_empty() {
                return Ok(shelf.clone());
            }
        }
        
        let books: Vec<Book> = self.storage.read_json_or_default(BOOKSHELF_FILE).await;
        {
            let mut shelf = self.bookshelf.write().await;
            *shelf = books.clone();
        }
        Ok(books)
    }

    /// 获取章节列表
    pub async fn get_chapter_list(&self, book_url: &str, origin: Option<&str>, refresh: bool) -> Result<Vec<Chapter>, anyhow::Error> {
        let cache_key = format!("chapters/{}.json", Self::url_to_key(book_url));
        
        // 尝试从缓存读取
        if !refresh {
            if let Ok(content) = self.storage.read_cache(&cache_key).await {
                if let Ok(chapters) = serde_json::from_str::<Vec<Chapter>>(&content) {
                    return Ok(chapters);
                }
            }
        }
        
        // 获取书源：优先使用 origin 参数，否则从 book info 中获取
        let source = if let Some(origin_url) = origin {
            self.get_source(origin_url).await?
        } else {
            let book = self.get_book_info(book_url, None).await?;
            self.get_source(&book.origin.unwrap_or_default()).await?
        };
        
        // Step 1: Get book info to resolve toc_url
        // The toc_url template may reference book info fields like {{$.resourceID}}
        let book_info = self.get_book_info(book_url, origin).await.ok();
        let toc_url = book_info
            .as_ref()
            .and_then(|b| b.toc_url.clone())
            .unwrap_or_else(|| book_url.to_string());
        
        tracing::debug!("Fetching chapters from toc_url: {} (book_url: {})", toc_url, book_url);
        
        // 使用 BookSourceEngine 获取章节
        let source_json = serde_json::to_string(&source)?;
        let toc_url_clone = toc_url.clone();
        let chapters = tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<Chapter>> {
            let engine_source: BookSource = serde_json::from_str(&source_json)?;
            let engine = BookSourceEngine::new(engine_source)?;
            let engine_chapters = engine.get_chapters(&toc_url_clone)?;
            
            Ok(engine_chapters.into_iter().enumerate().map(|(i, c)| Chapter {
                title: c.title,
                url: c.url,
                index: i as i32,
            }).collect())
        }).await??;
        
        // 缓存
        if !chapters.is_empty() {
            let content = serde_json::to_string(&chapters)?;
            let _ = self.storage.write_cache(&cache_key, &content).await;
        }
        
        Ok(chapters)
    }

    /// 获取章节内容
    pub async fn get_book_content(&self, book_url: &str, index: i32) -> Result<String, anyhow::Error> {
        let cache_key = format!("content/{}/{}.txt", Self::url_to_key(book_url), index);
        
        // 尝试从缓存读取
        if let Ok(content) = self.storage.read_cache(&cache_key).await {
            return Ok(content);
        }
        
        // 获取章节列表
        let chapters = self.get_chapter_list(book_url, None, false).await?;
        let chapter = chapters.get(index as usize)
            .ok_or_else(|| anyhow::anyhow!("Chapter not found"))?;
        
        // 获取书源
        let book = self.get_book_info(book_url, None).await?;
        let source = self.get_source(&book.origin.unwrap_or_default()).await?;
        
        // 使用 BookSourceEngine 获取内容
        let source_json = serde_json::to_string(&source)?;
        let chapter_url = chapter.url.clone();
        let content = tokio::task::spawn_blocking(move || -> anyhow::Result<String> {
            let engine_source: BookSource = serde_json::from_str(&source_json)?;
            let engine = BookSourceEngine::new(engine_source)?;
            engine.get_content(&chapter_url)
        }).await??;
        
        // 缓存
        if !content.is_empty() {
            let _ = self.storage.write_cache(&cache_key, &content).await;
        }
        
        Ok(content)
    }

    /// 获取书籍信息
    pub async fn get_book_info(&self, book_url: &str, origin: Option<&str>) -> Result<Book, anyhow::Error> {
        let shelf = self.bookshelf.read().await;
        if let Some(book) = shelf.iter().find(|b| b.book_url == book_url) {
            return Ok(book.clone());
        }
        drop(shelf);
        
        // 如果不在书架上，尝试从外部加载 (例如搜索结果详情)
        self.get_book_info_from_web(book_url, origin).await
    }

    /// 从网络获取书籍详细信息
    async fn get_book_info_from_web(&self, book_url: &str, origin: Option<&str>) -> Result<Book, anyhow::Error> {
        use crate::engine::book_source::{BookSourceEngine, BookSource};
        
        // 尝试用 origin 找到匹配源，否则用 URL 猜测
        let source = if let Some(origin_url) = origin {
            self.get_source(origin_url).await?
        } else {
            self.get_source_by_url(book_url).await?
        };
        let source_json = serde_json::to_string(&source)?;
        
        let book_url_str = book_url.to_string();
        let result = tokio::task::spawn_blocking(move || {
            let engine_source: BookSource = serde_json::from_str(&source_json)?;
            let engine = BookSourceEngine::new(engine_source)?;
            engine.get_book_info(&book_url_str)
        }).await?;
        
        match result {
            Ok(item) => {
                Ok(Book {
                    book_url: book_url.to_string(),
                    name: item.name,
                    author: item.author,
                    cover_url: item.cover_url,
                    intro: item.intro,
                    origin: Some(source.book_source_url.clone()),
                    origin_name: Some(source.book_source_name.clone()),
                    toc_url: item.toc_url.or(Some(book_url.to_string())),
                    ..Default::default()
                })
            }
            Err(e) => Err(e),
        }
    }

    /// 根据 URL 找到匹配的书源
    async fn get_source_by_url(&self, book_url: &str) -> Result<BookSourceFull, anyhow::Error> {
        let sources = self.sources.read().await;
        
        tracing::debug!("Searching source for URL: {}", book_url);
        
        // 1. 尝试完全匹配 bookSourceUrl (可能是 URL 前缀，也可能是像 "DQuestQBall" 这样的 ID)
        if let Some(source) = sources.iter().find(|s| book_url.starts_with(&s.book_source_url) || s.book_source_url == book_url) {
            tracing::debug!("Found source by prefix/exact match: {}", source.book_source_name);
            return Ok(source.clone());
        }
        
        // 2. 尝试匹配域名 (处理子域名情况)
        if let Some(pos) = book_url.find("://") {
            let start = pos + 3;
            let end = book_url[start..].find('/').unwrap_or(book_url.len() - start);
            let full_host = &book_url[start..start + end];
            
            // 提取主域名 (例如 bookshelf.html5.qq.com -> qq.com)
            let parts: Vec<&str> = full_host.split('.').collect();
            if parts.len() >= 2 {
                let domain = parts[parts.len()-2..].join(".");
                if let Some(source) = sources.iter().find(|s| s.book_source_url.contains(&domain)) {
                    tracing::debug!("Found source by domain match ({}): {}", domain, source.book_source_name);
                    return Ok(source.clone());
                }
            }
        }
        
        // 3. 最后尝试关键字模糊匹配 (针对一些特殊的书源)
        if book_url.contains("qq.com") {
             if let Some(source) = sources.iter().find(|s| s.book_source_url == "DQuestQBall" || s.book_source_url.contains("qq.com")) {
                tracing::debug!("Found source by qq.com fallback: {}", source.book_source_name);
                return Ok(source.clone());
            }
        }
        
        tracing::error!("Source not found for URL: {}", book_url);
        Err(anyhow::anyhow!("Source not found for URL: {}", book_url))
    }

    /// 搜索书籍 (使用新引擎)
    pub async fn search(&self, key: &str) -> Result<Vec<SearchResult>, anyhow::Error> {
        use crate::engine::book_source::{BookSourceEngine, BookSource};
        
        let sources = self.sources.read().await;
        
        for source in sources.iter().filter(|s| s.enabled && !s.search_url.is_empty()) {
            // 使用 JSON 序列化转换书源格式 (避免手动字段映射)
            let source_json = serde_json::to_string(source)?;
            
            // 在阻塞线程中运行新引擎
            let key = key.to_string();
            let source_name = source.book_source_name.clone();
            let result = tokio::task::spawn_blocking(move || {
                let engine_source: BookSource = serde_json::from_str(&source_json)?;
                match BookSourceEngine::new(engine_source) {
                    Ok(engine) => engine.search(&key, 1),
                    Err(e) => Err(e),
                }
            }).await;
            
            match result {
                Ok(Ok(books)) if !books.is_empty() => {
                    // 转换为 SearchResult 格式
                    let results: Vec<SearchResult> = books.into_iter()
                        .map(|b| SearchResult {
                            book_url: b.book_url,
                            name: b.name,
                            author: b.author,
                            cover_url: b.cover_url,
                            intro: b.intro,
                            kind: b.kind,
                            word_count: b.word_count,
                            latest_chapter_title: b.last_chapter,
                            update_time: b.update_time,
                            origin_name: Some(source_name.clone()),
                            origin: Some(source.book_source_url.clone()),
                        })
                        .collect();
                    return Ok(results);
                }
                Ok(Err(e)) => tracing::warn!("search failed for {}: {}", source.book_source_name, e),
                Err(e) => tracing::warn!("search spawn error: {}", e),
                _ => continue,
            }
        }
        
        Ok(vec![])
    }

    /// 多书源搜索 (SSE)
    pub fn search_multi_sse(&self, key: String, concurrent_count: usize) -> impl Stream<Item = Result<Event, Infallible>> {
        use crate::engine::book_source::{BookSourceEngine, BookSource};

        let sources = self.sources.clone();
        let storage = self.storage.clone();
        
        async_stream::stream! {
            // 确保书源已加载
            let mut sources_guard = sources.write().await;
            if sources_guard.is_empty() {
                tracing::info!("Loading sources from file...");
                let loaded: Vec<BookSourceFull> = storage.read_json_or_default(SOURCES_FILE).await;
                tracing::info!("Loaded {} sources", loaded.len());
                *sources_guard = loaded;
            }
            
            let enabled_sources: Vec<_> = sources_guard.iter()
                .filter(|s| s.enabled && !s.search_url.is_empty())
                .cloned()
                .collect();
            drop(sources_guard);
            
            tracing::info!("Searching with {} sources for: {}", enabled_sources.len(), key);
            
            if enabled_sources.is_empty() {
                tracing::warn!("No enabled sources with search_url found!");
            }
            
            // 并发搜索所有书源
            // 使用 Semaphore 限制最大并发数
            let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(concurrent_count));
            
            // 使用 FuturesUnordered 来无序处理结果 (谁先完成谁先返回)
            use futures::stream::FuturesUnordered;
            use futures::StreamExt;
            
            let mut tasks = FuturesUnordered::new();
            
            for source in &enabled_sources {
                let key = key.clone();
                let source_name = source.book_source_name.clone();
                let source_name_closure = source_name.clone(); // Clone for closure
                let source_url = source.book_source_url.clone();
                let source_json = match serde_json::to_string(&source) {
                    Ok(json) => json,
                    Err(e) => {
                        tracing::error!("Failed to serialize source {}: {}", source_name, e);
                        continue;
                    }
                };
                
                let semaphore = semaphore.clone(); // Clone semaphore for task
                
                tasks.push(tokio::task::spawn(async move {
                    // 在任务内部获取 permit，这样循环不会阻塞
                    let permit = semaphore.acquire_owned().await;
                    
                    // 确保 permit 在任务结束前一直被持有
                    let _permit = permit;
                    
                    // 使用 timeout 包装阻塞任务
                    let result = tokio::time::timeout(
                        std::time::Duration::from_secs(15),
                        tokio::task::spawn_blocking(move || {
                            let engine_source: BookSource = match serde_json::from_str(&source_json) {
                                Ok(s) => s,
                                Err(e) => return Err(anyhow::anyhow!("Failed to parse source: {}", e)),
                            };

                            match BookSourceEngine::new(engine_source) {
                                Ok(engine) => {
                                    tracing::debug!("Searching source: {}", source_name_closure);
                                    engine.search(&key, 1)
                                },
                                Err(e) => Err(anyhow::anyhow!("Failed to create engine: {}", e)),
                            }
                        })
                    ).await;
                    
                    let final_result = match result {
                        Ok(Ok(engine_res)) => engine_res, // success
                        Ok(Err(e)) => Err(anyhow::anyhow!("Task join error: {}", e)), // join error
                        Err(_) => Err(anyhow::anyhow!("Search timed out")), // timeout
                    };
                    
                    (source_name, source_url, final_result)
                }));
            }

            // 处理结果流
            let mut completed_count = 0;
            let total_count = enabled_sources.len();

            while let Some(task_result) = tasks.next().await {
                completed_count += 1;
                
                // 发送进度事件
                let progress_json = serde_json::json!({
                    "type": "progress",
                    "current": completed_count,
                    "total": total_count
                }).to_string();
                yield Ok(Event::default().data(progress_json));

                // task_result 是 JOIN 句柄的结果 (Result<..., JoinError>)
                if let Ok((source_name, source_url, search_result)) = task_result {
                    match search_result {
                        Ok(books) => {
                            tracing::info!("Found {} results from {}", books.len(), source_name);
                            for mut book in books {
                                // 补充来源信息
                                book.kind = Some(source_name.clone());
                                
                                // 转换为 SearchResult 格式
                                let result = SearchResult {
                                    book_url: book.book_url,
                                    name: book.name,
                                    author: book.author,
                                    cover_url: book.cover_url,
                                    intro: book.intro,
                                    kind: book.kind,
                                    word_count: book.word_count,
                                    latest_chapter_title: book.last_chapter,
                                    update_time: book.update_time,
                                    origin_name: Some(source_name.clone()),
                                    origin: Some(source_url.clone()),
                                };

                                // 包装在 data 字段中，以匹配前端预期: { "data": [ result ] }
                                let wrapper = serde_json::json!({
                                    "data": [result]
                                });

                                match serde_json::to_string(&wrapper) {
                                    Ok(json) => yield Ok(Event::default().data(json)),
                                    Err(e) => tracing::error!("Failed to serialize book: {}", e),
                                }
                            }
                        }
                        Err(e) => {
                             // 只有在非超时和其他特定错误时才打印警告，减少噪音
                             if !e.to_string().contains("timed out") && !e.to_string().contains("sending request") {
                                tracing::warn!("Search failed for {}: {}", source_name, e);
                             }
                        }
                    }
                }
            }
            
            yield Ok(Event::default().data(r#"{"type":"end"}"#));
        }
    }

    /// 获取书源
    async fn get_source(&self, source_url: &str) -> Result<BookSourceFull, anyhow::Error> {
        // Lazy load sources if cache is empty
        {
            let sources = self.sources.read().await;
            if sources.is_empty() {
                drop(sources);
                let loaded: Vec<BookSourceFull> = self.storage.read_json_or_default(SOURCES_FILE).await;
                tracing::info!("Lazy loaded {} sources for lookup", loaded.len());
                let mut sources = self.sources.write().await;
                *sources = loaded;
            }
        }
        
        let sources = self.sources.read().await;
        sources.iter()
            .find(|s| s.book_source_url == source_url)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Source not found: {}", source_url))
    }

    /// 保存书籍到书架
    pub async fn save_book(&self, book: Book) -> Result<Book, anyhow::Error> {
        let mut shelf = self.bookshelf.write().await;
        
        // 检查是否已存在
        if let Some(pos) = shelf.iter().position(|b| b.book_url == book.book_url) {
            shelf[pos] = book.clone();
        } else {
            shelf.push(book.clone());
        }
        
        // 保存到文件
        self.storage.write_json(BOOKSHELF_FILE, &*shelf).await?;
        Ok(book)
    }

    /// 删除书籍
    pub async fn delete_book(&self, book_url: &str) -> Result<(), anyhow::Error> {
        let mut shelf = self.bookshelf.write().await;
        shelf.retain(|b| b.book_url != book_url);
        self.storage.write_json(BOOKSHELF_FILE, &*shelf).await?;
        Ok(())
    }

    /// 批量删除书籍
    pub async fn delete_books(&self, books: Vec<Book>) -> Result<(), anyhow::Error> {
        let urls: Vec<&str> = books.iter().map(|b| b.book_url.as_str()).collect();
        let mut shelf = self.bookshelf.write().await;
        shelf.retain(|b| !urls.contains(&b.book_url.as_str()));
        self.storage.write_json(BOOKSHELF_FILE, &*shelf).await?;
        Ok(())
    }

    /// 保存阅读进度
    pub async fn save_progress(&self, book_url: &str, index: i32) -> Result<(), anyhow::Error> {
        let mut shelf = self.bookshelf.write().await;
        
        if let Some(book) = shelf.iter_mut().find(|b| b.book_url == book_url) {
            book.dur_chapter_index = Some(index);
            book.dur_chapter_time = Some(chrono::Utc::now().timestamp_millis());
        }
        
        self.storage.write_json(BOOKSHELF_FILE, &*shelf).await?;
        Ok(())
    }

    /// 批量加入分组
    pub async fn add_books_to_group(&self, group_id: i64, books: Vec<Book>) -> Result<(), anyhow::Error> {
        let urls: Vec<&str> = books.iter().map(|b| b.book_url.as_str()).collect();
        let mut shelf = self.bookshelf.write().await;
        
        for book in shelf.iter_mut() {
            if urls.contains(&book.book_url.as_str()) {
                book.group = Some(group_id);
            }
        }
        
        self.storage.write_json(BOOKSHELF_FILE, &*shelf).await?;
        Ok(())
    }

    /// 批量移出分组
    pub async fn remove_books_from_group(&self, _group_id: i64, books: Vec<Book>) -> Result<(), anyhow::Error> {
        let urls: Vec<&str> = books.iter().map(|b| b.book_url.as_str()).collect();
        let mut shelf = self.bookshelf.write().await;
        
        for book in shelf.iter_mut() {
            if urls.contains(&book.book_url.as_str()) {
                book.group = None;
            }
        }
        
        self.storage.write_json(BOOKSHELF_FILE, &*shelf).await?;
        Ok(())
    }

    /// URL 转缓存 key (移除特殊字符)
    fn url_to_key(url: &str) -> String {
        url.chars()
            .map(|c| if c.is_alphanumeric() { c } else { '_' })
            .collect()
    }
}

impl Default for BookService {
    fn default() -> Self {
        Self::new()
    }
}
