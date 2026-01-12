//! Anti-crawl module
//!
//! Simplified: Direct CF bypass via cf-bypass-service

mod chain;
mod strategies;

pub use chain::FallbackChain;
pub use strategies::CfBypassStrategy;
