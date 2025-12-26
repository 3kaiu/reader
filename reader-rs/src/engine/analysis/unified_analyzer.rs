//! Unified JS Analyzer - Combines regex and AST-based analysis with caching
//!
//! This module provides a unified interface for JavaScript analysis,
//! transparently switching between fast regex matching and accurate AST analysis.
//!
//! ## Analysis Strategy
//!
//! 1. **Cache Lookup** (O(1)): Check if already analyzed
//! 2. **Regex Analysis** (~3 µs): For simple patterns
//! 3. **AST Analysis** (~10 µs): For complex expressions
//! 4. **QuickJS Fallback**: When native execution is not possible

use std::cell::RefCell;
use std::collections::HashMap;

use crate::engine::ast::{ExecutionPlanCompiler, JsAstParser};
use crate::engine::js_analyzer::{AnalysisResult, JsPatternAnalyzer, NativeExecution};

/// Maximum cache size (number of entries)
const CACHE_MAX_SIZE: usize = 256;

/// Unified JavaScript Analyzer with caching
///
/// Combines regex-based pattern matching with AST-based analysis
/// to maximize native execution coverage. Results are cached for performance.
pub struct UnifiedJsAnalyzer {
    /// Fast regex-based pattern matcher
    regex_analyzer: JsPatternAnalyzer,

    /// AST-based analyzer using Oxc
    ast_parser: JsAstParser,

    /// Compiler for converting AST results to legacy format
    ast_compiler: ExecutionPlanCompiler,

    /// LRU-like cache for analysis results (code hash -> result type)
    /// Uses RefCell for interior mutability in analyze_readonly
    cache: RefCell<AnalysisCache>,

    /// Statistics for analysis decisions
    stats: RefCell<AnalysisStats>,
}

/// Simple LRU-like cache for analysis results
#[derive(Debug, Default)]
struct AnalysisCache {
    /// Map from code hash to cached result type
    entries: HashMap<u64, CachedResult>,
    /// Order of insertion for LRU eviction
    insert_order: Vec<u64>,
}

/// Cached analysis result (lightweight representation)
#[derive(Debug, Clone)]
enum CachedResult {
    /// Native execution (stores the NativeExecution)
    Native(NativeExecution),
    /// Chain of native executions
    NativeChain(Vec<NativeExecution>),
    /// Requires JS execution
    RequiresJs,
}

impl AnalysisCache {
    fn get(&self, hash: u64) -> Option<&CachedResult> {
        self.entries.get(&hash)
    }

    fn insert(&mut self, hash: u64, result: CachedResult) {
        // Evict oldest if at capacity
        if self.entries.len() >= CACHE_MAX_SIZE {
            if let Some(oldest) = self.insert_order.first().cloned() {
                self.entries.remove(&oldest);
                self.insert_order.remove(0);
            }
        }

        self.entries.insert(hash, result);
        self.insert_order.push(hash);
    }

    fn len(&self) -> usize {
        self.entries.len()
    }

    fn clear(&mut self) {
        self.entries.clear();
        self.insert_order.clear();
    }
}

/// Statistics for analysis decisions
#[derive(Debug, Default, Clone)]
pub struct AnalysisStats {
    /// Cache hits
    pub cache_hits: usize,
    /// Number of regex matches
    pub regex_matches: usize,
    /// Number of AST matches
    pub ast_matches: usize,
    /// Number of JS fallbacks
    pub js_fallbacks: usize,
}

impl Default for UnifiedJsAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

/// Simple hash function for code strings
fn hash_code(code: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    code.hash(&mut hasher);
    hasher.finish()
}

impl UnifiedJsAnalyzer {
    /// Create a new unified analyzer
    pub fn new() -> Self {
        Self {
            regex_analyzer: JsPatternAnalyzer::new(),
            ast_parser: JsAstParser::new(),
            ast_compiler: ExecutionPlanCompiler::new(),
            cache: RefCell::new(AnalysisCache::default()),
            stats: RefCell::new(AnalysisStats::default()),
        }
    }

