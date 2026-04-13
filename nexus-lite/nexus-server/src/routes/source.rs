use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_core::{NxsSource, SourcePolicy, SourceRulePackage};
use serde::{Deserialize, Serialize};

use crate::app::AppState;
use crate::routes::ApiResponse;
use crate::source_access::{is_source_publicly_available, load_source_availability};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceWithStatus {
    #[serde(flatten)]
    pub source: NxsSource,
    pub enabled: bool,
    pub policy: SourcePolicy,
    pub public_access_enabled: bool,
}

pub async fn list_sources(State(state): State<AppState>) -> Json<Vec<SourceWithStatus>> {
    let sources = state.engine_registry.source_store().get_all();
    let mut sources_with_status = Vec::new();

    for source in sources {
        let availability = load_source_availability(&state, &source.id).await.ok();
        let enabled = availability.as_ref().map(|it| it.enabled).unwrap_or(true);
        let policy = availability.map(|it| it.policy).unwrap_or_default();
        sources_with_status.push(SourceWithStatus {
            public_access_enabled: is_source_publicly_available(enabled, &policy),
            source,
            enabled,
            policy,
        });
    }

    Json(sources_with_status)
}

pub async fn get_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceWithStatus>, StatusCode> {
    let source = state
        .engine_registry
        .source_store()
        .get(&id)
        .ok_or(StatusCode::NOT_FOUND)?;

    let availability = load_source_availability(&state, &id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(SourceWithStatus {
        public_access_enabled: is_source_publicly_available(
            availability.enabled,
            &availability.policy,
        ),
        source,
        enabled: availability.enabled,
        policy: availability.policy,
    }))
}

/// Persist a book source from the canonical NXS shape (`NxsSource` JSON).
/// This is the primary “import NXS” endpoint for personal deployments; see `AGENTS.md`.
pub async fn add_source(
    State(state): State<AppState>,
    Json(source): Json<NxsSource>,
) -> Result<StatusCode, (StatusCode, String)> {
    let id = source.id.clone();
    state
        .engine_registry
        .source_store()
        .save(&source)
        .await
        .map(|_| {
            state.engine_registry.invalidate(&id);
            StatusCode::CREATED
        })
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn delete_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    state
        .engine_registry
        .source_store()
        .delete(&id)
        .await
        .map(|_| {
            state.engine_registry.invalidate(&id);
            StatusCode::NO_CONTENT
        })
        .map_err(|_| StatusCode::NOT_FOUND)
}

