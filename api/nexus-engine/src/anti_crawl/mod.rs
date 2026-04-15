//! Anti-crawl module
//!
//! **Fetch strategy (single decision tree for HTTP/HTML):**
//! 1. `CfBypassStrategy` — primary path when `cf_bypass.enabled`; calls the `bypass`
//!    service over HTTP for pages that need managed browser extraction.
//! 2. `DirectHttpStrategy` — plain `reqwest` when no anti-bot path is required or as fallback
//!    if the bypass service is unavailable (see `strategies.rs` and `chain.rs`).
//!
//! New call sites should go through the engine’s fetch/anti-crawl chain — avoid ad-hoc
//! `reqwest::get` in feature code so behavior stays consistent and observable.
//!
//! Provides Cloudflare bypass strategies:
//! - CfBypassStrategy: use external bypass service
//! - DirectHttpStrategy: direct HTTP fetch

mod chain;
mod strategies;

pub use chain::FallbackChain;
pub use strategies::{CfBypassStrategy, DirectHttpStrategy};
