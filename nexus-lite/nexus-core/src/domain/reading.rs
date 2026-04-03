//! 阅读领域 (Reading Domain)
//!
//! 阅读领域是整个系统的核心业务领域，负责处理书籍、章节、阅读进度等相关业务逻辑。
//! 该领域包含以下核心概念：
//! - 书籍(Book): 阅读的核心实体
//! - 章节(Chapter): 书籍的内容组织单元
//! - 阅读进度(ReadingProgress): 用户的阅读状态
//! - 书签(Bookmark): 用户的阅读标记
//! - 阅读会话(ReadingSession): 用户的阅读行为记录

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::domain::*;

fn to_domain_value<T: Serialize>(
    value: &T,
    entity_name: &str,
) -> Result<serde_json::Value, DomainError> {
    serde_json::to_value(value).map_err(|err| {
        DomainError::BusinessLogic(format!("Failed to serialize {}: {}", entity_name, err))
    })
}

/// 书籍实体 - 聚合根
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Book {
    pub id: BookId,
    pub title: String,
    pub author: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub genres: Vec<String>,
    pub tags: Vec<String>,
    pub word_count: u64,
    pub chapter_count: u32,
    pub status: BookStatus,
    pub rating: Option<f32>,
    pub publish_date: Option<DateTime<Utc>>,
    pub update_date: Option<DateTime<Utc>>,
    pub source_url: String,
    pub source_engine: String,
    pub metadata: HashMap<String, serde_json::Value>,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(skip)]
    pub uncommitted_events: Vec<DomainEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct BookId(pub String);

impl fmt::Display for BookId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BookStatus {
    Ongoing,
    Completed,
    Hiatus,
    Cancelled,
}

#[async_trait]
impl Entity for Book {
    type Id = BookId;

    fn id(&self) -> &Self::Id {
        &self.id
    }

    fn is_new(&self) -> bool {
        self.version == 0
    }

    fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }

    fn updated_at(&self) -> DateTime<Utc> {
        self.updated_at
    }
}

#[async_trait]
impl AggregateRoot for Book {
    fn version(&self) -> u64 {
        self.version
    }

    fn increment_version(&mut self) {
        self.version += 1;
        self.updated_at = Utc::now();
    }

    fn uncommitted_events(&self) -> Vec<DomainEvent> {
        self.uncommitted_events.clone()
    }

    fn clear_uncommitted_events(&mut self) {
        self.uncommitted_events.clear();
    }
}

impl Book {
    /// 创建新书籍
    pub fn new(
        id: BookId,
        title: String,
        author: String,
        source_url: String,
        source_engine: String,
    ) -> Self {
        let now = Utc::now();
        let book_id = id.0.clone();
        let title_ev = title.clone();
        let author_ev = author.clone();
        Self {
            id,
            title,
            author,
            description: None,
            cover_url: None,
            genres: Vec::new(),
            tags: Vec::new(),
            word_count: 0,
            chapter_count: 0,
            status: BookStatus::Ongoing,
            rating: None,
            publish_date: None,
            update_date: None,
            source_url,
            source_engine,
            metadata: HashMap::new(),
            version: 0,
            created_at: now,
            updated_at: now,
            uncommitted_events: vec![DomainEvent::Reading(ReadingEvent::BookCreated {
                book_id,
                title: title_ev,
                author: author_ev,
            })],
        }
    }

    /// 更新书籍元数据
    pub fn update_metadata(&mut self, metadata: HashMap<String, serde_json::Value>) {
        self.metadata.extend(metadata);
        self.increment_version();
    }

    /// 标记为已完成
    pub fn mark_completed(&mut self) {
        if !matches!(self.status, BookStatus::Completed) {
            self.status = BookStatus::Completed;
            self.update_date = Some(Utc::now());
            self.increment_version();

            self.uncommitted_events
                .push(DomainEvent::Reading(ReadingEvent::BookCompleted {
                    book_id: self.id.0.clone(),
                }));
        }
    }
}

/// 章节实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: ChapterId,
    pub book_id: BookId,
    pub number: u32,
    pub title: String,
    pub summary: Option<String>,
    pub word_count: u32,
    pub publish_date: Option<DateTime<Utc>>,
    pub update_date: Option<DateTime<Utc>>,
    pub is_vip: bool,
    pub content_hash: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ChapterId(pub String);

impl fmt::Display for ChapterId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[async_trait]
impl Entity for Chapter {
    type Id = ChapterId;

