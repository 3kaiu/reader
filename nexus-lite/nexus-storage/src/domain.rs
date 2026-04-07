//! 存储领域层 (Storage Domain Layer)
//!
//! 存储领域负责数据持久化、缓存管理、文件存储等数据存储业务逻辑。
//! 该领域包含以下核心概念：
//! - 数据对象 (DataObject): 存储的数据实体
//! - 存储桶 (StorageBucket): 数据组织容器
//! - 缓存条目 (CacheEntry): 缓存数据项
//! - 存储策略 (StorageStrategy): 数据存储策略

#![allow(deprecated)]

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{RwLock, RwLockReadGuard, RwLockWriteGuard};
use uuid::Uuid;

use nexus_core::{DomainError, Entity, ValueObject};

use nexus_core::domain::StorageEvent as CoreStorageEvent;
use nexus_core::EngineError as StorageError;
use nexus_core::{AggregateRoot, BusinessRuleValidator, DomainContext, DomainEvent, DomainResult};

fn to_storage_value<T: Serialize>(
    value: &T,
    entity_name: &str,
) -> Result<serde_json::Value, StorageError> {
    serde_json::to_value(value).map_err(|err| StorageError::Internal {
        message: format!("Failed to serialize {}: {}", entity_name, err),
    })
}

fn read_lock<'a, T>(
    lock: &'a RwLock<T>,
    lock_name: &str,
) -> Result<RwLockReadGuard<'a, T>, StorageError> {
    lock.read().map_err(|_| StorageError::Internal {
        message: format!("{} lock poisoned during read", lock_name),
    })
}

fn write_lock<'a, T>(
    lock: &'a RwLock<T>,
    lock_name: &str,
) -> Result<RwLockWriteGuard<'a, T>, StorageError> {
    lock.write().map_err(|_| StorageError::Internal {
        message: format!("{} lock poisoned during write", lock_name),
    })
}

