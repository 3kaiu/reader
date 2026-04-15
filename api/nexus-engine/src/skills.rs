//! Agent skill plane (rule-based v1).
//!
//! This module provides deterministic "skill" decisions that can run in
//! production now, while keeping contracts compatible with future AI providers.

use crate::extraction_metrics::SourceExtractionStats;
use crate::quality_gate::{evaluate_content_quality, passes_quality_gate, QualityGateConfig};
use dashmap::DashMap;
use nexus_core::types::{ExtractionQuality, FetchJob, SkillDecisionEnvelope, SourceRuntimeProfile};
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::LazyLock;
use uuid::Uuid;

static RUNTIME_PROFILES: LazyLock<DashMap<String, SourceRuntimeProfile>> =
    LazyLock::new(DashMap::new);

fn stable_hash(input: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    input.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn normalize_strategy(name: &str) -> &'static str {
    match name.to_ascii_lowercase().as_str() {
        "cf-bypass" | "cfbypass" => "CF-Bypass",
        "cloudscraper" | "cloud-scraper" => "DirectHTTP",
        "directhttp" | "direct-http" => "DirectHTTP",
        _ => "DirectHTTP",
    }
}

fn normalize_chain(raw: &[String]) -> Vec<String> {
    let mut dedup = std::collections::HashSet::new();
    let mut chain = Vec::new();
    for item in raw {
        let normalized = normalize_strategy(item).to_string();
        if dedup.insert(normalized.clone()) {
            chain.push(normalized);
        }
    }
    for fallback in ["CF-Bypass", "DirectHTTP"] {
        if dedup.insert(fallback.to_string()) {
            chain.push(fallback.to_string());
        }
    }
    chain
}

fn build_envelope(
    skill_name: &str,
    mode: &str,
    input: &str,
    confidence: f64,
    output: HashMap<String, String>,
) -> SkillDecisionEnvelope {
    SkillDecisionEnvelope {
        decision_id: Uuid::new_v4().to_string(),
        skill_name: skill_name.to_string(),
        input_hash: stable_hash(input),
        confidence: confidence.clamp(0.0, 1.0),
        mode: mode.to_string(),
        version: "v1-rule".to_string(),
        output,
    }
}

pub fn runtime_profile_for(source_id: &str) -> SourceRuntimeProfile {
    RUNTIME_PROFILES
        .get(source_id)
        .map(|it| it.clone())
        .unwrap_or_default()
}

pub fn upsert_runtime_profile(source_id: &str, profile: SourceRuntimeProfile) {
    RUNTIME_PROFILES.insert(source_id.to_string(), profile);
}

#[derive(Debug, Clone)]
pub struct StrategyPlannerSkill {
    pub mode: &'static str,
}

impl Default for StrategyPlannerSkill {
    fn default() -> Self {
        Self {
            mode: "shadow-rule",
        }
    }
}

impl StrategyPlannerSkill {
    pub fn plan(
        &self,
        job: &FetchJob,
        stats: Option<&SourceExtractionStats>,
    ) -> (SourceRuntimeProfile, SkillDecisionEnvelope) {
        let mut profile = runtime_profile_for(&job.source_id);
        let mut reason = "default".to_string();
        let mut confidence = 0.55;

        if let Some(stats) = stats {
            let total = (stats.success + stats.total_failures) as f64;
            let fail_ratio = if total > 0.0 {
                stats.total_failures as f64 / total
            } else {
                0.0
            };

            if stats.low_quality_failures >= stats.rule_mismatch_failures
                && stats.low_quality_failures >= 3
            {
                profile.strategy_chain = vec![
                    "DirectHTTP".to_string(),
                    "CF-Bypass".to_string(),
                ];
                reason = "quality_regression".to_string();
                confidence = 0.8;
            } else if stats.rule_mismatch_failures >= stats.validation_failures
                && stats.rule_mismatch_failures >= stats.low_quality_failures
                && stats.rule_mismatch_failures >= 3
            {
                profile.strategy_chain = vec![
                    "CF-Bypass".to_string(),
                    "DirectHTTP".to_string(),
                ];
                reason = "selector_mismatch_bias".to_string();
                confidence = 0.75;
            } else if stats.success_rate >= 0.8 && stats.avg_quality_score >= 0.7 {
                profile.strategy_chain = vec!["CF-Bypass".to_string(), "DirectHTTP".to_string()];
                reason = "stable_source_fast_path".to_string();
                confidence = 0.7;
            }

            if fail_ratio >= 0.55 {
                profile.timeout_ms = profile.timeout_ms.max(45_000);
                profile.retry_budget = profile.retry_budget.max(3);
            }
        }

        profile.strategy_chain = normalize_chain(&profile.strategy_chain);
        upsert_runtime_profile(&job.source_id, profile.clone());

        let mut output = HashMap::new();
        output.insert("sourceId".to_string(), job.source_id.clone());
        output.insert("strategyChain".to_string(), profile.strategy_chain.join(" -> "));
        output.insert("timeoutMs".to_string(), profile.timeout_ms.to_string());
        output.insert("retryBudget".to_string(), profile.retry_budget.to_string());
        output.insert("reason".to_string(), reason);

        let envelope = build_envelope(
            "StrategyPlannerSkill",
            self.mode,
            &format!(
                "{}|{}|{}",
                job.source_id,
                job.target_url,
                job.chapter_id.clone().unwrap_or_default()
            ),
            confidence,
            output,
        );

        (profile, envelope)
    }
}

