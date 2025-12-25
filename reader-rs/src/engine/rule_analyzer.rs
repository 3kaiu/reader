//! Rule Analyzer - Unified rule parsing with multi-rule support
//!
//! Handles Legado rule syntax including:
//! - Rule type detection (@css:, @json:, @xpath:, @js:, ##regex##)
//! - Multi-rule combinations (|| for alternatives, && for concatenation)
//! - JavaScript post-processing (<js>code</js>)
//! - Template variable replacement ({{key}})

use anyhow::{anyhow, Result};
use regex::Regex;
use std::collections::HashMap;
use std::sync::Arc;

use super::cookie::CookieManager;
use super::js_analyzer::{AnalysisResult, JsPatternAnalyzer, ExprValue};
use super::js_executor::JsExecutor;
use super::native_api::NativeApiProvider;
use super::parsers::css::CssParser;
use super::parsers::jsonpath::JsonPathParser;
use super::parsers::jsoup::JsoupDefaultParser;
use super::parsers::regex::RegexParser;
use super::parsers::xpath::XPathParser;
use super::parsers::{Parser, RuleType};
use super::preprocessor::{NativeApi, SourcePreprocessor};
use super::template::{TemplateContext, TemplateExecutor};
use crate::storage::kv::KvStore;

/// Rule Analyzer for parsing content using Legado rules
pub struct RuleAnalyzer {
    css_parser: CssParser,
    json_parser: JsonPathParser,
    regex_parser: RegexParser,
    jsoup_parser: JsoupDefaultParser,
    xpath_parser: XPathParser,
    js_executor: JsExecutor,
    variables: std::cell::RefCell<HashMap<String, String>>,
    result_list: std::cell::RefCell<Vec<String>>, // For $1, $2 capture groups
    /// Source preprocessor for rule analysis
    preprocessor: SourcePreprocessor,
    /// Native API provider for Rust-native execution
    native_api: Arc<NativeApiProvider>,
    /// Template executor for URL/rule templates
    template_executor: TemplateExecutor,
    /// JS pattern analyzer for native execution of simple JS
    js_analyzer: JsPatternAnalyzer,
}

impl RuleAnalyzer {
    /// Create a new RuleAnalyzer
    pub fn new(kv_store: Arc<KvStore>) -> Result<Self> {
        let cookie_manager = Arc::new(CookieManager::new());
        let native_api = Arc::new(NativeApiProvider::new(cookie_manager, kv_store));
        let template_executor = TemplateExecutor::new(native_api.clone());

        Ok(Self {
            css_parser: CssParser,
            json_parser: JsonPathParser,
            regex_parser: RegexParser,
            jsoup_parser: JsoupDefaultParser,
            xpath_parser: XPathParser,
            js_executor: JsExecutor::new(native_api.clone())?,
            variables: std::cell::RefCell::new(HashMap::new()),
            result_list: std::cell::RefCell::new(Vec::new()),
            preprocessor: SourcePreprocessor::new(),
            native_api,
            template_executor,
            js_analyzer: JsPatternAnalyzer::new(),
        })
    }

    /// Create RuleAnalyzer with shared cookie manager
    pub fn with_cookie_manager(
        cookie_manager: Arc<CookieManager>,
        kv_store: Arc<KvStore>,
    ) -> Result<Self> {
        let native_api = Arc::new(NativeApiProvider::new(cookie_manager, kv_store));
        let template_executor = TemplateExecutor::new(native_api.clone());

        Ok(Self {
            css_parser: CssParser,
            json_parser: JsonPathParser,
            regex_parser: RegexParser,
            jsoup_parser: JsoupDefaultParser,
            xpath_parser: XPathParser,
            js_executor: JsExecutor::new(native_api.clone())?,
            variables: std::cell::RefCell::new(HashMap::new()),
            result_list: std::cell::RefCell::new(Vec::new()),
            preprocessor: SourcePreprocessor::new(),
            native_api,
            template_executor,
            js_analyzer: JsPatternAnalyzer::new(),
        })
    }

    /// Set base URL for the JS executor
    pub fn set_base_url(&mut self, url: &str) {
        self.js_executor.set_base_url(url);
    }

    /// Preload JavaScript library code (jsLib from book source)
    pub fn preload_lib(&self, js_lib: &str) -> Result<()> {
        self.js_executor.preload_lib(js_lib)
    }

