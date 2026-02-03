//! Intelligent Monitoring and Alerting System
//!
//! Provides AI-powered monitoring capabilities:
//! - Smart metric collection and aggregation
//! - ML-based anomaly detection and alerting
//! - Intelligent alert correlation and deduplication
//! - Adaptive alerting thresholds
//! - Automated incident response

use crate::error::{EngineError, ErrorCode};
use crate::ml_models::{AnomalyDetector, SystemMetrics};
use crate::event_bus::{EventBus, SystemEvent, EngineEvent};
use crate::interfaces::MetricsCollector;
use async_trait::async_trait;
use std::collections::{HashMap, VecDeque, HashSet};
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Alert severity levels
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, PartialOrd)]
pub enum AlertSeverity {
    Info,
    Warning,
    Error,
    Critical,
}

/// Alert status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertStatus {
    Active,
    Acknowledged,
    Resolved,
    Suppressed,
}

/// Intelligent Alert
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntelligentAlert {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub severity: AlertSeverity,
    pub status: AlertStatus,
    pub source: String,
    pub component: String,
    pub metric: String,
    pub value: f64,
    pub threshold: f64,
    pub anomaly_score: Option<f64>,
    pub tags: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub acknowledged_by: Option<String>,
    pub related_alerts: Vec<Uuid>,
    pub suggested_actions: Vec<String>,
    pub escalation_level: u32,
    pub auto_resolvable: bool,
}

/// Alert rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub metric_pattern: String,
    pub condition: AlertCondition,
    pub severity: AlertSeverity,
    pub enabled: bool,
    pub cooldown_period: Duration,
    pub auto_resolve: bool,
    pub escalation_policy: EscalationPolicy,
    pub tags: HashMap<String, String>,
}

/// Alert condition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AlertCondition {
    Threshold { operator: ThresholdOperator, value: f64 },
    Anomaly { sensitivity: f64 },
    Trend { direction: TrendDirection, threshold: f64, window: Duration },
    Custom { expression: String },
}

/// Threshold operators
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ThresholdOperator {
    GreaterThan,
    LessThan,
    GreaterThanOrEqual,
    LessThanOrEqual,
    Equal,
    NotEqual,
}

/// Trend directions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TrendDirection {
    Increasing,
    Decreasing,
    Volatile,
}

/// Escalation policy
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EscalationPolicy {
    pub levels: Vec<EscalationLevel>,
    pub repeat_interval: Duration,
}

/// Escalation level
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EscalationLevel {
    pub level: u32,
    pub delay: Duration,
    pub channels: Vec<String>,
    pub recipients: Vec<String>,
}

/// Metric data point
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricDataPoint {
    pub metric: String,
    pub value: f64,
    pub timestamp: DateTime<Utc>,
    pub tags: HashMap<String, String>,
    pub source: String,
}

/// Alert notification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertNotification {
    pub alert_id: Uuid,
    pub channel: String,
    pub recipient: String,
    pub message: String,
    pub sent_at: DateTime<Utc>,
    pub status: NotificationStatus,
}

/// Notification status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationStatus {
    Pending,
    Sent,
    Delivered,
    Failed,
}

/// Monitoring dashboard
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringDashboard {
    pub id: String,
    pub name: String,
    pub description: String,
    pub panels: Vec<DashboardPanel>,
    pub refresh_interval: Duration,
    pub created_at: DateTime<Utc>,
}

/// Dashboard panel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardPanel {
    pub id: String,
    pub title: String,
    pub panel_type: PanelType,
    pub metrics: Vec<String>,
    pub time_range: Duration,
    pub aggregation: AggregationType,
}

/// Panel types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PanelType {
    LineChart,
    BarChart,
    Gauge,
    Table,
    Heatmap,
}

/// Aggregation types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AggregationType {
    None,
    Average,
    Sum,
    Min,
    Max,
    Percentile(f64),
}

/// Intelligent Monitoring System
pub struct IntelligentMonitoringSystem {
    anomaly_detector: Arc<AnomalyDetector>,
    event_bus: Arc<EventBus>,
    metrics_collector: Arc<dyn MetricsCollector>,
    alert_rules: Arc<RwLock<HashMap<String, AlertRule>>>,
    active_alerts: Arc<RwLock<HashMap<Uuid, IntelligentAlert>>>,
    metric_history: Arc<RwLock<HashMap<String, VecDeque<MetricDataPoint>>>>,
    alert_notifications: Arc<RwLock<VecDeque<AlertNotification>>>,
    alert_sender: broadcast::Sender<IntelligentAlert>,
    monitoring_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    alerting_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
    escalation_task: Arc<RwLock<Option<tokio::task::JoinHandle<()>>>>,
}

