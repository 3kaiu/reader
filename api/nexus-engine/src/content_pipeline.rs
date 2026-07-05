use nexus_core::nxs::ContentValidationConfig;
use nexus_core::{EngineError, NxsSource, ReplaceRule};
use scraper::Html;
use tracing::{debug, warn};

use crate::content::apply_replace_rules;
use crate::content_extract::{
    extract_structured_text_from_root, post_clean_content_enhanced, readability_like_extract,
    ContentExtractConfig,
};
use crate::extraction_metrics;
use crate::font_decryptor::FontDecryptor;
use crate::nxs_engine::{stage_report, CompiledNxs, ContentPipelineRun};
use crate::skill_telemetry;
use crate::skills::ContentJudgeSkill;

pub(crate) struct NxsContentPipeline<'a> {
    pub(crate) source: &'a NxsSource,
    pub(crate) compiled: &'a CompiledNxs,
    pub(crate) judge_skill: &'a ContentJudgeSkill,
}

impl<'a> NxsContentPipeline<'a> {
    pub(crate) fn content_stats(text: &str) -> (usize, usize) {
        let trimmed = text.trim();
        let chars = trimmed.chars().count();
        let paragraphs = trimmed
            .split("\n\n")
            .filter(|p| !p.trim().is_empty())
            .count();
        (chars, paragraphs)
    }

    pub(crate) fn looks_like_content(
        &self,
        text: &str,
        validation: &ContentValidationConfig,
    ) -> bool {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return false;
        }

        let (chars, paragraphs) = Self::content_stats(trimmed);

        if chars < validation.min_chars {
            if validation.allow_short_chapter {
                return chars >= 20 && paragraphs >= 1;
            }
            return false;
        }