    fn id(&self) -> &Self::Id {
        &self.id
    }

    fn is_new(&self) -> bool {
        self.version == 0
    }

    fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }

    fn updated_at(&self) -> DateTime<Utc> {
        self.updated_at
    }
}

/// 阅读进度值对象
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReadingProgress {
    pub user_id: String,
    pub book_id: BookId,
    pub chapter_id: ChapterId,
    pub position_percent: f32, // 0.0 - 100.0
    pub position_words: u32,
    pub scroll_position: i32,
    pub reading_time_seconds: u64,
    pub last_read_at: DateTime<Utc>,
    pub completed: bool,
    pub notes: Option<String>,
    pub bookmarks: Vec<Bookmark>,
}

impl ValueObject for ReadingProgress {}

/// 书签值对象
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bookmark {
    pub id: String,
    pub position: u32,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl ValueObject for Bookmark {}

/// 阅读会话实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingSession {
    pub id: ReadingSessionId,
    pub user_id: String,
    pub book_id: BookId,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub total_reading_time: u64,
    pub chapters_read: Vec<ChapterId>,
    pub device_info: DeviceInfo,
    pub metadata: HashMap<String, serde_json::Value>,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ReadingSessionId(pub String);

impl std::fmt::Display for ReadingSessionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub device_type: String,
    pub os: String,
    pub browser: Option<String>,
    pub screen_size: Option<String>,
}

#[async_trait]
impl Entity for ReadingSession {
    type Id = ReadingSessionId;

    fn id(&self) -> &Self::Id {
        &self.id
    }

    fn is_new(&self) -> bool {
        self.version == 0
    }

    fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }

    fn updated_at(&self) -> DateTime<Utc> {
        self.updated_at
    }
}

/// 阅读领域事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReadingEvent {
    BookCreated {
        book_id: String,
        title: String,
        author: String,
    },
    BookUpdated {
        book_id: String,
        changes: HashMap<String, serde_json::Value>,
    },
    BookCompleted {
        book_id: String,
    },
    ChapterRead {
        user_id: String,
        book_id: String,
        chapter_id: String,
        reading_time: u64,
    },
    ReadingSessionStarted {
        session_id: String,
        user_id: String,
        book_id: String,
    },
    ReadingSessionEnded {
        session_id: String,
        total_time: u64,
        chapters_read: u32,
    },
    BookmarkAdded {
        user_id: String,
        book_id: String,
        chapter_id: String,
        position: u32,
    },
}

/// 阅读领域命令
#[derive(Debug, Clone)]
pub enum ReadingCommand {
    CreateBook {
        book_id: String,
        title: String,
        author: String,
        source_url: String,
        source_engine: String,
    },
    UpdateBook {
        book_id: String,
        metadata: HashMap<String, serde_json::Value>,
    },
    MarkBookCompleted {
        book_id: String,
    },
    StartReadingSession {
        user_id: String,
        book_id: String,
        device_info: DeviceInfo,
    },
    UpdateReadingProgress {
        user_id: String,
        book_id: String,
        chapter_id: String,
        progress: ReadingProgress,
    },
    AddBookmark {
        user_id: String,
        book_id: String,
        chapter_id: String,
        position: u32,
        note: Option<String>,
    },
    EndReadingSession {
        session_id: String,
    },
}

/// 阅读领域查询
#[derive(Debug, Clone)]
pub enum ReadingQuery {
    GetBook {
        book_id: String,
    },
    GetBooksByAuthor {
        author: String,
        limit: Option<u32>,
    },
    GetReadingProgress {
        user_id: String,
        book_id: String,
    },
    GetUserBookmarks {
        user_id: String,
        book_id: Option<String>,
    },
    GetReadingHistory {
        user_id: String,
        limit: Option<u32>,
    },
    GetReadingStatistics {
        user_id: String,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    },
}

/// 阅读领域 - 聚合所有阅读相关业务逻辑
pub struct ReadingDomain {
    book_repository: Box<dyn BookRepository>,
    #[allow(dead_code)]
    chapter_repository: Box<dyn ChapterRepository>,
    reading_progress_repository: Box<dyn ReadingProgressRepository>,
    reading_session_repository: Box<dyn ReadingSessionRepository>,
    business_rules: Vec<Box<dyn BusinessRuleValidator<Book>>>,
}

