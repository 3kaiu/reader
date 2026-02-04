//! 工作流程优化器
//!
//! 精简和优化各种业务流程：
//! - 减少不必要的步骤
//! - 合并相似操作
//! - 优化执行顺序
//! - 消除冗余检查

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use tokio::sync::RwLock;

/// 工作流程配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowConfig {
    pub enable_workflow_optimization: bool,
    pub max_concurrent_workflows: usize,
    pub workflow_timeout_seconds: u64,
    pub enable_circuit_breaker: bool,
    pub enable_metrics_collection: bool,
}

/// 工作流程步骤
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStep {
    pub id: String,
    pub name: String,
    pub operation: String,
    pub dependencies: Vec<String>,
    pub estimated_duration_ms: u64,
    pub retry_count: u32,
    pub timeout_ms: u64,
}

/// 工作流程
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub steps: Vec<WorkflowStep>,
    pub priority: WorkflowPriority,
    pub status: WorkflowStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub result: Option<WorkflowResult>,
}

/// 工作流程优先级
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum WorkflowPriority {
    Low,
    Normal,
    High,
    Critical,
}

/// 工作流程状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkflowStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// 工作流程结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowResult {
    pub success: bool,
    pub output: serde_json::Value,
    pub execution_time_ms: u64,
    pub steps_executed: u32,
    pub errors: Vec<String>,
}

/// 工作流程优化器
pub struct WorkflowOptimizer {
    config: WorkflowConfig,
    workflows: Arc<RwLock<HashMap<String, Workflow>>>,
    active_workflows: Arc<RwLock<HashMap<String, tokio::task::JoinHandle<()>>>>,
    workflow_queue: Arc<RwLock<VecDeque<Workflow>>>,
    metrics: Arc<RwLock<WorkflowMetrics>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowMetrics {
    pub total_workflows: u64,
    pub completed_workflows: u64,
    pub failed_workflows: u64,
    pub average_execution_time_ms: f64,
    pub active_workflows: u32,
    pub queued_workflows: u32,
}

/// 工作流执行器接口
#[async_trait]
pub trait WorkflowExecutor: Send + Sync {
    /// 执行工作流程步骤
    async fn execute_step(&self, step: &WorkflowStep, context: &WorkflowContext) -> Result<serde_json::Value, WorkflowError>;
}

/// 工作流程上下文
#[derive(Debug, Clone)]
pub struct WorkflowContext {
    pub workflow_id: String,
    pub step_results: HashMap<String, serde_json::Value>,
    pub global_context: HashMap<String, serde_json::Value>,
}

/// 工作流程错误
#[derive(Debug, thiserror::Error)]
pub enum WorkflowError {
    #[error("Step execution failed: {0}")]
    StepFailed(String),

    #[error("Dependency not satisfied: {0}")]
    DependencyFailed(String),

    #[error("Timeout exceeded: {0}")]
    Timeout(String),

    #[error("Resource exhausted: {0}")]
    ResourceExhausted(String),

    #[error("Invalid workflow: {0}")]
    InvalidWorkflow(String),
}

impl WorkflowOptimizer {
    pub fn new(config: WorkflowConfig) -> Self {
        Self {
            config,
            workflows: Arc::new(RwLock::new(HashMap::new())),
            active_workflows: Arc::new(RwLock::new(HashMap::new())),
            workflow_queue: Arc::new(RwLock::new(VecDeque::new())),
            metrics: Arc::new(RwLock::new(WorkflowMetrics {
                total_workflows: 0,
                completed_workflows: 0,
                failed_workflows: 0,
                average_execution_time_ms: 0.0,
                active_workflows: 0,
                queued_workflows: 0,
            })),
        }
    }

    /// 提交工作流程
    pub async fn submit_workflow(&self, workflow: Workflow) -> Result<String, WorkflowError> {
        // 验证工作流程
        self.validate_workflow(&workflow).await?;

        // 优化工作流程步骤
        let optimized_workflow = self.optimize_workflow(workflow).await?;

        let workflow_id = optimized_workflow.id.clone();

        // 存储工作流程
        {
            let mut workflows = self.workflows.write().await;
            workflows.insert(workflow_id.clone(), optimized_workflow.clone());
        }

        // 更新指标
        {
            let mut metrics = self.metrics.write().await;
            metrics.total_workflows += 1;
            metrics.queued_workflows += 1;
        }

        // 添加到队列
        {
            let mut queue = self.workflow_queue.write().await;
            queue.push_back(optimized_workflow);
        }

        // 尝试启动工作流程
        self.try_start_next_workflow().await?;

        Ok(workflow_id)
    }