#[derive(Debug, Clone)]
pub struct ContentJudgeOutcome {
    pub quality: ExtractionQuality,
    pub passed: bool,
    pub decision: SkillDecisionEnvelope,
}

#[derive(Debug, Clone, Default)]
pub struct ContentJudgeSkill {
    gate: QualityGateConfig,
}

impl ContentJudgeSkill {
    pub fn judge(
        &self,
        source_id: &str,
        strategy_path: &[String],
        text: &str,
    ) -> ContentJudgeOutcome {
        let quality = evaluate_content_quality(text);
        let passed = passes_quality_gate(&quality, &self.gate);

        let mut output = HashMap::new();
        output.insert("sourceId".to_string(), source_id.to_string());
        output.insert("score".to_string(), format!("{:.4}", quality.score));
        output.insert("label".to_string(), format!("{:?}", quality.label));
        output.insert("passed".to_string(), passed.to_string());
        output.insert("strategyPath".to_string(), strategy_path.join(" -> "));

        let decision = build_envelope(
            "ContentJudgeSkill",
            "online-rule",
            &format!("{}|{}|{}", source_id, strategy_path.join("|"), text.len()),
            if passed { 0.8 } else { 0.9 },
            output,
        );

        ContentJudgeOutcome {
            quality,
            passed,
            decision,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FailureDiagnosis {
    pub primary_failure: String,
    pub recommendation: String,
    pub risk_score: f64,
    pub confidence: f64,
    pub decision: SkillDecisionEnvelope,
}

#[derive(Debug, Clone, Default)]
pub struct FailureDiagnosisSkill;

impl FailureDiagnosisSkill {
    pub fn diagnose(
        &self,
        source_id: &str,
        health_score: f64,
        stats: &SourceExtractionStats,
    ) -> FailureDiagnosis {
        let mut failures = [
            ("validation", stats.validation_failures),
            ("rule_mismatch", stats.rule_mismatch_failures),
            ("empty_content", stats.empty_content_failures),
            ("low_quality", stats.low_quality_failures),
        ];
        failures.sort_by(|a, b| b.1.cmp(&a.1));
        let primary_failure = failures
            .first()
            .map(|(name, _)| (*name).to_string())
            .unwrap_or_else(|| "none".to_string());

        let recommendation = match primary_failure.as_str() {
            "rule_mismatch" => "review source selectors and prefer DOM-rich strategy path",
            "validation" => {
                "relax strict validation for this source and inspect paragraph boundaries"
            },
            "empty_content" => {
                "increase retry budget and inspect anti-crawl responses for truncated bodies"
            },
            "low_quality" => "tune cleaner/noise filters and compare extraction fallback outputs",
            _ => "source is stable; keep strategy and monitor trend changes",
        }
        .to_string();

        let base_quality_risk = 1.0 - stats.avg_quality_score.clamp(0.0, 1.0);
        let base_success_risk = 1.0 - stats.success_rate.clamp(0.0, 1.0);
        let health_risk = 1.0 - health_score.clamp(0.0, 1.0);
        let risk_score = (base_quality_risk * 0.4 + base_success_risk * 0.35 + health_risk * 0.25)
            .clamp(0.0, 1.0);

        let mut output = HashMap::new();
        output.insert("sourceId".to_string(), source_id.to_string());
        output.insert("primaryFailure".to_string(), primary_failure.clone());
        output.insert("riskScore".to_string(), format!("{:.4}", risk_score));
        output.insert("recommendation".to_string(), recommendation.clone());

        let decision = build_envelope(
            "FailureDiagnosisSkill",
            "online-rule",
            &format!("{}|{:.3}|{}", source_id, health_score, stats.total_failures),
            0.75,
            output,
        );

        FailureDiagnosis {
            primary_failure,
            recommendation,
            risk_score,
            confidence: 0.75,
            decision,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planner_prioritizes_direct_http_for_quality_regression() {
        let skill = StrategyPlannerSkill::default();
        let job = FetchJob {
            source_id: "s1".to_string(),
            target_url: "https://x.test/chapter-1".to_string(),
            chapter_id: None,
            trace_id: "t-1".to_string(),
            request_meta: HashMap::new(),
        };
        let stats = SourceExtractionStats {
            source_id: "s1".to_string(),
            success: 10,
            fallback_hits: 0,
            validation_failures: 1,
            rule_mismatch_failures: 2,
            empty_content_failures: 1,
            low_quality_failures: 6,
            total_failures: 10,
            fallback_hit_rate: 0.0,
            success_rate: 0.5,
            avg_quality_score: 0.35,
            quality_success_rate: 0.5,
        };

        let (profile, _) = skill.plan(&job, Some(&stats));
        assert_eq!(profile.strategy_chain.first().map(String::as_str), Some("DirectHTTP"));
    }

    #[test]
    fn content_judge_marks_low_quality_text_as_failed() {
        let skill = ContentJudgeSkill::default();
        let outcome = skill.judge("s1", &["DirectHTTP".to_string()], "a a a a a");
        assert!(!outcome.passed);
    }
}
