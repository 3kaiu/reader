// ===== 核心业务模块 =====
pub mod book_engine; // 书籍引擎
pub mod nxs; // NXS格式处理
pub mod legado; // Legado书源数据模型

// ===== 领域模型 =====
pub mod domain;

// ===== 端口定义 =====
pub mod ports;

// ===== 基础支撑模块 =====
pub mod config; // 配置处理
pub mod error; // 错误定义
pub mod health_tracker;
pub mod traits; // 特质定义
pub mod types; // 类型定义

// ===== 核心导出 =====
pub use book_engine::*;
pub use config::*;
pub use domain::book_source::{BookSource, BookSourceSnapshot, BookSourceError, BookSourceEvent, SourceCreated, SourceStatusChanged, PolicyUpdated, ValidationCompleted, HealthUpdated};
pub use error::EngineError;
pub use health_tracker::*;
pub use nxs::NxsSource;
pub use legado::LegadoSource;
pub use ports::{
    BookSourceRepository, BookSourceReadModel, BookSourceEventStore,
    FetcherPort, AntiCrawlPort, ContentExtractorPort, StoragePort, CachePort, EventBusPort,
    FetchResponse, FetcherStatistics as PortFetcherStatistics, FetchError, FetchContext,
    ExtractorConfig, ExtractorMode, ExtractionResult, ExtractionMetadata, PipelineStageReport, ExtractorError,
    StorageError, CacheError, EventBusError,
};
pub use traits::{AntiCrawlStrategy, Fetcher, FetcherStatistics};
pub use types::*;