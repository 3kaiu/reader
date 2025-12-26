//! Execution Plan Compiler
//!
//! Compiles AST analysis results into executable plans and provides
//! conversion to legacy format for compatibility with existing NativeExecutor.

use super::types::*;
use crate::engine::js_analyzer::{
    AnalysisResult as LegacyAnalysisResult, ExprValue, NativeExecution,
};
use crate::engine::preprocessor::NativeApi;

/// Compiles analysis results into executable plans
pub struct ExecutionPlanCompiler {
    /// Enable constant folding optimization
    enable_constant_folding: bool,
    /// Enable chain merging optimization
    enable_chain_merging: bool,
}

impl Default for ExecutionPlanCompiler {
    fn default() -> Self {
        Self::new()
    }
}

impl ExecutionPlanCompiler {
    /// Create a new compiler with default optimizations
    pub fn new() -> Self {
        Self {
            enable_constant_folding: true,
            enable_chain_merging: true,
        }
    }

    /// Create a compiler without optimizations
    pub fn without_optimization() -> Self {
        Self {
            enable_constant_folding: false,
            enable_chain_merging: false,
        }
    }

    /// Compile an AST analysis result
    pub fn compile(&self, result: AstAnalysisResult) -> CompiledResult {
        match result {
            AstAnalysisResult::Native(plan) => {
                let optimized = if self.enable_constant_folding {
                    self.optimize(plan)
                } else {
                    plan
                };
                CompiledResult::Native(optimized)
            }

            AstAnalysisResult::NativeChain(plans) => {
                let optimized: Vec<_> = plans
                    .into_iter()
                    .map(|p| {
                        if self.enable_constant_folding {
                            self.optimize(p)
                        } else {
                            p
                        }
                    })
                    .collect();

                if self.enable_chain_merging && optimized.len() > 1 {
                    // Try to merge chain into single plan
                    if let Some(merged) = self.try_merge_chain(&optimized) {
                        return CompiledResult::Native(merged);
                    }
                }

                CompiledResult::NativeChain(optimized)
            }

            AstAnalysisResult::Partial {
                native_parts,
                js_parts,
            } => CompiledResult::Partial {
                native_parts,
                js_parts,
            },

            AstAnalysisResult::RequiresJs { code, reason } => {
                CompiledResult::RequiresJs { code, reason }
            }
        }
    }

    /// Optimize a single execution plan
    fn optimize(&self, plan: NativeExecutionPlan) -> NativeExecutionPlan {
        // For now, just return as-is
        // Future: constant folding, dead code elimination, etc.
        plan
    }

    /// Try to merge a chain of plans into a single plan
    fn try_merge_chain(&self, plans: &[NativeExecutionPlan]) -> Option<NativeExecutionPlan> {
        if plans.is_empty() {
            return None;
        }

        // For now, just flatten operations
        let mut all_ops = Vec::new();
        for plan in plans {
            all_ops.extend(plan.operations.clone());
        }

        Some(NativeExecutionPlan {
            operations: all_ops,
            input_binding: plans.first()?.input_binding.clone(),
            output_type: plans.last()?.output_type.clone(),
        })
    }

    /// Convert to legacy AnalysisResult format for compatibility
    pub fn to_legacy_format(&self, result: &AstAnalysisResult) -> Option<LegacyAnalysisResult> {
        match result {
            AstAnalysisResult::Native(plan) => {
                self.plan_to_legacy(plan).map(LegacyAnalysisResult::Native)
            }

            AstAnalysisResult::NativeChain(plans) => {
                let legacy_plans: Vec<NativeExecution> = plans
                    .iter()
                    .filter_map(|p| self.plan_to_legacy(p))
                    .collect();

                if legacy_plans.len() == plans.len() {
                    Some(LegacyAnalysisResult::NativeChain(legacy_plans))
                } else {
                    None
                }
            }

            AstAnalysisResult::RequiresJs { code, .. } => {
                Some(LegacyAnalysisResult::RequiresJs(code.clone()))
            }

            AstAnalysisResult::Partial { .. } => None,
        }
    }