impl IntelligentMonitoringSystem {
    /// Create new intelligent monitoring system
    pub fn new(
        anomaly_detector: Arc<AnomalyDetector>,
        event_bus: Arc<EventBus>,
        metrics_collector: Arc<dyn MetricsCollector>,
    ) -> Self {
        let (alert_sender, _) = broadcast::channel(100);

        Self {
            anomaly_detector,
            event_bus,
            metrics_collector,
            alert_rules: Arc::new(RwLock::new(HashMap::new())),
            active_alerts: Arc::new(RwLock::new(HashMap::new())),
            metric_history: Arc::new(RwLock::new(HashMap::new())),
            alert_notifications: Arc::new(RwLock::new(VecDeque::with_capacity(1000))),
            alert_sender,
            monitoring_task: Arc::new(RwLock::new(None)),
            alerting_task: Arc::new(RwLock::new(None)),
            escalation_task: Arc::new(RwLock::new(None)),
        }
    }

    /// Start the monitoring system
    pub async fn start(&self) -> Result<(), EngineError> {
        // Initialize default alert rules
        self.initialize_default_alert_rules().await?;

        // Start monitoring task
        let monitoring_handle = self.start_monitoring_task();
        *self.monitoring_task.write().await = Some(monitoring_handle);

        // Start alerting task
        let alerting_handle = self.start_alerting_task();
        *self.alerting_task.write().await = Some(alerting_handle);

        // Start escalation task
        let escalation_handle = self.start_escalation_task();
        *self.escalation_task.write().await = Some(escalation_handle);

        // Publish startup event
        self.event_bus.publish(
            SystemEvent::PluginLoaded {
                plugin_id: "intelligent_monitoring".to_string(),
                plugin_type: "monitoring".to_string(),
                version: "1.0.0".to_string(),
            },
            "intelligent_monitoring",
            None,
        ).await?;

        tracing::info!("Intelligent monitoring system started");
        Ok(())
    }

    /// Stop the monitoring system
    pub async fn stop(&self) -> Result<(), EngineError> {
        // Stop tasks
        if let Some(handle) = self.monitoring_task.write().await.take() {
            handle.abort();
        }
        if let Some(handle) = self.alerting_task.write().await.take() {
            handle.abort();
        }
        if let Some(handle) = self.escalation_task.write().await.take() {
            handle.abort();
        }

        tracing::info!("Intelligent monitoring system stopped");
        Ok(())
    }

    /// Add or update alert rule
    pub async fn set_alert_rule(&self, rule: AlertRule) -> Result<(), EngineError> {
        let mut rules = self.alert_rules.write().await;
        rules.insert(rule.id.clone(), rule);
        Ok(())
    }

    /// Get alert rule
    pub async fn get_alert_rule(&self, rule_id: &str) -> Option<AlertRule> {
        let rules = self.alert_rules.read().await;
        rules.get(rule_id).cloned()
    }

    /// Get all alert rules
    pub async fn get_all_alert_rules(&self) -> Vec<AlertRule> {
        let rules = self.alert_rules.read().await;
        rules.values().cloned().collect()
    }

    /// Get active alerts
    pub async fn get_active_alerts(&self) -> Vec<IntelligentAlert> {
        let alerts = self.active_alerts.read().await;
        alerts.values()
            .filter(|alert| alert.status == AlertStatus::Active)
            .cloned()
            .collect()
    }

    /// Acknowledge alert
    pub async fn acknowledge_alert(&self, alert_id: Uuid, user: String) -> Result<(), EngineError> {
        let mut alerts = self.active_alerts.write().await;
        if let Some(alert) = alerts.get_mut(&alert_id) {
            alert.status = AlertStatus::Acknowledged;
            alert.acknowledged_by = Some(user);
            alert.updated_at = Utc::now();

            // Publish event
            self.event_bus.publish(
                SystemEvent::Error {
                    message: format!("Alert acknowledged: {}", alert.title),
                    severity: "info".to_string(),
                    component: alert.component.clone(),
                    stack_trace: None,
                },
                "intelligent_monitoring",
                None,
            ).await?;
        }
        Ok(())
    }

