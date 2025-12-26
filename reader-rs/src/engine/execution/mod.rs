//! Execution Module - Unified execution framework
//!
//! This module provides:
//! - `Executor` trait for execution abstraction
//! - `ExecutorFactory` for creating and managing executors
//! - `ExecutionContext` for execution state
//! - `ExecutionPlan` for unified execution plans

mod executor_factory;
mod executor_trait;

pub use executor_factory::{ExecutorFactory, SharedExecutorFactory};
pub use executor_trait::{ExecutionContext, ExecutionResult, Executor};
