//! HTTP fetcher module

mod client;
pub mod cookie_cache;
pub mod user_agents;

pub use client::HttpFetcher;