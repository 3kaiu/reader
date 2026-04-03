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
use serde::{Deserialize, Serialize};

use crate::app::AppState;

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
    Ok(Json(build_source_diagnosis(&id, health.score(), &stats, &diagnosis_skill)))
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
        routing::get,
        Router,
    };
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
