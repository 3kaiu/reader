use axum::response::sse::Event;
use futures::stream::Stream;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::models::{Book, Chapter, SearchResult, BookSourceFull};
use crate::storage::FileStorage;
use crate::engine::AnalyzeRule;

/// 书架存储文件名
const BOOKSHELF_FILE: &str = "bookshelf.json";

pub struct BookService {
    storage: FileStorage,
    bookshelf: Arc<RwLock<Vec<Book>>>,
}

impl BookService {
    pub fn new() -> Self {
        Self {
            storage: FileStorage::default(),
            bookshelf: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// 初始化加载书架数据
    pub async fn init(&self) -> anyhow::Result<()> {
        let books: Vec<Book> = self.storage.read_json_or_default(BOOKSHELF_FILE).await;
        let mut shelf = self.bookshelf.write().await;
        *shelf = books;
        Ok(())
    }

    /// 获取书架列表
    pub async fn get_bookshelf(&self, _refresh: bool) -> Result<Vec<Book>, anyhow::Error> {
        // 如果书架为空，尝试从文件加载
        {
            let shelf = self.bookshelf.read().await;
            if !shelf.is_empty() {
                return Ok(shelf.clone());
            }
        }
        
        // 从文件加载
        let books: Vec<Book> = self.storage.read_json_or_default(BOOKSHELF_FILE).await;
        {
            let mut shelf = self.bookshelf.write().await;
            *shelf = books.clone();
        }
        Ok(books)
    }

    /// 获取章节列表
    pub async fn get_chapter_list(&self, book_url: &str, refresh: bool) -> Result<Vec<Chapter>, anyhow::Error> {
        // 从缓存读取
        let cache_key = format!("chapters/{}.json", Self::url_to_key(book_url));
        
        if !refresh {
            if let Ok(content) = self.storage.read_cache(&cache_key).await {
                if let Ok(chapters) = serde_json::from_str::<Vec<Chapter>>(&content) {
                    return Ok(chapters);
                }
            }
        }
        
        // TODO: 从书源获取章节列表
        // 需要实现网络请求和规则解析
        Ok(vec![])
    }

    /// 获取章节内容
    pub async fn get_book_content(&self, book_url: &str, index: i32) -> Result<String, anyhow::Error> {
        // 从缓存读取
        let cache_key = format!("content/{}/{}.txt", Self::url_to_key(book_url), index);
        
        if let Ok(content) = self.storage.read_cache(&cache_key).await {
            return Ok(content);
        }
        
        // TODO: 从书源获取内容
        Ok(String::new())
    }

    /// 获取书籍信息
    pub async fn get_book_info(&self, book_url: &str) -> Result<Book, anyhow::Error> {
        let shelf = self.bookshelf.read().await;
        shelf.iter()
            .find(|b| b.book_url == book_url)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Book not found"))
    }

    /// 搜索书籍
    pub async fn search(&self, _key: &str) -> Result<Vec<SearchResult>, anyhow::Error> {
        // TODO: 实现多书源搜索
        Ok(vec![])
    }

    /// 多书源搜索 (SSE)
    pub fn search_multi_sse(&self, _key: String) -> impl Stream<Item = Result<Event, Infallible>> {
        async_stream::stream! {
            // TODO: 实现多书源并发搜索
            yield Ok(Event::default().data(r#"{"type":"end"}"#));
        }
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