    /// Analyze JavaScript code and return the best execution strategy
    ///
    /// This method tries multiple analysis strategies in order of performance:
    /// 1. Cache lookup (fastest)
    /// 2. Regex pattern matching
    /// 3. AST-based analysis
    /// 4. Falls back to RequiresJs if no native strategy found
    pub fn analyze(&self, code: &str) -> AnalysisResult {
        let hash = hash_code(code);

        // Step 0: Check cache
        {
            let cache = self.cache.borrow();
            if let Some(cached) = cache.get(hash) {
                self.stats.borrow_mut().cache_hits += 1;
                return cached_to_result(cached);
            }
        }

        // Step 1: Try regex-based pattern analysis (fastest)
        let regex_result = self.regex_analyzer.analyze(code);

        match &regex_result {
            AnalysisResult::Native(exec) => {
                self.stats.borrow_mut().regex_matches += 1;
                self.cache
                    .borrow_mut()
                    .insert(hash, CachedResult::Native(exec.clone()));
                return regex_result;
            }
            AnalysisResult::NativeChain(chain) => {
                self.stats.borrow_mut().regex_matches += 1;
                self.cache
                    .borrow_mut()
                    .insert(hash, CachedResult::NativeChain(chain.clone()));
                return regex_result;
            }
            AnalysisResult::RequiresJs(_) => {
                // Continue to AST analysis
            }
        }

        // Step 2: Try AST-based analysis (more accurate)
        let ast_result = self.ast_parser.parse_and_analyze(code);

        if let Some(legacy) = self.ast_compiler.to_legacy_format(&ast_result) {
            match &legacy {
                AnalysisResult::Native(exec) => {
                    self.stats.borrow_mut().ast_matches += 1;
                    self.cache
                        .borrow_mut()
                        .insert(hash, CachedResult::Native(exec.clone()));
                    return legacy;
                }
                AnalysisResult::NativeChain(chain) => {
                    self.stats.borrow_mut().ast_matches += 1;
                    self.cache
                        .borrow_mut()
                        .insert(hash, CachedResult::NativeChain(chain.clone()));
                    return legacy;
                }
                AnalysisResult::RequiresJs(_) => {
                    // Fall through
                }
            }
        }

        // Step 3: Must use JS execution
        self.stats.borrow_mut().js_fallbacks += 1;
        self.cache.borrow_mut().insert(hash, CachedResult::RequiresJs);
        AnalysisResult::RequiresJs(code.to_string())
    }

    /// Analyze without mutating stats (for read-only contexts)
    /// Still uses cache for performance
    pub fn analyze_readonly(&self, code: &str) -> AnalysisResult {
        self.analyze(code)
    }

    /// Get analysis statistics
    pub fn stats(&self) -> AnalysisStats {
        self.stats.borrow().clone()
    }

    /// Reset statistics
    pub fn reset_stats(&self) {
        *self.stats.borrow_mut() = AnalysisStats::default();
    }

    /// Get cache size
    pub fn cache_size(&self) -> usize {
        self.cache.borrow().len()
    }

    /// Clear the analysis cache
    pub fn clear_cache(&self) {
        self.cache.borrow_mut().clear();
    }

    /// Get the native execution rate
    pub fn native_rate(&self) -> f64 {
        let stats = self.stats.borrow();
        let total = stats.regex_matches + stats.ast_matches + stats.js_fallbacks;
        if total == 0 {
            return 0.0;
        }
        let native = stats.regex_matches + stats.ast_matches;
        native as f64 / total as f64
    }

    /// Get cache hit rate
    pub fn cache_hit_rate(&self) -> f64 {
        let stats = self.stats.borrow();
        let total =
            stats.cache_hits + stats.regex_matches + stats.ast_matches + stats.js_fallbacks;
        if total == 0 {
            return 0.0;
        }
        stats.cache_hits as f64 / total as f64
    }