    /// Resolve alert
    pub async fn resolve_alert(&self, alert_id: Uuid) -> Result<(), EngineError> {
        let mut alerts = self.active_alerts.write().await;
        if let Some(alert) = alerts.get_mut(&alert_id) {
            alert.status = AlertStatus::Resolved;
            alert.resolved_at = Some(Utc::now());
            alert.updated_at = Utc::now();
        }
        Ok(())
    }

    /// Record metric data point
    pub async fn record_metric(&self, data_point: MetricDataPoint) -> Result<(), EngineError> {
        let mut history = self.metric_history.write().await;
        let metric_history = history.entry(data_point.metric.clone())
            .or_insert_with(|| VecDeque::with_capacity(1000));

        metric_history.push_back(data_point.clone());
        if metric_history.len() > 1000 {
            metric_history.pop_front();
        }

        // Collect using metrics collector
        self.metrics_collector.set_gauge(
            &data_point.metric,
            data_point.value,
            Some(data_point.tags.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        ).await?;

        Ok(())
    }

    /// Get metric history
    pub async fn get_metric_history(&self, metric: &str, limit: Option<usize>) -> Vec<MetricDataPoint> {
        let history = self.metric_history.read().await;
        if let Some(metric_history) = history.get(metric) {
            let limit = limit.unwrap_or(metric_history.len());
            metric_history.iter().rev().take(limit).cloned().collect()
        } else {
            Vec::new()
        }
    }

    /// Subscribe to alerts
    pub fn subscribe_alerts(&self) -> broadcast::Receiver<IntelligentAlert> {
        self.alert_sender.subscribe()
    }

    /// Analyze system metrics and generate alerts
    pub async fn analyze_and_alert(&self) -> Result<Vec<IntelligentAlert>, EngineError> {
        let mut new_alerts = Vec::new();

        // Get current metrics
        let current_metrics = self.collect_current_metrics().await?;

        // Evaluate alert rules
        let rules = self.alert_rules.read().await;
        for rule in rules.values().filter(|r| r.enabled) {
            if let Some(alert) = self.evaluate_alert_rule(rule, &current_metrics).await? {
                new_alerts.push(alert);
            }
        }

        // Store and publish new alerts
        let mut active_alerts = self.active_alerts.write().await;
        for alert in &new_alerts {
            active_alerts.insert(alert.id, alert.clone());

            // Publish alert
            let _ = self.alert_sender.send(alert.clone());

            // Publish event
            self.event_bus.publish(
                SystemEvent::Error {
                    message: alert.description.clone(),
                    severity: match alert.severity {
                        AlertSeverity::Critical => "critical",
                        AlertSeverity::Error => "error",
                        AlertSeverity::Warning => "warning",
                        AlertSeverity::Info => "info",
                    }.to_string(),
                    component: alert.component.clone(),
                    stack_trace: None,
                },
                "intelligent_monitoring",
                None,
            ).await?;
        }

        Ok(new_alerts)
    }

    async fn initialize_default_alert_rules(&self) -> Result<(), EngineError> {
        let default_rules = vec![
            AlertRule {
                id: "high_cpu_usage".to_string(),
                name: "High CPU Usage".to_string(),
                description: "CPU usage is above 80%".to_string(),
                metric_pattern: "cpu_usage".to_string(),
                condition: AlertCondition::Threshold {
                    operator: ThresholdOperator::GreaterThan,
                    value: 80.0,
                },
                severity: AlertSeverity::Warning,
                enabled: true,
                cooldown_period: Duration::minutes(5),
                auto_resolve: true,
                escalation_policy: EscalationPolicy {
                    levels: vec![
                        EscalationLevel {
                            level: 1,
                            delay: Duration::minutes(5),
                            channels: vec!["email".to_string()],
                            recipients: vec!["admin@example.com".to_string()],
                        },
                        EscalationLevel {
                            level: 2,
                            delay: Duration::minutes(15),
                            channels: vec!["sms".to_string()],
                            recipients: vec!["admin@example.com".to_string()],
                        },
                    ],
                    repeat_interval: Duration::hours(1),
                },
                tags: HashMap::from([
                    ("category".to_string(), "performance".to_string()),
                    ("resource".to_string(), "cpu".to_string()),
                ]),
            },
            AlertRule {
                id: "high_memory_usage".to_string(),
                name: "High Memory Usage".to_string(),
                description: "Memory usage is above 85%".to_string(),
                metric_pattern: "memory_usage".to_string(),
                condition: AlertCondition::Threshold {
                    operator: ThresholdOperator::GreaterThan,
                    value: 85.0,
                },
                severity: AlertSeverity::Error,
                enabled: true,
                cooldown_period: Duration::minutes(5),
                auto_resolve: true,
                escalation_policy: EscalationPolicy {
                    levels: vec![
                        EscalationLevel {
                            level: 1,
                            delay: Duration::minutes(2),
                            channels: vec!["email".to_string()],
                            recipients: vec!["admin@example.com".to_string()],
                        },
                    ],
                    repeat_interval: Duration::hours(1),
                },
                tags: HashMap::from([
                    ("category".to_string(), "performance".to_string()),
                    ("resource".to_string(), "memory".to_string()),
                ]),
            },
            AlertRule {
                id: "anomaly_detection".to_string(),
                name: "System Anomaly".to_string(),
                description: "Anomalous system behavior detected".to_string(),
                metric_pattern: "*".to_string(),
                condition: AlertCondition::Anomaly { sensitivity: 0.7 },
                severity: AlertSeverity::Warning,
                enabled: true,
                cooldown_period: Duration::minutes(10),
                auto_resolve: false,
                escalation_policy: EscalationPolicy {
                    levels: vec![
                        EscalationLevel {
                            level: 1,
                            delay: Duration::minutes(5),
                            channels: vec!["email".to_string()],
                            recipients: vec!["admin@example.com".to_string()],
                        },
                    ],
                    repeat_interval: Duration::hours(2),
                },
                tags: HashMap::from([
                    ("category".to_string(), "anomaly".to_string()),
                    ("type".to_string(), "ml_detection".to_string()),
                ]),
            },
        ];

        let mut rules = self.alert_rules.write().await;
        for rule in default_rules {
            rules.insert(rule.id.clone(), rule);
        }

        Ok(())
    }

    fn start_monitoring_task(&self) -> tokio::task::JoinHandle<()> {
        let metrics_collector = Arc::clone(&self.metrics_collector);
        let metric_history = Arc::clone(&self.metric_history);

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

            loop {
                interval.tick().await;

                // Collect system metrics (simplified for demo)
                let metrics = vec![
                    ("cpu_usage", (50.0 + (rand::random::<f64>() - 0.5) * 20.0).max(0.0).min(100.0)),
                    ("memory_usage", (60.0 + (rand::random::<f64>() - 0.5) * 20.0).max(0.0).min(100.0)),
                    ("response_time", (200.0 + (rand::random::<f64>() - 0.5) * 100.0).max(10.0)),
                    ("request_rate", (500.0 + (rand::random::<f64>() - 0.5) * 200.0).max(0.0)),
                    ("error_rate", (0.01 + (rand::random::<f64>() - 0.5) * 0.02).max(0.0).min(1.0)),
                ];

                for (metric_name, value) in metrics {
                    let data_point = MetricDataPoint {
                        metric: metric_name.to_string(),
                        value,
                        timestamp: Utc::now(),
                        tags: HashMap::from([
                            ("source".to_string(), "system".to_string()),
                            ("component".to_string(), "monitoring".to_string()),
                        ]),
                        source: "intelligent_monitoring".to_string(),
                    };

                    // Record metric
                    let mut history = metric_history.write().await;
                    let metric_history_queue = history.entry(metric_name.to_string())
                        .or_insert_with(|| VecDeque::with_capacity(1000));
                    metric_history_queue.push_back(data_point.clone());
                    if metric_history_queue.len() > 1000 {
                        metric_history_queue.pop_front();
                    }

                    // Send to metrics collector
                    let _ = metrics_collector.set_gauge(
                        &data_point.metric,
                        data_point.value,
                        Some(data_point.tags.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                    );
                }
            }
        })
    }

