#![allow(dead_code)]
//! Prometheus metrics module

use metrics::{counter, gauge, histogram};
use metrics_exporter_prometheus::PrometheusBuilder;
use std::net::SocketAddr;
use tracing::info;

/// Metric names
pub mod names {
    pub const REQUESTS_TOTAL: &str = "nexus_requests_total";
    pub const REQUEST_DURATION: &str = "nexus_request_duration_seconds";
    pub const ACTIVE_CONNECTIONS: &str = "nexus_active_connections";
    pub const CACHE_HITS: &str = "nexus_cache_hits_total";
    pub const CACHE_MISSES: &str = "nexus_cache_misses_total";
    pub const SOURCE_ERRORS: &str = "nexus_source_errors_total";
}

/// Initialize Prometheus metrics exporter
pub fn init_metrics(port: u16) -> anyhow::Result<()> {
    let addr: SocketAddr = ([0, 0, 0, 0], port).into();

    PrometheusBuilder::new()
        .with_http_listener(addr)
        .install()?;

    info!(
        "Prometheus metrics server on http://0.0.0.0:{}/metrics",
        port
    );
    Ok(())
}

/// Record a request completion
pub fn record_request(endpoint: &str, status: u16, duration_secs: f64) {
    let status_class = match status {
        200..=299 => "2xx",
        400..=499 => "4xx",
        500..=599 => "5xx",
        _ => "other",
    };

    counter!(names::REQUESTS_TOTAL, "endpoint" => endpoint.to_string(), "status" => status_class.to_string()).increment(1);
    histogram!(names::REQUEST_DURATION, "endpoint" => endpoint.to_string()).record(duration_secs);
}

/// Increment active connections
pub fn inc_connections() {
    gauge!(names::ACTIVE_CONNECTIONS).increment(1.0);
}

/// Decrement active connections
pub fn dec_connections() {
    gauge!(names::ACTIVE_CONNECTIONS).decrement(1.0);
}

/// Record cache hit
pub fn cache_hit() {
    counter!(names::CACHE_HITS).increment(1);
}

/// Record cache miss
pub fn cache_miss() {
    counter!(names::CACHE_MISSES).increment(1);
}

/// Record source error
pub fn source_error(source_id: &str) {
    counter!(names::SOURCE_ERRORS, "source" => source_id.to_string()).increment(1);
}