    /// Build URL from template using Rust-native execution
    ///
    /// This method uses the preprocessor to analyze the URL template and
    /// executes it using native Rust where possible, only falling back to
    /// JS for complex expressions.
    ///
    /// # Example
    /// ```ignore
    /// let url = analyzer.build_url(
    ///     "https://example.com/search?q={{java.base64Encode(key)}}&page={{page}}",
    ///     &[("key", "test"), ("page", "1")]
    /// )?;
    /// ```
    pub fn build_url(&self, url_template: &str, vars: &[(&str, &str)]) -> Result<String> {
        let preprocessed = self.preprocessor.preprocess_url(url_template);

        let mut ctx = TemplateContext::new();
        for (key, value) in vars {
            ctx.set(key, value);
        }

        // Add stored variables
        let stored_vars = self.variables.borrow();
        for (k, v) in stored_vars.iter() {
            ctx.set(k, v);
        }

        self.template_executor.execute_url(&preprocessed, &ctx)
    }

    /// Get the native API provider (for external use)
    pub fn native_api(&self) -> &Arc<NativeApiProvider> {
        &self.native_api
    }

    /// Get the preprocessor (for external use)
    pub fn preprocessor(&self) -> &SourcePreprocessor {
        &self.preprocessor
    }

    /// Execute a native JS operation without QuickJS
    fn execute_native_js(&self, exec: &super::js_analyzer::NativeExecution, content: &str) -> Result<String> {
        use super::js_analyzer::ExprValue;
        
        // Resolve arguments to actual values
        let args: Vec<String> = exec.args.iter().map(|arg| {
            match arg {
                ExprValue::Literal(s) => s.clone(),
                ExprValue::Variable(name) => {
                    // Check variables first, fall back to content
                    self.variables.borrow().get(name).cloned()
                        .unwrap_or_else(|| content.to_string())
                }
                ExprValue::CurrentContent => content.to_string(),
            }
        }).collect();
        
        // Execute the native API
        self.native_api.execute(&exec.api, &args)
    }

    // ============== Crypto API (Rust Native) ==============

    /// 3DES decode using Rust native implementation
    pub fn triple_des_decode(
        &self,
        data: &str,
        key: &str,
        mode: &str,
        padding: &str,
        iv: &str,
    ) -> Result<String> {
        super::crypto::CryptoProvider::triple_des_decode_str(data, key, mode, padding, iv)
    }

    /// 3DES encode to Base64 using Rust native implementation
    pub fn triple_des_encode_base64(
        &self,
        data: &str,
        key: &str,
        mode: &str,
        padding: &str,
        iv: &str,
    ) -> Result<String> {
        super::crypto::CryptoProvider::triple_des_encode_base64(data, key, mode, padding, iv)
    }

    /// AES decode with Base64 encoded key/iv
    pub fn aes_decode_args_base64(
        &self,
        data: &str,
        key_b64: &str,
        mode: &str,
        padding: &str,
        iv_b64: &str,
    ) -> Result<String> {
        super::crypto::CryptoProvider::aes_decode_args_base64(data, key_b64, mode, padding, iv_b64)
    }

    /// AES encode with Base64 encoded key/iv
    pub fn aes_encode_args_base64(
        &self,
        data: &str,
        key_b64: &str,
        mode: &str,
        padding: &str,
        iv_b64: &str,
    ) -> Result<String> {
        super::crypto::CryptoProvider::aes_encode_args_base64(data, key_b64, mode, padding, iv_b64)
    }

    // ============== File API (Rust Native) ==============

    /// Delete a file from cache directory
    pub fn delete_file(&self, path: &str) -> bool {
        std::fs::remove_file(path).is_ok()
    }

    // ============== Hash API (Rust Native) ==============

    /// Calculate digest hash (MD5, SHA1, SHA256, SHA512)
    pub fn digest_hex(&self, data: &str, algorithm: &str) -> String {
        use super::preprocessor::NativeApi;
        self.native_api
            .execute(
                &NativeApi::DigestHex(algorithm.to_string()),
                &[data.to_string()],
            )
            .unwrap_or_default()
    }

    /// MD5 encode
    pub fn md5_encode(&self, data: &str) -> String {
        format!("{:x}", md5::compute(data.as_bytes()))
    }

    /// MD5 encode 16 characters
    pub fn md5_encode16(&self, data: &str) -> String {
        let full = self.md5_encode(data);
        if full.len() >= 24 {
            full[8..24].to_string()
        } else {
            full
        }
    }

    // ============== Encoding API (Rust Native) ==============