    /// 获取工作流程状态
    pub async fn get_workflow_status(&self, workflow_id: &str) -> Option<WorkflowStatus> {
        let workflows = self.workflows.read().await;
        workflows.get(workflow_id).map(|w| w.status.clone())
    }

    /// 取消工作流程
    pub async fn cancel_workflow(&self, workflow_id: &str) -> Result<(), WorkflowError> {
        let mut workflows = self.workflows.write().await;
        let mut active = self.active_workflows.write().await;

        if let Some(workflow) = workflows.get_mut(workflow_id) {
            workflow.status = WorkflowStatus::Cancelled;
            workflow.completed_at = Some(chrono::Utc::now());

            if let Some(handle) = active.remove(workflow_id) {
                handle.abort();
            }
        }

        Ok(())
    }

    /// 获取工作流程结果
    pub async fn get_workflow_result(&self, workflow_id: &str) -> Option<WorkflowResult> {
        let workflows = self.workflows.read().await;
        workflows.get(workflow_id).and_then(|w| w.result.clone())
    }

    /// 获取工作流程指标
    pub async fn get_metrics(&self) -> WorkflowMetrics {
        self.metrics.read().await.clone()
    }

    async fn validate_workflow(&self, workflow: &Workflow) -> Result<(), WorkflowError> {
        if workflow.steps.is_empty() {
            return Err(WorkflowError::InvalidWorkflow("Workflow must have at least one step".to_string()));
        }

        // 检查步骤依赖关系
        let step_ids: HashSet<&String> = workflow.steps.iter().map(|s| &s.id).collect();
        for step in &workflow.steps {
            for dep in &step.dependencies {
                if !step_ids.contains(dep) {
                    return Err(WorkflowError::InvalidWorkflow(
                        format!("Step {} depends on non-existent step {}", step.id, dep)
                    ));
                }
            }
        }

        Ok(())
    }

    async fn optimize_workflow(&self, mut workflow: Workflow) -> Result<Workflow, WorkflowError> {
        // 合并相似步骤
        workflow.steps = self.merge_similar_steps(workflow.steps);

        // 重新排序步骤以最小化等待时间
        workflow.steps = self.optimize_step_order(workflow.steps);

        // 移除不必要的步骤
        workflow.steps.retain(|step| self.is_step_necessary(step));

        Ok(workflow)
    }

    fn merge_similar_steps(&self, steps: Vec<WorkflowStep>) -> Vec<WorkflowStep> {
        let mut merged = Vec::new();
        let mut step_groups: HashMap<String, Vec<WorkflowStep>> = HashMap::new();

        // 按操作分组
        for step in steps {
            step_groups.entry(step.operation.clone())
                .or_insert_with(Vec::new)
                .push(step);
        }

        // 合并相同操作的步骤
        for (operation, group_steps) in step_groups {
            if group_steps.len() == 1 {
                merged.extend(group_steps);
            } else {
                // 合并为单个步骤
                let merged_step = WorkflowStep {
                    id: format!("merged_{}", operation),
                    name: format!("Merged {}", operation),
                    operation,
                    dependencies: group_steps.iter()
                        .flat_map(|s| s.dependencies.clone())
                        .collect::<HashSet<_>>()
                        .into_iter()
                        .collect(),
                    estimated_duration_ms: group_steps.iter()
                        .map(|s| s.estimated_duration_ms)
                        .sum(),
                    retry_count: group_steps.iter()
                        .map(|s| s.retry_count)
                        .max()
                        .unwrap_or(0),
                    timeout_ms: group_steps.iter()
                        .map(|s| s.timeout_ms)
                        .max()
                        .unwrap_or(30000),
                };
                merged.push(merged_step);
            }
        }

        merged
    }

