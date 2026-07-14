//! URL and input validation utilities

use std::net::IpAddr;
use url::Url;

/// Validation errors
#[derive(Debug, thiserror::Error)]
pub enum ValidationError {
    #[error("Invalid URL format: {0}")]
    InvalidUrl(#[from] url::ParseError),

    #[error("Private/internal IP addresses are not allowed")]
    PrivateIp,

    #[error("Only http and https schemes are allowed")]
    InvalidScheme,

    #[error("URL host is required")]
    MissingHost,
}

/// Validate a URL for security
/// - Must be http or https
/// - Must not be a private/internal IP (unless allow_private is true)
#[allow(dead_code)]
pub fn validate_url(url_str: &str) -> Result<Url, ValidationError> {
    validate_url_with_options(url_str, false)
}

/// Validate a URL with configurable private IP check
/// - Must be http or https
/// - If allow_private is false, private/internal IPs are rejected
pub fn validate_url_with_options(
    url_str: &str,
    allow_private: bool,
) -> Result<Url, ValidationError> {
    let url = Url::parse(url_str)?;

    // Only allow http/https
    if !["http", "https"].contains(&url.scheme()) {
        return Err(ValidationError::InvalidScheme);
    }

    // Check for private IPs (unless allowed)
    if let Some(host) = url.host_str() {
        if !allow_private && is_private_host(host) {
            return Err(ValidationError::PrivateIp);
        }
    } else {
        return Err(ValidationError::MissingHost);
    }

    Ok(url)
}

/// Check if a host is a private/internal address
fn is_private_host(host: &str) -> bool {
    // Check common private hostnames
    let private_hosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
    if private_hosts.contains(&host.to_lowercase().as_str()) {
        return true;
    }

    // Try to parse as IP and check if private
    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_private_ip(&ip);
    }

    // Check for internal domain patterns
    if host.ends_with(".local") || host.ends_with(".internal") || host.ends_with(".localhost") {
        return true;
    }

    false
}

/// Check if an IP address is private/internal
fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            ipv4.is_private()
                || ipv4.is_loopback()
                || ipv4.is_link_local()
                || ipv4.is_broadcast()
                || ipv4.is_unspecified()
                // 169.254.x.x (link-local)
                || (ipv4.octets()[0] == 169 && ipv4.octets()[1] == 254)
                // 10.x.x.x
                || ipv4.octets()[0] == 10
                // 172.16.x.x - 172.31.x.x
                || (ipv4.octets()[0] == 172 && (16..=31).contains(&ipv4.octets()[1]))
                // 192.168.x.x
                || (ipv4.octets()[0] == 192 && ipv4.octets()[1] == 168)
        },
        IpAddr::V6(ipv6) => ipv6.is_loopback() || ipv6.is_unspecified(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_url() {
        assert!(validate_url("https://example.com/book").is_ok());
        assert!(validate_url("http://hetushu.com/book/1").is_ok());
    }

    #[test]
    fn test_private_ip_blocked() {
        assert!(validate_url("http://127.0.0.1/api").is_err());
        assert!(validate_url("http://localhost/api").is_err());
        assert!(validate_url("http://192.168.1.1/api").is_err());
        assert!(validate_url("http://10.0.0.1/api").is_err());
    }

    #[test]
    fn test_private_ip_allowed_with_options() {
        assert!(validate_url_with_options("http://127.0.0.1/api", true).is_ok());
        assert!(validate_url_with_options("http://localhost/api", true).is_ok());
        assert!(validate_url_with_options("http://192.168.1.1/api", true).is_ok());
        assert!(validate_url_with_options("http://10.0.0.1/api", true).is_ok());
        assert!(validate_url_with_options("http://127.0.0.1/api", false).is_err());
    }

    #[test]
    fn test_invalid_scheme() {
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("ftp://example.com").is_err());
    }
}
