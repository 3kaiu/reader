use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_core::{LegadoSource, NxsSource, SourcePolicy, SourceRulePackage};
use serde::{Deserialize, Serialize};

use crate::app::AppState;
use crate::routes::ApiResponse;
use crate::source_access::{is_source_publicly_available, load_source_availability};

/// Validate a source ID to prevent directory traversal attacks.
/// Rejects IDs containing `..`, `/`, `\\`, or null bytes.
fn sanitize_source_id(id: &str) -> Result<&str, StatusCode> {
    if id.contains("..")
        || id.contains('/')
        || id.contains('\\')
        || id.contains('\0')
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(id)
}

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
    sanitize_source_id(&id)?;
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
    sanitize_source_id(&id)?;
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
    sanitize_source_id(&id).map_err(|e| (e, "Invalid source ID".to_string()))?;
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
    sanitize_source_id(&id).map_err(|e| (e, "Invalid source ID".to_string()))?;
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
    let _ = sanitize_source_id(&id);
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
    let _ = sanitize_source_id(&id);
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

// ============================================================
// Legado Source Import API
// ============================================================

/// Response for a single imported Legado source
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegadoImportResult {
    pub source_id: String,
    pub source_name: String,
    pub classification: String,
    pub fully_automatable: bool,
    pub imported: bool,
}

/// Import one or more Legado book sources (accepts single or array)
pub async fn import_legado_sources(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Json<ApiResponse<Vec<LegadoImportResult>>> {
    // Accept both single object and array
    let sources: Vec<LegadoSource> = if let Ok(arr) = serde_json::from_value::<Vec<LegadoSource>>(body.clone()) {
        arr
    } else if let Ok(single) = serde_json::from_value::<LegadoSource>(body) {
        vec![single]
    } else {
        return Json(ApiResponse::error("Expected LegadoSource or Vec<LegadoSource>"));
    };

    let mut results = Vec::with_capacity(sources.len());
    for source in &sources {
        let classification = source.classification();
        let fully_automatable = source.is_fully_automatable();
        let source_id = match state.engine_registry.legado_store().save(source).await {
            Ok(id) => id,
            Err(e) => {
                results.push(LegadoImportResult {
                    source_id: source.infer_id(),
                    source_name: source.book_source_name.clone(),
                    classification: classification.to_string(),
                    fully_automatable,
                    imported: false,
                });
                tracing::warn!("Failed to save legado source '{}': {}", source.book_source_name, e);
                continue;
            }
        };
        state.engine_registry.invalidate(&source_id);
        results.push(LegadoImportResult {
            source_id,
            source_name: source.book_source_name.clone(),
            classification: classification.to_string(),
            fully_automatable,
            imported: true,
        });
    }

    Json(ApiResponse::success(results))
}

/// List all imported Legado sources
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegadoSourceSummary {
    pub source_id: String,
    pub source_name: String,
    pub source_url: String,
    pub group: Option<String>,
    pub classification: String,
    pub fully_automatable: bool,
    pub has_js: bool,
    pub has_web_js: bool,
}

pub async fn list_legado_sources(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<LegadoSourceSummary>>> {
    let sources = state.engine_registry.legado_store().get_all();
    let items: Vec<LegadoSourceSummary> = sources
        .into_iter()
        .map(|s| {
            let source_id = s.infer_id();
            let classification = s.classification().to_string();
            let fully_automatable = s.is_fully_automatable();
            let has_js = s.has_js_rules();
            let has_web_js = s.has_web_js();
            LegadoSourceSummary {
                source_id,
                source_name: s.book_source_name,
                source_url: s.book_source_url,
                group: s.book_source_group,
                classification,
                fully_automatable,
                has_js,
                has_web_js,
            }
        })
        .collect();
    Json(ApiResponse::success(items))
}

/// Delete a Legado source by ID
pub async fn delete_legado_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    let id = match sanitize_source_id(&id) {
        Ok(valid) => valid,
        Err(e) => return Json(ApiResponse::error(&format!("Invalid source ID: {e}"))),
    };
    state
        .engine_registry
        .legado_store()
        .delete(&id)
        .await
        .map_err(|e| {
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                e.to_string(),
            )
        })
        .ok();
    state.engine_registry.invalidate(&id);
    Json(ApiResponse::success(serde_json::json!({
        "sourceId": id,
        "deleted": true
    })))
}
