//! 引擎领域层 (Engine Domain Layer)
//!
//! 引擎领域负责爬虫引擎、内容抓取、反爬虫策略等核心爬虫业务逻辑。
//! 该领域包含以下核心概念：
//! - 抓取任务 (FetchTask): 网页抓取任务
//! - 内容解析器 (ContentParser): HTML内容解析
//! - 反爬虫策略 (AntiCrawlStrategy): 反检测策略
//! - 连接池 (ConnectionPool): 网络连接管理

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use nexus_core::{EngineError, DomainError};
use nexus_core::{Entity, AggregateRoot, DomainEvent, DomainResult, DomainContext, BusinessRuleValidator};
use nexus_core::domain::EngineEvent as CoreEngineEvent;

/// 抓取任务实体 - 聚合根
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchTask {
    pub id: FetchTaskId,
    pub url: String,
    pub method: HttpMethod,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub timeout_ms: u64,
    pub retry_count: u32,
    pub max_retries: u32,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub domain: String,
    pub anti_crawl_strategy: AntiCrawlStrategy,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub result: Option<TaskResult>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub version: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct FetchTaskId(pub String);

impl std::fmt::Display for FetchTaskId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HttpMethod {
    GET,
    POST,
    PUT,
    DELETE,
    HEAD,
    OPTIONS,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
    Retrying,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskPriority {
    Low,
    Normal,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AntiCrawlStrategy {
    None,
    UserAgentRotation,
    Delay,
    Proxy,
    CloudflareBypass,
    Advanced(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub success: bool,
    pub status_code: Option<u16>,
    pub response_headers: HashMap<String, String>,
    pub response_body: Option<String>,
    pub response_size_bytes: u64,
    pub duration_ms: u64,
    pub error_message: Option<String>,
    pub retry_count: u32,
}

#[async_trait]
impl Entity for FetchTask {
    type Id = FetchTaskId;

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
        self.completed_at.unwrap_or(self.created_at)
    }
}

#[async_trait]
impl AggregateRoot for FetchTask {
    fn version(&self) -> u64 {
        self.version
    }

    fn increment_version(&mut self) {
        self.version += 1;
    }

    fn uncommitted_events(&self) -> Vec<DomainEvent> {
        // 简化的实现，实际应该维护未提交事件列表
        Vec::new()
    }

    fn clear_uncommitted_events(&mut self) {
        // 简化的实现
    }
}

impl FetchTask {
    /// 创建新抓取任务
    pub fn new(url: String, method: HttpMethod) -> Self {
        let now = Utc::now();
        let domain = extract_domain(&url).unwrap_or("unknown".to_string());

        Self {
            id: FetchTaskId(Uuid::new_v4().to_string()),
            url,
            method,
            headers: HashMap::new(),
            body: None,
            timeout_ms: 30000,
            retry_count: 0,
            max_retries: 3,
            status: TaskStatus::Pending,
            priority: TaskPriority::Normal,
            domain,
            anti_crawl_strategy: AntiCrawlStrategy::None,
            created_at: now,
            started_at: None,
            completed_at: None,
            result: None,
            metadata: HashMap::new(),
            version: 0,
        }
    }

    /// 启动任务
    pub fn start(&mut self) {
        if self.status == TaskStatus::Pending {
            self.status = TaskStatus::Running;
            self.started_at = Some(Utc::now());
        }
    }

    /// 完成任务
    pub fn complete(&mut self, result: TaskResult) {
        self.status = if result.success {
            TaskStatus::Completed
        } else {
            TaskStatus::Failed
        };
        self.completed_at = Some(Utc::now());
        self.result = Some(result);
    }

    /// 增加重试次数
    pub fn increment_retry(&mut self) {
        self.retry_count += 1;
        if self.retry_count < self.max_retries {
            self.status = TaskStatus::Retrying;
        } else {
            self.status = TaskStatus::Failed;
        }
    }

    /// 检查是否可以重试
    pub fn can_retry(&self) -> bool {
        self.retry_count < self.max_retries
    }
}

/// 内容解析器实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentParser {
    pub id: ContentParserId,
    pub name: String,
    pub parser_type: ParserType,
    pub selectors: HashMap<String, String>,
    pub regex_patterns: HashMap<String, String>,
    pub config: ParserConfig,
    pub is_active: bool,
    pub success_rate: f64,
    pub average_parse_time_ms: f64,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ContentParserId(pub String);

impl std::fmt::Display for ContentParserId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ParserType {
    Html,
    Json,
    Xml,
    Regex,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParserConfig {
    pub timeout_ms: u64,
    pub max_content_length: u64,
    pub encoding: String,
    pub follow_redirects: bool,
    pub validate_content: bool,
}

#[async_trait]
impl Entity for ContentParser {
    type Id = ContentParserId;

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

/// 连接池实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionPool {
    pub id: ConnectionPoolId,
    pub domain: String,
    pub max_connections: u32,
    pub active_connections: u32,
    pub idle_connections: u32,
    pub total_connections_created: u64,
    pub total_requests: u64,
    pub average_response_time_ms: f64,
    pub error_rate: f64,
    pub last_health_check: DateTime<Utc>,
    pub status: PoolStatus,
    pub config: PoolConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ConnectionPoolId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PoolStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Maintenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolConfig {
    pub max_idle_connections: u32,
    pub connection_timeout_ms: u64,
    pub idle_timeout_ms: u64,
    pub max_lifetime_ms: u64,
    pub health_check_interval_ms: u64,
}

/// 引擎领域事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EngineEvent {
    FetchTaskCreated {
        task_id: String,
        url: String,
        priority: String,
    },
    FetchTaskStarted {
        task_id: String,
        domain: String,
    },
    FetchTaskCompleted {
        task_id: String,
        success: bool,
        duration_ms: u64,
        response_size_bytes: u64,
    },
    FetchTaskFailed {
        task_id: String,
        error: String,
        retry_count: u32,
    },
    AntiCrawlStrategyApplied {
        task_id: String,
        strategy: String,
        domain: String,
    },
    ConnectionPoolExhausted {
        domain: String,
        active_connections: u32,
        max_connections: u32,
    },
    ContentParserUpdated {
        parser_id: String,
        parser_type: String,
        success_rate: f64,
    },
}

/// 引擎领域命令
#[derive(Debug, Clone)]
pub enum EngineCommand {
    CreateFetchTask {
        task: FetchTask,
    },
    ExecuteFetchTask {
        task_id: String,
    },
    CancelFetchTask {
        task_id: String,
        reason: String,
    },
    RetryFetchTask {
        task_id: String,
    },
    CreateContentParser {
        parser: ContentParser,
    },
    UpdateContentParser {
        parser_id: String,
        selectors: HashMap<String, String>,
        regex_patterns: HashMap<String, String>,
    },
    ConfigureConnectionPool {
        domain: String,
        config: PoolConfig,
    },
    HealthCheckConnectionPool {
        domain: String,
    },
}

/// 引擎领域查询
#[derive(Debug, Clone)]
pub enum EngineQuery {
    GetFetchTask {
        task_id: String,
    },
    ListFetchTasks {
        status: Option<TaskStatus>,
        domain: Option<String>,
        limit: Option<u32>,
    },
    GetContentParser {
        parser_id: String,
    },
    ListContentParsers {
        parser_type: Option<ParserType>,
    },
    GetConnectionPool {
        domain: String,
    },
    ListConnectionPools {
        status: Option<PoolStatus>,
    },
    GetEngineMetrics,
    GetDomainStatistics {
        domain: String,
    },
}

/// 引擎领域 - 聚合所有爬虫引擎业务逻辑
pub struct EngineDomain {
    task_repository: Box<dyn FetchTaskRepository>,
    parser_repository: Box<dyn ContentParserRepository>,
    pool_repository: Box<dyn ConnectionPoolRepository>,
    metrics_service: Box<dyn EngineMetricsService>,
    business_rules: Vec<Box<dyn BusinessRuleValidator<FetchTask>>>,
}

impl EngineDomain {
    pub async fn new() -> Result<Self, EngineError> {
        Ok(Self {
            task_repository: Box::new(InMemoryFetchTaskRepository::new()),
            parser_repository: Box::new(InMemoryContentParserRepository::new()),
            pool_repository: Box::new(InMemoryConnectionPoolRepository::new()),
            metrics_service: Box::new(BasicEngineMetricsService::new()),
            business_rules: vec![
                Box::new(FetchTaskUrlValidRule),
                Box::new(FetchTaskTimeoutValidRule),
            ],
        })
    }

    pub async fn handle_command(&self, command: EngineCommand) -> Result<DomainResult, EngineError> {
        match command {
            EngineCommand::CreateFetchTask { task } => {
                self.create_fetch_task(task).await
            }
            EngineCommand::ExecuteFetchTask { task_id } => {
                self.execute_fetch_task(task_id).await
            }
            EngineCommand::CancelFetchTask { task_id, reason } => {
                self.cancel_fetch_task(task_id, reason).await
            }
            EngineCommand::RetryFetchTask { task_id } => {
                self.retry_fetch_task(task_id).await
            }
            EngineCommand::CreateContentParser { parser } => {
                self.create_content_parser(parser).await
            }
            EngineCommand::UpdateContentParser { parser_id, selectors, regex_patterns } => {
                self.update_content_parser(parser_id, selectors, regex_patterns).await
            }
            EngineCommand::ConfigureConnectionPool { domain, config } => {
                self.configure_connection_pool(domain, config).await
            }
            EngineCommand::HealthCheckConnectionPool { domain } => {
                self.health_check_connection_pool(domain).await
            }
        }
    }

    pub async fn handle_query(&self, query: EngineQuery) -> Result<DomainResult, EngineError> {
        match query {
            EngineQuery::GetFetchTask { task_id } => {
                self.get_fetch_task(task_id).await
            }
            EngineQuery::ListFetchTasks { status, domain, limit } => {
                self.list_fetch_tasks(status, domain, limit).await
            }
            EngineQuery::GetContentParser { parser_id } => {
                self.get_content_parser(parser_id).await
            }
            EngineQuery::ListContentParsers { parser_type } => {
                self.list_content_parsers(parser_type).await
            }
            EngineQuery::GetConnectionPool { domain } => {
                self.get_connection_pool(domain).await
            }
            EngineQuery::ListConnectionPools { status } => {
                self.list_connection_pools(status).await
            }
            EngineQuery::GetEngineMetrics => {
                self.get_engine_metrics().await
            }
            EngineQuery::GetDomainStatistics { domain } => {
                self.get_domain_statistics(domain).await
            }
        }
    }

    async fn create_fetch_task(&self, task: FetchTask) -> Result<DomainResult, EngineError> {
        // 验证业务规则
        for rule in &self.business_rules {
            rule.validate(&task, &DomainContext::default()).await?;
        }

        self.task_repository.save(&task).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&task).unwrap()),
            events: vec![DomainEvent::Engine(CoreEngineEvent::FetchTaskCreated {
                task_id: task.id.0.clone(),
                url: task.url.clone(),
                priority: format!("{:?}", task.priority),
            })],
            metadata: HashMap::new(),
        })
    }

    async fn execute_fetch_task(&self, task_id: String) -> Result<DomainResult, EngineError> {
        let task_id = FetchTaskId(task_id);
        let mut task = self.task_repository.find_by_id(&task_id).await?
            .ok_or_else(|| EngineError::NotFound { resource: format!("Task {}", task_id.0) })?;

        task.start();
        self.task_repository.save(&task).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&task).unwrap()),
            events: vec![DomainEvent::Engine(CoreEngineEvent::FetchTaskStarted {
                task_id: task.id.0,
                domain: task.domain,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn cancel_fetch_task(&self, task_id: String, reason: String) -> Result<DomainResult, EngineError> {
        let task_id = FetchTaskId(task_id);
        let mut task = self.task_repository.find_by_id(&task_id).await?
            .ok_or_else(|| EngineError::NotFound { resource: format!("Task {}", task_id.0) })?;

        task.status = TaskStatus::Cancelled;
        task.completed_at = Some(Utc::now());
        self.task_repository.save(&task).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&task).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn retry_fetch_task(&self, task_id: String) -> Result<DomainResult, EngineError> {
        let task_id = FetchTaskId(task_id);
        let mut task = self.task_repository.find_by_id(&task_id).await?
            .ok_or_else(|| EngineError::NotFound { resource: format!("Task {}", task_id.0) })?;

        if task.can_retry() {
            task.increment_retry();
            task.status = TaskStatus::Pending;
            self.task_repository.save(&task).await?;
        }

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&task).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn create_content_parser(&self, parser: ContentParser) -> Result<DomainResult, EngineError> {
        self.parser_repository.save(&parser).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&parser).unwrap()),
            events: vec![DomainEvent::Engine(CoreEngineEvent::ContentParserUpdated {
                parser_id: parser.id.0,
                parser_type: format!("{:?}", parser.parser_type),
                success_rate: parser.success_rate,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn update_content_parser(
        &self,
        parser_id: String,
        selectors: HashMap<String, String>,
        regex_patterns: HashMap<String, String>,
    ) -> Result<DomainResult, EngineError> {
        let parser_id = ContentParserId(parser_id);
        let mut parser = self.parser_repository.find_by_id(&parser_id).await?
            .ok_or_else(|| EngineError::NotFound { resource: format!("Parser {}", parser_id.0) })?;

        parser.selectors.extend(selectors);
        parser.regex_patterns.extend(regex_patterns);
        parser.updated_at = Utc::now();
        self.parser_repository.save(&parser).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&parser).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn configure_connection_pool(&self, domain: String, config: PoolConfig) -> Result<DomainResult, EngineError> {
        let pool_id = ConnectionPoolId(format!("pool_{}", domain));
        let mut pool = self.pool_repository.find_by_id(&pool_id).await?
            .unwrap_or_else(|| ConnectionPool {
                id: pool_id.clone(),
                domain: domain.clone(),
                max_connections: 10,
                active_connections: 0,
                idle_connections: 0,
                total_connections_created: 0,
                total_requests: 0,
                average_response_time_ms: 0.0,
                error_rate: 0.0,
                last_health_check: Utc::now(),
                status: PoolStatus::Healthy,
                config: config.clone(),
            });

        pool.config = config;
        self.pool_repository.save(&pool).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&pool).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn health_check_connection_pool(&self, domain: String) -> Result<DomainResult, EngineError> {
        let pool_id = ConnectionPoolId(format!("pool_{}", domain));
        let mut pool = self.pool_repository.find_by_id(&pool_id).await?
            .ok_or_else(|| EngineError::NotFound { resource: format!("Pool for domain {}", domain) })?;

        pool.last_health_check = Utc::now();
        // 简化的健康检查逻辑
        pool.status = PoolStatus::Healthy;
        self.pool_repository.save(&pool).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&pool).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_fetch_task(&self, task_id: String) -> Result<DomainResult, EngineError> {
        let task_id = FetchTaskId(task_id);
        let task = self.task_repository.find_by_id(&task_id).await?
            .ok_or_else(|| EngineError::NotFound { resource: format!("Task {}", task_id.0) })?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&task).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn list_fetch_tasks(
        &self,
        status: Option<TaskStatus>,
        domain: Option<String>,
        limit: Option<u32>,
    ) -> Result<DomainResult, EngineError> {
        let tasks = self.task_repository.find_by_criteria(status, domain, limit.unwrap_or(50)).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(tasks)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_content_parser(&self, parser_id: String) -> Result<DomainResult, EngineError> {
        let parser_id = ContentParserId(parser_id);
        let parser = self.parser_repository.find_by_id(&parser_id).await?
            .ok_or_else(|| EngineError::NotFound { resource: format!("Parser {}", parser_id.0) })?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&parser).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn list_content_parsers(&self, parser_type: Option<ParserType>) -> Result<DomainResult, EngineError> {
        let parsers = self.parser_repository.find_by_type(parser_type).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(parsers)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_connection_pool(&self, domain: String) -> Result<DomainResult, EngineError> {
        let pool_id = ConnectionPoolId(format!("pool_{}", domain));
        let pool = self.pool_repository.find_by_id(&pool_id).await?
            .ok_or_else(|| EngineError::NotFound { resource: format!("Pool for domain {}", domain) })?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(&pool).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn list_connection_pools(&self, status: Option<PoolStatus>) -> Result<DomainResult, EngineError> {
        let pools = self.pool_repository.find_by_status(status).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(pools)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_engine_metrics(&self) -> Result<DomainResult, EngineError> {
        let metrics = self.metrics_service.get_metrics().await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(metrics).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_domain_statistics(&self, domain: String) -> Result<DomainResult, EngineError> {
        let stats = self.metrics_service.get_domain_statistics(&domain).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::to_value(stats).unwrap()),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }
}

// ===== 仓库接口 =====

#[async_trait]
pub trait FetchTaskRepository: Send + Sync {
    async fn save(&self, task: &FetchTask) -> Result<(), EngineError>;
    async fn find_by_id(&self, id: &FetchTaskId) -> Result<Option<FetchTask>, EngineError>;
    async fn find_by_criteria(&self, status: Option<TaskStatus>, domain: Option<String>, limit: u32) -> Result<Vec<FetchTask>, EngineError>;
    async fn delete(&self, id: &FetchTaskId) -> Result<(), EngineError>;
}

#[async_trait]
pub trait ContentParserRepository: Send + Sync {
    async fn save(&self, parser: &ContentParser) -> Result<(), EngineError>;
    async fn find_by_id(&self, id: &ContentParserId) -> Result<Option<ContentParser>, EngineError>;
    async fn find_by_type(&self, parser_type: Option<ParserType>) -> Result<Vec<ContentParser>, EngineError>;
    async fn delete(&self, id: &ContentParserId) -> Result<(), EngineError>;
}

#[async_trait]
pub trait ConnectionPoolRepository: Send + Sync {
    async fn save(&self, pool: &ConnectionPool) -> Result<(), EngineError>;
    async fn find_by_id(&self, id: &ConnectionPoolId) -> Result<Option<ConnectionPool>, EngineError>;
    async fn find_by_domain(&self, domain: &str) -> Result<Option<ConnectionPool>, EngineError>;
    async fn find_by_status(&self, status: Option<PoolStatus>) -> Result<Vec<ConnectionPool>, EngineError>;
}

#[async_trait]
pub trait EngineMetricsService: Send + Sync {
    async fn get_metrics(&self) -> Result<EngineMetrics, EngineError>;
    async fn get_domain_statistics(&self, domain: &str) -> Result<DomainStatistics, EngineError>;
    async fn record_fetch(&self, domain: &str, success: bool, duration_ms: u64, size_bytes: u64) -> Result<(), EngineError>;
}

// ===== 内存实现 =====

pub struct InMemoryFetchTaskRepository {
    tasks: std::sync::RwLock<HashMap<FetchTaskId, FetchTask>>,
}

impl InMemoryFetchTaskRepository {
    pub fn new() -> Self {
        Self {
            tasks: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl FetchTaskRepository for InMemoryFetchTaskRepository {
    async fn save(&self, task: &FetchTask) -> Result<(), EngineError> {
        let mut tasks = self.tasks.write().unwrap();
        tasks.insert(task.id.clone(), task.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &FetchTaskId) -> Result<Option<FetchTask>, EngineError> {
        let tasks = self.tasks.read().unwrap();
        Ok(tasks.get(id).cloned())
    }

    async fn find_by_criteria(&self, status: Option<TaskStatus>, domain: Option<String>, limit: u32) -> Result<Vec<FetchTask>, EngineError> {
        let tasks = self.tasks.read().unwrap();
        let filtered: Vec<FetchTask> = tasks.values()
            .filter(|t| status.as_ref().map_or(true, |s| matches!(&t.status, s)))
            .filter(|t| domain.as_ref().map_or(true, |d| &t.domain == d))
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn delete(&self, id: &FetchTaskId) -> Result<(), EngineError> {
        let mut tasks = self.tasks.write().unwrap();
        tasks.remove(id);
        Ok(())
    }
}

pub struct InMemoryContentParserRepository {
    parsers: std::sync::RwLock<HashMap<ContentParserId, ContentParser>>,
}

impl InMemoryContentParserRepository {
    pub fn new() -> Self {
        Self {
            parsers: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl ContentParserRepository for InMemoryContentParserRepository {
    async fn save(&self, parser: &ContentParser) -> Result<(), EngineError> {
        let mut parsers = self.parsers.write().unwrap();
        parsers.insert(parser.id.clone(), parser.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &ContentParserId) -> Result<Option<ContentParser>, EngineError> {
        let parsers = self.parsers.read().unwrap();
        Ok(parsers.get(id).cloned())
    }

    async fn find_by_type(&self, parser_type: Option<ParserType>) -> Result<Vec<ContentParser>, EngineError> {
        let parsers = self.parsers.read().unwrap();
        let filtered: Vec<ContentParser> = if let Some(pt) = parser_type {
            parsers.values()
                .filter(|p| matches!(&p.parser_type, pt))
                .cloned()
                .collect()
        } else {
            parsers.values().cloned().collect()
        };
        Ok(filtered)
    }

    async fn delete(&self, id: &ContentParserId) -> Result<(), EngineError> {
        let mut parsers = self.parsers.write().unwrap();
        parsers.remove(id);
        Ok(())
    }
}

pub struct InMemoryConnectionPoolRepository {
    pools: std::sync::RwLock<HashMap<ConnectionPoolId, ConnectionPool>>,
}

impl InMemoryConnectionPoolRepository {
    pub fn new() -> Self {
        Self {
            pools: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl ConnectionPoolRepository for InMemoryConnectionPoolRepository {
    async fn save(&self, pool: &ConnectionPool) -> Result<(), EngineError> {
        let mut pools = self.pools.write().unwrap();
        pools.insert(pool.id.clone(), pool.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &ConnectionPoolId) -> Result<Option<ConnectionPool>, EngineError> {
        let pools = self.pools.read().unwrap();
        Ok(pools.get(id).cloned())
    }

    async fn find_by_domain(&self, domain: &str) -> Result<Option<ConnectionPool>, EngineError> {
        let pools = self.pools.read().unwrap();
        let pool = pools.values().find(|p| p.domain == domain).cloned();
        Ok(pool)
    }

    async fn find_by_status(&self, status: Option<PoolStatus>) -> Result<Vec<ConnectionPool>, EngineError> {
        let pools = self.pools.read().unwrap();
        let filtered: Vec<ConnectionPool> = if let Some(status) = status {
            pools.values()
                .filter(|p| matches!(&p.status, status))
                .cloned()
                .collect()
        } else {
            pools.values().cloned().collect()
        };
        Ok(filtered)
    }
}

pub struct BasicEngineMetricsService;

impl BasicEngineMetricsService {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl EngineMetricsService for BasicEngineMetricsService {
    async fn get_metrics(&self) -> Result<EngineMetrics, EngineError> {
        Ok(EngineMetrics {
            total_requests: 5000,
            successful_requests: 4850,
            failed_requests: 150,
            average_response_time_ms: 245.0,
            active_tasks: 12,
            queued_tasks: 5,
        })
    }

    async fn get_domain_statistics(&self, _domain: &str) -> Result<DomainStatistics, EngineError> {
        Ok(DomainStatistics {
            domain: _domain.to_string(),
            total_requests: 1200,
            success_rate: 0.95,
            average_response_time_ms: 180.0,
            error_count: 60,
            last_request: Utc::now(),
        })
    }

    async fn record_fetch(&self, _domain: &str, _success: bool, _duration_ms: u64, _size_bytes: u64) -> Result<(), EngineError> {
        Ok(())
    }
}

// ===== 业务规则 =====

pub struct FetchTaskUrlValidRule;

#[async_trait]
impl BusinessRuleValidator<FetchTask> for FetchTaskUrlValidRule {
    fn rule_name(&self) -> &str {
        "fetch_task_url_valid"
    }

    async fn validate(&self, entity: &FetchTask, _context: &DomainContext) -> Result<(), DomainError> {
        if entity.url.trim().is_empty() {
            return Err(DomainError::Validation("Fetch task URL cannot be empty".to_string()));
        }
        if !entity.url.starts_with("http://") && !entity.url.starts_with("https://") {
            return Err(DomainError::Validation("Fetch task URL must start with http:// or https://".to_string()));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that fetch task URL is valid"
    }
}

pub struct FetchTaskTimeoutValidRule;

#[async_trait]
impl BusinessRuleValidator<FetchTask> for FetchTaskTimeoutValidRule {
    fn rule_name(&self) -> &str {
        "fetch_task_timeout_valid"
    }

    async fn validate(&self, entity: &FetchTask, _context: &DomainContext) -> Result<(), DomainError> {
        if entity.timeout_ms == 0 || entity.timeout_ms > 300000 { // 5分钟
            return Err(DomainError::Validation("Timeout must be between 1ms and 5 minutes".to_string()));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that fetch task timeout is within valid range"
    }
}

// ===== 工具函数 =====

fn extract_domain(url: &str) -> Option<String> {
    if let Ok(url) = url::Url::parse(url) {
        url.host_str().map(|s| s.to_string())
    } else {
        None
    }
}

// ===== 数据传输对象 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineMetrics {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub average_response_time_ms: f64,
    pub active_tasks: u32,
    pub queued_tasks: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainStatistics {
    pub domain: String,
    pub total_requests: u64,
    pub success_rate: f64,
    pub average_response_time_ms: f64,
    pub error_count: u64,
    pub last_request: DateTime<Utc>,
}