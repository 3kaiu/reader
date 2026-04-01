use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use nexus_core::types::SkillDecisionEnvelope;
use nexus_engine::extraction_metrics;
use nexus_engine::skill_telemetry;
use nexus_engine::skills::FailureDiagnosisSkill;
use nexus_core::{NxsSource, SourcePolicy, SourceRulePackage};
use serde::{Deserialize, Serialize};

use crate::app::AppState;
use crate::routes::ApiResponse;
use crate::source_access::{is_source_publicly_available, load_source_availability};

/// Source with enabled status
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceWithStatus {
    #[serde(flatten)]
    pub source: NxsSource,
    pub enabled: bool,
    pub policy: SourcePolicy,
    pub public_access_enabled: bool,
}

/// List all sources
pub async fn list_sources(State(state): State<AppState>) -> Json<Vec<SourceWithStatus>> {
    let sources = state.engine_registry.source_store().get_all();
    let mut sources_with_status = Vec::new();

    for source in sources {
        let availability = load_source_availability(&state, &source.id)
            .await
            .ok();
        let enabled = availability
            .as_ref()
            .map(|it| it.enabled)
            .unwrap_or(true);
        let policy = availability
            .map(|it| it.policy)
            .unwrap_or_default();
        sources_with_status.push(SourceWithStatus {
            public_access_enabled: is_source_publicly_available(enabled, &policy),
            source,
            enabled,
            policy,
        });
    }

    Json(sources_with_status)
}

/// Get a single source
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

/// Add a new source
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

/// Delete a source
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

/// Source health info for API response
#[derive(serde::Serialize)]
pub struct SourceHealthInfo {
    pub source_id: String,
    pub success_count: u64,
    pub failure_count: u64,
    pub avg_latency_ms: u64,
    pub score: f64,
}

/// Get health stats for all sources
pub async fn source_health(State(state): State<AppState>) -> Json<Vec<SourceHealthInfo>> {
    let health_stats = state.orchestrator.health_tracker().get_all();

    let info: Vec<SourceHealthInfo> = health_stats
        .into_iter()
        .map(|h| SourceHealthInfo {
            source_id: h.source_id.clone(),
            success_count: h.success_count,
            failure_count: h.failure_count,
            avg_latency_ms: h.avg_latency_ms(),
            score: h.score(),
        })
        .collect();

    Json(info)
}

/// Extraction quality stats for all sources
pub async fn source_extraction_metrics() -> Json<Vec<extraction_metrics::SourceExtractionStats>> {
    Json(extraction_metrics::snapshot())
}

#[derive(Deserialize)]
pub struct ExtractionSummaryQuery {
    pub top: Option<usize>,
}