/// 数据对象实体 - 聚合根
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataObject {
    pub id: DataObjectId,
    pub key: String,
    pub bucket: String,
    pub data: Vec<u8>,
    pub content_type: String,
    pub size_bytes: u64,
    pub checksum: String,
    pub metadata: HashMap<String, String>,
    pub storage_class: StorageClass,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub version: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct DataObjectId(pub String);

impl std::fmt::Display for DataObjectId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StorageClass {
    Standard,
    InfrequentAccess,
    Archive,
    Cold,
}

#[async_trait]
impl Entity for DataObject {
    type Id = DataObjectId;

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
impl AggregateRoot for DataObject {
    fn version(&self) -> u64 {
        self.version
    }

    fn increment_version(&mut self) {
        self.version += 1;
        self.updated_at = Utc::now();
    }

    fn uncommitted_events(&self) -> Vec<DomainEvent> {
        Vec::new() // 简化的实现
    }

    fn clear_uncommitted_events(&mut self) {
        // 简化的实现
    }
}

impl DataObject {
    /// 创建新数据对象
    pub fn new(key: String, bucket: String, data: Vec<u8>, content_type: String) -> Self {
        let now = Utc::now();
        let checksum = format!("{:x}", md5::compute(&data));
        let size_bytes = data.len() as u64;

        Self {
            id: DataObjectId(Uuid::new_v4().to_string()),
            key,
            bucket,
            data,
            content_type,
            size_bytes,
            checksum,
            metadata: HashMap::new(),
            storage_class: StorageClass::Standard,
            created_at: now,
            updated_at: now,
            expires_at: None,
            version: 0,
        }
    }

    /// 检查数据是否过期
    pub fn is_expired(&self) -> bool {
        self.expires_at.is_some_and(|expires| Utc::now() > expires)
    }

    /// 更新数据内容
    pub fn update_data(&mut self, data: Vec<u8>) {
        self.data = data;
        self.checksum = format!("{:x}", md5::compute(&self.data));
        self.size_bytes = self.data.len() as u64;
        self.increment_version();
    }

    /// 设置过期时间
    pub fn set_expiry(&mut self, expires_at: DateTime<Utc>) {
        self.expires_at = Some(expires_at);
        self.increment_version();
    }
}

/// 存储桶实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageBucket {
    pub id: StorageBucketId,
    pub name: String,
    pub description: Option<String>,
    pub storage_class: StorageClass,
    pub max_size_bytes: Option<u64>,
    pub current_size_bytes: u64,
    pub object_count: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub lifecycle_rules: Vec<LifecycleRule>,
    pub permissions: Vec<BucketPermission>,
    pub version: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct StorageBucketId(pub String);

impl std::fmt::Display for StorageBucketId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LifecycleRule {
    pub id: String,
    pub prefix: String,
    pub transition_to_ia_after_days: Option<u32>,
    pub transition_to_archive_after_days: Option<u32>,
    pub transition_to_cold_after_days: Option<u32>,
    pub delete_after_days: Option<u32>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketPermission {
    pub user_id: String,
    pub permission: BucketPermissionType,
    pub granted_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BucketPermissionType {
    Read,
    Write,
    Delete,
    Admin,
}

#[async_trait]
impl Entity for StorageBucket {
    type Id = StorageBucketId;

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

/// 缓存条目值对象
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CacheEntry {
    pub key: String,
    pub value: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub accessed_at: DateTime<Utc>,
    pub ttl_seconds: Option<u64>,
    pub access_count: u64,
    pub size_bytes: u64,
    pub tags: Vec<String>,
}

impl ValueObject for CacheEntry {}

impl CacheEntry {
    /// 检查缓存条目是否过期
    pub fn is_expired(&self) -> bool {
        if let Some(ttl) = self.ttl_seconds {
            let expires_at = self.created_at + chrono::Duration::seconds(ttl as i64);
            Utc::now() > expires_at
        } else {
            false
        }
    }

    /// 记录访问
    pub fn record_access(&mut self) {
        self.accessed_at = Utc::now();
        self.access_count += 1;
    }
}

/// 存储策略值对象
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StorageStrategy {
    pub name: String,
    pub strategy_type: StrategyType,
    pub config: HashMap<String, serde_json::Value>,
    pub priority: i32,
    pub is_active: bool,
    pub conditions: Vec<StrategyCondition>,
}

impl ValueObject for StorageStrategy {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum StrategyType {
    Replication,
    Compression,
    Encryption,
    Deduplication,
    Tiering,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StrategyCondition {
    pub condition_type: ConditionType,
    pub operator: ConditionOperator,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ConditionType {
    FileSize,
    FileType,
    AccessFrequency,
    Age,
    StorageClass,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ConditionOperator {
    Equals,
    NotEquals,
    GreaterThan,
    LessThan,
    Contains,
    NotContains,
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
    StorageQuotaExceeded {
        bucket: String,
        current_size: u64,
        max_size: u64,
    },
}

/// 存储领域命令
#[derive(Debug, Clone)]
pub enum StorageCommand {
    CreateDataObject {
        object: DataObject,
    },
    UpdateDataObject {
        object_id: String,
        data: Vec<u8>,
    },
    DeleteDataObject {
        object_id: String,
    },
    CreateStorageBucket {
        bucket: StorageBucket,
    },
    UpdateBucketLifecycle {
        bucket_id: String,
        rules: Vec<LifecycleRule>,
    },
    SetCacheEntry {
        entry: CacheEntry,
    },
    DeleteCacheEntry {
        key: String,
    },
    ClearExpiredCache,
    ApplyStorageStrategy {
        strategy: StorageStrategy,
        target_bucket: String,
    },
}

/// 存储领域查询
#[derive(Debug, Clone)]
pub enum StorageQuery {
    GetDataObject {
        object_id: String,
    },
    ListObjectsInBucket {
        bucket: String,
        prefix: Option<String>,
        limit: Option<u32>,
    },
    GetStorageBucket {
        bucket_id: String,
    },
    ListBuckets {
        limit: Option<u32>,
    },
    GetCacheEntry {
        key: String,
    },
    ListCacheEntries {
        tag: Option<String>,
        limit: Option<u32>,
    },
    GetStorageStatistics,
    GetBucketStatistics {
        bucket_id: String,
    },
    GetCacheStatistics,
}

/// 存储领域 - 聚合所有存储相关业务逻辑
pub struct StorageDomain {
    object_repository: Box<dyn DataObjectRepository>,
    bucket_repository: Box<dyn StorageBucketRepository>,
    cache_repository: Box<dyn CacheRepository>,
    strategy_service: Box<dyn StorageStrategyService>,
    metrics_service: Box<dyn StorageMetricsService>,
    business_rules: Vec<Box<dyn BusinessRuleValidator<DataObject>>>,
}

impl StorageDomain {
    pub async fn new() -> Result<Self, StorageError> {
        Ok(Self {
            object_repository: Box::new(InMemoryDataObjectRepository::new()),
            bucket_repository: Box::new(InMemoryStorageBucketRepository::new()),
            cache_repository: Box::new(InMemoryCacheRepository::new()),
            strategy_service: Box::new(BasicStorageStrategyService::new()),
            metrics_service: Box::new(BasicStorageMetricsService::new()),
            business_rules: vec![
                Box::new(DataObjectKeyValidRule),
                Box::new(DataObjectSizeValidRule),
            ],
        })
    }

    pub async fn handle_command(
        &self,
        command: StorageCommand,
    ) -> Result<DomainResult, StorageError> {
        match command {
            StorageCommand::CreateDataObject { object } => self.create_data_object(object).await,
            StorageCommand::UpdateDataObject { object_id, data } => {
                self.update_data_object(object_id, data).await
            },
            StorageCommand::DeleteDataObject { object_id } => {
                self.delete_data_object(object_id).await
            },
            StorageCommand::CreateStorageBucket { bucket } => {
                self.create_storage_bucket(bucket).await
            },
            StorageCommand::UpdateBucketLifecycle { bucket_id, rules } => {
                self.update_bucket_lifecycle(bucket_id, rules).await
            },
            StorageCommand::SetCacheEntry { entry } => self.set_cache_entry(entry).await,
            StorageCommand::DeleteCacheEntry { key } => self.delete_cache_entry(key).await,
            StorageCommand::ClearExpiredCache => self.clear_expired_cache().await,
            StorageCommand::ApplyStorageStrategy {
                strategy,
                target_bucket,
            } => self.apply_storage_strategy(strategy, target_bucket).await,
        }
    }

    pub async fn handle_query(&self, query: StorageQuery) -> Result<DomainResult, StorageError> {
        match query {
            StorageQuery::GetDataObject { object_id } => self.get_data_object(object_id).await,
            StorageQuery::ListObjectsInBucket {
                bucket,
                prefix,
                limit,
            } => self.list_objects_in_bucket(bucket, prefix, limit).await,
            StorageQuery::GetStorageBucket { bucket_id } => {
                self.get_storage_bucket(bucket_id).await
            },
            StorageQuery::ListBuckets { limit } => self.list_buckets(limit).await,
            StorageQuery::GetCacheEntry { key } => self.get_cache_entry(key).await,
            StorageQuery::ListCacheEntries { tag, limit } => {
                self.list_cache_entries(tag, limit).await
            },
            StorageQuery::GetStorageStatistics => self.get_storage_statistics().await,
            StorageQuery::GetBucketStatistics { bucket_id } => {
                self.get_bucket_statistics(bucket_id).await
            },
            StorageQuery::GetCacheStatistics => self.get_cache_statistics().await,
        }
    }

    async fn create_data_object(&self, object: DataObject) -> Result<DomainResult, StorageError> {
        // 验证业务规则
        for rule in &self.business_rules {
            rule.validate(&object, &DomainContext::default()).await?;
        }

        self.object_repository.save(&object).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&object, "data object")?),
            events: vec![DomainEvent::Storage(CoreStorageEvent::DataObjectCreated {
                object_id: object.id.0.clone(),
                bucket: object.bucket.clone(),
                key: object.key.clone(),
                size_bytes: object.size_bytes,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn update_data_object(
        &self,
        object_id: String,
        data: Vec<u8>,
    ) -> Result<DomainResult, StorageError> {
        let object_id = DataObjectId(object_id);
        let mut object = self
            .object_repository
            .find_by_id(&object_id)
            .await?
            .ok_or_else(|| StorageError::NotFound {
                resource: format!("Object {}", object_id.0),
            })?;

        let old_size = object.size_bytes;
        object.update_data(data);
        self.object_repository.save(&object).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&object, "data object")?),
            events: vec![DomainEvent::Storage(CoreStorageEvent::DataObjectUpdated {
                object_id: object.id.0,
                bucket: object.bucket,
                key: object.key,
                old_size,
                new_size: object.size_bytes,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn delete_data_object(&self, object_id: String) -> Result<DomainResult, StorageError> {
        let object_id = DataObjectId(object_id);
        let object = self
            .object_repository
            .find_by_id(&object_id)
            .await?
            .ok_or_else(|| StorageError::NotFound {
                resource: format!("Object {}", object_id.0),
            })?;

        self.object_repository.delete(&object_id).await?;

        Ok(DomainResult {
            success: true,
            data: None,
            events: vec![DomainEvent::Storage(CoreStorageEvent::DataObjectDeleted {
                object_id: object.id.0,
                bucket: object.bucket,
                key: object.key,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn create_storage_bucket(
        &self,
        bucket: StorageBucket,
    ) -> Result<DomainResult, StorageError> {
        self.bucket_repository.save(&bucket).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&bucket, "storage bucket")?),
            events: vec![DomainEvent::Storage(CoreStorageEvent::BucketCreated {
                bucket_id: bucket.id.0,
                name: bucket.name,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn update_bucket_lifecycle(
        &self,
        bucket_id: String,
        rules: Vec<LifecycleRule>,
    ) -> Result<DomainResult, StorageError> {
        let bucket_id = StorageBucketId(bucket_id);
        let mut bucket = self
            .bucket_repository
            .find_by_id(&bucket_id)
            .await?
            .ok_or_else(|| StorageError::NotFound {
                resource: format!("Bucket {}", bucket_id.0),
            })?;

        bucket.lifecycle_rules = rules;
        bucket.updated_at = Utc::now();
        self.bucket_repository.save(&bucket).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&bucket, "storage bucket")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn set_cache_entry(&self, entry: CacheEntry) -> Result<DomainResult, StorageError> {
        self.cache_repository.save(&entry).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&entry, "cache entry")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn delete_cache_entry(&self, key: String) -> Result<DomainResult, StorageError> {
        self.cache_repository.delete(&key).await?;

        Ok(DomainResult {
            success: true,
            data: None,
            events: vec![DomainEvent::Storage(CoreStorageEvent::CacheEvicted {
                key,
                reason: "Manual deletion".to_string(),
            })],
            metadata: HashMap::new(),
        })
    }

    async fn clear_expired_cache(&self) -> Result<DomainResult, StorageError> {
        let cleared_count = self.cache_repository.clear_expired().await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!({ "cleared_count": cleared_count })),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn apply_storage_strategy(
        &self,
        strategy: StorageStrategy,
        target_bucket: String,
    ) -> Result<DomainResult, StorageError> {
        let result = self
            .strategy_service
            .apply_strategy(&strategy, &target_bucket)
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&result, "strategy result")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_data_object(&self, object_id: String) -> Result<DomainResult, StorageError> {
        let object_id = DataObjectId(object_id);
        let object = self
            .object_repository
            .find_by_id(&object_id)
            .await?
            .ok_or_else(|| StorageError::NotFound {
                resource: format!("Object {}", object_id.0),
            })?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&object, "data object")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn list_objects_in_bucket(
        &self,
        bucket: String,
        prefix: Option<String>,
        limit: Option<u32>,
    ) -> Result<DomainResult, StorageError> {
        let objects = self
            .object_repository
            .find_by_bucket(&bucket, prefix, limit.unwrap_or(100))
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(objects)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_storage_bucket(&self, bucket_id: String) -> Result<DomainResult, StorageError> {
        let bucket_id = StorageBucketId(bucket_id);
        let bucket = self
            .bucket_repository
            .find_by_id(&bucket_id)
            .await?
            .ok_or_else(|| StorageError::NotFound {
                resource: format!("Bucket {}", bucket_id.0),
            })?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&bucket, "storage bucket")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn list_buckets(&self, limit: Option<u32>) -> Result<DomainResult, StorageError> {
        let buckets = self.bucket_repository.find_all(limit.unwrap_or(50)).await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(buckets)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_cache_entry(&self, key: String) -> Result<DomainResult, StorageError> {
        let entry = self.cache_repository.find_by_key(&key).await?;

        if let Some(entry) = entry {
            Ok(DomainResult {
                success: true,
                data: Some(entry.value),
                events: vec![DomainEvent::Storage(CoreStorageEvent::CacheHit {
                    key,
                    access_count: entry.access_count,
                })],
                metadata: HashMap::new(),
            })
        } else {
            Ok(DomainResult {
                success: false,
                data: None,
                events: vec![DomainEvent::Storage(CoreStorageEvent::CacheMiss { key })],
                metadata: HashMap::new(),
            })
        }
    }

    async fn list_cache_entries(
        &self,
        tag: Option<String>,
        limit: Option<u32>,
    ) -> Result<DomainResult, StorageError> {
        let entries = self
            .cache_repository
            .find_by_tag(tag, limit.unwrap_or(100))
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(entries)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_storage_statistics(&self) -> Result<DomainResult, StorageError> {
        let stats = self.metrics_service.get_storage_statistics().await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&stats, "storage statistics")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_bucket_statistics(&self, bucket_id: String) -> Result<DomainResult, StorageError> {
        let stats = self
            .metrics_service
            .get_bucket_statistics(&bucket_id)
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&stats, "bucket statistics")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_cache_statistics(&self) -> Result<DomainResult, StorageError> {
        let stats = self.metrics_service.get_cache_statistics().await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_storage_value(&stats, "cache statistics")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }
}

// ===== 仓库接口 =====

#[async_trait]
pub trait DataObjectRepository: Send + Sync {
    async fn save(&self, object: &DataObject) -> Result<(), StorageError>;
    async fn find_by_id(&self, id: &DataObjectId) -> Result<Option<DataObject>, StorageError>;
    async fn find_by_bucket(
        &self,
        bucket: &str,
        prefix: Option<String>,
        limit: u32,
    ) -> Result<Vec<DataObject>, StorageError>;
    async fn delete(&self, id: &DataObjectId) -> Result<(), StorageError>;
}

#[async_trait]
pub trait StorageBucketRepository: Send + Sync {
    async fn save(&self, bucket: &StorageBucket) -> Result<(), StorageError>;
    async fn find_by_id(&self, id: &StorageBucketId)
        -> Result<Option<StorageBucket>, StorageError>;
    async fn find_by_name(&self, name: &str) -> Result<Option<StorageBucket>, StorageError>;
    async fn find_all(&self, limit: u32) -> Result<Vec<StorageBucket>, StorageError>;
    async fn delete(&self, id: &StorageBucketId) -> Result<(), StorageError>;
}

#[async_trait]
pub trait CacheRepository: Send + Sync {
    async fn save(&self, entry: &CacheEntry) -> Result<(), StorageError>;
    async fn find_by_key(&self, key: &str) -> Result<Option<CacheEntry>, StorageError>;
    async fn find_by_tag(
        &self,
        tag: Option<String>,
        limit: u32,
    ) -> Result<Vec<CacheEntry>, StorageError>;
    async fn delete(&self, key: &str) -> Result<(), StorageError>;
    async fn clear_expired(&self) -> Result<u64, StorageError>;
}

#[async_trait]
pub trait StorageStrategyService: Send + Sync {
    async fn apply_strategy(
        &self,
        strategy: &StorageStrategy,
        target_bucket: &str,
    ) -> Result<StrategyApplicationResult, StorageError>;
    async fn get_available_strategies(&self) -> Result<Vec<StorageStrategy>, StorageError>;
}

#[async_trait]
pub trait StorageMetricsService: Send + Sync {
    async fn get_storage_statistics(&self) -> Result<StorageStatistics, StorageError>;
    async fn get_bucket_statistics(
        &self,
        bucket_id: &str,
    ) -> Result<BucketStatistics, StorageError>;
    async fn get_cache_statistics(&self) -> Result<CacheStatistics, StorageError>;
}

// ===== 内存实现 =====

pub struct InMemoryDataObjectRepository {
    objects: std::sync::RwLock<HashMap<DataObjectId, DataObject>>,
}

impl InMemoryDataObjectRepository {
    pub fn new() -> Self {
        Self {
            objects: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

impl Default for InMemoryDataObjectRepository {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl DataObjectRepository for InMemoryDataObjectRepository {
    async fn save(&self, object: &DataObject) -> Result<(), StorageError> {
        let mut objects = write_lock(&self.objects, "data objects")?;
        objects.insert(object.id.clone(), object.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &DataObjectId) -> Result<Option<DataObject>, StorageError> {
        let objects = read_lock(&self.objects, "data objects")?;
        Ok(objects.get(id).cloned())
    }

    async fn find_by_bucket(
        &self,
        bucket: &str,
        prefix: Option<String>,
        limit: u32,
    ) -> Result<Vec<DataObject>, StorageError> {
        let objects = read_lock(&self.objects, "data objects")?;
        let filtered: Vec<DataObject> = objects
            .values()
            .filter(|o| o.bucket == bucket)
            .filter(|o| prefix.as_ref().is_none_or(|p| o.key.starts_with(p)))
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn delete(&self, id: &DataObjectId) -> Result<(), StorageError> {
        let mut objects = write_lock(&self.objects, "data objects")?;
        objects.remove(id);
        Ok(())
    }
}

pub struct InMemoryStorageBucketRepository {
    buckets: std::sync::RwLock<HashMap<StorageBucketId, StorageBucket>>,
}

impl InMemoryStorageBucketRepository {
    pub fn new() -> Self {
        Self {
            buckets: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

impl Default for InMemoryStorageBucketRepository {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl StorageBucketRepository for InMemoryStorageBucketRepository {
    async fn save(&self, bucket: &StorageBucket) -> Result<(), StorageError> {
        let mut buckets = write_lock(&self.buckets, "storage buckets")?;
        buckets.insert(bucket.id.clone(), bucket.clone());
        Ok(())
    }

    async fn find_by_id(
        &self,
        id: &StorageBucketId,
    ) -> Result<Option<StorageBucket>, StorageError> {
        let buckets = read_lock(&self.buckets, "storage buckets")?;
        Ok(buckets.get(id).cloned())
    }

    async fn find_by_name(&self, name: &str) -> Result<Option<StorageBucket>, StorageError> {
        let buckets = read_lock(&self.buckets, "storage buckets")?;
        let bucket = buckets.values().find(|b| b.name == name).cloned();
        Ok(bucket)
    }

    async fn find_all(&self, limit: u32) -> Result<Vec<StorageBucket>, StorageError> {
        let buckets = read_lock(&self.buckets, "storage buckets")?;
        let all: Vec<StorageBucket> = buckets.values().take(limit as usize).cloned().collect();
        Ok(all)
    }

    async fn delete(&self, id: &StorageBucketId) -> Result<(), StorageError> {
        let mut buckets = write_lock(&self.buckets, "storage buckets")?;
        buckets.remove(id);
        Ok(())
    }
}

pub struct InMemoryCacheRepository {
    entries: std::sync::RwLock<HashMap<String, CacheEntry>>,
}

impl InMemoryCacheRepository {
    pub fn new() -> Self {
        Self {
            entries: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

impl Default for InMemoryCacheRepository {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CacheRepository for InMemoryCacheRepository {
    async fn save(&self, entry: &CacheEntry) -> Result<(), StorageError> {
        let mut entries = write_lock(&self.entries, "cache entries")?;
        entries.insert(entry.key.clone(), entry.clone());
        Ok(())
    }

    async fn find_by_key(&self, key: &str) -> Result<Option<CacheEntry>, StorageError> {
        let entries = read_lock(&self.entries, "cache entries")?;
        Ok(entries.get(key).cloned())
    }

    async fn find_by_tag(
        &self,
        tag: Option<String>,
        limit: u32,
    ) -> Result<Vec<CacheEntry>, StorageError> {
        let entries = read_lock(&self.entries, "cache entries")?;
        let filtered: Vec<CacheEntry> = if let Some(tag) = tag {
            entries
                .values()
                .filter(|e| e.tags.contains(&tag))
                .take(limit as usize)
                .cloned()
                .collect()
        } else {
            entries.values().take(limit as usize).cloned().collect()
        };
        Ok(filtered)
    }

    async fn delete(&self, key: &str) -> Result<(), StorageError> {
        let mut entries = write_lock(&self.entries, "cache entries")?;
        entries.remove(key);
        Ok(())
    }

    async fn clear_expired(&self) -> Result<u64, StorageError> {
        let mut entries = write_lock(&self.entries, "cache entries")?;
        let mut cleared_count = 0u64;

        entries.retain(|_, entry| {
            if entry.is_expired() {
                cleared_count += 1;
                false
            } else {
                true
            }
        });

        Ok(cleared_count)
    }
}

pub struct BasicStorageStrategyService;

impl BasicStorageStrategyService {
    pub fn new() -> Self {
        Self
    }
}

impl Default for BasicStorageStrategyService {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl StorageStrategyService for BasicStorageStrategyService {
    async fn apply_strategy(
        &self,
        _strategy: &StorageStrategy,
        _target_bucket: &str,
    ) -> Result<StrategyApplicationResult, StorageError> {
        Ok(StrategyApplicationResult {
            strategy_name: _strategy.name.clone(),
            target_bucket: _target_bucket.to_string(),
            processed_objects: 150,
            saved_bytes: 2048000,
            execution_time_ms: 2500,
        })
    }

    async fn get_available_strategies(&self) -> Result<Vec<StorageStrategy>, StorageError> {
        Ok(vec![
            StorageStrategy {
                name: "compression".to_string(),
                strategy_type: StrategyType::Compression,
                config: HashMap::new(),
                priority: 1,
                is_active: true,
                conditions: Vec::new(),
            },
            StorageStrategy {
                name: "deduplication".to_string(),
                strategy_type: StrategyType::Deduplication,
                config: HashMap::new(),
                priority: 2,
                is_active: true,
                conditions: Vec::new(),
            },
        ])
    }
}

pub struct BasicStorageMetricsService;

impl BasicStorageMetricsService {
    pub fn new() -> Self {
        Self
    }
}

impl Default for BasicStorageMetricsService {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl StorageMetricsService for BasicStorageMetricsService {
    async fn get_storage_statistics(&self) -> Result<StorageStatistics, StorageError> {
        Ok(StorageStatistics {
            total_objects: 5000,
            total_size_bytes: 1073741824, // 1GB
            total_buckets: 25,
            compression_ratio: 0.75,
            deduplication_ratio: 0.85,
            cache_hit_rate: 0.92,
        })
    }

    async fn get_bucket_statistics(
        &self,
        _bucket_id: &str,
    ) -> Result<BucketStatistics, StorageError> {
        Ok(BucketStatistics {
            bucket_id: _bucket_id.to_string(),
            object_count: 200,
            total_size_bytes: 52428800,  // 50MB
            average_object_size: 262144, // 256KB
            last_modified: Utc::now(),
            storage_class_distribution: HashMap::from([
                ("standard".to_string(), 150),
                ("ia".to_string(), 45),
                ("archive".to_string(), 5),
            ]),
        })
    }

    async fn get_cache_statistics(&self) -> Result<CacheStatistics, StorageError> {
        Ok(CacheStatistics {
            total_entries: 2500,
            total_size_bytes: 134217728, // 128MB
            hit_count: 95000,
            miss_count: 5000,
            hit_rate: 0.95,
            eviction_count: 1200,
            average_access_time_ms: 0.8,
        })
    }
}

// ===== 业务规则 =====

pub struct DataObjectKeyValidRule;

#[async_trait]
impl BusinessRuleValidator<DataObject> for DataObjectKeyValidRule {
    fn rule_name(&self) -> &str {
        "data_object_key_valid"
    }

    async fn validate(
        &self,
        entity: &DataObject,
        _context: &DomainContext,
    ) -> Result<(), DomainError> {
        if entity.key.trim().is_empty() {
            return Err(DomainError::Validation("Data object key cannot be empty".to_string()));
        }
        if entity.key.len() > 1024 {
            return Err(DomainError::Validation(
                "Data object key is too long (max 1024 characters)".to_string(),
            ));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that data object key is valid"
    }
}

pub struct DataObjectSizeValidRule;

#[async_trait]
impl BusinessRuleValidator<DataObject> for DataObjectSizeValidRule {
    fn rule_name(&self) -> &str {
        "data_object_size_valid"
    }

    async fn validate(
        &self,
        entity: &DataObject,
        _context: &DomainContext,
    ) -> Result<(), DomainError> {
        const MAX_SIZE: u64 = 100 * 1024 * 1024; // 100MB
        if entity.size_bytes > MAX_SIZE {
            return Err(DomainError::Validation(format!(
                "Data object is too large (max {} bytes)",
                MAX_SIZE
            )));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that data object size is within limits"
    }
}

// ===== 数据传输对象 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyApplicationResult {
    pub strategy_name: String,
    pub target_bucket: String,
    pub processed_objects: u64,
    pub saved_bytes: u64,
    pub execution_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStatistics {
    pub total_objects: u64,
    pub total_size_bytes: u64,
    pub total_buckets: u32,
    pub compression_ratio: f64,
    pub deduplication_ratio: f64,
    pub cache_hit_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketStatistics {
    pub bucket_id: String,
    pub object_count: u64,
    pub total_size_bytes: u64,
    pub average_object_size: u64,
    pub last_modified: DateTime<Utc>,
    pub storage_class_distribution: HashMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStatistics {
    pub total_entries: u64,
    pub total_size_bytes: u64,
    pub hit_count: u64,
    pub miss_count: u64,
    pub hit_rate: f64,
    pub eviction_count: u64,
    pub average_access_time_ms: f64,
}