#[derive(serde::Deserialize)]
pub struct UpdateStatusRequest {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcePackageSummary {
    pub source_id: String,
    pub source_name: String,
    pub host: String,
    pub package_id: String,
    pub generated_at_ms: i64,
    pub enabled: bool,
    pub valid: bool,
    pub readiness_state: String,
    #[serde(default)]
    pub searchable: bool,
    #[serde(default)]
    pub detail_ready: bool,
    #[serde(default)]
    pub toc_ready: bool,
    #[serde(default)]
    pub readable: bool,
    #[serde(default)]
    pub overall_health_score: f64,
    #[serde(default)]
    pub recommended: bool,
    pub search_status: String,
    pub book_status: String,
    pub toc_status: String,
    pub content_status: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn health_status_label(status: &nexus_core::SourceHealthStatus) -> &'static str {
    match status {
        nexus_core::SourceHealthStatus::Pass => "pass",
        nexus_core::SourceHealthStatus::Warn => "warn",
        nexus_core::SourceHealthStatus::Fail => "fail",
        nexus_core::SourceHealthStatus::Unknown => "unknown",
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourcePackageRequest {
    pub package: SourceRulePackage,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourcePackageResponse {
    pub source_id: String,
    pub package_id: String,
    pub imported: bool,
    pub compile_ready: bool,
    pub importable: bool,
    pub readiness_state: String,
}

pub async fn update_source_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStatusRequest>,
) -> Result<Json<SourceWithStatus>, (StatusCode, String)> {
    let source = state
        .engine_registry
        .source_store()
        .get(&id)
        .ok_or((StatusCode::NOT_FOUND, format!("Source not found: {}", id)))?;

    state
        .store
        .set_source_status(id.clone(), body.enabled)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let policy = state
        .store
        .get_source_policy(id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(SourceWithStatus {
        public_access_enabled: is_source_publicly_available(body.enabled, &policy),
        source,
        enabled: body.enabled,
        policy,
    }))
}

pub async fn update_source_policy(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(policy): Json<SourcePolicy>,
) -> Result<Json<SourceWithStatus>, (StatusCode, String)> {
    let source = state
        .engine_registry
        .source_store()
        .get(&id)
        .ok_or((StatusCode::NOT_FOUND, format!("Source not found: {}", id)))?;

    state
        .store
        .set_source_policy(id.clone(), policy.clone())
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let enabled = state.store.get_source_status(id).await.unwrap_or(true);

    Ok(Json(SourceWithStatus {
        public_access_enabled: is_source_publicly_available(enabled, &policy),
        source,
        enabled,
        policy,
    }))
}

pub async fn import_source_package(
    State(state): State<AppState>,
    Json(req): Json<ImportSourcePackageRequest>,
) -> Json<ApiResponse<ImportSourcePackageResponse>> {
    let mut package = req.package;
    package.refresh_readiness();
    let readiness = package.effective_readiness();
    let source_id = package.source.id.clone();
    let compile_ready = package.validation.valid;
    let importable = readiness.importable;
    let enabled_by_default = package
        .import_policy
        .as_ref()
        .map(|it| it.enabled_by_default)
        .unwrap_or(true);

    if !importable {
        return Json(ApiResponse::error("source package must pass validation before import"));
    }

    if let Err(error) = state
        .engine_registry
        .source_store()
        .save(&package.source)
        .await
    {
        return Json(ApiResponse::error(&format!("save source failed: {error}")));
    }
    if let Err(error) = state.store.save_source_package(package.clone()).await {
        return Json(ApiResponse::error(&format!("save source package failed: {error}")));
    }
    if let Err(error) = state
        .store
        .set_source_status(source_id.clone(), enabled_by_default)
        .await
    {
        return Json(ApiResponse::error(&format!("set source status failed: {error}")));
    }

    state.engine_registry.invalidate(&source_id);
    Json(ApiResponse::success(ImportSourcePackageResponse {
        source_id,
        package_id: package.package_id,
        imported: true,
        compile_ready,
        importable,
        readiness_state: readiness.state.as_str().to_string(),
    }))
}

pub async fn list_source_packages(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<SourcePackageSummary>>> {
    let packages = match state.store.list_source_packages().await {
        Ok(packages) => packages,
        Err(error) => {
            return Json(ApiResponse::error(&format!("list source packages failed: {error}")))
        },
    };

    let mut items = Vec::with_capacity(packages.len());
    for package in packages {
        let readiness = package.effective_readiness();
        let enabled = state
            .store
            .get_source_status(package.source.id.clone())
            .await
            .unwrap_or(true);
        let host = url::Url::parse(&package.source.url)
            .ok()
            .and_then(|url| url.host_str().map(|it| it.to_string()))
            .unwrap_or_default();
        items.push(SourcePackageSummary {
            source_id: package.source.id.clone(),
            source_name: package.source.name.clone(),
            host,
            package_id: package.package_id,
            generated_at_ms: package.generated_at_ms,
            enabled,
            valid: package.validation.valid,
            readiness_state: readiness.state.as_str().to_string(),
            searchable: readiness.searchable,
            detail_ready: readiness.detail_ready,
            toc_ready: readiness.toc_ready,
            readable: readiness.readable,
            overall_health_score: package.validation.health.overall_score,
            recommended: package.validation.health.recommended,
            search_status: health_status_label(&package.validation.health.search.status)
                .to_string(),
            book_status: health_status_label(&package.validation.health.book.status).to_string(),
            toc_status: health_status_label(&package.validation.health.toc.status).to_string(),
            content_status: health_status_label(&package.validation.health.content.status)
                .to_string(),
            tags: package.tags,
        });
    }

    Json(ApiResponse::success(items))
}

pub async fn get_source_package(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<SourceRulePackage>> {
    match state.store.get_source_package(id).await {
        Ok(Some(mut package)) => {
            package.refresh_readiness();
            Json(ApiResponse::success(package))
        },
        Ok(None) => Json(ApiResponse::error("source package not found")),
        Err(error) => Json(ApiResponse::error(&format!("get source package failed: {error}"))),
    }
}

pub async fn delete_source_package(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    if let Err(error) = state.store.delete_source_package(id.clone()).await {
        return Json(ApiResponse::error(&format!("delete source package failed: {error}")));
    }
    let _ = state.engine_registry.source_store().delete(&id).await;
    state.engine_registry.invalidate(&id);

    Json(ApiResponse::success(serde_json::json!({
        "sourceId": id,
        "deleted": true
    })))
}