    fn optimize_step_order(&self, steps: Vec<WorkflowStep>) -> Vec<WorkflowStep> {
        // 使用拓扑排序优化步骤顺序
        let mut result = Vec::new();
        let mut in_degree: HashMap<String, usize> = HashMap::new();
        let mut graph: HashMap<String, Vec<String>> = HashMap::new();

        // 构建图
        for step in &steps {
            in_degree.entry(step.id.clone()).or_insert(0);
            for dep in &step.dependencies {
                graph.entry(dep.clone()).or_insert_with(Vec::new).push(step.id.clone());
                *in_degree.entry(step.id.clone()).or_insert(0) += 1;
            }
        }

        // Kahn算法进行拓扑排序
        let mut queue: VecDeque<String> = in_degree.iter()
            .filter(|(_, &deg)| deg == 0)
            .map(|(id, _)| id.clone())
            .collect();

        while let Some(step_id) = queue.pop_front() {
            if let Some(step) = steps.iter().find(|s| s.id == step_id) {
                result.push(step.clone());
            }

            if let Some(neighbors) = graph.get(&step_id) {
                for neighbor in neighbors {
                    if let Some(deg) = in_degree.get_mut(neighbor) {
                        *deg -= 1;
                        if *deg == 0 {
                            queue.push_back(neighbor.clone());
                        }
                    }
                }
            }
        }

        result
    }

    fn is_step_necessary(&self, step: &WorkflowStep) -> bool {
        // 检查步骤是否有副作用或必要性
        // 简化的实现，实际应该基于业务规则
        !step.operation.contains("unnecessary")
    }

    async fn try_start_next_workflow(&self) -> Result<(), WorkflowError> {
        let active_count = {
            let active = self.active_workflows.read().await;
            active.len()
        };

        if active_count >= self.config.max_concurrent_workflows {
            return Ok(());
        }

        let workflow = {
            let mut queue = self.workflow_queue.write().await;
            queue.pop_front()
        };

        if let Some(workflow) = workflow {
            self.start_workflow_execution(workflow).await?;
        }

        Ok(())
    }

    async fn start_workflow_execution(&self, mut workflow: Workflow) -> Result<(), WorkflowError> {
        let workflow_id = workflow.id.clone();
        let workflow_id_key = workflow_id.clone();
        let config = self.config.clone();
        let executor = Arc::new(DefaultWorkflowExecutor::new());

        let handle = tokio::spawn(async move {
            let start_time = chrono::Utc::now();
            workflow.started_at = Some(start_time);
            workflow.status = WorkflowStatus::Running;

            let result = Self::execute_workflow_steps(
                workflow,
                executor,
                config.workflow_timeout_seconds,
            ).await;

            match result {
                Ok(completed_workflow) => {
                    // 工作流程成功完成
                    println!("Workflow {} completed successfully", completed_workflow.id);
                }
                Err(error) => {
                    // 工作流程失败
                    println!("Workflow {} failed: {:?}", workflow_id, error);
                }
            }
        });

        {
            let mut active = self.active_workflows.write().await;
            active.insert(workflow_id_key, handle);
        }

        {
            let mut metrics = self.metrics.write().await;
            metrics.active_workflows += 1;
            metrics.queued_workflows = metrics.queued_workflows.saturating_sub(1);
        }

        Ok(())
    }

    async fn execute_workflow_steps(
        mut workflow: Workflow,
        executor: Arc<dyn WorkflowExecutor>,
        timeout_seconds: u64,
    ) -> Result<Workflow, WorkflowError> {
        let timeout_duration = std::time::Duration::from_secs(timeout_seconds);
        let start_time = std::time::Instant::now();

        let mut context = WorkflowContext {
            workflow_id: workflow.id.clone(),
            step_results: HashMap::new(),
            global_context: HashMap::new(),
        };

        let mut completed_steps = 0;

        for step in &workflow.steps {
            // 检查超时
            if start_time.elapsed() > timeout_duration {
                workflow.status = WorkflowStatus::Failed;
                workflow.completed_at = Some(chrono::Utc::now());
                workflow.result = Some(WorkflowResult {
                    success: false,
                    output: serde_json::Value::Null,
                    execution_time_ms: start_time.elapsed().as_millis() as u64,
                    steps_executed: completed_steps,
                    errors: vec!["Workflow timeout".to_string()],
                });
                return Ok(workflow);
            }

            // 检查依赖是否满足
            let deps_satisfied = step.dependencies.iter().all(|dep| context.step_results.contains_key(dep));
            if !deps_satisfied {
                continue; // 跳过此步骤，稍后重试
            }

            // 执行步骤
            match executor.execute_step(step, &context).await {
                Ok(output) => {
                    context.step_results.insert(step.id.clone(), output);
                    completed_steps += 1;
                }
                Err(error) => {
                    workflow.status = WorkflowStatus::Failed;
                    workflow.completed_at = Some(chrono::Utc::now());
                    workflow.result = Some(WorkflowResult {
                        success: false,
                        output: serde_json::Value::Null,
                        execution_time_ms: start_time.elapsed().as_millis() as u64,
                        steps_executed: completed_steps,
                        errors: vec![error.to_string()],
                    });
                    return Ok(workflow);
                }
            }
        }

        // 工作流程成功完成
        workflow.status = WorkflowStatus::Completed;
        workflow.completed_at = Some(chrono::Utc::now());
        workflow.result = Some(WorkflowResult {
            success: true,
            output: serde_json::json!({
                "completed_steps": completed_steps,
                "step_results": context.step_results
            }),
            execution_time_ms: start_time.elapsed().as_millis() as u64,
            steps_executed: completed_steps,
            errors: vec![],
        });

        Ok(workflow)
    }

