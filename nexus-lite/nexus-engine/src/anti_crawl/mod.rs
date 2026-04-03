//! Anti-crawl module
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
pub use strategies::{CfBypassStrategy, DirectHttpStrategy};