impl ReadingDomain {
    pub async fn new() -> Result<Self, DomainError> {
        Ok(Self {
            book_repository: Box::new(InMemoryBookRepository::new()),
            chapter_repository: Box::new(InMemoryChapterRepository::new()),
            reading_progress_repository: Box::new(InMemoryReadingProgressRepository::new()),
            reading_session_repository: Box::new(InMemoryReadingSessionRepository::new()),
            business_rules: vec![
                Box::new(BookTitleNotEmptyRule),
                Box::new(BookAuthorNotEmptyRule),
            ],
        })
    }

    pub async fn handle_command(
        &self,
        command: ReadingCommand,
    ) -> Result<DomainResult, DomainError> {
        match command {
            ReadingCommand::CreateBook {
                book_id,
                title,
                author,
                source_url,
                source_engine,
            } => {
                self.create_book(book_id, title, author, source_url, source_engine)
                    .await
            },
            ReadingCommand::UpdateBook { book_id, metadata } => {
                self.update_book(book_id, metadata).await
            },
            ReadingCommand::MarkBookCompleted { book_id } => {
                self.mark_book_completed(book_id).await
            },
            ReadingCommand::StartReadingSession {
                user_id,
                book_id,
                device_info,
            } => {
                self.start_reading_session(user_id, book_id, device_info)
                    .await
            },
            ReadingCommand::UpdateReadingProgress {
                user_id,
                book_id,
                chapter_id,
                progress,
            } => {
                self.update_reading_progress(user_id, book_id, chapter_id, progress)
                    .await
            },
            ReadingCommand::AddBookmark {
                user_id,
                book_id,
                chapter_id,
                position,
                note,
            } => {
                self.add_bookmark(user_id, book_id, chapter_id, position, note)
                    .await
            },
            ReadingCommand::EndReadingSession { session_id } => {
                self.end_reading_session(session_id).await
            },
        }
    }

    pub async fn handle_query(&self, query: ReadingQuery) -> Result<DomainResult, DomainError> {
        match query {
            ReadingQuery::GetBook { book_id } => self.get_book(book_id).await,
            ReadingQuery::GetBooksByAuthor { author, limit } => {
                self.get_books_by_author(author, limit).await
            },
            ReadingQuery::GetReadingProgress { user_id, book_id } => {
                self.get_reading_progress(user_id, book_id).await
            },
            ReadingQuery::GetUserBookmarks { user_id, book_id } => {
                self.get_user_bookmarks(user_id, book_id).await
            },
            ReadingQuery::GetReadingHistory { user_id, limit } => {
                self.get_reading_history(user_id, limit).await
            },
            ReadingQuery::GetReadingStatistics {
                user_id,
                time_range,
            } => self.get_reading_statistics(user_id, time_range).await,
        }
    }

