// ===== 核心业务模块 =====
pub mod book_engine; // 书籍引擎
pub mod legado;
pub mod nxs; // NXS格式处理 // Legado书源数据模型

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
pub mod url_safety; // SSRF 防护

// ===== 核心导出 =====
pub use book_engine::*;
pub use config::*;
pub use domain::book_source::{
    BookSource, BookSourceError, BookSourceEvent, BookSourceSnapshot, HealthUpdated, PolicyUpdated,
    SourceCreated, SourceStatusChanged, ValidationCompleted,
};
pub use error::EngineError;
pub use health_tracker::*;
pub use legado::LegadoSource;
pub use nxs::NxsSource;
pub use ports::{
    AntiCrawlPort, BookSourceEventStore, BookSourceReadModel, BookSourceRepository, CacheError,
    CachePort, ContentExtractorPort, EventBusError, EventBusPort, ExtractionMetadata,
    ExtractionResult, ExtractorConfig, ExtractorError, ExtractorMode, FetchError, FetcherPort,
    StorageError, StoragePort,
};
pub use traits::{AntiCrawlStrategy, Fetcher, FetcherStatistics};
pub use types::{
    AiAnalysisHistory, AiMappingRule, BookGroup, BookInfo, BookInfoMeta, BookItem, BookshelfItem,
    Chapter, ChapterContent, ChapterContentMeta, ExtractionQuality, FetchContext, FetchResponse,
    PersistedExtractionMetrics, PipelineStageReport, QualityLabel, ReplaceRule, SearchExplain,
    SearchExplainStrategy, SkillDecisionLogEntry, SourceAccessMode, SourceHealthReport,
    SourceHealthSegment, SourceHealthStatus, SourceImportPolicy, SourceLicenseStatus, SourcePolicy,
    SourceReadinessReport, SourceRulePackage, SourceRuleValidationReport, SourceRuntimeProfile,
    SourceSearchMode, VoiceModelMetadata,
};