    /// Convert a single plan to legacy NativeExecution
    fn plan_to_legacy(&self, plan: &NativeExecutionPlan) -> Option<NativeExecution> {
        // Only handle single API call plans for now
        if plan.operations.len() != 1 {
            return None;
        }

        match &plan.operations[0] {
            Operation::ApiCall { api, args } => {
                let legacy_args: Vec<ExprValue> = args
                    .iter()
                    .filter_map(|op| self.operand_to_expr_value(op))
                    .collect();

                if legacy_args.len() != args.len() {
                    return None;
                }

                Some(NativeExecution {
                    api: api.clone(),
                    args: legacy_args,
                })
            }

            Operation::MethodCall {
                object,
                method,
                args,
            } => {
                // Map method calls to appropriate NativeApi
                let api = self.method_to_native_api(method, args)?;
                let mut legacy_args = vec![self.operand_to_expr_value(object)?];
                legacy_args.extend(args.iter().filter_map(|op| self.operand_to_expr_value(op)));

                Some(NativeExecution {
                    api,
                    args: legacy_args,
                })
            }

            Operation::Literal(op) => {
                // Literal values don't map to NativeExecution
                None
            }

            _ => None,
        }
    }

    /// Map method name to NativeApi
    fn method_to_native_api(&self, method: &str, _args: &[Operand]) -> Option<NativeApi> {
        match method {
            "trim" => Some(NativeApi::StringTrim),
            "replace" | "replaceAll" => {
                // Need to extract pattern and replacement from args
                // For now, return a placeholder
                Some(NativeApi::StringReplace {
                    pattern: String::new(),
                    replacement: String::new(),
                    is_regex: false,
                    global: true,
                })
            }
            "split" => Some(NativeApi::StringSplit {
                delimiter: String::new(),
            }),
            "substring" | "substr" | "slice" => Some(NativeApi::StringSubstring {
                start: 0,
                end: None,
            }),
            _ => None,
        }
    }

    /// Convert Operand to legacy ExprValue
    fn operand_to_expr_value(&self, op: &Operand) -> Option<ExprValue> {
        match op {
            Operand::StringLiteral(s) => Some(ExprValue::Literal(s.clone())),
            Operand::NumberLiteral(n) => Some(ExprValue::Literal(n.to_string())),
            Operand::BooleanLiteral(b) => Some(ExprValue::Literal(b.to_string())),
            Operand::Variable(name) => Some(ExprValue::Variable(name.clone())),
            Operand::ContextValue(ctx) => match ctx {
                ContextKey::Result | ContextKey::Content | ContextKey::Src => {
                    Some(ExprValue::CurrentContent)
                }
                ContextKey::Key => Some(ExprValue::Variable("key".to_string())),
                ContextKey::Page => Some(ExprValue::Variable("page".to_string())),
                ContextKey::BaseUrl => Some(ExprValue::Variable("baseUrl".to_string())),
                _ => Some(ExprValue::Variable(format!("{:?}", ctx).to_lowercase())),
            },
            Operand::Nested(plan) => {
                // Convert nested plan to NativeCall
                if let Some(exec) = self.plan_to_legacy(plan) {
                    Some(ExprValue::NativeCall(Box::new(exec)))
                } else {
                    None
                }
            }
            Operand::Null | Operand::Undefined => Some(ExprValue::Literal(String::new())),
            _ => None,
        }
    }
}

/// Compiled result
#[derive(Debug)]
pub enum CompiledResult {
    /// Single native execution plan
    Native(NativeExecutionPlan),
    /// Chain of native plans
    NativeChain(Vec<NativeExecutionPlan>),
    /// Partial native with JS parts
    Partial {
        native_parts: Vec<NativeExecutionPlan>,
        js_parts: Vec<JsFragment>,
    },
    /// Requires full JS execution
    RequiresJs {
        code: String,
        reason: JsRequiredReason,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compile_native() {
        let compiler = ExecutionPlanCompiler::new();
        let plan = NativeExecutionPlan::api_call(
            NativeApi::Base64Encode,
            vec![Operand::Variable("key".to_string())],
        );

        let result = compiler.compile(AstAnalysisResult::Native(plan));
        assert!(matches!(result, CompiledResult::Native(_)));
    }

    #[test]
    fn test_to_legacy_format() {
        let compiler = ExecutionPlanCompiler::new();
        let plan = NativeExecutionPlan::api_call(
            NativeApi::Base64Encode,
            vec![Operand::Variable("key".to_string())],
        );

        let ast_result = AstAnalysisResult::Native(plan);
        let legacy = compiler.to_legacy_format(&ast_result);
        assert!(legacy.is_some());
    }
}
