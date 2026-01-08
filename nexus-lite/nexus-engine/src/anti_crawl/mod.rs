//! Anti-crawl strategies module
//!
//! Strategy Levels:
//! - L1: Basic HTTP (reqwest)
//! - L6: HTTP-based Cloudflare Bypass (cf-bypass-service v4.0)

mod chain;
mod strategies;

pub use chain::FallbackChain;
pub use strategies::{AntiCrawlLevel, L1BasicStrategy, L6HttpStrategy};
