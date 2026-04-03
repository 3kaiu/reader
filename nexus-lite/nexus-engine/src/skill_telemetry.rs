//! Skill decision telemetry recorder.
//!
//! Keeps a bounded in-memory timeline of skill decisions for diagnosis and replay.

use nexus_core::types::{SkillDecisionEnvelope, SkillDecisionLogEntry};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDecisionEvent {
    pub occurred_at_ms: i64,
    pub source_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    pub decision: SkillDecisionEnvelope,
}

#[derive(Debug, Clone)]
struct RecorderConfig {
    max_events: usize,
}

impl Default for RecorderConfig {
    fn default() -> Self {
        Self { max_events: 5000 }
    }
}

static CONFIG: LazyLock<Mutex<RecorderConfig>> =
    LazyLock::new(|| Mutex::new(RecorderConfig::default()));
static EVENTS: LazyLock<Mutex<VecDeque<SkillDecisionEvent>>> =
    LazyLock::new(|| Mutex::new(VecDeque::new()));
type PersistHook = Arc<dyn Fn(SkillDecisionEvent) + Send + Sync + 'static>;
static PERSIST_HOOK: LazyLock<Mutex<Option<PersistHook>>> = LazyLock::new(|| Mutex::new(None));

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn configure(max_events: usize) {
    let mut cfg = CONFIG
        .lock()
        .expect("skill telemetry config mutex poisoned");
    cfg.max_events = max_events.max(100);
}

pub fn set_persist_hook(hook: Option<PersistHook>) {
    let mut slot = PERSIST_HOOK
        .lock()
        .expect("skill telemetry persist hook mutex poisoned");
    *slot = hook;
}

pub fn record(source_id: &str, trace_id: Option<&str>, decision: SkillDecisionEnvelope) {
    let cfg = CONFIG
        .lock()
        .expect("skill telemetry config mutex poisoned")
        .clone();
    let mut events = EVENTS
        .lock()
        .expect("skill telemetry events mutex poisoned");
    events.push_back(SkillDecisionEvent {
        occurred_at_ms: now_ms(),
        source_id: source_id.to_string(),
        trace_id: trace_id.map(str::to_string),
        decision,
    });

    while events.len() > cfg.max_events {
        events.pop_front();
    }
    let latest = events.back().cloned();
    drop(events);

    let hook = PERSIST_HOOK
        .lock()
        .expect("skill telemetry persist hook mutex poisoned")
        .clone();
    if let (Some(hook), Some(event)) = (hook, latest) {
        hook(event);
    }
}

pub fn snapshot(
    limit: usize,
    source_id: Option<&str>,
    skill_name: Option<&str>,
) -> Vec<SkillDecisionEvent> {
    let events = EVENTS
        .lock()
        .expect("skill telemetry events mutex poisoned");
    let source_filter = source_id.map(str::to_string);
    let skill_filter = skill_name.map(|s| s.to_ascii_lowercase());

    let mut out = events
        .iter()
        .rev()
        .filter(|it| {
            if let Some(src) = source_filter.as_ref() {
                if &it.source_id != src {
                    return false;
                }
            }
            if let Some(skill) = skill_filter.as_ref() {
                if it.decision.skill_name.to_ascii_lowercase() != *skill {
                    return false;
                }
            }
            true
        })
        .take(limit.max(1).min(1000))
        .cloned()
        .collect::<Vec<_>>();
    out.sort_by(|a, b| b.occurred_at_ms.cmp(&a.occurred_at_ms));
    out
}

impl SkillDecisionEvent {
    pub fn to_log_entry(self) -> SkillDecisionLogEntry {
        SkillDecisionLogEntry {
            id: self.decision.decision_id.clone(),
            occurred_at_ms: self.occurred_at_ms,
            source_id: self.source_id,
            trace_id: self.trace_id,
            decision: self.decision,
        }
    }
}

#[cfg(test)]
pub fn reset_for_tests() {
    let mut events = EVENTS
        .lock()
        .expect("skill telemetry events mutex poisoned");
    events.clear();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn fake_decision(skill_name: &str) -> SkillDecisionEnvelope {
        SkillDecisionEnvelope {
            decision_id: "d-1".to_string(),
            skill_name: skill_name.to_string(),
            input_hash: "h".to_string(),
            confidence: 0.8,
            mode: "test".to_string(),
            version: "v1".to_string(),
            output: HashMap::new(),
        }
    }

    #[test]
    fn snapshot_filters_by_source_and_skill() {
        reset_for_tests();
        record("s1", Some("t1"), fake_decision("StrategyPlannerSkill"));
        record("s2", Some("t2"), fake_decision("ContentJudgeSkill"));
        record("s1", Some("t3"), fake_decision("ContentJudgeSkill"));

        let items = snapshot(10, Some("s1"), Some("contentjudgeskill"));
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].source_id, "s1");
        assert_eq!(items[0].decision.skill_name, "ContentJudgeSkill");
    }
}
