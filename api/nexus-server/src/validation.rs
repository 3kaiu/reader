//! URL and input validation utilities

use nexus_core::url_safety;
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
        if !allow_private && url_safety::is_private_host(host) {
            return Err(ValidationError::PrivateIp);
        }
    } else {
        return Err(ValidationError::MissingHost);
    }

    Ok(url)
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

    #[test]
    fn test_ipv6_private_blocked() {
        // Loopback
        assert!(validate_url("http://[::1]/api").is_err());
        // Unspecified
        assert!(validate_url("http://[::]/api").is_err());
        // Unique local (fc00::/7)
        assert!(validate_url("http://[fc00::1]/api").is_err());
        assert!(validate_url("http://[fd00::abcd]/api").is_err());
        // Unicast link-local (fe80::/10)
        assert!(validate_url("http://[fe80::1]/api").is_err());
        // Documentation range (2001:db8::/32)
        assert!(validate_url("http://[2001:db8::1]/api").is_err());
        // IPv4-mapped IPv6 with private IPv4
        assert!(validate_url("http://[::ffff:192.168.1.1]/api").is_err());
        assert!(validate_url("http://[::ffff:10.0.0.1]/api").is_err());
        assert!(validate_url("http://[::ffff:127.0.0.1]/api").is_err());
    }

    #[test]
    fn test_ipv6_public_allowed() {
        assert!(validate_url("http://[2001:4860:4860::8888]/api").is_ok()); // Google DNS
        assert!(validate_url("http://[2606:4700:4700::1111]/api").is_ok()); // Cloudflare DNS
        // IPv4-mapped IPv6 with public IPv4
        assert!(validate_url("http://[::ffff:8.8.8.8]/api").is_ok());
    }
}