pub async fn source_extraction_summary(
    Query(query): Query<ExtractionSummaryQuery>,
) -> Json<extraction_metrics::ExtractionSummary> {
    Json(extraction_metrics::summary(query.top.unwrap_or(10).clamp(1, 50)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDecisionQuery {
    pub limit: Option<usize>,
    pub source_id: Option<String>,
    pub skill_name: Option<String>,
    pub since_ms: Option<i64>,
}

pub async fn source_skill_decisions(
    Query(query): Query<SkillDecisionQuery>,
) -> Json<Vec<skill_telemetry::SkillDecisionEvent>> {
    Json(skill_telemetry::snapshot(
        query.limit.unwrap_or(200),
        query.source_id.as_deref(),
        query.skill_name.as_deref(),
    ))
}

pub async fn source_skill_decisions_history(
    State(state): State<AppState>,
    Query(query): Query<SkillDecisionQuery>,
) -> Result<Json<Vec<nexus_core::SkillDecisionLogEntry>>, StatusCode> {
    state
        .store
        .get_skill_decision_history(
            query.limit.unwrap_or(200) as u32,
            query.source_id,
            query.skill_name,
            query.since_ms,
        )
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

/// Source extraction diagnosis response
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SourceDiagnosis {
    pub source_id: String,
    pub health_score: f64,
    pub success_rate: f64,
    pub quality_success_rate: f64,
    pub avg_quality_score: f64,
    pub risk_score: f64,
    pub primary_failure: String,
    pub recommendation: String,
    pub skill_confidence: f64,
    pub skill_decision: SkillDecisionEnvelope,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDiagnosisOverview {
    pub generated_at_ms: i64,
    pub total_sources: usize,
    pub top_risk_sources: Vec<SourceDiagnosis>,
    pub top_low_quality_sources: Vec<SourceDiagnosis>,
}

#[derive(Deserialize)]
pub struct DiagnosisQuery {
    pub top: Option<usize>,
}

fn build_source_diagnosis(
    source_id: &str,
    health_score: f64,
    stats: &extraction_metrics::SourceExtractionStats,
    diagnosis_skill: &FailureDiagnosisSkill,
) -> SourceDiagnosis {
    let diagnosis = diagnosis_skill.diagnose(source_id, health_score, stats);
    skill_telemetry::record(source_id, None, diagnosis.decision.clone());

    SourceDiagnosis {
        source_id: stats.source_id.clone(),
        health_score,
        success_rate: stats.success_rate,
        quality_success_rate: stats.quality_success_rate,
        avg_quality_score: stats.avg_quality_score,
        risk_score: diagnosis.risk_score,
        primary_failure: diagnosis.primary_failure,
        recommendation: diagnosis.recommendation,
        skill_confidence: diagnosis.confidence,
        skill_decision: diagnosis.decision,
    }
}

/// Diagnose a source using extraction/health metrics
pub async fn source_diagnosis(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceDiagnosis>, StatusCode> {
    let health = state
        .orchestrator
        .health_tracker()
        .get(&id)
        .ok_or(StatusCode::NOT_FOUND)?;
    let stats = extraction_metrics::snapshot()
        .into_iter()
        .find(|s| s.source_id == id)
        .ok_or(StatusCode::NOT_FOUND)?;

    let diagnosis_skill = FailureDiagnosisSkill;
    Ok(Json(build_source_diagnosis(
        &id,
        health.score(),
        &stats,
        &diagnosis_skill,
    )))
}

pub async fn source_diagnosis_overview(
    State(state): State<AppState>,
    Query(query): Query<DiagnosisQuery>,
) -> Json<SourceDiagnosisOverview> {
    let top = query.top.unwrap_or(10).clamp(1, 50);
    let health_map = state
        .orchestrator
        .health_tracker()
        .get_all()
        .into_iter()
        .map(|h| {
            let score = h.score();
            (h.source_id, score)
        })
        .collect::<std::collections::HashMap<_, _>>();
    let diagnosis_skill = FailureDiagnosisSkill;

    let mut items = extraction_metrics::snapshot()
        .into_iter()
        .map(|stats| {
            let health_score = health_map.get(&stats.source_id).copied().unwrap_or(0.5);
            build_source_diagnosis(&stats.source_id, health_score, &stats, &diagnosis_skill)
        })
        .collect::<Vec<_>>();

    items.sort_by(|a, b| {
        b.risk_score
            .partial_cmp(&a.risk_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let top_risk_sources = items.iter().take(top).cloned().collect::<Vec<_>>();

    let mut by_low_quality = items.clone();
    by_low_quality.sort_by(|a, b| {
        a.avg_quality_score
            .partial_cmp(&b.avg_quality_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let top_low_quality_sources = by_low_quality.into_iter().take(top).collect::<Vec<_>>();

    Json(SourceDiagnosisOverview {
        generated_at_ms: Utc::now().timestamp_millis(),
        total_sources: items.len(),
        top_risk_sources,
        top_low_quality_sources,
    })
}

/// Request body for updating source status
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
    #[serde(default)]
    pub tags: Vec<String>,
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
}

/// Update source enabled status
pub async fn update_source_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStatusRequest>,
) -> Result<Json<SourceWithStatus>, (StatusCode, String)> {
    // Check if source exists
    let source = state
        .engine_registry
        .source_store()
        .get(&id)
        .ok_or((StatusCode::NOT_FOUND, format!("Source not found: {}", id)))?;

    // Update status in database
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

/// Update source governance policy
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
    let package = req.package;
    let source_id = package.source.id.clone();
    let compile_ready = package.validation.valid;
    let importable = package.validation.importable && package.validation.compile_ok;
    let enabled_by_default = package
        .import_policy
        .as_ref()
        .map(|it| it.enabled_by_default)
        .unwrap_or(true);

    if !importable {
        return Json(ApiResponse::error(
            "source package must pass validation before import",
        ));
    }

    if let Err(error) = state.engine_registry.source_store().save(&package.source).await {
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
    }))
}

pub async fn list_source_packages(
    State(state): State<AppState>,
) -> Json<ApiResponse<Vec<SourcePackageSummary>>> {
    let packages = match state.store.list_source_packages().await {
        Ok(packages) => packages,
        Err(error) => {
            return Json(ApiResponse::error(&format!(
                "list source packages failed: {error}"
            )))
        }
    };

    let mut items = Vec::with_capacity(packages.len());
    for package in packages {
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
        Ok(Some(package)) => Json(ApiResponse::success(package)),
        Ok(None) => Json(ApiResponse::error("source package not found")),
        Err(error) => Json(ApiResponse::error(&format!(
            "get source package failed: {error}"
        ))),
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
        routing::get,
        Router,
    };
    use nexus_engine::skill_telemetry;
    use nexus_core::types::SkillDecisionEnvelope;
    use std::collections::HashMap;
    use tower::ServiceExt;

    #[tokio::test]
    async fn source_extraction_route_returns_json_array() {
        extraction_metrics::record_success("route_test_source", false);

        let app = Router::new().route("/api/sources/extraction", get(source_extraction_metrics));
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/sources/extraction")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("route should respond");

        assert_eq!(response.status(), StatusCode::OK);

        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should be readable");
        let payload: serde_json::Value =
            serde_json::from_slice(&bytes).expect("response must be valid json");
        assert!(payload.is_array());
    }

    #[tokio::test]
    async fn source_extraction_summary_route_returns_json_object() {
        extraction_metrics::record_success("summary_test_source", true);

        let app =
            Router::new().route("/api/sources/extraction/summary", get(source_extraction_summary));
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/sources/extraction/summary?top=3")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("route should respond");

        assert_eq!(response.status(), StatusCode::OK);

        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should be readable");
        let payload: serde_json::Value =
            serde_json::from_slice(&bytes).expect("response must be valid json");
        assert!(payload.is_object());
        assert!(payload.get("topFailingSources").is_some());
    }

    #[tokio::test]
    async fn source_skill_decisions_route_returns_json_array() {
        skill_telemetry::record(
            "skill_route_source",
            Some("trace-1"),
            SkillDecisionEnvelope {
                decision_id: "decision-1".to_string(),
                skill_name: "StrategyPlannerSkill".to_string(),
                input_hash: "abc".to_string(),
                confidence: 0.9,
                mode: "test".to_string(),
                version: "v1".to_string(),
                output: HashMap::new(),
            },
        );

        let app = Router::new().route("/api/sources/skills/decisions", get(source_skill_decisions));
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/sources/skills/decisions?limit=5&sourceId=skill_route_source")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("route should respond");

        assert_eq!(response.status(), StatusCode::OK);

        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should be readable");
        let payload: serde_json::Value =
            serde_json::from_slice(&bytes).expect("response must be valid json");
        assert!(payload.is_array());
        assert!(!payload.as_array().expect("array expected").is_empty());
    }
}
