//! Anti-crawl module
//!
//! Provides Cloudflare bypass strategies:
//! - CloudScraper: Unified solution for all CF challenges (v1/v2/v3/Turnstile)
//! - CfCookieManager: Headless browser for CF cookie extraction and reuse

mod chain;
mod strategies;
mod cloudscraper;
mod cf_cookie;

pub use chain::FallbackChain;
pub use strategies::{CfBypassStrategy, DirectHttpStrategy};
pub use cloudscraper::CloudScraperStrategy;
pub use cf_cookie::{CfCookie, CfCookieManager, CfCookieError};
