//! 搜索领域 (Search Domain)
//!
//! 搜索领域负责处理书籍搜索、发现、推荐等相关业务逻辑。
//! 该领域包含以下核心概念：
//! - 搜索查询(SearchQuery): 用户的搜索请求
//! - 搜索结果(SearchResult): 搜索返回的结果
//! - 推荐引擎(RecommendationEngine): 个性化推荐
//! - 搜索历史(SearchHistory): 用户搜索行为记录

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{RwLock, RwLockReadGuard, RwLockWriteGuard};
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

fn read_lock<'a, T>(
    lock: &'a RwLock<T>,
    lock_name: &str,
) -> Result<RwLockReadGuard<'a, T>, DomainError> {
    lock.read()
        .map_err(|_| DomainError::BusinessLogic(format!("{} lock poisoned during read", lock_name)))
}

fn write_lock<'a, T>(
    lock: &'a RwLock<T>,
    lock_name: &str,
) -> Result<RwLockWriteGuard<'a, T>, DomainError> {
    lock.write().map_err(|_| {
        DomainError::BusinessLogic(format!("{} lock poisoned during write", lock_name))
    })
}

/// 搜索查询值对象
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchQuery {
    pub keywords: Vec<String>,
    pub filters: SearchFilters,
    pub sort_by: SearchSort,
    pub page: u32,
    pub page_size: u32,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
}

impl ValueObject for SearchQuery {}

/// 搜索过滤条件值对象
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchFilters {
    pub author: Option<String>,
    pub genre: Option<String>,
    pub status: Option<BookStatus>,
    pub rating_min: Option<f32>,
    pub rating_max: Option<f32>,
    pub word_count_min: Option<u64>,
    pub word_count_max: Option<u64>,
    pub publish_date_from: Option<DateTime<Utc>>,
    pub publish_date_to: Option<DateTime<Utc>>,
    pub tags: Vec<String>,
}

impl ValueObject for SearchFilters {}

/// 搜索排序方式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SearchSort {
    Relevance,
    Popularity,
    Rating,
    UpdateDate,
    PublishDate,
    Title,
    Author,
}

/// 搜索结果实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: SearchResultId,
    pub query: SearchQuery,
    pub items: Vec<SearchResultItem>,
    pub total_count: u64,
    pub execution_time_ms: u64,
    pub search_timestamp: DateTime<Utc>,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SearchResultId(pub String);

/// 搜索结果项值对象
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchResultItem {
    pub book_id: String,
    pub title: String,
    pub author: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub genres: Vec<String>,
    pub rating: Option<f32>,
    pub status: BookStatus,
    pub word_count: u64,
    pub relevance_score: f32,
    pub matched_keywords: Vec<String>,
    pub highlights: Vec<String>,
}

impl ValueObject for SearchResultItem {}

/// 搜索历史实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHistory {
    pub id: SearchHistoryId,
    pub user_id: String,
    pub query: SearchQuery,
    pub result_count: u64,
    pub selected_result: Option<String>,
    pub execution_time_ms: u64,
    pub timestamp: DateTime<Utc>,
    pub device_info: DeviceInfo,
    pub metadata: HashMap<String, serde_json::Value>,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SearchHistoryId(pub String);