    async fn create_book(
        &self,
        book_id: String,
        title: String,
        author: String,
        source_url: String,
        source_engine: String,
    ) -> Result<DomainResult, DomainError> {
        let book_id = BookId(book_id);
        let book = Book::new(book_id.clone(), title, author, source_url, source_engine);

        // 验证业务规则
        for rule in &self.business_rules {
            rule.validate(&book, &DomainContext::default()).await?;
        }

        // 保存到仓库
        self.book_repository.save(&book).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&book, "book")?),
            events: book.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn update_book(
        &self,
        book_id: String,
        metadata: HashMap<String, serde_json::Value>,
    ) -> Result<DomainResult, DomainError> {
        let book_id = BookId(book_id);
        let mut book = self
            .book_repository
            .find_by_id(&book_id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("Book {} not found", book_id.0)))?;

        book.update_metadata(metadata);
        self.book_repository.save(&book).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&book, "book")?),
            events: book.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn mark_book_completed(&self, book_id: String) -> Result<DomainResult, DomainError> {
        let book_id = BookId(book_id);
        let mut book = self
            .book_repository
            .find_by_id(&book_id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("Book {} not found", book_id.0)))?;

        book.mark_completed();
        self.book_repository.save(&book).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&book, "book")?),
            events: book.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn start_reading_session(
        &self,
        user_id: String,
        book_id: String,
        device_info: DeviceInfo,
    ) -> Result<DomainResult, DomainError> {
        let session_id = ReadingSessionId(Uuid::new_v4().to_string());
        let book_id = BookId(book_id);
        let session = ReadingSession {
            id: session_id.clone(),
            user_id,
            book_id,
            start_time: Utc::now(),
            end_time: None,
            total_reading_time: 0,
            chapters_read: Vec::new(),
            device_info,
            metadata: HashMap::new(),
            version: 0,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.reading_session_repository.save(&session).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&session, "reading session")?),
            events: vec![DomainEvent::Reading(ReadingEvent::ReadingSessionStarted {
                session_id: session_id.0,
                user_id: session.user_id,
                book_id: session.book_id.0,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn update_reading_progress(
        &self,
        user_id: String,
        book_id: String,
        chapter_id: String,
        progress: ReadingProgress,
    ) -> Result<DomainResult, DomainError> {
        self.reading_progress_repository
            .save_progress(&progress)
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&progress, "reading progress")?),
            events: vec![DomainEvent::Reading(ReadingEvent::ChapterRead {
                user_id,
                book_id,
                chapter_id,
                reading_time: progress.reading_time_seconds,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn add_bookmark(
        &self,
        user_id: String,
        book_id: String,
        chapter_id: String,
        position: u32,
        note: Option<String>,
    ) -> Result<DomainResult, DomainError> {
        let bookmark = Bookmark {
            id: Uuid::new_v4().to_string(),
            position,
            note,
            created_at: Utc::now(),
        };

        // 这里应该更新阅读进度中的书签列表
        // 为了简化，这里直接返回成功

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&bookmark, "bookmark")?),
            events: vec![DomainEvent::Reading(ReadingEvent::BookmarkAdded {
                user_id,
                book_id,
                chapter_id,
                position,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn end_reading_session(&self, session_id: String) -> Result<DomainResult, DomainError> {
        let session_id = ReadingSessionId(session_id);
        let mut session = self
            .reading_session_repository
            .find_by_id(&session_id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("Session {} not found", session_id.0)))?;

        let end_time = Utc::now();
        session.end_time = Some(end_time);
        session.total_reading_time = (end_time - session.start_time).num_seconds().max(0) as u64;

        self.reading_session_repository.save(&session).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&session, "reading session")?),
            events: vec![DomainEvent::Reading(ReadingEvent::ReadingSessionEnded {
                session_id: session_id.0,
                total_time: session.total_reading_time,
                chapters_read: session.chapters_read.len() as u32,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn get_book(&self, book_id: String) -> Result<DomainResult, DomainError> {
        let book_id = BookId(book_id);
        let book = self
            .book_repository
            .find_by_id(&book_id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("Book {} not found", book_id.0)))?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&book, "book")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_books_by_author(
        &self,
        author: String,
        limit: Option<u32>,
    ) -> Result<DomainResult, DomainError> {
        let books = self
            .book_repository
            .find_by_author(&author, limit.unwrap_or(50))
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(books)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_reading_progress(
        &self,
        user_id: String,
        book_id: String,
    ) -> Result<DomainResult, DomainError> {
        let book_id = BookId(book_id);
        let progress = self
            .reading_progress_repository
            .find_by_user_and_book(&user_id, &book_id)
            .await?;

        Ok(DomainResult {
            success: true,
            data: progress
                .map(|p| to_domain_value(&p, "reading progress"))
                .transpose()?,
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_user_bookmarks(
        &self,
        user_id: String,
        book_id: Option<String>,
    ) -> Result<DomainResult, DomainError> {
        let bookmarks = if let Some(book_id) = book_id {
            let book_id = BookId(book_id);
            self.reading_progress_repository
                .find_bookmarks_by_user_and_book(&user_id, &book_id)
                .await?
        } else {
            self.reading_progress_repository
                .find_bookmarks_by_user(&user_id)
                .await?
        };

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(bookmarks)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_reading_history(
        &self,
        user_id: String,
        limit: Option<u32>,
    ) -> Result<DomainResult, DomainError> {
        let sessions = self
            .reading_session_repository
            .find_by_user(&user_id, limit.unwrap_or(20))
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(sessions)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_reading_statistics(
        &self,
        user_id: String,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<DomainResult, DomainError> {
        let stats = self
            .reading_session_repository
            .get_reading_statistics(&user_id, time_range)
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&stats, "reading statistics")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }
}

// ===== 仓库接口 =====

#[async_trait]
pub trait BookRepository: Send + Sync {
    async fn save(&self, book: &Book) -> Result<(), DomainError>;
    async fn find_by_id(&self, id: &BookId) -> Result<Option<Book>, DomainError>;
    async fn find_by_author(&self, author: &str, limit: u32) -> Result<Vec<Book>, DomainError>;
    async fn find_all(&self, limit: u32) -> Result<Vec<Book>, DomainError>;
}

#[async_trait]
pub trait ChapterRepository: Send + Sync {
    async fn save(&self, chapter: &Chapter) -> Result<(), DomainError>;
    async fn find_by_id(&self, id: &ChapterId) -> Result<Option<Chapter>, DomainError>;
    async fn find_by_book(&self, book_id: &BookId) -> Result<Vec<Chapter>, DomainError>;
}

#[async_trait]
pub trait ReadingProgressRepository: Send + Sync {
    async fn save_progress(&self, progress: &ReadingProgress) -> Result<(), DomainError>;
    async fn find_by_user_and_book(
        &self,
        user_id: &str,
        book_id: &BookId,
    ) -> Result<Option<ReadingProgress>, DomainError>;
    async fn find_bookmarks_by_user(&self, user_id: &str) -> Result<Vec<Bookmark>, DomainError>;
    async fn find_bookmarks_by_user_and_book(
        &self,
        user_id: &str,
        book_id: &BookId,
    ) -> Result<Vec<Bookmark>, DomainError>;
}

#[async_trait]
pub trait ReadingSessionRepository: Send + Sync {
    async fn save(&self, session: &ReadingSession) -> Result<(), DomainError>;
    async fn find_by_id(
        &self,
        id: &ReadingSessionId,
    ) -> Result<Option<ReadingSession>, DomainError>;
    async fn find_by_user(
        &self,
        user_id: &str,
        limit: u32,
    ) -> Result<Vec<ReadingSession>, DomainError>;
    async fn get_reading_statistics(
        &self,
        user_id: &str,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<ReadingStatistics, DomainError>;
}

// ===== 内存实现（用于测试和原型）=====

pub struct InMemoryBookRepository {
    books: std::sync::RwLock<HashMap<BookId, Book>>,
}

impl InMemoryBookRepository {
    pub fn new() -> Self {
        Self {
            books: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl BookRepository for InMemoryBookRepository {
    async fn save(&self, book: &Book) -> Result<(), DomainError> {
        let mut books = self.books.write().unwrap();
        books.insert(book.id.clone(), book.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &BookId) -> Result<Option<Book>, DomainError> {
        let books = self.books.read().unwrap();
        Ok(books.get(id).cloned())
    }

    async fn find_by_author(&self, author: &str, limit: u32) -> Result<Vec<Book>, DomainError> {
        let books = self.books.read().unwrap();
        let filtered: Vec<Book> = books
            .values()
            .filter(|b| b.author == author)
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn find_all(&self, limit: u32) -> Result<Vec<Book>, DomainError> {
        let books = self.books.read().unwrap();
        let all: Vec<Book> = books.values().take(limit as usize).cloned().collect();
        Ok(all)
    }
}

// 其他内存实现类似，这里省略...

pub struct InMemoryChapterRepository {
    chapters: std::sync::RwLock<HashMap<ChapterId, Chapter>>,
}

impl InMemoryChapterRepository {
    pub fn new() -> Self {
        Self {
            chapters: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl ChapterRepository for InMemoryChapterRepository {
    async fn save(&self, chapter: &Chapter) -> Result<(), DomainError> {
        let mut chapters = self.chapters.write().unwrap();
        chapters.insert(chapter.id.clone(), chapter.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &ChapterId) -> Result<Option<Chapter>, DomainError> {
        let chapters = self.chapters.read().unwrap();
        Ok(chapters.get(id).cloned())
    }

    async fn find_by_book(&self, book_id: &BookId) -> Result<Vec<Chapter>, DomainError> {
        let chapters = self.chapters.read().unwrap();
        let filtered: Vec<Chapter> = chapters
            .values()
            .filter(|c| &c.book_id == book_id)
            .cloned()
            .collect();
        Ok(filtered)
    }
}

pub struct InMemoryReadingProgressRepository {
    progress: std::sync::RwLock<HashMap<(String, BookId), ReadingProgress>>,
}

impl InMemoryReadingProgressRepository {
    pub fn new() -> Self {
        Self {
            progress: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl ReadingProgressRepository for InMemoryReadingProgressRepository {
    async fn save_progress(&self, progress: &ReadingProgress) -> Result<(), DomainError> {
        let mut progress_store = self.progress.write().unwrap();
        let key = (progress.user_id.clone(), progress.book_id.clone());
        progress_store.insert(key, progress.clone());
        Ok(())
    }

    async fn find_by_user_and_book(
        &self,
        user_id: &str,
        book_id: &BookId,
    ) -> Result<Option<ReadingProgress>, DomainError> {
        let progress_store = self.progress.read().unwrap();
        let key = (user_id.to_string(), book_id.clone());
        Ok(progress_store.get(&key).cloned())
    }

    async fn find_bookmarks_by_user(&self, user_id: &str) -> Result<Vec<Bookmark>, DomainError> {
        let progress_store = self.progress.read().unwrap();
        let bookmarks: Vec<Bookmark> = progress_store
            .values()
            .filter(|p| p.user_id == user_id)
            .flat_map(|p| p.bookmarks.clone())
            .collect();
        Ok(bookmarks)
    }

    async fn find_bookmarks_by_user_and_book(
        &self,
        user_id: &str,
        book_id: &BookId,
    ) -> Result<Vec<Bookmark>, DomainError> {
        let progress_store = self.progress.read().unwrap();
        let key = (user_id.to_string(), book_id.clone());
        if let Some(progress) = progress_store.get(&key) {
            Ok(progress.bookmarks.clone())
        } else {
            Ok(Vec::new())
        }
    }
}

pub struct InMemoryReadingSessionRepository {
    sessions: std::sync::RwLock<HashMap<ReadingSessionId, ReadingSession>>,
}

impl InMemoryReadingSessionRepository {
    pub fn new() -> Self {
        Self {
            sessions: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl ReadingSessionRepository for InMemoryReadingSessionRepository {
    async fn save(&self, session: &ReadingSession) -> Result<(), DomainError> {
        let mut sessions = self.sessions.write().unwrap();
        sessions.insert(session.id.clone(), session.clone());
        Ok(())
    }

    async fn find_by_id(
        &self,
        id: &ReadingSessionId,
    ) -> Result<Option<ReadingSession>, DomainError> {
        let sessions = self.sessions.read().unwrap();
        Ok(sessions.get(id).cloned())
    }

    async fn find_by_user(
        &self,
        user_id: &str,
        limit: u32,
    ) -> Result<Vec<ReadingSession>, DomainError> {
        let sessions = self.sessions.read().unwrap();
        let filtered: Vec<ReadingSession> = sessions
            .values()
            .filter(|s| s.user_id == user_id)
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn get_reading_statistics(
        &self,
        user_id: &str,
        _time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<ReadingStatistics, DomainError> {
        let sessions = self.sessions.read().unwrap();
        let user_sessions: Vec<&ReadingSession> =
            sessions.values().filter(|s| s.user_id == user_id).collect();

        let total_sessions = user_sessions.len() as u64;
        let total_reading_time: u64 = user_sessions.iter().map(|s| s.total_reading_time).sum();
        let total_chapters: u64 = user_sessions
            .iter()
            .map(|s| s.chapters_read.len() as u64)
            .sum();

        Ok(ReadingStatistics {
            total_sessions,
            total_reading_time,
            total_chapters,
            average_session_time: if total_sessions > 0 {
                total_reading_time / total_sessions
            } else {
                0
            },
        })
    }
}

// ===== 业务规则 =====

pub struct BookTitleNotEmptyRule;

#[async_trait]
impl BusinessRuleValidator<Book> for BookTitleNotEmptyRule {
    fn rule_name(&self) -> &str {
        "book_title_not_empty"
    }

    async fn validate(&self, entity: &Book, _context: &DomainContext) -> Result<(), DomainError> {
        if entity.title.trim().is_empty() {
            return Err(DomainError::Validation("Book title cannot be empty".to_string()));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that book title is not empty"
    }
}

pub struct BookAuthorNotEmptyRule;

#[async_trait]
impl BusinessRuleValidator<Book> for BookAuthorNotEmptyRule {
    fn rule_name(&self) -> &str {
        "book_author_not_empty"
    }

    async fn validate(&self, entity: &Book, _context: &DomainContext) -> Result<(), DomainError> {
        if entity.author.trim().is_empty() {
            return Err(DomainError::Validation("Book author cannot be empty".to_string()));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that book author is not empty"
    }
}

// ===== 数据传输对象 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingStatistics {
    pub total_sessions: u64,
    pub total_reading_time: u64,
    pub total_chapters: u64,
    pub average_session_time: u64,
}
