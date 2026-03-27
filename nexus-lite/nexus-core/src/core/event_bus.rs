//! NexusLite 核心事件总线模块
//!
//! 这是简化后的核心事件总线，提供事件发布和订阅功能。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::broadcast;

/// 引擎事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", content = "data")]
pub enum EngineEvent {
    /// 抓取任务创建
    FetchTaskCreated {
        task_id: String,
        url: String,
    },
    /// 抓取任务完成
    FetchTaskCompleted {
        task_id: String,
        success: bool,
        duration_ms: u64,
    },
    /// 缓存命中
    CacheHit {
        key: String,
    },
    /// 缓存未命中
    CacheMiss {
        key: String,
    },
    /// 书籍搜索
    BookSearch {
        query: String,
        results_count: usize,
    },
}

/// 事件总线
pub struct EventBus {
    engine_sender: broadcast::Sender<EngineEvent>,
    system_sender: broadcast::Sender<SystemEvent>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            engine_sender: broadcast::channel(1000).0,
            system_sender: broadcast::channel(1000).0,
        }
    }

    /// 发布引擎事件
    pub async fn publish_engine(&self, event: EngineEvent) {
        let _ = self.engine_sender.send(event);
    }

    /// 发布系统事件
    pub async fn publish_system(&self, event: SystemEvent) {
        let _ = self.system_sender.send(event);
    }

    /// 订阅引擎事件
    pub fn subscribe_engine(&self) -> broadcast::Receiver<EngineEvent> {
        self.engine_sender.subscribe()
    }

    /// 订阅系统事件
    pub fn subscribe_system(&self) -> broadcast::Receiver<SystemEvent> {
        self.system_sender.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

/// 系统事件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", content = "data")]
pub enum SystemEvent {
    /// 引擎注册
    EngineRegistered {
        engine_name: String,
    },
    /// 引擎注销
    EngineUnregistered {
        engine_name: String,
    },
    /// 配置更新
    ConfigUpdated {
        key: String,
        value: String,
    },
    /// 系统启动
    SystemStarted {
        timestamp: i64,
    },
    /// 系统关闭
    SystemShutdown {
        timestamp: i64,
    },
}

/// 全局事件总线实例
static GLOBAL_EVENT_BUS: std::sync::OnceLock<Arc<EventBus>> = std::sync::OnceLock::new();

/// 获取全局事件总线
pub fn get_event_bus() -> Arc<EventBus> {
    GLOBAL_EVENT_BUS
        .get_or_init(|| Arc::new(EventBus::new()))
        .clone()
}
