pub mod aggregate;
pub mod events;
pub mod repository;
pub mod state_machine;
pub mod value_objects;

pub use aggregate::{BookSource, BookSourceSnapshot, BookSourceError};
pub use events::{BookSourceEvent, SourceCreated, SourceStatusChanged, SourcePolicyUpdated, SourceValidationCompleted, SourceHealthUpdated};
pub use repository::{BookSourceSnapshot as RepoSnapshot, BookSourceFilter, BookSourceEventPublisher, BookSourceReadModelError};
pub use state_machine::{ReadinessTransition, ReadinessCalculator, HealthScoreCalculator};
pub use value_objects::*;