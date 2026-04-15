#[path = "types/ai.rs"]
mod ai;
#[path = "types/books.rs"]
mod books;
#[path = "types/content.rs"]
mod content;
#[cfg(feature = "discovery")]
#[path = "types/discovery.rs"]
mod discovery;
#[path = "types/fetch.rs"]
mod fetch;
#[path = "types/library.rs"]
mod library;
#[path = "types/source.rs"]
mod source;
#[path = "types/voice.rs"]
mod voice;

pub use ai::*;
pub use books::*;
pub use content::*;
#[cfg(feature = "discovery")]
pub use discovery::*;
pub use fetch::*;
pub use library::*;
pub use source::*;
pub use voice::*;

#[cfg(test)]
mod tests {
    use super::{SourceAccessMode, SourceLicenseStatus, SourcePolicy};

    #[test]
    fn source_policy_defaults_to_unreviewed() {
        let policy = SourcePolicy::default();

        assert_eq!(policy.license_status, SourceLicenseStatus::Unknown);
        assert_eq!(policy.access_mode, SourceAccessMode::Unknown);
        assert!(!policy.allows_public_access());
    }

    #[test]
    fn source_policy_only_allows_reviewed_public_sources() {
        let licensed = SourcePolicy {
            license_status: SourceLicenseStatus::Licensed,
            ..SourcePolicy::default()
        };
        let public_domain = SourcePolicy {
            license_status: SourceLicenseStatus::PublicDomain,
            ..SourcePolicy::default()
        };
        let blocked = SourcePolicy {
            license_status: SourceLicenseStatus::Blocked,
            ..SourcePolicy::default()
        };

        assert!(licensed.allows_public_access());
        assert!(public_domain.allows_public_access());
        assert!(!blocked.allows_public_access());
    }
}
