use nexus_core::SourcePolicy;

use crate::{
    app::AppState,
    error::{forbidden, internal_error, not_found, ApiErrorResponse},
};

#[derive(Debug, Clone)]
pub struct SourceAvailability {
    pub enabled: bool,
    pub policy: SourcePolicy,
}

impl SourceAvailability {
    pub fn public_access_enabled(&self) -> bool {
        is_source_publicly_available(self.enabled, &self.policy)
    }
}

pub fn is_source_publicly_available(enabled: bool, policy: &SourcePolicy) -> bool {
    enabled && policy.allows_public_access()
}

pub async fn load_source_availability(
    state: &AppState,
    source_id: &str,
) -> Result<SourceAvailability, ApiErrorResponse> {
    let enabled = state
        .store
        .get_source_status(source_id.to_string())
        .await
        .map_err(|e| internal_error(e.to_string()))?;
    let policy = state
        .store
        .get_source_policy(source_id.to_string())
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    Ok(SourceAvailability { enabled, policy })
}

pub async fn ensure_source_public_access(
    state: &AppState,
    source_id: &str,
) -> Result<SourceAvailability, ApiErrorResponse> {
    if state.engine_registry.legado_store.get(source_id).is_none() {
        return Err(not_found("Source"));
    }

    let availability = load_source_availability(state, source_id).await?;
    if availability.public_access_enabled() {
        return Ok(availability);
    }

    Err(forbidden(format!("Source {} is not approved for public reading", source_id)))
}

#[cfg(test)]
mod tests {
    use nexus_core::{SourceLicenseStatus, SourcePolicy};
    use crate::source_access::is_source_publicly_available;

    #[test]
    fn public_access_requires_enabled_and_reviewed_policy() {
        let approved_policy = SourcePolicy {
            license_status: SourceLicenseStatus::Licensed,
            ..SourcePolicy::default()
        };
        let blocked_policy = SourcePolicy {
            license_status: SourceLicenseStatus::Blocked,
            ..SourcePolicy::default()
        };

        assert!(is_source_publicly_available(true, &approved_policy));
        assert!(!is_source_publicly_available(false, &approved_policy));
        assert!(!is_source_publicly_available(true, &blocked_policy));
    }
}