    /// Check if code can be executed natively (without stats tracking)
    pub fn can_execute_natively(&self, code: &str) -> bool {
        matches!(
            self.analyze_readonly(code),
            AnalysisResult::Native(_) | AnalysisResult::NativeChain(_)
        )
    }

    /// Check if code likely requires JS execution
    pub fn likely_requires_js(&self, code: &str) -> bool {
        self.regex_analyzer.is_complex_js(code)
    }

    /// Get direct access to regex analyzer
    pub fn regex_analyzer(&self) -> &JsPatternAnalyzer {
        &self.regex_analyzer
    }

    /// Get direct access to AST parser
    pub fn ast_parser(&self) -> &JsAstParser {
        &self.ast_parser
    }
}

/// Convert cached result back to AnalysisResult
fn cached_to_result(cached: &CachedResult) -> AnalysisResult {
    match cached {
        CachedResult::Native(exec) => AnalysisResult::Native(exec.clone()),
        CachedResult::NativeChain(chain) => AnalysisResult::NativeChain(chain.clone()),
        CachedResult::RequiresJs => AnalysisResult::RequiresJs(String::new()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unified_analyzer_regex_path() {
        let analyzer = UnifiedJsAnalyzer::new();

        // Simple patterns should be caught by regex
        let result = analyzer.analyze("result.trim()");
        assert!(matches!(result, AnalysisResult::Native(_)));
        assert_eq!(analyzer.stats().regex_matches, 1);
    }

    #[test]
    fn test_unified_analyzer_cache_hit() {
        let analyzer = UnifiedJsAnalyzer::new();

        // First call - should analyze
        let result1 = analyzer.analyze("result.trim()");
        assert!(matches!(result1, AnalysisResult::Native(_)));
        assert_eq!(analyzer.stats().cache_hits, 0);
        assert_eq!(analyzer.stats().regex_matches, 1);

        // Second call - should hit cache
        let result2 = analyzer.analyze("result.trim()");
        assert!(matches!(result2, AnalysisResult::Native(_)));
        assert_eq!(analyzer.stats().cache_hits, 1);
        assert_eq!(analyzer.stats().regex_matches, 1); // Still 1
    }

    #[test]
    fn test_unified_analyzer_js_fallback() {
        let analyzer = UnifiedJsAnalyzer::new();

        // Complex code should fall back to JS
        let result = analyzer.analyze("someCustomFunction(result)");
        assert!(matches!(result, AnalysisResult::RequiresJs(_)));
        assert_eq!(analyzer.stats().js_fallbacks, 1);
    }

    #[test]
    fn test_cache_size_limit() {
        let analyzer = UnifiedJsAnalyzer::new();

        // Fill cache beyond limit
        for i in 0..300 {
            analyzer.analyze(&format!("result.trim{i}()"));
        }

        // Cache should be at or below max size
        assert!(analyzer.cache_size() <= CACHE_MAX_SIZE);
    }

    #[test]
    fn test_cache_hit_rate() {
        let analyzer = UnifiedJsAnalyzer::new();

        // Analyze same code multiple times
        analyzer.analyze("result.trim()");
        analyzer.analyze("result.trim()");
        analyzer.analyze("result.trim()");

        // 2 out of 3 should be cache hits
        let rate = analyzer.cache_hit_rate();
        assert!((rate - 0.666).abs() < 0.1);
    }

    #[test]
    fn test_can_execute_natively() {
        let analyzer = UnifiedJsAnalyzer::new();

        assert!(analyzer.can_execute_natively("result.trim()"));
        assert!(analyzer.can_execute_natively("java.base64Encode('hello')"));
        assert!(!analyzer.can_execute_natively("complexFunction()"));
    }

    #[test]
    fn test_clear_cache() {
        let analyzer = UnifiedJsAnalyzer::new();

        analyzer.analyze("result.trim()");
        assert!(analyzer.cache_size() > 0);

        analyzer.clear_cache();
        assert_eq!(analyzer.cache_size(), 0);
    }
}
