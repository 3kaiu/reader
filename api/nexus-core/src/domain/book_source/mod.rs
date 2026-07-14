pub mod aggregate;
pub mod events;
pub mod repository;
pub mod state_machine;
pub mod value_objects;

pub use aggregate::{BookSource, BookSourceError, BookSourceSnapshot};
pub use events::BookSourceEvent;
pub use repository::{
    BookSourceEventPublisher, BookSourceFilter, BookSourceReadModel, BookSourceReadModelError,
    BookSourceRepository, BookSourceRepositoryError, BookSourceSummary,
};
pub use state_machine::{
    HealthScoreCalculator, ReadinessCalculator, ReadinessTransition, StatusTransition,
};
pub use value_objects::{
    HealthUpdated, PolicyUpdated, SourceCreated, SourceId, SourceIdError, SourceName,
    SourceNameError, SourceReadinessState, SourceStatus, SourceStatusChanged, SourceType,
    SourceUrl, SourceUrlError, ValidationCompleted,
};

pub type RepoSnapshot = BookSourceSnapshot;
