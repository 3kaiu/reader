//! 领域层 (Domain Layer)
//!
//! 这是DDD架构中的核心领域层，包含所有业务领域模型、业务规则和领域逻辑。
//! 领域层是整个系统的核心，它定义了业务概念、业务规则和业务行为。
//!
//! 领域层设计原则：
//! - 高内聚：相关业务逻辑集中在一个领域内
//! - 低耦合：领域间依赖最小化
//! - 业务导向：以业务概念为中心，而不是技术实现
//! - 纯业务逻辑：不依赖外部框架和技术细节

pub mod reading;
pub mod search;
pub mod user;
pub mod system;

// 重新导出主要领域类型
pub use reading::*;
pub use search::*;
pub use user::*;
pub use system::*;

/// 领域层通用接口和类型
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;
use chrono::{DateTime, Utc};

/// 领域实体基特质
#[async_trait]
pub trait Entity: Send + Sync {
    type Id: Clone + fmt::Display + Send + Sync;

    /// 获取实体ID
    fn id(&self) -> &Self::Id;

    /// 实体是否为新建状态
    fn is_new(&self) -> bool;

    /// 获取创建时间
    fn created_at(&self) -> DateTime<Utc>;

    /// 获取最后修改时间
    fn updated_at(&self) -> DateTime<Utc>;
}

/// 聚合根特质
#[async_trait]
pub trait AggregateRoot: Entity {
    /// 获取聚合版本号（用于并发控制）
    fn version(&self) -> u64;

    /// 增加版本号
    fn increment_version(&mut self);

    /// 获取未提交的领域事件
    fn uncommitted_events(&self) -> Vec<DomainEvent>;

    /// 清除未提交的领域事件
    fn clear_uncommitted_events(&mut self);
}

/// 值对象基特质
pub trait ValueObject: Clone + PartialEq + fmt::Debug + Send + Sync {}

/// 领域服务特质
#[async_trait]
pub trait DomainService: Send + Sync {
    /// 服务名称
    fn name(&self) -> &str;

    /// 执行领域服务逻辑
    async fn execute(&self, context: &DomainContext) -> Result<DomainResult, DomainError>;
}

/// 领域事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", content = "data")]
pub enum DomainEvent {
    // 阅读领域事件
    Reading(ReadingEvent),
    // 搜索领域事件
    Search(SearchEvent),
    // 用户领域事件
    User(UserEvent),
    // 系统领域事件
    System(SystemEvent),
    // 存储领域事件
    Storage(StorageEvent),
    // 引擎领域事件
    Engine(EngineEvent),
}

/// 存储领域事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StorageEvent {
    DataObjectCreated {
        object_id: String,
        bucket: String,
        key: String,
        size_bytes: u64,
    },
    DataObjectUpdated {
        object_id: String,
        bucket: String,
        key: String,
        old_size: u64,
        new_size: u64,
    },
    DataObjectDeleted {
        object_id: String,
        bucket: String,
        key: String,
    },
    CacheHit {
        key: String,
        access_count: u64,
    },
    CacheMiss {
        key: String,
    },
    CacheEvicted {
        key: String,
        reason: String,
    },
    BucketCreated {
        bucket_id: String,
        name: String,
    },
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
        rule_count: usize,
    },
}

/// 领域上下文
#[derive(Debug, Clone)]
pub struct DomainContext {
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub correlation_id: String,
    pub timestamp: DateTime<Utc>,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl Default for DomainContext {
    fn default() -> Self {
        Self {
            user_id: None,
            session_id: None,
            correlation_id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            metadata: HashMap::new(),
        }
    }
}

/// 领域结果
#[derive(Debug, Clone)]
pub struct DomainResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub events: Vec<DomainEvent>,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// 领域错误
#[derive(Debug, Clone)]
pub enum DomainError {
    Validation(String),
    BusinessLogic(String),
    NotFound(String),
    Conflict(String),
    Unauthorized(String),
    ExternalService(String),
}

impl std::fmt::Display for DomainError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(s) => write!(f, "Validation: {}", s),
            Self::BusinessLogic(s) => write!(f, "BusinessLogic: {}", s),
            Self::NotFound(s) => write!(f, "NotFound: {}", s),
            Self::Conflict(s) => write!(f, "Conflict: {}", s),
            Self::Unauthorized(s) => write!(f, "Unauthorized: {}", s),
            Self::ExternalService(s) => write!(f, "ExternalService: {}", s),
        }
    }
}

/// 业务规则验证器
#[async_trait]
pub trait BusinessRuleValidator<T>: Send + Sync {
    /// 规则名称
    fn rule_name(&self) -> &str;

    /// 验证业务规则
    async fn validate(&self, entity: &T, context: &DomainContext) -> Result<(), DomainError>;

    /// 获取规则描述
    fn description(&self) -> &str;
}

/// 领域工厂
#[async_trait]
pub trait DomainFactory<T: Entity>: Send + Sync {
    /// 创建新实体
    async fn create(&self, data: serde_json::Value, context: &DomainContext) -> Result<T, DomainError>;