impl std::fmt::Display for SearchHistoryId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[async_trait]
impl Entity for SearchHistory {
    type Id = SearchHistoryId;

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

/// 推荐引擎实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendationEngine {
    pub id: RecommendationEngineId,
    pub name: String,
    pub algorithm: RecommendationAlgorithm,
    pub configuration: HashMap<String, serde_json::Value>,
    pub is_active: bool,
    pub performance_metrics: RecommendationMetrics,
    pub last_trained_at: Option<DateTime<Utc>>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RecommendationEngineId(pub String);

impl std::fmt::Display for RecommendationEngineId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RecommendationAlgorithm {
    CollaborativeFiltering,
    ContentBased,
    Hybrid,
    PopularityBased,
    Trending,
    Personalized,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendationMetrics {
    pub total_recommendations: u64,
    pub click_through_rate: f32,
    pub conversion_rate: f32,
    pub average_rating: f32,
    pub user_satisfaction_score: f32,
}

#[async_trait]
impl Entity for RecommendationEngine {
    type Id = RecommendationEngineId;

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

/// 推荐项目值对象
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecommendationItem {
    pub book_id: String,
    pub score: f32,
    pub reason: RecommendationReason,
    pub algorithm_used: RecommendationAlgorithm,
    pub confidence: f32,
    pub features: Vec<String>,
}

impl ValueObject for RecommendationItem {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RecommendationReason {
    SimilarUsers,
    SimilarBooks,
    AuthorPreference,
    GenrePreference,
    Trending,
    Popular,
    RecentlyRead,
    Custom(String),
}

/// 搜索领域事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SearchEvent {
    SearchExecuted {
        user_id: Option<String>,
        query_keywords: Vec<String>,
        result_count: u64,
        execution_time_ms: u64,
    },
    SearchResultClicked {
        user_id: Option<String>,
        search_id: String,
        book_id: String,
        position: u32,
    },
    RecommendationGenerated {
        user_id: String,
        algorithm: String,
        item_count: u32,
        execution_time_ms: u64,
    },
    RecommendationClicked {
        user_id: String,
        book_id: String,
        algorithm: String,
        position: u32,
    },
}

/// 搜索领域命令
#[derive(Debug, Clone)]
pub enum SearchCommand {
    ExecuteSearch {
        query: SearchQuery,
    },
    RecordSearchResult {
        search_result: SearchResult,
    },
    GenerateRecommendations {
        user_id: String,
        context: RecommendationContext,
        limit: u32,
    },
    UpdateRecommendationMetrics {
        engine_id: String,
        metrics: RecommendationMetrics,
    },
    AddToSearchHistory {
        history: SearchHistory,
    },
}

/// 搜索领域查询（CQRS 查询枚举）
#[derive(Debug, Clone, PartialEq)]
pub enum SearchDomainQuery {
    SearchBooks {
        query: SearchQuery,
    },
    GetSearchHistory {
        user_id: String,
        limit: Option<u32>,
    },
    GetRecommendations {
        user_id: String,
        algorithm: Option<RecommendationAlgorithm>,
        limit: Option<u32>,
    },
    GetSearchAnalytics {
        user_id: Option<String>,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    },
    GetPopularSearches {
        limit: u32,
    },
}

/// 推荐上下文
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendationContext {
    pub current_book_id: Option<String>,
    pub recently_read: Vec<String>,
    pub favorite_genres: Vec<String>,
    pub favorite_authors: Vec<String>,
    pub time_of_day: u8, // 0-23
    pub device_type: DeviceType,
    pub mood_indicators: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeviceType {
    Mobile,
    Tablet,
    Desktop,
    Unknown,
}

/// 搜索领域 - 聚合所有搜索相关业务逻辑
pub struct SearchDomain {
    search_engine: Box<dyn SearchEngine>,
    recommendation_engine: Box<dyn RecommendationService>,
    search_history_repository: Box<dyn SearchHistoryRepository>,
    analytics_service: Box<dyn SearchAnalyticsService>,
    business_rules: Vec<Box<dyn BusinessRuleValidator<SearchQuery>>>,
}

impl SearchDomain {
    pub async fn new() -> Result<Self, DomainError> {
        Ok(Self {
            search_engine: Box::new(SimpleSearchEngine::new()),
            recommendation_engine: Box::new(HybridRecommendationEngine::new()),
            search_history_repository: Box::new(InMemorySearchHistoryRepository::new()),
            analytics_service: Box::new(BasicSearchAnalyticsService::new()),
            business_rules: vec![
                Box::new(SearchQueryNotEmptyRule),
                Box::new(SearchPageSizeValidRule),
            ],
        })
    }

    pub async fn handle_command(
        &self,
        command: SearchCommand,
    ) -> Result<DomainResult, DomainError> {
        match command {
            SearchCommand::ExecuteSearch { query } => self.execute_search(query).await,
            SearchCommand::RecordSearchResult { search_result } => {
                self.record_search_result(search_result).await
            },
            SearchCommand::GenerateRecommendations {
                user_id,
                context,
                limit,
            } => self.generate_recommendations(user_id, context, limit).await,
            SearchCommand::UpdateRecommendationMetrics { engine_id, metrics } => {
                self.update_recommendation_metrics(engine_id, metrics).await
            },
            SearchCommand::AddToSearchHistory { history } => {
                self.add_to_search_history(history).await
            },
        }
    }

    pub async fn handle_query(
        &self,
        query: SearchDomainQuery,
    ) -> Result<DomainResult, DomainError> {
        match query {
            SearchDomainQuery::SearchBooks { query } => self.search_books(query).await,
            SearchDomainQuery::GetSearchHistory { user_id, limit } => {
                self.get_search_history(user_id, limit).await
            },
            SearchDomainQuery::GetRecommendations {
                user_id,
                algorithm,
                limit,
            } => self.get_recommendations(user_id, algorithm, limit).await,
            SearchDomainQuery::GetSearchAnalytics {
                user_id,
                time_range,
            } => self.get_search_analytics(user_id, time_range).await,
            SearchDomainQuery::GetPopularSearches { limit } => {
                self.get_popular_searches(limit).await
            },
        }
    }

    async fn execute_search(&self, query: SearchQuery) -> Result<DomainResult, DomainError> {
        // 验证业务规则
        for rule in &self.business_rules {
            rule.validate(&query, &DomainContext::default()).await?;
        }

        let start_time = Utc::now();
        let result = self.search_engine.search(query.clone()).await?;
        let execution_time = (Utc::now() - start_time).num_milliseconds() as u64;

        // 记录搜索历史
        if let Some(user_id) = &query.user_id {
            let history = SearchHistory {
                id: SearchHistoryId(Uuid::new_v4().to_string()),
                user_id: user_id.clone(),
                query: query.clone(),
                result_count: result.total_count,
                selected_result: None,
                execution_time_ms: execution_time,
                timestamp: Utc::now(),
                device_info: DeviceInfo {
                    device_type: "unknown".to_string(),
                    os: "unknown".to_string(),
                    browser: None,
                    screen_size: None,
                },
                metadata: HashMap::new(),
                version: 0,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            };

            self.search_history_repository.save(&history).await?;
        }

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&result, "search result")?),
            events: vec![DomainEvent::Search(SearchEvent::SearchExecuted {
                user_id: query.user_id,
                query_keywords: query.keywords,
                result_count: result.total_count,
                execution_time_ms: execution_time,
            })],
            metadata: HashMap::from([(
                "execution_time_ms".to_string(),
                serde_json::json!(execution_time),
            )]),
        })
    }

