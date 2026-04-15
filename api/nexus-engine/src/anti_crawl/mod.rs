//! Anti-crawl module
//!
//! **Fetch strategy (single decision tree for HTTP/HTML):**
//! 1. `CfBypassStrategy` — primary path when `cf_bypass.enabled`; calls the Python
//!    the `bypass` service over HTTP for pages that need managed browser / mesh extraction.
//! 2. `CloudScraperStrategy` — in-process Rust (`cloudscraper-rs`) when the chain selects it.
//! 3. `DirectHttpStrategy` — plain `reqwest` when no anti-bot path is required or as fallback
//!    if the bypass service is unavailable (see `strategies.rs` and `chain.rs`).
//! 4. `CfCookieManager` — headless Chrome for `cf_clearance` cookie extraction when needed.
//!
//! New call sites should go through the engine’s fetch/anti-crawl chain — avoid ad-hoc
//! `reqwest::get` in feature code so behavior stays consistent and observable.
//!
//! Provides Cloudflare bypass strategies:
//! - CloudScraper: Unified solution for all CF challenges (v1/v2/v3/Turnstile)
//! - CfCookieManager: Headless browser for CF cookie extraction and reuse

mod cf_cookie;
mod chain;
mod cloudscraper;
mod strategies;

pub use cf_cookie::{CfCookie, CfCookieError, CfCookieManager};
pub use chain::FallbackChain;
pub use cloudscraper::CloudScraperStrategy;
pub use strategies::{CfBypassStrategy, DirectHttpStrategy, JinaReaderStrategy};