    /// Base64 encode
    pub fn base64_encode(&self, data: &str) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(data.as_bytes())
    }

    /// Base64 decode
    pub fn base64_decode(&self, data: &str) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(data.as_bytes())
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok())
            .unwrap_or_default()
    }

    /// URL encode
    pub fn encode_uri(&self, data: &str) -> String {
        urlencoding::encode(data).to_string()
    }

    /// Random UUID
    pub fn random_uuid(&self) -> String {
        uuid::Uuid::new_v4().to_string()
    }

    /// Put a variable for @put syntax
    pub fn put_variable(&self, key: &str, value: &str) {
        self.variables
            .borrow_mut()
            .insert(key.to_string(), value.to_string());
        // Also update JS cache for java.get/put access
        self.js_executor.put_variable(key, value);
    }

    /// Get a variable for @get syntax
    pub fn get_variable(&self, key: &str) -> Option<String> {
        self.variables.borrow().get(key).cloned()
    }

    /// Set result list for $1, $2 capture group references
    pub fn set_result_list(&self, list: Vec<String>) {
        *self.result_list.borrow_mut() = list;
    }

    /// Replace $1, $2 etc. with values from result_list
    fn replace_capture_groups(&self, text: &str) -> String {
        let list = self.result_list.borrow();
        if list.is_empty() {
            return text.to_string();
        }

        // Match $1, $2, ... $99
        let re = regex::Regex::new(r"\$(\d{1,2})").unwrap();
        re.replace_all(text, |caps: &regex::Captures| {
            let index: usize = caps[1].parse().unwrap_or(0);
            list.get(index).cloned().unwrap_or_default()
        })
        .to_string()
    }

    /// Replace @get:key and {{key}} placeholders with stored variables
    fn replace_variables(&self, text: &str) -> String {
        let mut result = text.to_string();
        let vars = self.variables.borrow();

        for (k, v) in vars.iter() {
            // Replace {{key}}
            result = result.replace(&format!("{{{{{}}}}}", k), v);
            // Replace @get:key
            result = result.replace(&format!("@get:{}", k), v);
        }

        result
    }

    /// Parse @put:{key:value} syntax and return the rule without @put part
    fn parse_put_rule(&self, rule: &str) -> String {
        // Format: rule@put:{"key":"value"} or rule@put:{key:value}
        if let Some(pos) = rule.find("@put:") {
            let base_rule = rule[..pos].trim();
            let json_part = &rule[pos + 5..];

            // Try to parse as JSON
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_part) {
                if let Some(obj) = json.as_object() {
                    for (k, v) in obj {
                        if let Some(val) = v.as_str() {
                            self.put_variable(k, val);
                        } else {
                            self.put_variable(k, &v.to_string());
                        }
                    }
                }
            }

            return base_rule.to_string();
        }

        rule.to_string()
    }

    /// Get a single string value from content using a rule
    pub fn get_string(&self, content: &str, rule: &str) -> Result<String> {
        let rule = rule.trim();
        if rule.is_empty() {
            return Ok(String::new());
        }

        // Handle @put:{key:value} syntax - extract and store variables
        let rule = self.parse_put_rule(rule);

        // Replace @get:key and {{key}} placeholders
        let rule = self.replace_variables(&rule);

        // Replace $1, $2 etc. capture group references
        let rule = self.replace_capture_groups(&rule);
        let rule = rule.as_str();

        // Handle || alternative rules (try each until one succeeds)
        if rule.contains("||") && !rule.starts_with("<js>") {
            for alt in rule.split("||") {
                let alt = alt.trim();
                if alt.is_empty() {
                    continue;
                }
                if let Ok(result) = self.get_string(content, alt) {
                    if !result.is_empty() && result != "null" {
                        return Ok(result);
                    }
                }
            }
            return Ok(String::new());
        }

        // Split into steps using smarter logic that respects JS blocks and rule types
        let lines = self.split_steps(rule, false);
        let mut current_result = content.to_string();
        let mut first_line = true;

        for line in lines {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            // Check if this line is a pure JS rule (starts with @js: or <js>)
            let is_js =
                line.starts_with("@js:") || (line.starts_with("<js>") && line.contains("</js>"));

            let line_result = if is_js {
                self.execute_single_rule(if first_line { content } else { &current_result }, line)?
            } else {
                let mut vars = HashMap::new();
                // Use original content for first line, previous result for subsequent lines
                let effective_content = if first_line { content } else { &current_result };
                vars.insert("result".to_string(), effective_content.to_string());
                vars.insert("it".to_string(), effective_content.to_string());
                vars.insert("src".to_string(), effective_content.to_string());

                let processed_line = self.process_templates(line, &vars);
                let rule_type = RuleType::detect(&processed_line, content);

                // Heuristic: If it's a Jsoup rule without @ or . or #, and it's after processing,
                // it might be a literal if it contains spaces or ends with / or is purely numeric.
                // But CSS selectors like ".chapter-content p" should NOT be treated as literals
                let is_css_like = processed_line.starts_with('.')
                    || processed_line.starts_with('#')
                    || processed_line.contains(':'); // For pseudo-selectors

                let looks_like_literal = rule_type == RuleType::JsoupDefault
                    && !is_css_like
                    && !processed_line.contains('@')
                    && (processed_line.is_empty()
                        || processed_line.chars().all(|c| c.is_numeric() || c == '.')
                        || (processed_line.contains(' ') && !is_css_like)
                        || processed_line.starts_with("http")
                        || processed_line.starts_with('<'));

                if looks_like_literal {
                    eprintln!(
                        "!!!TRACE!!! process_chain_rules literal line, current len={}",
                        if first_line {
                            content.len()
                        } else {
                            current_result.len()
                        }
                    );
                    self.process_js_tags(&processed_line, &current_result)?
                } else {
                    self.execute_single_rule(
                        if first_line { content } else { &current_result },
                        &processed_line,
                    )?
                }
            };

            current_result = line_result;
            first_line = false;
        }

        Ok(current_result)
    }

    /// Get a list of strings from content using a rule
    pub fn get_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = rule.trim();
        if rule.is_empty() {
            return Ok(vec![]);
        }

        // Split by newline for chain rules
        // For list rules, we chain all but the last line as string transformations,
        // then execute the last line as a list rule.
        let lines: Vec<&str> = rule
            .split('\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if lines.len() > 1 {
            let base_rule_part = lines[..lines.len() - 1].join("\n");
            let list_rule_part = lines[lines.len() - 1];

            let base_content = self.get_string(content, &base_rule_part)?;
            return self.get_list(&base_content, list_rule_part);
        }

        // Handle || alternative rules for lists
        if rule.contains("||") && !rule.starts_with("<js>") {
            for alt in rule.split("||") {
                let alt = alt.trim();
                if alt.is_empty() {
                    continue;
                }
                if let Ok(results) = self.get_list(content, alt) {
                    if !results.is_empty() {
                        return Ok(results);
                    }
                }
            }
            return Ok(Vec::new());
        }

        // Check for list reversal prefix (-)
        let (rule, should_reverse) = if rule.starts_with('-') {
            (&rule[1..], true)
        } else {
            (rule, false)
        };

        // Handle multi-rule (%%)
        if rule.contains("%%") {
            let mut all_results = Vec::new();
            for sub_rule in rule.split("%%") {
                let sub_rule = sub_rule.trim();
                if sub_rule.is_empty() {
                    continue;
                }
                if let Ok(mut results) = self.execute_list_rule(content, sub_rule) {
                    all_results.append(&mut results);
                }
            }
            if should_reverse {
                all_results.reverse();
            }
            return Ok(all_results);
        }

        // Handle JS post-processing
        let (base_rule, js_code) = self.extract_js_postprocess(rule);

        // Execute base rule
        let mut results = self.execute_list_rule(content, &base_rule)?;

        // Apply list reversal
        if should_reverse {
            results.reverse();
        }

        // Apply JS post-processing if present
        if let Some(code) = js_code {
            results
                .into_iter()
                .map(|item| self.apply_js_postprocess(&item, &code))
                .collect()
        } else {
            Ok(results)
        }
    }

    /// Get elements (HTML fragments) from content using a rule
    pub fn get_elements(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule = rule.trim();
        if rule.is_empty() {
            return Ok(vec![]);
        }

        // Multi-line in elements rule usually doesn't happen for the selector itself,
        // but if it does, we take the last line as the element selector.
        let lines: Vec<&str> = rule
            .split('\n')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        let (base_content, selector) = if lines.len() > 1 {
            let base_rule_part = lines[..lines.len() - 1].join("\n");
            (
                self.get_string(content, &base_rule_part)?,
                lines[lines.len() - 1].to_string(),
            )
        } else {
            (content.to_string(), rule.to_string())
        };

        let (base_rule, _) = self.extract_js_postprocess(&selector);
        self.execute_elements_rule(&base_content, &base_rule)
    }

    /// Execute a JavaScript rule
    pub(crate) fn eval_js(&self, code: &str, vars: &HashMap<String, String>) -> Result<String> {
        self.js_executor.eval_with_context(code, vars)
    }

    /// Process <js> tags in a rule string
    pub fn process_js_tags(&self, rule: &str, result: &str) -> Result<String> {
        if !rule.contains("<js>") {
            return Ok(rule.to_string());
        }

        let mut output = String::new();
        let mut last_pos = 0;

        while let Some(start) = rule[last_pos..].find("<js>") {
            let start = last_pos + start;
            output.push_str(&rule[last_pos..start]);

            if let Some(end) = rule[start..].find("</js>") {
                let end = start + end;
                let code = &rule[start + 4..end];

                let mut vars = HashMap::new();
                vars.insert("result".to_string(), result.to_string());
                vars.insert("it".to_string(), result.to_string());

                let js_result = self.eval_js(code, &vars)?;
                output.push_str(&js_result);
                last_pos = end + 5;
            } else {
                // Unclosed tag
                output.push_str(&rule[start..]);
                last_pos = rule.len();
                break;
            }
        }
        output.push_str(&rule[last_pos..]);
        Ok(output)
    }

    /// Process {{key}} templates or {{ js_expression }} or {{ rule }} in a rule string
    pub fn process_templates(&self, rule: &str, vars: &HashMap<String, String>) -> String {
        let mut output = rule.to_string();

        // 1. Simple replacements for variables
        for (key, value) in vars {
            let placeholder = format!("{{{{{}}}}}", key);
            output = output.replace(&placeholder, value);
        }

        // 2. Evaluate remaining {{...}} as JavaScript or Rule
        if output.contains("{{") {
            if let Ok(re) = Regex::new(r"\{\{(.+?)\}\}") {
                // Collect matches first to avoid multiple mutable borrows
                let matches: Vec<(String, String)> = re
                    .captures_iter(&output)
                    .map(|cap| (cap[0].to_string(), cap[1].to_string()))
                    .collect();

                let content = vars.get("result").map(|s| s.as_str()).unwrap_or("");

                tracing::debug!(
                    "process_templates: content length={}, has matches={}",
                    content.len(),
                    matches.len()
                );

                for (full_match, inner_rule) in matches {
                    // Try evaluating as a rule first if content is available and it looks like a rule
                    // (starts with $ or @ or //)
                    let mut replaced = false;
                    let inner_trimmed = inner_rule.trim();

                    if !content.is_empty()
                        && (inner_trimmed.starts_with("$.")
                            || inner_trimmed.starts_with("$[")
                            || inner_trimmed.starts_with("//")
                            || inner_trimmed.starts_with("@"))
                    {
                        if let Ok(result) = self.get_string(content, inner_trimmed) {
                            output = output.replace(&full_match, &result);
                            replaced = true;
                        }
                    }

                    if !replaced {
                        // Try Native Template Executor
                        // This handles java.* APIs natively without JS
                        let parts = self.preprocessor.parse_template(&full_match);
                        let ctx = TemplateContext {
                            variables: vars.clone(),
                        };

                        if let Ok(result) = self.template_executor.execute_parts(&parts, &ctx) {
                            // If result matches the expression (literal fallback), it didn't really 'execute' in a useful way
                            // unless it was a literal. But here full_match includes {{}}.
                            // If template_executor returns a string that is not the original {{...}}, valid.
                            if result != full_match {
                                output = output.replace(&full_match, &result);
                                replaced = true;
                            }
                        }
                    }

                    if !replaced {
                        // Fallback to JS evaluation
                        match self.eval_js(&inner_rule, vars) {
                            Ok(result) => {
                                output = output.replace(&full_match, &result);
                            }
                            Err(_) => {
                                // If eval failed, keep original (might be intended)
                            }
                        }
                    }
                }
            }
        }

        output
    }

    // === Private methods ===

    /// Handle alternative rules separated by ||
    fn get_string_with_alternatives(&self, content: &str, rule: &str) -> Result<String> {
        for part in rule.split("||") {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }

            if let Ok(result) = self.get_string(content, part) {
                if !result.is_empty() {
                    return Ok(result);
                }
            }
        }

        Err(anyhow!("No alternative rule matched"))
    }

    /// Handle concatenation rules separated by &&
    fn get_string_with_concatenation(&self, content: &str, rule: &str) -> Result<String> {
        let mut results = Vec::new();

        for part in rule.split("&&") {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }

            match self.get_string(content, part) {
                Ok(result) => results.push(result),
                Err(_) => results.push(String::new()),
            }
        }

        Ok(results.join(""))
    }

    /// Extract JS post-processing code from rule
    /// Returns (base_rule, Option<js_code>)
    fn extract_js_postprocess(&self, rule: &str) -> (String, Option<String>) {
        // Handle <js>code</js> at end of rule
        if let Some(js_start) = rule.find("<js>") {
            if let Some(js_end) = rule.find("</js>") {
                let base_rule = rule[..js_start].trim().to_string();
                let js_code = rule[js_start + 4..js_end].trim().to_string();
                return (base_rule, Some(js_code));
            }
        }

        (rule.to_string(), None)
    }

    /// Apply JS post-processing to a result
    fn apply_js_postprocess(&self, result: &str, js_code: &str) -> Result<String> {
        // Set current content for java.getString()
        self.js_executor.set_current_content(result);

        let mut vars = HashMap::new();
        vars.insert("result".to_string(), result.to_string());
        vars.insert("it".to_string(), result.to_string());

        self.js_executor.eval_with_context(js_code, &vars)
    }

    /// Execute a single rule (no || or &&)
    /// Execute a single rule (no || or &&)
    fn execute_single_rule(&self, content: &str, rule: &str) -> Result<String> {
        let rule = rule.trim();
        if rule.contains("||") {
            return self.get_string_with_alternatives(content, rule);
        }
        if rule.contains("&&") {
            return self.get_string_with_concatenation(content, rule);
        }

        let (base_rule_full, js_post) = self.extract_js_postprocess(rule);

        // Handle Regex Replacement Suffix (##)
        // Check if there is a '##' that is NOT at the start (meaning it's a suffix, not a pure regex rule)
        // Note: RuleType::detect handles "##..." as Regex, so we only care if it's "TYPE:RULE##REGEX"
        let (base_rule, regex_suffix) = if !base_rule_full.starts_with("##") {
            if let Some(pos) = base_rule_full.find("##") {
                let base = base_rule_full[..pos].trim();
                let suffix = base_rule_full[pos..].trim();
                (base.to_string(), Some(suffix.to_string()))
            } else {
                (base_rule_full, None)
            }
        } else {
            (base_rule_full, None)
        };

        let initial_result = if base_rule.is_empty() {
            content.to_string()
        } else {
            let rule_type = RuleType::detect(&base_rule, content);
            match rule_type {
                RuleType::JavaScript => {
                    let code = if base_rule.starts_with("@js:") {
                        base_rule.trim_start_matches("@js:")
                    } else if base_rule.starts_with("<js>") {
                        let s = base_rule.trim_start_matches("<js>");
                        s.trim_end_matches("</js>")
                    } else {
                        &base_rule
                    };

                    // Try native execution first using JsPatternAnalyzer
                    match self.js_analyzer.analyze(code) {
                        AnalysisResult::Native(exec) => {
                            // Execute natively
                            self.execute_native_js(&exec, content)?
                        }
                        AnalysisResult::NativeChain(chain) => {
                            // Execute chain natively
                            let mut result = content.to_string();
                            for exec in chain {
                                result = self.execute_native_js(&exec, &result)?;
                            }
                            result
                        }
                        AnalysisResult::RequiresJs(_) => {
                            // Fall back to JS executor
                            self.js_executor.set_current_content(content);

                            let mut vars = HashMap::new();
                            vars.insert("result".to_string(), content.to_string());
                            vars.insert("it".to_string(), content.to_string());
                            vars.insert("src".to_string(), content.to_string());
                            self.js_executor.eval_with_context(code, &vars)?
                        }
                    }
                }
                RuleType::Css => self.css_parser.get_string(content, &base_rule)?,
                RuleType::JsonPath => self.json_parser.get_string(content, &base_rule)?,
                RuleType::Regex => self.regex_parser.get_string(content, &base_rule)?,
                RuleType::JsoupDefault => self.jsoup_parser.get_string(content, &base_rule)?,
                RuleType::XPath => self.xpath_parser.get_string(content, &base_rule)?,
            }
        };

        // Apply regex suffix if present
        let result = if let Some(suffix) = regex_suffix {
            match self.regex_parser.get_string(&initial_result, &suffix) {
                Ok(r) => r,
                Err(_) => {
                    // Regex suffix not matching is common and expected, don't log
                    initial_result
                }
            }
        } else {
            initial_result
        };

        if let Some(js_code) = js_post {
            self.apply_js_postprocess(&result, &js_code)
        } else {
            Ok(result)
        }
    }

    /// Execute rule that returns a list
    fn execute_list_rule(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule_type = RuleType::detect(rule, content);

        match rule_type {
            RuleType::JavaScript => {
                // For JS, return the result as single-item list
                let code = rule.trim_start_matches("@js:");
                let mut vars = HashMap::new();
                vars.insert("result".to_string(), content.to_string());
                let result = self.js_executor.eval_with_context(code, &vars)?;
                Ok(vec![result])
            }
            RuleType::Css => self.css_parser.get_list(content, rule),
            RuleType::JsonPath => self.json_parser.get_list(content, rule),
            RuleType::Regex => self.regex_parser.get_list(content, rule),
            RuleType::JsoupDefault => self.jsoup_parser.get_list(content, rule),
            RuleType::XPath => self.xpath_parser.get_list(content, rule),
        }
    }

    /// Execute rule that returns elements
    fn execute_elements_rule(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        let rule_type = RuleType::detect(rule, content);

        match rule_type {
            RuleType::Css => self.css_parser.get_elements(content, rule),
            RuleType::JsonPath => self.json_parser.get_elements(content, rule),
            RuleType::JsoupDefault => self.jsoup_parser.get_elements(content, rule),
            RuleType::XPath => self.xpath_parser.get_elements(content, rule),
            _ => Err(anyhow!("get_elements not supported for this rule type")),
        }
    }

    /// Evaluate an URL rule, handling @js: if present
    pub fn evaluate_url(&self, raw_url: &str, vars: &HashMap<String, String>) -> Result<String> {
        // If it starts with @js:, evaluate everything else as JS
        if raw_url.starts_with("@js:") {
            let js_code = &raw_url[4..];
            return self.js_executor.eval_with_context(js_code, vars);
        }

        // Otherwise, process line by line using smarter split
        let mut current_result = String::new();
        let lines = self.split_steps(raw_url, true);

        for (i, line) in lines.iter().enumerate() {
            let line = line.trim();
            let mut line_vars = vars.clone();
            // result is passed from previous step
            if i > 0 {
                line_vars.insert("result".to_string(), current_result.clone());
                line_vars.insert("it".to_string(), current_result.clone());
                line_vars.insert("src".to_string(), current_result.clone());
            }

            // Check if this step is a JS step
            let is_js_step =
                line.starts_with("@js:") || (line.starts_with("<js>") && line.contains("</js>"));

            let next_part = if is_js_step {
                self.execute_single_rule(&current_result, line)?
            } else {
                // Use Rust-native Template Executor
                let ctx = TemplateContext {
                    variables: line_vars,
                };

                // Parse and execute template expressions
                let parts = self.preprocessor.parse_template(line);

                let processed_line = match self.template_executor.execute_parts(&parts, &ctx) {
                    Ok(res) => res,
                    Err(e) => {
                        tracing::warn!("Template execution error: {}", e);
                        return Err(e);
                    }
                };

                // If it contains <js> tags that are not the whole line, process it
                if processed_line.contains("<js>") {
                    self.process_js_tags(&processed_line, &current_result)?
                } else {
                    processed_line
                }
            };

            if i > 0 && !is_js_step {
                current_result.push('\n');
            }
            if is_js_step {
                // JS step REPLACES the result usually in URL chain
                current_result = next_part;
            } else {
                current_result.push_str(&next_part);
            }
        }

        Ok(current_result)
    }

    /// Split a rule into logical steps, respecting JS blocks and JSON templates
    fn split_steps(&self, rule: &str, is_url_rule: bool) -> Vec<String> {
        let mut steps = Vec::new();
        let mut current_block = String::new();
        let mut in_js_block = false;

        for line in rule.split('\n') {
            let trimmed = line.trim();
            if trimmed.is_empty() && !in_js_block {
                continue;
            }

            let starts_js = trimmed.starts_with("<js>") || trimmed.starts_with("@js:");

            if !in_js_block {
                if starts_js {
                    // Start of JS step.
                    if !current_block.is_empty() {
                        steps.push(current_block.trim().to_string());
                        current_block = String::new();
                    }
                    if trimmed.starts_with("<js>") && !trimmed.contains("</js>") {
                        in_js_block = true;
                    }
                } else if !is_url_rule {
                    // For standard rules, every non-JS line is a separate step
                    if !current_block.is_empty() {
                        steps.push(current_block.trim().to_string());
                        current_block = String::new();
                    }
                }
            }

            if !current_block.is_empty() {
                current_block.push('\n');
            }
            current_block.push_str(line);

            if in_js_block && trimmed.contains("</js>") {
                in_js_block = false;
                steps.push(current_block.trim().to_string());
                current_block = String::new();
            } else if !in_js_block && starts_js && !is_url_rule {
                // for standard rules, single line @js is a step
                steps.push(current_block.trim().to_string());
                current_block = String::new();
            }
        }

        if !current_block.is_empty() {
            steps.push(current_block.trim().to_string());
        }
        steps
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::kv::KvStore;
    use crate::storage::FileStorage;

    fn create_test_kv() -> Arc<KvStore> {
        let fs = FileStorage::new("/tmp/reader_tests_ra");
        Arc::new(KvStore::new(fs, "test_kv_ra.json"))
    }

    #[test]
    fn test_css_rule() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();
        let html = r#"<div class="title">Hello</div>"#;

        let result = analyzer.get_string(html, "@css:div.title").unwrap();
        assert_eq!(result, "Hello");
    }

    #[test]
    fn test_jsonpath_rule() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();
        let json = r#"{"name": "Test"}"#;

        let result = analyzer.get_string(json, "$.name").unwrap();
        assert_eq!(result, "Test");
    }

    #[test]
    fn test_alternative_rules() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();
        let html = r#"<div class="author">Author Name</div>"#;

        // First rule fails, second succeeds
        let result = analyzer
            .get_string(html, "@css:.nonexistent || @css:.author")
            .unwrap();
        assert_eq!(result, "Author Name");
    }

    #[test]
    fn test_js_postprocess() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();
        let html = r#"<div class="name">hello world</div>"#;

        let result = analyzer
            .get_string(html, "@css:.name<js>result.toUpperCase()</js>")
            .unwrap();
        assert_eq!(result, "HELLO WORLD");
    }

    #[test]
    fn test_chain_rules() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();
        let json = r#"{"id": 123}"#;

        // Chain: id -> JS transformation -> template
        let rule = "$.id\n<js>Number(result) + 100</js>\nID: {{result}}";
        let result = analyzer.get_string(json, rule).unwrap();
        assert_eq!(result, "ID: 223");
    }

    #[test]
    fn test_js_tags_anywhere() {
        let _analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();

        let rule = "prefix_<js>'a'.toUpperCase()</js>_suffix";
        let result = _analyzer.process_js_tags(rule, "").unwrap();
        assert_eq!(result, "prefix_A_suffix");
    }

    #[test]
    fn test_evaluate_url_complex() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();
        let mut _vars: std::collections::HashMap<String, String> = std::collections::HashMap::new();
        _vars.insert("bid".to_string(), "123".to_string());

        let rule = "{{bid}}\n<js>Number(result) + 1000</js>\nhttp://example.com/{{result}}";
        let result = analyzer.evaluate_url(rule, &_vars).unwrap();
        assert_eq!(result, "http://example.com/1123");
    }
    #[test]
    fn test_regex_suffix() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();
        let content = r#"{"key": "prefix_123_suffix"}"#;

        // Test extraction
        let result = analyzer.get_string(content, "$.key##_(\\d+)_").unwrap();
        assert_eq!(result, "123");

        // Test replacement (remove prefix)
        // ##regex##replacement
        let result = analyzer.get_string(content, "$.key##prefix_##").unwrap();
        assert_eq!(result, "123_suffix");
    }

    #[test]
    fn test_build_url_native() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();

        // Test simple variable substitution
        let url = analyzer
            .build_url(
                "https://example.com/search?q={{key}}&page={{page}}",
                &[("key", "test"), ("page", "2")],
            )
            .unwrap();
        assert_eq!(url, "https://example.com/search?q=test&page=2");
    }

    #[test]
    fn test_build_url_with_base64() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();

        // Test java.base64Encode - should be executed natively
        let url = analyzer
            .build_url(
                "https://example.com/s?q={{java.base64Encode(key)}}",
                &[("key", "hello")],
            )
            .unwrap();
        assert_eq!(url, "https://example.com/s?q=aGVsbG8=");
    }

    #[test]
    fn test_native_base64() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();

        let encoded = analyzer.base64_encode("hello");
        assert_eq!(encoded, "aGVsbG8=");

        let decoded = analyzer.base64_decode(&encoded);
        assert_eq!(decoded, "hello");
    }

    #[test]
    fn test_native_md5() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();

        let hash = analyzer.md5_encode("hello");
        assert_eq!(hash, "5d41402abc4b2a76b9719d911017c592");

        let hash16 = analyzer.md5_encode16("hello");
        assert_eq!(hash16.len(), 16);
    }

    #[test]
    fn test_native_encode_uri() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();

        let encoded = analyzer.encode_uri("hello world");
        assert_eq!(encoded, "hello%20world");
    }

    #[test]
    fn test_native_uuid() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();

        let uuid = analyzer.random_uuid();
        assert_eq!(uuid.len(), 36); // UUID format: 8-4-4-4-12
        assert!(uuid.contains('-'));
    }

    #[test]
    fn test_native_digest() {
        let analyzer = RuleAnalyzer::new(create_test_kv()).unwrap();

        let sha256 = analyzer.digest_hex("hello", "SHA256");
        assert!(sha256.len() == 64); // SHA256 = 64 hex chars
    }
}