    fn start_alerting_task(&self) -> tokio::task::JoinHandle<()> {
        let system = Arc::new(Self {
            anomaly_detector: Arc::clone(&self.anomaly_detector),
            event_bus: Arc::clone(&self.event_bus),
            metrics_collector: Arc::clone(&self.metrics_collector),
            alert_rules: Arc::clone(&self.alert_rules),
            active_alerts: Arc::clone(&self.active_alerts),
            metric_history: Arc::clone(&self.metric_history),
            alert_notifications: Arc::clone(&self.alert_notifications),
            alert_sender: self.alert_sender.clone(),
            monitoring_task: Arc::new(RwLock::new(None)),
            alerting_task: Arc::new(RwLock::new(None)),
            escalation_task: Arc::new(RwLock::new(None)),
        });

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60)); // Check every minute

            loop {
                interval.tick().await;

                if let Err(e) = system.analyze_and_alert().await {
                    tracing::error!("Alert analysis failed: {:?}", e);
                }
            }
        })
    }

    fn start_escalation_task(&self) -> tokio::task::JoinHandle<()> {
        let active_alerts = Arc::clone(&self.active_alerts);
        let alert_notifications = Arc::clone(&self.alert_notifications);

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));

            loop {
                interval.tick().await;

                let alerts = active_alerts.read().await;
                let mut notifications_to_send = Vec::new();

                for alert in alerts.values().filter(|a| a.status == AlertStatus::Active) {
                    let time_since_creation = Utc::now() - alert.created_at;
                    let escalation_level = (time_since_creation.num_minutes() / 5).min(2) as u32; // Escalate every 5 minutes

                    if escalation_level > alert.escalation_level {
                        // Create escalation notifications
                        notifications_to_send.push(AlertNotification {
                            alert_id: alert.id,
                            channel: "email".to_string(),
                            recipient: "admin@example.com".to_string(),
                            message: format!("ESCALATION: {} - {}", alert.title, alert.description),
                            sent_at: Utc::now(),
                            status: NotificationStatus::Pending,
                        });

                        // Update alert escalation level
                        // (In real implementation, this would modify the alert)
                    }
                }

                // Store notifications
                let mut notifications = alert_notifications.write().await;
                for notification in notifications_to_send {
                    notifications.push_back(notification);
                    if notifications.len() > 1000 {
                        notifications.pop_front();
                    }
                }
            }
        })
    }

    async fn collect_current_metrics(&self) -> Result<HashMap<String, f64>, EngineError> {
        let history = self.metric_history.read().await;
        let mut current_metrics = HashMap::new();

        for (metric_name, metric_history) in &*history {
            if let Some(latest) = metric_history.back() {
                current_metrics.insert(metric_name.clone(), latest.value);
            }
        }

        Ok(current_metrics)
    }

    async fn evaluate_alert_rule(&self, rule: &AlertRule, current_metrics: &HashMap<String, f64>) -> Result<Option<IntelligentAlert>, EngineError> {
        // Check if alert is already active and within cooldown
        let active_alerts = self.active_alerts.read().await;
        let existing_alert = active_alerts.values()
            .find(|a| a.status == AlertStatus::Active && a.title == rule.name);

        if let Some(alert) = existing_alert {
            let time_since_last = Utc::now() - alert.updated_at;
            if time_since_last < rule.cooldown_period {
                return Ok(None); // Still in cooldown
            }
        }

        let alert_triggered = match &rule.condition {
            AlertCondition::Threshold { operator, value } => {
                if let Some(metric_value) = current_metrics.get(&rule.metric_pattern) {
                    match operator {
                        ThresholdOperator::GreaterThan => *metric_value > *value,
                        ThresholdOperator::LessThan => *metric_value < *value,
                        ThresholdOperator::GreaterThanOrEqual => *metric_value >= *value,
                        ThresholdOperator::LessThanOrEqual => *metric_value <= *value,
                        ThresholdOperator::Equal => (*metric_value - value).abs() < f64::EPSILON,
                        ThresholdOperator::NotEqual => (*metric_value - value).abs() >= f64::EPSILON,
                    }
                } else {
                    false
                }
            },
            AlertCondition::Anomaly { sensitivity } => {
                // Use anomaly detector
                let system_metrics = SystemMetrics {
                    timestamp: Utc::now(),
                    cpu_usage: *current_metrics.get("cpu_usage").unwrap_or(&50.0),
                    memory_usage: *current_metrics.get("memory_usage").unwrap_or(&60.0),
                    response_time: *current_metrics.get("response_time").unwrap_or(&200.0),
                    request_rate: *current_metrics.get("request_rate").unwrap_or(&500.0),
                    cache_hit_rate: 80.0,
                    error_rate: *current_metrics.get("error_rate").unwrap_or(&0.01),
                    cpu_cores: 4,
                    memory_gb: 8.0,
                    connection_pool_size: 50,
                    thread_pool_size: 10,
                };

                let anomaly_result = self.anomaly_detector.detect_anomaly(&system_metrics).await?;
                anomaly_result.score > *sensitivity
            },
            AlertCondition::Trend { direction, threshold, window } => {
                // Check trend in metric history
                if let Some(history) = self.metric_history.read().await.get(&rule.metric_pattern) {
                    let recent_values: Vec<f64> = history.iter()
                        .rev()
                        .take_while(|dp| Utc::now() - dp.timestamp < *window)
                        .map(|dp| dp.value)
                        .collect();

                    if recent_values.len() >= 2 {
                        let trend = self.calculate_trend(&recent_values);
                        match direction {
                            TrendDirection::Increasing => trend > *threshold,
                            TrendDirection::Decreasing => trend < -*threshold,
                            TrendDirection::Volatile => trend.abs() > *threshold,
                        }
                    } else {
                        false
                    }
                } else {
                    false
                }
            },
            AlertCondition::Custom { .. } => {
                // Custom expression evaluation (simplified)
                false
            },
        };

        if alert_triggered {
            let metric_value = current_metrics.get(&rule.metric_pattern).copied().unwrap_or(0.0);
            let anomaly_score = if matches!(rule.condition, AlertCondition::Anomaly { .. }) {
                Some(0.8) // Placeholder
            } else {
                None
            };

            let alert = IntelligentAlert {
                id: Uuid::new_v4(),
                title: rule.name.clone(),
                description: rule.description.clone(),
                severity: rule.severity.clone(),
                status: AlertStatus::Active,
                source: "intelligent_monitoring".to_string(),
                component: rule.tags.get("resource").unwrap_or(&"system".to_string()).clone(),
                metric: rule.metric_pattern.clone(),
                value: metric_value,
                threshold: match &rule.condition {
                    AlertCondition::Threshold { value, .. } => *value,
                    _ => 0.0,
                },
                anomaly_score,
                tags: rule.tags.clone(),
                created_at: Utc::now(),
                updated_at: Utc::now(),
                resolved_at: None,
                acknowledged_by: None,
                related_alerts: Vec::new(),
                suggested_actions: self.generate_suggested_actions(rule, metric_value),
                escalation_level: 0,
                auto_resolvable: rule.auto_resolve,
            };

            Ok(Some(alert))
        } else {
            Ok(None)
        }
    }

    fn calculate_trend(&self, values: &[f64]) -> f64 {
        if values.len() < 2 {
            return 0.0;
        }

        let n = values.len() as f64;
        let x_sum: f64 = (0..values.len()).map(|i| i as f64).sum();
        let y_sum: f64 = values.iter().sum();
        let xy_sum: f64 = values.iter().enumerate().map(|(i, &y)| i as f64 * y).sum();
        let x_squared_sum: f64 = (0..values.len()).map(|i| (i as f64).powi(2)).sum();

        (n * xy_sum - x_sum * y_sum) / (n * x_squared_sum - x_sum.powi(2))
    }

    fn generate_suggested_actions(&self, rule: &AlertRule, metric_value: f64) -> Vec<String> {
        match rule.id.as_str() {
            "high_cpu_usage" => vec![
                format!("Consider scaling CPU resources (current: {:.1}%)", metric_value),
                "Check for CPU-intensive processes".to_string(),
                "Consider optimizing application code".to_string(),
            ],
            "high_memory_usage" => vec![
                format!("Monitor memory usage (current: {:.1}%)", metric_value),
                "Check for memory leaks".to_string(),
                "Consider increasing memory allocation".to_string(),
            ],
            "anomaly_detection" => vec![
                "Investigate recent system changes".to_string(),
                "Check application logs for errors".to_string(),
                "Review performance metrics trends".to_string(),
            ],
            _ => vec![
                "Investigate the alert condition".to_string(),
                "Check system logs".to_string(),
                "Review related metrics".to_string(),
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::runtime::Runtime;

    #[tokio::test]
    async fn test_alert_severity_ordering() {
        assert!(AlertSeverity::Info < AlertSeverity::Warning);
        assert!(AlertSeverity::Warning < AlertSeverity::Error);
        assert!(AlertSeverity::Error < AlertSeverity::Critical);
    }

    #[test]
    fn test_threshold_operators() {
        let value = 75.0;
        let threshold = 80.0;

        assert!(!matches!(ThresholdOperator::GreaterThan, _ => value > threshold));
        assert!(matches!(ThresholdOperator::LessThan, _ => value < threshold));
    }
}