    fn are_dependencies_satisfied(&self, step: &WorkflowStep, completed_steps: &HashMap<String, serde_json::Value>) -> bool {
        step.dependencies.iter().all(|dep| completed_steps.contains_key(dep))
    }
}

/// 默认工作流执行器
pub struct DefaultWorkflowExecutor;

impl DefaultWorkflowExecutor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl WorkflowExecutor for DefaultWorkflowExecutor {
    async fn execute_step(&self, step: &WorkflowStep, _context: &WorkflowContext) -> Result<serde_json::Value, WorkflowError> {
        // 简化的步骤执行逻辑
        // 实际实现应该根据step.operation调用相应的业务逻辑
        match step.operation.as_str() {
            "validate_input" => Ok(serde_json::json!({"validated": true})),
            "process_data" => Ok(serde_json::json!({"processed": true})),
            "save_result" => Ok(serde_json::json!({"saved": true})),
            _ => Ok(serde_json::json!({"executed": true})),
        }
    }
}

/// 工作流程构建器
pub struct WorkflowBuilder {
    workflow: Workflow,
}

impl WorkflowBuilder {
    pub fn new(id: String, name: String) -> Self {
        Self {
            workflow: Workflow {
                id,
                name,
                description: None,
                steps: Vec::new(),
                priority: WorkflowPriority::Normal,
                status: WorkflowStatus::Pending,
                created_at: chrono::Utc::now(),
                started_at: None,
                completed_at: None,
                result: None,
            },
        }
    }

    pub fn description(mut self, desc: String) -> Self {
        self.workflow.description = Some(desc);
        self
    }

    pub fn priority(mut self, priority: WorkflowPriority) -> Self {
        self.workflow.priority = priority;
        self
    }

    pub fn add_step(mut self, step: WorkflowStep) -> Self {
        self.workflow.steps.push(step);
        self
    }

    pub fn build(self) -> Workflow {
        self.workflow
    }
}

/// 全局工作流程优化器管理器
pub struct WorkflowOptimizerManager {
    optimizer: Arc<RwLock<WorkflowOptimizer>>,
}

impl WorkflowOptimizerManager {
    pub fn new(config: WorkflowConfig) -> Self {
        let optimizer = WorkflowOptimizer::new(config);
        Self {
            optimizer: Arc::new(RwLock::new(optimizer)),
        }
    }

    pub fn optimizer(&self) -> Arc<RwLock<WorkflowOptimizer>> {
        Arc::clone(&self.optimizer)
    }
}

/// 全局工作流程优化器实例
static mut WORKFLOW_OPTIMIZER_MANAGER: Option<WorkflowOptimizerManager> = None;

/// 初始化全局工作流程优化器
pub fn init_workflow_optimizer(config: WorkflowConfig) {
    unsafe {
        WORKFLOW_OPTIMIZER_MANAGER = Some(WorkflowOptimizerManager::new(config));
    }
}

/// 获取全局工作流程优化器
pub fn get_workflow_optimizer() -> Option<&'static WorkflowOptimizerManager> {
    unsafe { WORKFLOW_OPTIMIZER_MANAGER.as_ref() }
}