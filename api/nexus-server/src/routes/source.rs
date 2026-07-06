use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_core::{LegadoSource, NxsSource, SourcePolicy};
use serde::{Deserialize, Serialize};

use crate::app::AppState;
use crate::error::{internal_error, not_found, ApiErrorResponse};

// ---- Helpers ----

fn sanitize_source_id(id: &str) -> Result<&str, StatusCode> {
    if id.contains("..") || id.contains('/') || id.contains('\\') || id.contains('\0') {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(id)
}

// ---- Legado Source Views ----

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegadoSourceView {
    pub source: LegadoSource,
    pub classification: String,
}

fn classify_source(source: &LegadoSource) -> String {
    let text = format!("{:?}", source);
    if text.contains("startBrowser")
        || source
            .rule_content
            .as_ref()
            .and_then(|c| c.web_js.as_ref())
            .is_some()
    {
        "webjs".to_string()
    } else if text.contains("@js:") || text.contains("<js>") || text.contains("java.") {
        "js".to_string()
    } else if text.contains("@xpath:") {
        "xpath".to_string()
    } else {
        "css".to_string()
    }
}

// ---- Unified source view (combines Legado + NXS) ----

/// Combined view of a source with runtime metadata
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceView {
    pub id: String,
    pub name: String,
    pub source_type: &'static str,
    pub enabled: bool,
    pub policy: SourcePolicy,
}

impl SourceView {
    fn from_legado(source: &LegadoSource, enabled: bool, policy: SourcePolicy) -> Self {
        Self {
            id: source.infer_id(),
            name: source.book_source_name.clone(),
            source_type: "legado",
            enabled,
            policy,
        }
    }

    fn from_nxs(source: &NxsSource, enabled: bool, policy: SourcePolicy) -> Self {
        Self {
            id: source.id.clone(),
            name: source.name.clone(),
            source_type: "nxs",
            enabled,
            policy,
        }
    }
}

// ---- Request payloads ----

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatusPayload {
    pub enabled: bool,
}

// ---- Route handlers ----

/// POST /api/sources/legado/import
pub async fn import_legado_sources(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<Vec<LegadoSourceView>>, (StatusCode, String)> {
    let sources: Vec<LegadoSource> =
        if let Ok(array) = serde_json::from_value::<Vec<LegadoSource>>(payload.clone()) {
            array
        } else if let Ok(single) = serde_json::from_value::<LegadoSource>(payload) {
            vec![single]
        } else {
            return Err((StatusCode::BAD_REQUEST, "Invalid Legado source JSON".to_string()));
        };

    let mut imported = Vec::new();
    for source in sources {
        let id = source.infer_id();
        state
            .engine_registry
            .legado_store
            .save(&source)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        state.engine_registry.invalidate(&id);

        if let Some(_store) = state.engine_registry.legado_store.get(&id) {
            let classification = classify_source(&source);
            imported.push(LegadoSourceView {
                source,
                classification,
            });
        }
    }

    Ok(Json(imported))
}

/// GET /api/sources/legado
pub async fn list_legado_sources(
    State(state): State<AppState>,
) -> Json<Vec<LegadoSourceView>> {
    let sources = state.engine_registry.legado_store.get_all();
    let result: Vec<LegadoSourceView> = sources
        .into_iter()
        .map(|source| {
            let classification = classify_source(&source);
            LegadoSourceView { source, classification }
        })
        .collect();
    Json(result)
}

/// DELETE /api/sources/legado/{id}
pub async fn delete_legado_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> StatusCode {
    let id = match sanitize_source_id(&id) {
        Ok(id) => id,
        Err(_) => return StatusCode::BAD_REQUEST,
    };

    let _ = state.engine_registry.legado_store.delete(id).await;
    state.engine_registry.invalidate(id);
    StatusCode::NO_CONTENT
}

/// GET /api/sources — list all sources (Legado + NXS) with runtime metadata
pub async fn list_sources(
    State(state): State<AppState>,
) -> Result<Json<Vec<SourceView>>, ApiErrorResponse> {
    let mut sources: Vec<SourceView> = Vec::new();

    // Legado sources
    for ls in state.engine_registry.legado_store.get_all() {
        let id = ls.infer_id();
        let enabled = state
            .store
            .get_source_status(id.clone())
            .await
            .unwrap_or(true);
        let policy = state
            .store
            .get_source_policy(id.clone())
            .await
            .unwrap_or_default();
        sources.push(SourceView::from_legado(&ls, enabled, policy));
    }

    // NXS sources
    for nxs in state.engine_registry.nxs_store.get_all() {
        let enabled = state
            .store
            .get_source_status(nxs.id.clone())
            .await
            .unwrap_or(true);
        let policy = state
            .store
            .get_source_policy(nxs.id.clone())
            .await
            .unwrap_or_default();
        sources.push(SourceView::from_nxs(&nxs, enabled, policy));
    }

    Ok(Json(sources))
}

/// GET /api/sources/{id} — get single source with runtime metadata
pub async fn get_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceView>, ApiErrorResponse> {
    if let Some(ls) = state.engine_registry.legado_store.get(&id) {
        let enabled = state
            .store
            .get_source_status(id.clone())
            .await
            .unwrap_or(true);
        let policy = state
            .store
            .get_source_policy(id.clone())
            .await
            .unwrap_or_default();
        return Ok(Json(SourceView::from_legado(&ls, enabled, policy)));
    }

    if let Some(nxs) = state.engine_registry.nxs_store.get(&id) {
        let enabled = state
            .store
            .get_source_status(id.clone())
            .await
            .unwrap_or(true);
        let policy = state
            .store
            .get_source_policy(id.clone())
            .await
            .unwrap_or_default();
        return Ok(Json(SourceView::from_nxs(&nxs, enabled, policy)));
    }

    Err(not_found("Source"))
}

/// PUT /api/sources/{id}/status — update source enabled/disabled
pub async fn update_source_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateStatusPayload>,
) -> Result<Json<SourceView>, ApiErrorResponse> {
    // Check source exists in either store
    let exists = state.engine_registry.legado_store.get(&id).is_some()
        || state.engine_registry.nxs_store.get(&id).is_some();
    if !exists {
        return Err(not_found("Source"));
    }

    state
        .store
        .set_source_status(id.clone(), payload.enabled)
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let policy = state
        .store
        .get_source_policy(id.clone())
        .await
        .unwrap_or_default();

    Ok(Json(SourceView {
        id: id.clone(),
        name: id.clone(),
        source_type: "unknown",
        enabled: payload.enabled,
        policy,
    }))
}

/// PUT /api/sources/{id}/policy — update source policy
pub async fn update_source_policy(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(policy): Json<SourcePolicy>,
) -> Result<Json<SourceView>, ApiErrorResponse> {
    let exists = state.engine_registry.legado_store.get(&id).is_some()
        || state.engine_registry.nxs_store.get(&id).is_some();
    if !exists {
        return Err(not_found("Source"));
    }

    state
        .store
        .set_source_policy(id.clone(), policy.clone())
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let enabled = state
        .store
        .get_source_status(id.clone())
        .await
        .unwrap_or(true);

    Ok(Json(SourceView {
        id: id.clone(),
        name: id.clone(),
        source_type: "unknown",
        enabled,
        policy,
    }))
}

/// POST /api/sources — add a new source (NXS format)
pub async fn add_source(
    State(state): State<AppState>,
    Json(source): Json<NxsSource>,
) -> Result<StatusCode, ApiErrorResponse> {
    state
        .engine_registry
        .nxs_store
        .save(&source)
        .await
        .map_err(|e| internal_error(e.to_string()))?;
    Ok(StatusCode::CREATED)
}

/// DELETE /api/sources/{id} — delete a source from both stores
pub async fn delete_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiErrorResponse> {
    // Try Legado store
    if state.engine_registry.legado_store.get(&id).is_some() {
        state
            .engine_registry
            .legado_store
            .delete(&id)
            .await
            .map_err(|e| internal_error(e.to_string()))?;
        state.engine_registry.invalidate(&id);
        return Ok(StatusCode::NO_CONTENT);
    }

    // Try NXS store
    if state.engine_registry.nxs_store.get(&id).is_some() {
        state
            .engine_registry
            .nxs_store
            .delete(&id)
            .await
            .map_err(|e| internal_error(e.to_string()))?;
        state.engine_registry.invalidate(&id);
        return Ok(StatusCode::NO_CONTENT);
    }

    Err(not_found("Source"))
}

// ---- Source health ----

/// GET /api/sources/health — get health summary for all sources
pub async fn list_source_health(
    State(state): State<AppState>,
) -> Json<Vec<serde_json::Value>> {
    use nexus_engine::extraction_metrics;

    let health_tracker = state.store.health_tracker();
    let all_snapshot = health_tracker.snapshot_persisted();

    let mut results: Vec<serde_json::Value> = Vec::new();
    for h in &all_snapshot {
        let total = h.success_count + h.failure_count;
        let success_rate = if total > 0 {
            h.success_count as f64 / total as f64
        } else {
            1.0
        };
        let extraction = extraction_metrics::stats_for(&h.source_id);
        results.push(serde_json::json!({
            "sourceId": h.source_id,
            "successCount": h.success_count,
            "failureCount": h.failure_count,
            "healthPoints": h.health_points,
            "consecutiveSuccesses": h.consecutive_successes,
            "consecutiveFailures": h.consecutive_failures,
            "successRate": success_rate,
            "extraction": extraction.map(|e| serde_json::json!({
                "success": e.success,
                "validationFailures": e.validation_failures,
                "ruleMismatchFailures": e.rule_mismatch_failures,
                "emptyContentFailures": e.empty_content_failures,
                "lowQualityFailures": e.low_quality_failures,
            })),
        }));
    }

    Json(results)
}

// ---- Source packages (stubs returning 501) ----

/// GET /api/source-packages
pub async fn list_source_packages() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "message": "Source packages are not yet implemented in this version",
        "status": "unavailable",
        "sources": [],
    }))
}

/// POST /api/source-packages/import
pub async fn import_source_package() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({
            "message": "Source package import is not yet implemented in this version",
            "status": "unavailable",
        })),
    )
}

/// GET /api/source-packages/{id}
pub async fn get_source_package(
    Path(_id): Path<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({
            "message": "Source package detail is not yet implemented in this version",
            "status": "unavailable",
        })),
    )
}

/// DELETE /api/source-packages/{id}
pub async fn delete_source_package() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({
            "message": "Source package deletion is not yet implemented in this version",
            "status": "unavailable",
        })),
    )
}