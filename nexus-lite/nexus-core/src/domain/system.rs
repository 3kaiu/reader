//! 系统领域 (System Domain)
//!
//! 系统领域负责处理系统级别的配置、管理、监控和优化功能。
//! 该领域包含以下核心概念：
//! - 系统配置(SystemConfig): 全局系统配置
//! - 系统监控(SystemMonitor): 系统状态监控
//! - 系统优化(SystemOptimizer): 系统性能优化
//! - 系统事件(SystemEvent): 系统级别事件

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

/// 系统配置实体 - 聚合根
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemConfig {
    pub id: SystemConfigId,
    pub config_key: String,
    pub config_value: serde_json::Value,
    pub config_type: ConfigType,
    pub description: String,
    pub is_encrypted: bool,
    pub is_runtime_updateable: bool,
    pub validation_rules: Vec<ConfigValidationRule>,
    pub depends_on: Vec<String>,
    pub tags: Vec<String>,
    pub version: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_modified_by: Option<String>,
    #[serde(skip)]
    pub uncommitted_events: Vec<DomainEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SystemConfigId(pub String);

impl fmt::Display for SystemConfigId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfigType {
    String,
    Number,
    Boolean,
    Object,
    Array,
    Encrypted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigValidationRule {
    pub rule_type: ValidationRuleType,
    pub parameters: HashMap<String, serde_json::Value>,
    pub error_message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationRuleType {
    Required,
    MinLength,
    MaxLength,
    MinValue,
    MaxValue,
    Pattern,
    Enum,
    Custom,
}

#[async_trait]
impl Entity for SystemConfig {
    type Id = SystemConfigId;

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
impl AggregateRoot for SystemConfig {
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

impl SystemConfig {
    /// 创建新配置项
    pub fn new(
        id: SystemConfigId,
        config_key: String,
        config_value: serde_json::Value,
        config_type: ConfigType,
        description: String,
    ) -> Self {
        let now = Utc::now();
        let config_id = id.0.clone();
        let config_key_ev = config_key.clone();
        Self {
            id,
            config_key,
            config_value,
            config_type,
            description,
            is_encrypted: false,
            is_runtime_updateable: true,
            validation_rules: Vec::new(),
            depends_on: Vec::new(),
            tags: Vec::new(),
            version: 0,
            created_at: now,
            updated_at: now,
            last_modified_by: None,
            uncommitted_events: vec![DomainEvent::System(SystemEvent::SystemConfigCreated {
                config_id,
                config_key: config_key_ev,
            })],
        }
    }

    /// 更新配置值
    pub fn update_value(
        &mut self,
        new_value: serde_json::Value,
        modified_by: Option<String>,
    ) -> Result<(), DomainError> {
        // 验证配置值
        self.validate_value(&new_value)?;

        let old_value = self.config_value.clone();
        self.config_value = new_value;
        self.last_modified_by = modified_by;
        self.increment_version();

        self.uncommitted_events
            .push(DomainEvent::System(SystemEvent::SystemConfigUpdated {
                config_id: self.id.0.clone(),
                config_key: self.config_key.clone(),
                old_value,
                new_value: self.config_value.clone(),
            }));

        Ok(())
    }

    /// 添加验证规则
    pub fn add_validation_rule(&mut self, rule: ConfigValidationRule) {
        self.validation_rules.push(rule);
        self.increment_version();
    }

    /// 验证配置值
    pub fn validate_value(&self, value: &serde_json::Value) -> Result<(), DomainError> {
        for rule in &self.validation_rules {
            match rule.rule_type {
                ValidationRuleType::Required => {
                    if value.is_null() {
                        return Err(DomainError::Validation(rule.error_message.clone()));
                    }
                },
                ValidationRuleType::MinLength => {
                    if let Some(min_len) = rule.parameters.get("minLength").and_then(|v| v.as_u64())
                    {
                        if let Some(str_val) = value.as_str() {
                            if str_val.len() < min_len as usize {
                                return Err(DomainError::Validation(rule.error_message.clone()));
                            }
                        }
                    }
                },
                ValidationRuleType::MaxLength => {
                    if let Some(max_len) = rule.parameters.get("maxLength").and_then(|v| v.as_u64())
                    {
                        if let Some(str_val) = value.as_str() {
                            if str_val.len() > max_len as usize {
                                return Err(DomainError::Validation(rule.error_message.clone()));
                            }
                        }
                    }
                },
                ValidationRuleType::MinValue => {
                    if let Some(min_val) = rule.parameters.get("minValue").and_then(|v| v.as_f64())
                    {
                        if let Some(num_val) = value.as_f64() {
                            if num_val < min_val {
                                return Err(DomainError::Validation(rule.error_message.clone()));
                            }
                        }
                    }
                },
                ValidationRuleType::MaxValue => {
                    if let Some(max_val) = rule.parameters.get("maxValue").and_then(|v| v.as_f64())
                    {
                        if let Some(num_val) = value.as_f64() {
                            if num_val > max_val {
                                return Err(DomainError::Validation(rule.error_message.clone()));
                            }
                        }
                    }
                },
                ValidationRuleType::Enum => {
                    if let Some(allowed_values) =
                        rule.parameters.get("values").and_then(|v| v.as_array())
                    {
                        let is_valid = allowed_values.iter().any(|allowed| allowed == value);
                        if !is_valid {
                            return Err(DomainError::Validation(rule.error_message.clone()));
                        }
                    }
                },
                _ => {}, // 其他规则暂时跳过
            }
        }
        Ok(())
    }
}

/// 系统指标实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetric {
    pub id: SystemMetricId,
    pub metric_name: String,
    pub metric_value: f64,
    pub metric_type: MetricType,
    pub unit: String,
    pub timestamp: DateTime<Utc>,
    pub tags: HashMap<String, String>,
    pub source: String,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SystemMetricId(pub String);

impl std::fmt::Display for SystemMetricId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MetricType {
    Counter,
    Gauge,
    Histogram,
    Summary,
}

#[async_trait]
impl Entity for SystemMetric {
    type Id = SystemMetricId;

    fn id(&self) -> &Self::Id {
        &self.id
    }

    fn is_new(&self) -> bool {
        false // 系统指标通常是只读的
    }

    fn created_at(&self) -> DateTime<Utc> {
        self.timestamp
    }

    fn updated_at(&self) -> DateTime<Utc> {
        self.timestamp
    }
}

/// 系统告警实体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemAlert {
    pub id: SystemAlertId,
    pub alert_type: AlertType,
    pub severity: AlertSeverity,
    pub title: String,
    pub message: String,
    pub source: String,
    pub condition: String,
    pub threshold: f64,
    pub current_value: f64,
    pub status: AlertStatus,
    pub acknowledged_by: Option<String>,
    pub acknowledged_at: Option<DateTime<Utc>>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub tags: Vec<String>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SystemAlertId(pub String);

impl std::fmt::Display for SystemAlertId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertType {
    Performance,
    Availability,
    Security,
    Configuration,
    Resource,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AlertStatus {
    Active,
    Acknowledged,
    Resolved,
    Suppressed,
}

#[async_trait]
impl Entity for SystemAlert {
    type Id = SystemAlertId;

    fn id(&self) -> &Self::Id {
        &self.id
    }

    fn is_new(&self) -> bool {
        self.status == AlertStatus::Active && self.acknowledged_at.is_none()
    }

    fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }

    fn updated_at(&self) -> DateTime<Utc> {
        self.updated_at
    }
}

impl SystemAlert {
    /// 确认告警
    pub fn acknowledge(&mut self, acknowledged_by: String) {
        if self.status == AlertStatus::Active {
            self.status = AlertStatus::Acknowledged;
            self.acknowledged_by = Some(acknowledged_by);
            self.acknowledged_at = Some(Utc::now());
            self.updated_at = Utc::now();
        }
    }

    /// 解决告警
    pub fn resolve(&mut self) {
        self.status = AlertStatus::Resolved;
        self.resolved_at = Some(Utc::now());
        self.updated_at = Utc::now();
    }
}

/// 系统领域事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SystemEvent {
    SystemConfigCreated {
        config_id: String,
        config_key: String,
    },
    SystemConfigUpdated {
        config_id: String,
        config_key: String,
        old_value: serde_json::Value,
        new_value: serde_json::Value,
    },
    SystemMetricRecorded {
        metric_name: String,
        value: f64,
        source: String,
    },
    SystemAlertTriggered {
        alert_id: String,
        alert_type: String,
        severity: String,
        message: String,
    },
    SystemAlertAcknowledged {
        alert_id: String,
        acknowledged_by: String,
    },
    SystemAlertResolved {
        alert_id: String,
    },
    SystemOptimizationApplied {
        optimization_type: String,
        target: String,
        improvement: f64,
    },
    SystemMaintenanceScheduled {
        maintenance_type: String,
        scheduled_time: DateTime<Utc>,
    },
}

/// 系统领域命令
#[derive(Debug, Clone)]
pub enum SystemCommand {
    CreateSystemConfig {
        config_id: String,
        config_key: String,
        config_value: serde_json::Value,
        config_type: ConfigType,
        description: String,
    },
    UpdateSystemConfig {
        config_id: String,
        new_value: serde_json::Value,
        modified_by: Option<String>,
    },
    DeleteSystemConfig {
        config_id: String,
    },
    RecordSystemMetric {
        metric_name: String,
        metric_value: f64,
        metric_type: MetricType,
        unit: String,
        tags: HashMap<String, String>,
        source: String,
    },
    CreateSystemAlert {
        alert_type: AlertType,
        severity: AlertSeverity,
        title: String,
        message: String,
        source: String,
        condition: String,
        threshold: f64,
        current_value: f64,
    },
    AcknowledgeSystemAlert {
        alert_id: String,
        acknowledged_by: String,
    },
    ResolveSystemAlert {
        alert_id: String,
    },
    RunSystemOptimization {
        optimization_type: String,
        target: String,
    },
    ScheduleSystemMaintenance {
        maintenance_type: String,
        scheduled_time: DateTime<Utc>,
        description: String,
    },
}

/// 系统领域查询
#[derive(Debug, Clone)]
pub enum SystemQuery {
    GetSystemConfig {
        config_id: String,
    },
    ListSystemConfigs {
        filter_by_tag: Option<String>,
        limit: Option<u32>,
    },
    GetSystemMetrics {
        metric_name: Option<String>,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
        limit: Option<u32>,
    },
    GetSystemAlerts {
        status: Option<AlertStatus>,
        severity: Option<AlertSeverity>,
        limit: Option<u32>,
    },
    GetSystemHealth {
        include_details: bool,
    },
    GetSystemPerformance {
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    },
    GetSystemOptimizationHistory {
        limit: Option<u32>,
    },
}

/// 系统领域 - 聚合所有系统相关业务逻辑
pub struct SystemDomain {
    config_repository: Box<dyn SystemConfigRepository>,
    metric_repository: Box<dyn SystemMetricRepository>,
    alert_repository: Box<dyn SystemAlertRepository>,
    optimization_service: Box<dyn SystemOptimizationService>,
    monitoring_service: Box<dyn SystemMonitoringService>,
    business_rules: Vec<Box<dyn BusinessRuleValidator<SystemConfig>>>,
}

impl SystemDomain {
    pub async fn new() -> Result<Self, DomainError> {
        Ok(Self {
            config_repository: Box::new(InMemorySystemConfigRepository::new()),
            metric_repository: Box::new(InMemorySystemMetricRepository::new()),
            alert_repository: Box::new(InMemorySystemAlertRepository::new()),
            optimization_service: Box::new(BasicSystemOptimizationService::new()),
            monitoring_service: Box::new(BasicSystemMonitoringService::new()),
            business_rules: vec![
                Box::new(ConfigKeyNotEmptyRule),
                Box::new(ConfigValueValidRule),
            ],
        })
    }

    pub async fn handle_command(
        &self,
        command: SystemCommand,
    ) -> Result<DomainResult, DomainError> {
        match command {
            SystemCommand::CreateSystemConfig {
                config_id,
                config_key,
                config_value,
                config_type,
                description,
            } => {
                self.create_system_config(
                    config_id,
                    config_key,
                    config_value,
                    config_type,
                    description,
                )
                .await
            },
            SystemCommand::UpdateSystemConfig {
                config_id,
                new_value,
                modified_by,
            } => {
                self.update_system_config(config_id, new_value, modified_by)
                    .await
            },
            SystemCommand::DeleteSystemConfig { config_id } => {
                self.delete_system_config(config_id).await
            },
            SystemCommand::RecordSystemMetric {
                metric_name,
                metric_value,
                metric_type,
                unit,
                tags,
                source,
            } => {
                self.record_system_metric(
                    metric_name,
                    metric_value,
                    metric_type,
                    unit,
                    tags,
                    source,
                )
                .await
            },
            SystemCommand::CreateSystemAlert {
                alert_type,
                severity,
                title,
                message,
                source,
                condition,
                threshold,
                current_value,
            } => {
                self.create_system_alert(
                    alert_type,
                    severity,
                    title,
                    message,
                    source,
                    condition,
                    threshold,
                    current_value,
                )
                .await
            },
            SystemCommand::AcknowledgeSystemAlert {
                alert_id,
                acknowledged_by,
            } => {
                self.acknowledge_system_alert(alert_id, acknowledged_by)
                    .await
            },
            SystemCommand::ResolveSystemAlert { alert_id } => {
                self.resolve_system_alert(alert_id).await
            },
            SystemCommand::RunSystemOptimization {
                optimization_type,
                target,
            } => {
                self.run_system_optimization(optimization_type, target)
                    .await
            },
            SystemCommand::ScheduleSystemMaintenance {
                maintenance_type,
                scheduled_time,
                description,
            } => {
                self.schedule_system_maintenance(maintenance_type, scheduled_time, description)
                    .await
            },
        }
    }

    pub async fn handle_query(&self, query: SystemQuery) -> Result<DomainResult, DomainError> {
        match query {
            SystemQuery::GetSystemConfig { config_id } => self.get_system_config(config_id).await,
            SystemQuery::ListSystemConfigs {
                filter_by_tag,
                limit,
            } => self.list_system_configs(filter_by_tag, limit).await,
            SystemQuery::GetSystemMetrics {
                metric_name,
                time_range,
                limit,
            } => {
                self.get_system_metrics(metric_name, time_range, limit)
                    .await
            },
            SystemQuery::GetSystemAlerts {
                status,
                severity,
                limit,
            } => self.get_system_alerts(status, severity, limit).await,
            SystemQuery::GetSystemHealth { include_details } => {
                self.get_system_health(include_details).await
            },
            SystemQuery::GetSystemPerformance { time_range } => {
                self.get_system_performance(time_range).await
            },
            SystemQuery::GetSystemOptimizationHistory { limit } => {
                self.get_system_optimization_history(limit).await
            },
        }
    }

    async fn create_system_config(
        &self,
        config_id: String,
        config_key: String,
        config_value: serde_json::Value,
        config_type: ConfigType,
        description: String,
    ) -> Result<DomainResult, DomainError> {
        let config_id = SystemConfigId(config_id);
        let config = SystemConfig::new(
            config_id.clone(),
            config_key,
            config_value,
            config_type,
            description,
        );

        // 验证业务规则
        for rule in &self.business_rules {
            rule.validate(&config, &DomainContext::default()).await?;
        }

        self.config_repository.save(&config).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&config, "system config")?),
            events: config.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn update_system_config(
        &self,
        config_id: String,
        new_value: serde_json::Value,
        modified_by: Option<String>,
    ) -> Result<DomainResult, DomainError> {
        let config_id = SystemConfigId(config_id);
        let mut config = self
            .config_repository
            .find_by_id(&config_id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("Config {} not found", config_id.0)))?;

        config.update_value(new_value, modified_by)?;
        self.config_repository.save(&config).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&config, "system config")?),
            events: config.uncommitted_events.clone(),
            metadata: HashMap::new(),
        })
    }

    async fn delete_system_config(&self, config_id: String) -> Result<DomainResult, DomainError> {
        let config_id = SystemConfigId(config_id);
        self.config_repository.delete(&config_id).await?;

        Ok(DomainResult {
            success: true,
            data: None,
            events: vec![DomainEvent::System(SystemEvent::SystemConfigUpdated {
                config_id: config_id.0,
                config_key: "".to_string(),
                old_value: serde_json::Value::Null,
                new_value: serde_json::json!({"deleted": true}),
            })],
            metadata: HashMap::new(),
        })
    }

    async fn record_system_metric(
        &self,
        metric_name: String,
        metric_value: f64,
        metric_type: MetricType,
        unit: String,
        tags: HashMap<String, String>,
        source: String,
    ) -> Result<DomainResult, DomainError> {
        let metric = SystemMetric {
            id: SystemMetricId(Uuid::new_v4().to_string()),
            metric_name: metric_name.clone(),
            metric_value,
            metric_type,
            unit,
            timestamp: Utc::now(),
            tags,
            source: source.clone(),
            metadata: HashMap::new(),
        };

        self.metric_repository.save(&metric).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&metric, "system metric")?),
            events: vec![DomainEvent::System(SystemEvent::SystemMetricRecorded {
                metric_name,
                value: metric_value,
                source,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn create_system_alert(
        &self,
        alert_type: AlertType,
        severity: AlertSeverity,
        title: String,
        message: String,
        source: String,
        condition: String,
        threshold: f64,
        current_value: f64,
    ) -> Result<DomainResult, DomainError> {
        let alert = SystemAlert {
            id: SystemAlertId(Uuid::new_v4().to_string()),
            alert_type: alert_type.clone(),
            severity: severity.clone(),
            title: title.clone(),
            message: message.clone(),
            source,
            condition,
            threshold,
            current_value,
            status: AlertStatus::Active,
            acknowledged_by: None,
            acknowledged_at: None,
            resolved_at: None,
            tags: Vec::new(),
            metadata: HashMap::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        self.alert_repository.save(&alert).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&alert, "system alert")?),
            events: vec![DomainEvent::System(SystemEvent::SystemAlertTriggered {
                alert_id: alert.id.0,
                alert_type: format!("{:?}", alert_type),
                severity: format!("{:?}", severity),
                message,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn acknowledge_system_alert(
        &self,
        alert_id: String,
        acknowledged_by: String,
    ) -> Result<DomainResult, DomainError> {
        let alert_id = SystemAlertId(alert_id);
        let mut alert = self
            .alert_repository
            .find_by_id(&alert_id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("Alert {} not found", alert_id.0)))?;

        alert.acknowledge(acknowledged_by.clone());
        self.alert_repository.save(&alert).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&alert, "system alert")?),
            events: vec![DomainEvent::System(SystemEvent::SystemAlertAcknowledged {
                alert_id: alert_id.0,
                acknowledged_by,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn resolve_system_alert(&self, alert_id: String) -> Result<DomainResult, DomainError> {
        let alert_id = SystemAlertId(alert_id);
        let mut alert = self
            .alert_repository
            .find_by_id(&alert_id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("Alert {} not found", alert_id.0)))?;

        alert.resolve();
        self.alert_repository.save(&alert).await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&alert, "system alert")?),
            events: vec![DomainEvent::System(SystemEvent::SystemAlertResolved {
                alert_id: alert_id.0,
            })],
            metadata: HashMap::new(),
        })
    }

    async fn run_system_optimization(
        &self,
        optimization_type: String,
        target: String,
    ) -> Result<DomainResult, DomainError> {
        let result = self
            .optimization_service
            .run_optimization(&optimization_type, &target)
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&result, "optimization result")?),
            events: vec![DomainEvent::System(
                SystemEvent::SystemOptimizationApplied {
                    optimization_type: optimization_type.clone(),
                    target: target.clone(),
                    improvement: 0.1, // 示例改进值
                },
            )],
            metadata: HashMap::from([
                ("optimization_type".to_string(), serde_json::json!(optimization_type)),
                ("target".to_string(), serde_json::json!(target)),
            ]),
        })
    }

    async fn schedule_system_maintenance(
        &self,
        maintenance_type: String,
        scheduled_time: DateTime<Utc>,
        description: String,
    ) -> Result<DomainResult, DomainError> {
        // 这里可以实现维护调度逻辑
        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!({
                "maintenance_type": maintenance_type,
                "scheduled_time": scheduled_time,
                "description": description,
                "status": "scheduled"
            })),
            events: vec![DomainEvent::System(
                SystemEvent::SystemMaintenanceScheduled {
                    maintenance_type,
                    scheduled_time,
                },
            )],
            metadata: HashMap::new(),
        })
    }

    async fn get_system_config(&self, config_id: String) -> Result<DomainResult, DomainError> {
        let config_id = SystemConfigId(config_id);
        let config = self
            .config_repository
            .find_by_id(&config_id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("Config {} not found", config_id.0)))?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&config, "system config")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn list_system_configs(
        &self,
        filter_by_tag: Option<String>,
        limit: Option<u32>,
    ) -> Result<DomainResult, DomainError> {
        let configs = self
            .config_repository
            .list_configs(filter_by_tag, limit.unwrap_or(50))
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(configs)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_system_metrics(
        &self,
        metric_name: Option<String>,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
        limit: Option<u32>,
    ) -> Result<DomainResult, DomainError> {
        let metrics = self
            .metric_repository
            .get_metrics(metric_name, time_range, limit.unwrap_or(100))
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(metrics)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_system_alerts(
        &self,
        status: Option<AlertStatus>,
        severity: Option<AlertSeverity>,
        limit: Option<u32>,
    ) -> Result<DomainResult, DomainError> {
        let alerts = self
            .alert_repository
            .get_alerts(status, severity, limit.unwrap_or(50))
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(alerts)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_system_health(&self, include_details: bool) -> Result<DomainResult, DomainError> {
        let health = self
            .monitoring_service
            .get_system_health(include_details)
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&health, "system health")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_system_performance(
        &self,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<DomainResult, DomainError> {
        let performance = self
            .monitoring_service
            .get_system_performance(time_range)
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(to_domain_value(&performance, "system performance")?),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }

    async fn get_system_optimization_history(
        &self,
        limit: Option<u32>,
    ) -> Result<DomainResult, DomainError> {
        let history = self
            .optimization_service
            .get_optimization_history(limit.unwrap_or(20))
            .await?;

        Ok(DomainResult {
            success: true,
            data: Some(serde_json::json!(history)),
            events: Vec::new(),
            metadata: HashMap::new(),
        })
    }
}

// ===== 仓库接口 =====

#[async_trait]
pub trait SystemConfigRepository: Send + Sync {
    async fn save(&self, config: &SystemConfig) -> Result<(), DomainError>;
    async fn find_by_id(&self, id: &SystemConfigId) -> Result<Option<SystemConfig>, DomainError>;
    async fn find_by_key(&self, key: &str) -> Result<Option<SystemConfig>, DomainError>;
    async fn list_configs(
        &self,
        filter_by_tag: Option<String>,
        limit: u32,
    ) -> Result<Vec<SystemConfig>, DomainError>;
    async fn delete(&self, id: &SystemConfigId) -> Result<(), DomainError>;
}

#[async_trait]
pub trait SystemMetricRepository: Send + Sync {
    async fn save(&self, metric: &SystemMetric) -> Result<(), DomainError>;
    async fn get_metrics(
        &self,
        metric_name: Option<String>,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
        limit: u32,
    ) -> Result<Vec<SystemMetric>, DomainError>;
    async fn get_latest_metric(
        &self,
        metric_name: &str,
    ) -> Result<Option<SystemMetric>, DomainError>;
}

#[async_trait]
pub trait SystemAlertRepository: Send + Sync {
    async fn save(&self, alert: &SystemAlert) -> Result<(), DomainError>;
    async fn find_by_id(&self, id: &SystemAlertId) -> Result<Option<SystemAlert>, DomainError>;
    async fn get_alerts(
        &self,
        status: Option<AlertStatus>,
        severity: Option<AlertSeverity>,
        limit: u32,
    ) -> Result<Vec<SystemAlert>, DomainError>;
    async fn update_status(
        &self,
        id: &SystemAlertId,
        status: AlertStatus,
    ) -> Result<(), DomainError>;
}

#[async_trait]
pub trait SystemOptimizationService: Send + Sync {
    async fn run_optimization(
        &self,
        optimization_type: &str,
        target: &str,
    ) -> Result<OptimizationResult, DomainError>;
    async fn get_optimization_history(
        &self,
        limit: u32,
    ) -> Result<Vec<OptimizationRecord>, DomainError>;
    async fn get_available_optimizations(&self) -> Result<Vec<String>, DomainError>;
}

#[async_trait]
pub trait SystemMonitoringService: Send + Sync {
    async fn get_system_health(&self, include_details: bool) -> Result<SystemHealth, DomainError>;
    async fn get_system_performance(
        &self,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<SystemPerformance, DomainError>;
    async fn get_resource_usage(&self) -> Result<ResourceUsage, DomainError>;
}

// ===== 内存实现 =====

pub struct InMemorySystemConfigRepository {
    configs: std::sync::RwLock<HashMap<SystemConfigId, SystemConfig>>,
}

impl InMemorySystemConfigRepository {
    pub fn new() -> Self {
        Self {
            configs: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl SystemConfigRepository for InMemorySystemConfigRepository {
    async fn save(&self, config: &SystemConfig) -> Result<(), DomainError> {
        let mut configs = self.configs.write().unwrap();
        configs.insert(config.id.clone(), config.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &SystemConfigId) -> Result<Option<SystemConfig>, DomainError> {
        let configs = self.configs.read().unwrap();
        Ok(configs.get(id).cloned())
    }

    async fn find_by_key(&self, key: &str) -> Result<Option<SystemConfig>, DomainError> {
        let configs = self.configs.read().unwrap();
        let config = configs.values().find(|c| c.config_key == key).cloned();
        Ok(config)
    }

    async fn list_configs(
        &self,
        filter_by_tag: Option<String>,
        limit: u32,
    ) -> Result<Vec<SystemConfig>, DomainError> {
        let configs = self.configs.read().unwrap();
        let filtered: Vec<SystemConfig> = configs
            .values()
            .filter(|c| {
                filter_by_tag
                    .as_ref()
                    .map_or(true, |tag| c.tags.contains(tag))
            })
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn delete(&self, id: &SystemConfigId) -> Result<(), DomainError> {
        let mut configs = self.configs.write().unwrap();
        configs.remove(id);
        Ok(())
    }
}

pub struct InMemorySystemMetricRepository {
    metrics: std::sync::RwLock<Vec<SystemMetric>>,
}

impl InMemorySystemMetricRepository {
    pub fn new() -> Self {
        Self {
            metrics: std::sync::RwLock::new(Vec::new()),
        }
    }
}

#[async_trait]
impl SystemMetricRepository for InMemorySystemMetricRepository {
    async fn save(&self, metric: &SystemMetric) -> Result<(), DomainError> {
        let mut metrics = self.metrics.write().unwrap();
        metrics.push(metric.clone());
        // 保留最近1000个指标
        if metrics.len() > 1000 {
            metrics.remove(0);
        }
        Ok(())
    }

    async fn get_metrics(
        &self,
        metric_name: Option<String>,
        time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
        limit: u32,
    ) -> Result<Vec<SystemMetric>, DomainError> {
        let metrics = self.metrics.read().unwrap();
        let filtered: Vec<SystemMetric> = metrics
            .iter()
            .filter(|m| {
                metric_name
                    .as_ref()
                    .map_or(true, |name| m.metric_name == *name)
            })
            .filter(|m| {
                time_range
                    .as_ref()
                    .map_or(true, |(start, end)| m.timestamp >= *start && m.timestamp <= *end)
            })
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn get_latest_metric(
        &self,
        metric_name: &str,
    ) -> Result<Option<SystemMetric>, DomainError> {
        let metrics = self.metrics.read().unwrap();
        let latest = metrics
            .iter()
            .filter(|m| m.metric_name == metric_name)
            .max_by_key(|m| m.timestamp)
            .cloned();
        Ok(latest)
    }
}

pub struct InMemorySystemAlertRepository {
    alerts: std::sync::RwLock<HashMap<SystemAlertId, SystemAlert>>,
}

impl InMemorySystemAlertRepository {
    pub fn new() -> Self {
        Self {
            alerts: std::sync::RwLock::new(HashMap::new()),
        }
    }
}

#[async_trait]
impl SystemAlertRepository for InMemorySystemAlertRepository {
    async fn save(&self, alert: &SystemAlert) -> Result<(), DomainError> {
        let mut alerts = self.alerts.write().unwrap();
        alerts.insert(alert.id.clone(), alert.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &SystemAlertId) -> Result<Option<SystemAlert>, DomainError> {
        let alerts = self.alerts.read().unwrap();
        Ok(alerts.get(id).cloned())
    }

    async fn get_alerts(
        &self,
        status: Option<AlertStatus>,
        severity: Option<AlertSeverity>,
        limit: u32,
    ) -> Result<Vec<SystemAlert>, DomainError> {
        let alerts = self.alerts.read().unwrap();
        let filtered: Vec<SystemAlert> = alerts
            .values()
            .filter(|a| status.as_ref().is_none_or(|s| &a.status == s))
            .filter(|a| {
                severity.as_ref().is_none_or(|s| {
                    std::mem::discriminant(&a.severity) == std::mem::discriminant(s)
                })
            })
            .take(limit as usize)
            .cloned()
            .collect();
        Ok(filtered)
    }

    async fn update_status(
        &self,
        id: &SystemAlertId,
        status: AlertStatus,
    ) -> Result<(), DomainError> {
        let mut alerts = self.alerts.write().unwrap();
        if let Some(alert) = alerts.get_mut(id) {
            alert.status = status;
            alert.updated_at = Utc::now();
        }
        Ok(())
    }
}

pub struct BasicSystemOptimizationService;

impl BasicSystemOptimizationService {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl SystemOptimizationService for BasicSystemOptimizationService {
    async fn run_optimization(
        &self,
        optimization_type: &str,
        target: &str,
    ) -> Result<OptimizationResult, DomainError> {
        // 模拟优化结果
        Ok(OptimizationResult {
            optimization_type: optimization_type.to_string(),
            target: target.to_string(),
            improvement: 0.15,
            before_value: 100.0,
            after_value: 85.0,
            duration_ms: 150,
            timestamp: Utc::now(),
        })
    }

    async fn get_optimization_history(
        &self,
        limit: u32,
    ) -> Result<Vec<OptimizationRecord>, DomainError> {
        // 返回模拟的历史记录
        let records = (0..limit.min(10))
            .map(|i| OptimizationRecord {
                id: Uuid::new_v4().to_string(),
                optimization_type: format!("optimization_{}", i),
                target: format!("target_{}", i),
                improvement: 0.1 + (i as f64 * 0.01),
                before_value: 100.0,
                after_value: 100.0 - (i as f64 * 5.0),
                duration_ms: 100 + (i as u64 * 10),
                timestamp: Utc::now() - chrono::Duration::hours(i as i64),
            })
            .collect();

        Ok(records)
    }

    async fn get_available_optimizations(&self) -> Result<Vec<String>, DomainError> {
        Ok(vec![
            "memory_optimization".to_string(),
            "cpu_optimization".to_string(),
            "io_optimization".to_string(),
            "cache_optimization".to_string(),
        ])
    }
}

pub struct BasicSystemMonitoringService;

impl BasicSystemMonitoringService {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl SystemMonitoringService for BasicSystemMonitoringService {
    async fn get_system_health(&self, _include_details: bool) -> Result<SystemHealth, DomainError> {
        Ok(SystemHealth {
            overall_status: "healthy".to_string(),
            components: vec![
                ComponentHealth {
                    name: "database".to_string(),
                    status: "healthy".to_string(),
                    response_time_ms: Some(50),
                    last_check: Utc::now(),
                },
                ComponentHealth {
                    name: "cache".to_string(),
                    status: "healthy".to_string(),
                    response_time_ms: Some(10),
                    last_check: Utc::now(),
                },
            ],
            uptime_seconds: 86400,
            last_check: Utc::now(),
        })
    }

    async fn get_system_performance(
        &self,
        _time_range: Option<(DateTime<Utc>, DateTime<Utc>)>,
    ) -> Result<SystemPerformance, DomainError> {
        Ok(SystemPerformance {
            cpu_usage_percent: 45.2,
            memory_usage_percent: 67.8,
            disk_usage_percent: 23.4,
            network_throughput_mbps: 150.5,
            active_connections: 1250,
            response_time_avg_ms: 120.0,
            error_rate_percent: 0.02,
            timestamp: Utc::now(),
        })
    }

    async fn get_resource_usage(&self) -> Result<ResourceUsage, DomainError> {
        Ok(ResourceUsage {
            cpu_cores: 8,
            memory_total_gb: 16.0,
            disk_total_gb: 500.0,
            network_interfaces: 2,
            timestamp: Utc::now(),
        })
    }
}

// ===== 业务规则 =====

pub struct ConfigKeyNotEmptyRule;

#[async_trait]
impl BusinessRuleValidator<SystemConfig> for ConfigKeyNotEmptyRule {
    fn rule_name(&self) -> &str {
        "config_key_not_empty"
    }

    async fn validate(
        &self,
        entity: &SystemConfig,
        _context: &DomainContext,
    ) -> Result<(), DomainError> {
        if entity.config_key.trim().is_empty() {
            return Err(DomainError::Validation("Config key cannot be empty".to_string()));
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that system config key is not empty"
    }
}

pub struct ConfigValueValidRule;

#[async_trait]
impl BusinessRuleValidator<SystemConfig> for ConfigValueValidRule {
    fn rule_name(&self) -> &str {
        "config_value_valid"
    }

    async fn validate(
        &self,
        entity: &SystemConfig,
        _context: &DomainContext,
    ) -> Result<(), DomainError> {
        // 验证配置值是否符合类型要求
        match entity.config_type {
            ConfigType::Number => {
                if !entity.config_value.is_number() {
                    return Err(DomainError::Validation(
                        "Config value must be a number".to_string(),
                    ));
                }
            },
            ConfigType::Boolean => {
                if !entity.config_value.is_boolean() {
                    return Err(DomainError::Validation(
                        "Config value must be a boolean".to_string(),
                    ));
                }
            },
            ConfigType::String => {
                if !entity.config_value.is_string() {
                    return Err(DomainError::Validation(
                        "Config value must be a string".to_string(),
                    ));
                }
            },
            _ => {}, // 其他类型暂时跳过验证
        }
        Ok(())
    }

    fn description(&self) -> &str {
        "Ensures that system config value matches its declared type"
    }
}

// ===== 数据传输对象 =====

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResult {
    pub optimization_type: String,
    pub target: String,
    pub improvement: f64,
    pub before_value: f64,
    pub after_value: f64,
    pub duration_ms: u64,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationRecord {
    pub id: String,
    pub optimization_type: String,
    pub target: String,
    pub improvement: f64,
    pub before_value: f64,
    pub after_value: f64,
    pub duration_ms: u64,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemHealth {
    pub overall_status: String,
    pub components: Vec<ComponentHealth>,
    pub uptime_seconds: u64,
    pub last_check: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentHealth {
    pub name: String,
    pub status: String,
    pub response_time_ms: Option<u64>,
    pub last_check: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemPerformance {
    pub cpu_usage_percent: f64,
    pub memory_usage_percent: f64,
    pub disk_usage_percent: f64,
    pub network_throughput_mbps: f64,
    pub active_connections: u64,
    pub response_time_avg_ms: f64,
    pub error_rate_percent: f64,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceUsage {
    pub cpu_cores: u32,
    pub memory_total_gb: f64,
    pub disk_total_gb: f64,
    pub network_interfaces: u32,
    pub timestamp: DateTime<Utc>,
}