        paragraphs >= validation.min_paragraphs
    }

    pub(crate) fn execute_from_html(
        &self,
        html: &str,
        rules: &[ReplaceRule],
        strict_validate: bool,
    ) -> Result<ContentPipelineRun, EngineError> {
        let doc = Html::parse_document(html);
        let extract_cfg = ContentExtractConfig {
            filter_selectors: &self.compiled.content_filter,
            visible_only: self.compiled.content_visible_only,
        };
        let validation = self.source.content.validation.clone().unwrap_or_default();
        let mut stage_reports = Vec::new();

        let mut used_fallback = false;
        let mut extracted = if self.compiled.content_body.attr == "text" {
            self.compiled
                .content_body
                .select_first(&doc)
                .map(|root| extract_structured_text_from_root(root, &extract_cfg))
        } else {
            self.compiled.content_body.select_and_extract(&doc)
        }
        .unwrap_or_default();

        if extracted.trim().is_empty() && self.compiled.content_body.attr == "text" {
            if let Some(fallback) = readability_like_extract(&doc, &extract_cfg) {
                used_fallback = true;
                extracted = fallback;
            }
        }

        if used_fallback {
            debug!("content extraction fallback triggered for source {}", self.source.id);
        }
        let mut extract_stage = stage_report("rule_extract", true);
        extract_stage.strategy = Some(if used_fallback {
            "readability_fallback".to_string()
        } else {
            "selector_extract".to_string()
        });
        extract_stage
            .metrics
            .insert("chars".to_string(), extracted.chars().count().to_string());
        stage_reports.push(extract_stage);

        if extracted.trim().is_empty() {
            extraction_metrics::record_rule_mismatch_failure(&self.source.id);
            return Err(EngineError::RuleMismatch {
                rule: "content.body".to_string(),
            });
        }

        extracted = apply_replace_rules(extracted, rules, &self.source.id);
        extracted = apply_replace_rules(extracted, &self.source.content.replace, &self.source.id);
        let mut replace_stage = stage_report("replace", true);
        replace_stage
            .metrics
            .insert("chars".to_string(), extracted.chars().count().to_string());
        stage_reports.push(replace_stage);

        extracted = self.apply_content_script(extracted)?;
        let mut script_stage = stage_report("script", true);
        script_stage.strategy = self
            .source
            .content
            .script
            .as_ref()
            .map(|_| "restricted_script".to_string());
        script_stage
            .metrics
            .insert("enabled".to_string(), self.source.content.script_enabled.to_string());
        stage_reports.push(script_stage);

        extracted = self.apply_font_decrypt(extracted);
        let mut font_stage = stage_report("font_decrypt", true);
        font_stage.strategy = self.source.content.font_decrypt.as_ref().map(|cfg| {
            if cfg.mapping.is_some() {
                "known_mapping".to_string()
            } else if cfg.auto_decrypt {
                "auto_decrypt_hint".to_string()
            } else {
                "disabled".to_string()
            }
        });
        stage_reports.push(font_stage);

        let cleaned = post_clean_content_enhanced(extracted, self.source.content.clean.as_ref());
        let mut clean_stage = stage_report("clean", true);
        clean_stage.strategy = Some("engine_cleaned".to_string());
        clean_stage
            .metrics
            .insert("chars".to_string(), cleaned.chars().count().to_string());
        clean_stage
            .metrics
            .insert("paragraphs".to_string(), Self::content_stats(&cleaned).1.to_string());
        stage_reports.push(clean_stage);
        let strategy_path = stage_reports
            .iter()
            .filter_map(|stage| stage.strategy.clone())
            .collect::<Vec<_>>();
        let judge = self
            .judge_skill
            .judge(&self.source.id, &strategy_path, &cleaned);
        extraction_metrics::record_quality_score(&self.source.id, judge.quality.score);
        let mut quality_stage = stage_report("quality_gate", true);
        quality_stage.strategy = Some(judge.decision.decision_id.clone());
        quality_stage
            .metrics
            .insert("score".to_string(), format!("{:.3}", judge.quality.score));
        quality_stage
            .metrics
            .insert("label".to_string(), format!("{:?}", judge.quality.label));
        stage_reports.push(quality_stage);

        if !judge.passed {
            warn!(
                "content quality gate failed for source {} (score={:.3}, label={:?}, chars={}, paragraphs={}, noise={:.3}, dup={:.3})",
                self.source.id,
                judge.quality.score,
                judge.quality.label,
                judge.quality.char_count,
                judge.quality.paragraph_count,
                judge.quality.noise_ratio,
                judge.quality.duplicate_ratio
            );
            debug!(
                "content judge decision source={} decision={} confidence={:.2}",
                self.source.id, judge.decision.decision_id, judge.decision.confidence
            );
            skill_telemetry::record(&self.source.id, None, judge.decision.clone());
            extraction_metrics::record_low_quality_failure(&self.source.id);
            return Err(EngineError::RuleMismatch {
                rule: "content.quality_gate".to_string(),
            });
        }
        skill_telemetry::record(&self.source.id, None, judge.decision.clone());

        if strict_validate && !self.looks_like_content(&cleaned, &validation) {
            let (chars, paragraphs) = Self::content_stats(&cleaned);
            warn!(
                "content validation failed for source {} (chars={}, paragraphs={}, min_chars={}, min_paragraphs={}, allow_short={})",
                self.source.id,
                chars,
                paragraphs,
                validation.min_chars,
                validation.min_paragraphs,
                validation.allow_short_chapter
            );
            extraction_metrics::record_validation_failure(&self.source.id);
            return Err(EngineError::RuleMismatch {
                rule: "content.validation".to_string(),
            });
        }
        let mut validation_stage = stage_report("validation", true);
        validation_stage
            .metrics
            .insert("chars".to_string(), judge.quality.char_count.to_string());
        validation_stage
            .metrics
            .insert("paragraphs".to_string(), judge.quality.paragraph_count.to_string());
        stage_reports.push(validation_stage);
        if cleaned.trim().is_empty() {
            extraction_metrics::record_empty_content_failure(&self.source.id);
            return Err(EngineError::EmptyContent);
        }

        extraction_metrics::record_success(&self.source.id, used_fallback);
        Ok(ContentPipelineRun {
            content: cleaned,
            stage_reports,
        })
    }

    fn apply_content_script(&self, mut content: String) -> Result<String, EngineError> {
        let Some(script) = self.source.content.script.as_ref() else {
            return Ok(content);
        };
        if !self.source.content.script_enabled {
            return Ok(content);
        }
        if script.trim().is_empty() {
            return Ok(content);
        }
        if script.len() > 16 * 1024 {
            return Err(EngineError::ScriptMemoryExceeded);
        }

        for line in script.lines() {
            let cmd = line.trim();
            if cmd.is_empty() || cmd.starts_with('#') || cmd.starts_with("//") {
                continue;
            }

            if cmd.eq_ignore_ascii_case("trim") {
                content = content.trim().to_string();
                continue;
            }
            if cmd.eq_ignore_ascii_case("collapse_blank_lines") {
                while content.contains("\n\n\n") {
                    content = content.replace("\n\n\n", "\n\n");
                }
                continue;
            }

            if let Some(payload) = cmd.strip_prefix("replace::") {
                let mut parts = payload.splitn(2, "::");
                let pattern = parts.next().unwrap_or_default();
                let replacement = parts.next().unwrap_or_default();
                if pattern.len() > 256 {
                    continue;
                }
                let re = regex::Regex::new(pattern).map_err(|e| EngineError::ScriptError {
                    message: format!("invalid replace regex: {}", e),
                })?;
                content = re.replace_all(&content, replacement).to_string();
                continue;
            }

            if let Some(pattern) = cmd.strip_prefix("remove::") {
                if pattern.len() > 256 {
                    continue;
                }
                let re = regex::Regex::new(pattern).map_err(|e| EngineError::ScriptError {
                    message: format!("invalid remove regex: {}", e),
                })?;
                content = re.replace_all(&content, "").to_string();
                continue;
            }

            warn!("Unsupported script command for source {}: {}", self.source.id, cmd);
        }

        Ok(content)
    }

    fn apply_font_decrypt(&self, content: String) -> String {
        let Some(cfg) = self.source.content.font_decrypt.as_ref() else {
            return content;
        };

        if let Some(mapping) = cfg.mapping.as_ref() {
            let decryptor = FontDecryptor::new();
            return decryptor.decrypt(&content, mapping);
        }

        if cfg.auto_decrypt {
            warn!(
                "font_decrypt.auto_decrypt is enabled for source {}, but no mapping is provided",
                self.source.id
            );
        }

        content
    }
}