    /// 从现有数据重建实体
    async fn reconstruct(&self, data: serde_json::Value, version: u64) -> Result<T, DomainError>;
}

/// 规范（Specification）模式 - 用于复杂查询条件
pub trait Specification<T>: Send + Sync {
    /// 检查实体是否满足规范
    fn is_satisfied_by(&self, entity: &T) -> bool;

    /// 获取规范描述
    fn description(&self) -> &str;
}

/// 领域层配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainConfig {
    pub enable_business_rules_validation: bool,
    pub enable_domain_events: bool,
    pub max_aggregate_version: u64,
    pub enable_audit_trail: bool,
    pub cache_ttl_seconds: u64,
}

/// 领域层构建器
pub struct DomainLayerBuilder {
    config: DomainConfig,
    reading_domain: Option<reading::ReadingDomain>,
    search_domain: Option<search::SearchDomain>,
    user_domain: Option<user::UserDomain>,
    system_domain: Option<system::SystemDomain>,
}

impl DomainLayerBuilder {
    pub fn new() -> Self {
        Self {
            config: DomainConfig {
                enable_business_rules_validation: true,
                enable_domain_events: true,
                max_aggregate_version: 1000,
                enable_audit_trail: true,
                cache_ttl_seconds: 3600,
            },
            reading_domain: None,
            search_domain: None,
            user_domain: None,
            system_domain: None,
        }
    }

    pub fn with_config(mut self, config: DomainConfig) -> Self {
        self.config = config;
        self
    }

    pub fn with_reading_domain(mut self, domain: reading::ReadingDomain) -> Self {
        self.reading_domain = Some(domain);
        self
    }

    pub fn with_search_domain(mut self, domain: search::SearchDomain) -> Self {
        self.search_domain = Some(domain);
        self
    }

    pub fn with_user_domain(mut self, domain: user::UserDomain) -> Self {
        self.user_domain = Some(domain);
        self
    }

    pub fn with_system_domain(mut self, domain: system::SystemDomain) -> Self {
        self.system_domain = Some(domain);
        self
    }

    pub fn build(self) -> Result<DomainLayer, DomainError> {
        Ok(DomainLayer {
            config: self.config,
            reading_domain: self.reading_domain.ok_or_else(|| DomainError::Validation("Reading domain is required".to_string()))?,
            search_domain: self.search_domain.ok_or_else(|| DomainError::Validation("Search domain is required".to_string()))?,
            user_domain: self.user_domain.ok_or_else(|| DomainError::Validation("User domain is required".to_string()))?,
            system_domain: self.system_domain.ok_or_else(|| DomainError::Validation("System domain is required".to_string()))?,
        })
    }
}

/// 领域层统一接口
pub struct DomainLayer {
    pub config: DomainConfig,
    pub reading_domain: reading::ReadingDomain,
    pub search_domain: search::SearchDomain,
    pub user_domain: user::UserDomain,
    pub system_domain: system::SystemDomain,
}

impl DomainLayer {
    /// 处理领域命令
    pub async fn handle_command(&self, command: DomainCommand) -> Result<DomainResult, DomainError> {
        match command {
            DomainCommand::Reading(cmd) => self.reading_domain.handle_command(cmd).await,
            DomainCommand::Search(cmd) => self.search_domain.handle_command(cmd).await,
            DomainCommand::User(cmd) => self.user_domain.handle_command(cmd).await,
            DomainCommand::System(cmd) => self.system_domain.handle_command(cmd).await,
        }
    }

    /// 处理领域查询
    pub async fn handle_query(&self, query: DomainQuery) -> Result<DomainResult, DomainError> {
        match query {
            DomainQuery::Reading(q) => self.reading_domain.handle_query(q).await,
            DomainQuery::Search(q) => self.search_domain.handle_query(q).await,
            DomainQuery::User(q) => self.user_domain.handle_query(q).await,
            DomainQuery::System(q) => self.system_domain.handle_query(q).await,
        }
    }
}

/// 领域命令
#[derive(Debug, Clone)]
pub enum DomainCommand {
    Reading(reading::ReadingCommand),
    Search(search::SearchCommand),
    User(user::UserCommand),
    System(system::SystemCommand),
}

/// 领域查询
#[derive(Debug, Clone)]
pub enum DomainQuery {
    Reading(reading::ReadingQuery),
    Search(search::SearchDomainQuery),
    User(user::UserQuery),
    System(system::SystemQuery),
}

/// 领域层初始化函数
pub async fn init_domain_layer() -> Result<DomainLayer, DomainError> {
    DomainLayerBuilder::new()
        .with_reading_domain(reading::ReadingDomain::new().await?)
        .with_search_domain(search::SearchDomain::new().await?)
        .with_user_domain(user::UserDomain::new().await?)
        .with_system_domain(system::SystemDomain::new().await?)
        .build()
}