    async fn record_search_result(
        &self,
        search_result: SearchResult,
    ) -> Result<DomainResult, DomainError> {
        // 这里可以记录搜索结果用于分析
        self.analytics_service
            .record_search_result(&search_result)
            .await?;

        Ok(DomainResult {
            success: true,
            data: None,
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn generate_recommendations(
        &self,
        user_id: String,
        context: RecommendationContext,
        limit: u32,
    ) -> Result<DomainResult, DomainError> {
        let start_time = Utc::now();
        let recommendations = self
            .recommendation_engine
            .generate_recommendations(&user_id, &context, limit)
            .await?;
        let execution_time = (Utc::now() - start_time).num_milliseconds() as u64;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(recommendations)),
            events: vec![DomainEvent::Search(SearchEvent::RecommendationGenerated {
                user_id: user_id.clone(),
                algorithm: "hybrid".to_string(),
                item_count: recommendations.len() as u32,
                execution_time_ms: execution_time,
            })],
            metadata: HashMap::from([
                ("algorithm".to_string(), serde_json::json!("hybrid")),
                ("execution_time_ms".to_string(), serde_json::json!(execution_time)),
            ]),
        })
    }

    async fn update_recommendation_metrics(
        &self,
        engine_id: String,
        metrics: RecommendationMetrics,
    ) -> Result<DomainResult, DomainError> {
        // 更新推荐引擎性能指标
        self.analytics_service
            .update_recommendation_metrics(&engine_id, &metrics)
            .await?;

        Ok(DomainResult {
            success: true,
            data: None,
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn add_to_search_history(
        &self,
        history: SearchHistory,
    ) -> Result<DomainResult, DomainError> {
        self.search_history_repository.save(&history).await?;

        Ok(DomainResult {
            success: true,
            data: None,
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn search_books(&self, query: SearchQuery) -> Result<DomainResult, DomainError> {
        self.execute_search(query).await
    }

    async fn get_search_history(
        &self,
        user_id: String,
        limit: Option<u32>,
    ) -> Result<DomainResult, DomainError> {
        let history = self
            .search_history_repository
            .find_by_user(&user_id, limit.unwrap_or(20))
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(history)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_recommendations(
        &self,
        user_id: String,
        _algorithm: Option<RecommendationAlgorithm>,
        limit: Option<u32>,
    ) -> Result<DomainResult, DomainError> {
        let context = RecommendationContext {
            current_book_id: None,
            recently_read: Vec::new(),
            favorite_genres: Vec::new(),
            favorite_authors: Vec::new(),
            time_of_day: 12,
            device_type: DeviceType::Unknown,
            mood_indicators: Vec::new(),
        };

        self.generate_recommendations(user_id, context, limit.unwrap_or(10))
            .await
    }

    async fn get_search_analytics(
        &self,
        user_id: Option<String>,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<DomainResult, DomainError> {
        let analytics = self
            .analytics_service
            .get_search_analytics(user_id, time_range)
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&analytics, "search analytics")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_popular_searches(&self, limit: u32) -> Result<DomainResult, DomainError> {
        let popular = self.analytics_service.get_popular_searches(limit).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(popular)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }
}

// ===== 核心服务接口 =====

#[async_trait]
pub trait SearchEngine: Send + Sync {
    async fn search(&self, query: SearchQuery) -> Result<SearchResult, DomainError>;
    async fn index_book(&self, book: &crate::domain::reading::Book) -> Result<(), DomainError>;
    async fn remove_from_index(&self, book_id: &str) -> Result<(), DomainError>;
}

#[async_trait]
pub trait RecommendationService: Send + Sync {
    async fn generate_recommendations(
        &self,
        user_id: &str,
        context: &RecommendationContext,
        limit: u32,
    ) -> Result<Vec<RecommendationItem>, DomainError>;
    async fn update_user_preferences(
        &self,
        user_id: &str,
        preferences: HashMap<String, f32>,
    ) -> Result<(), DomainError>;
    async fn get_similar_books(
        &self,
        book_id: &str,
        limit: u32,
    ) -> Result<Vec<RecommendationItem>, DomainError>;
}

#[async_trait]
pub trait SearchHistoryRepository: Send + Sync {
    async fn save(&self, history: &SearchHistory) -> Result<(), DomainError>;
    async fn find_by_id(&self, id: &SearchHistoryId) -> Result<Option<SearchHistory>, DomainError>;
    async fn find_by_user(
        &self,
        user_id: &str,
        limit: u32,
    ) -> Result<Vec<SearchHistory>, DomainError>;
    async fn get_search_statistics(
        &self,
        user_id: &str,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<SearchStatistics, DomainError>;
}

#[async_trait]
pub trait SearchAnalyticsService: Send + Sync {
    async fn record_search_result(&self, result: &SearchResult) -> Result<(), DomainError>;
    async fn update_recommendation_metrics(
        &self,
        engine_id: &str,
        metrics: &RecommendationMetrics,
    ) -> Result<(), DomainError>;
    async fn get_search_analytics(
        &self,
        user_id: Option<String>,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<SearchAnalytics, DomainError>;
    async fn get_popular_searches(&self, limit: u32) -> Result<Vec<PopularSearch>, DomainError>;
}

// ===== 简单实现 =====

pub struct SimpleSearchEngine {
    // 在实际实现中，这里会连接到Elasticsearch或其他搜索引擎
}

impl SimpleSearchEngine {
    pub fn new() -> Self {
        Self {}
    }
}

impl Default for SimpleSearchEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SearchEngine for SimpleSearchEngine {
    async fn search(&self, query: SearchQuery) -> Result<SearchResult, DomainError> {
        // 模拟搜索结果
        let result_id = SearchResultId(Uuid::new_v4().to_string());
        let items = vec![SearchResultItem {
            book_id: "book1".to_string(),
            title: "示例书籍1".to_string(),
            author: "作者1".to_string(),
            description: Some("书籍描述".to_string()),
            cover_url: None,
            genres: vec!["小说".to_string()],
            rating: Some(4.5),
            status: BookStatus::Ongoing,
            word_count: 100000,
            relevance_score: 0.95,
            matched_keywords: query.keywords.clone(),
            highlights: vec!["关键词高亮".to_string()],
        }];

        Ok(SearchResult {
            id: result_id,
            query,
            items,
            total_count: 1,
            execution_time_ms: 150,
            search_timestamp: Utc::now(),
            metadata: HashMap::new(),
        })
    }

    async fn index_book(&self, _book: &crate::domain::reading::Book) -> Result<(), DomainError> {
        // 模拟索引操作
        Ok(())
    }

    async fn remove_from_index(&self, _book_id: &str) -> Result<(), DomainError> {
        // 模拟删除索引操作
        Ok(())
    }
}

pub struct HybridRecommendationEngine;

impl HybridRecommendationEngine {
    pub fn new() -> Self {
        Self
    }
}

impl Default for HybridRecommendationEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl RecommendationService for HybridRecommendationEngine {
    async fn generate_recommendations(
        &self,
        _user_id: &str,
        _context: &RecommendationContext,
        limit: u32,
    ) -> Result<Vec<RecommendationItem>, DomainError> {
        // 模拟推荐结果
        let recommendations = (0..limit)
            .map(|i| RecommendationItem {
                book_id: format!("rec_book_{}", i),
                score: 0.8 - (i as f32 * 0.1),
                reason: RecommendationReason::SimilarBooks,
                algorithm_used: RecommendationAlgorithm::Hybrid,
                confidence: 0.75,
                features: vec!["genre_match".to_string(), "author_popular".to_string()],
            })
            .collect();

        Ok(recommendations)
    }

    async fn update_user_preferences(
        &self,
        _user_id: &str,
        _preferences: HashMap<String, f32>,
    ) -> Result<(), DomainError> {
        Ok(())
    }

    async fn get_similar_books(
        &self,
        _book_id: &str,
        limit: u32,
    ) -> Result<Vec<RecommendationItem>, DomainError> {
        let similar = (0..limit)
            .map(|i| RecommendationItem {
                book_id: format!("similar_book_{}", i),
                score: 0.9 - (i as f32 * 0.05),
                reason: RecommendationReason::SimilarBooks,
                algorithm_used: RecommendationAlgorithm::ContentBased,
                confidence: 0.8,
                features: vec!["content_similarity".to_string()],
            })
            .collect();

        Ok(similar)
    }
}

pub struct InMemorySearchHistoryRepository {
    history: std::sync::RwLock<HashMap<SearchHistoryId, SearchHistory>>,
}

impl InMemorySearchHistoryRepository {
    pub fn new() -> Self {
        Self {
            history: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

impl Default for InMemorySearchHistoryRepository {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SearchHistoryRepository for InMemorySearchHistoryRepository {
    async fn save(&self, history: &SearchHistory) -> Result<(), DomainError> {
        let mut store = write_lock(&self.history, "search history")?;
        store.insert(history.id.clone(), history.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &SearchHistoryId) -> Result<Option<SearchHistory>, DomainError> {
        let store = read_lock(&self.history, "search history")?;
        Ok(store.get(id).cloned())
    }

    async fn find_by_user(
        &self,
        user_id: &str,
        limit: u32,
    ) -> Result<Vec<SearchHistory>, DomainError> {
        let store = read_lock(&self.history, "search history")?;
        let filtered: Vec<SearchHistory> = store
            .values()
            .filter(|h| h.user_id == user_id)
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn get_search_statistics(
        &self,
        user_id: &str,
        _time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<SearchStatistics, DomainError> {
        let store = read_lock(&self.history, "search history")?;
        let user_history: Vec<&SearchHistory> =
            store.values().filter(|h| h.user_id == user_id).collect();

        let total_searches = user_history.len() as u64;
        let average_execution_time = if total_searches > 0 {
            user_history
                .iter()
                .map(|h| h.execution_time_ms)
                .sum::<u64>()
                / total_searches
        } else {
            0
        };

        Ok(SearchStatistics {
            total_searches,
            average_execution_time,
            average_results_per_search: 5.0,
        })
    }
}

pub struct BasicSearchAnalyticsService;

impl BasicSearchAnalyticsService {
    pub fn new() -> Self {
        Self
    }
}

impl Default for BasicSearchAnalyticsService {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SearchAnalyticsService for BasicSearchAnalyticsService {
    async fn record_search_result(&self, _result: &SearchResult) -> Result<(), DomainError> {
        Ok(())
    }

    async fn update_recommendation_metrics(
        &self,
        _engine_id: &str,
        _metrics: &RecommendationMetrics,
    ) -> Result<(), DomainError> {
        Ok(())
    }

    async fn get_search_analytics(
        &self,
        _user_id: Option<String>,
        _time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<SearchAnalytics, DomainError> {
        Ok(SearchAnalytics {
            total_searches: 1000,
            unique_users: 500,
            average_search_time: 200.0,
            popular_keywords: vec!["小说".to_string(), "玄幻".to_string()],
            conversion_rate: 0.15,
        })
    }

    async fn get_popular_searches(&self, limit: u32) -> Result<Vec<PopularSearch>, DomainError> {
        let popular = (0..limit)
            .map(|i| PopularSearch {
                keyword: format!("热门关键词{}", i),
                search_count: 100 - (i as u64 * 5),
                trend: if i % 2 == 0 {
                    "上升".to_string()
                } else {
                    "稳定".to_string()
                },
            })
            .collect();

        Ok(popular)
    }
}

// ===== 业务规则 =====

pub struct SearchQueryNotEmptyRule;

#[async_trait]
impl BusinessRuleValidator<SearchQuery> for SearchQueryNotEmptyRule {
    fn rule_name(&self) -> &str {
        "search_query_not_empty"
    }

    async fn validate(
        &self,
        entity: &SearchQuery,
        _context: &DomainContext,
    ) -> Result<(), DomainError> {
        if entity.keywords.is_empty() {
            return Err(DomainError::Validation(
                "Search query keywords cannot be empty".to_string(),
            ));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that search query has at least one keyword"
    }
}

pub struct SearchPageSizeValidRule;

#[async_trait]
impl BusinessRuleValidator<SearchQuery> for SearchPageSizeValidRule {
    fn rule_name(&self) -> &str {
        "search_page_size_valid"
    }

    async fn validate(
        &self,
        entity: &SearchQuery,
        _context: &DomainContext,
    ) -> Result<(), DomainError> {
        if entity.page_size == 0 || entity.page_size > 100 {
            return Err(DomainError::Validation("Page size must be between 1 and 100".to_string()));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that search page size is within valid range"
    }
}

// ===== 数据传输对象 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchStatistics {
    pub total_searches: u64,
    pub average_execution_time: u64,
    pub average_results_per_search: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchAnalytics {
    pub total_searches: u64,
    pub unique_users: u64,
    pub average_search_time: f64,
    pub popular_keywords: Vec<String>,
    pub conversion_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PopularSearch {
    pub keyword: String,
    pub search_count: u64,
    pub trend: String,
}
