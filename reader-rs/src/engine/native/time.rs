//! Time Operations - Time formatting
//!
//! Native Rust implementations of time APIs.

use anyhow::Result;
use chrono::{Local, TimeZone, Utc};

/// Format current time or timestamp
pub fn time_format(timestamp_ms: Option<i64>, format: Option<&str>) -> Result<String> {
    let format_str = format.unwrap_or("%Y-%m-%d %H:%M:%S");

    let datetime = if let Some(ts) = timestamp_ms {
        Local.timestamp_millis_opt(ts).single()
    } else {
        Some(Local::now())
    };

    match datetime {
        Some(dt) => Ok(dt.format(format_str).to_string()),
        None => Ok(String::new()),
    }
}

/// Format time with UTC offset
pub fn time_format_utc(timestamp_ms: i64, format: &str, offset_hours: i32) -> Result<String> {
    use chrono::FixedOffset;

    let offset =
        FixedOffset::east_opt(offset_hours * 3600).unwrap_or(FixedOffset::east_opt(0).unwrap());

    if let Some(dt) = Utc.timestamp_millis_opt(timestamp_ms).single() {
        let local_dt = dt.with_timezone(&offset);
        Ok(local_dt.format(format).to_string())
    } else {
        Ok(String::new())
    }
}

/// Get current timestamp in milliseconds
pub fn get_time_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_time_format_now() {
        let result = time_format(None, None).unwrap();
        assert!(!result.is_empty());
    }

    #[test]
    fn test_get_time_millis() {
        let ts = get_time_millis();
        assert!(ts > 0);
    }
}
