//! SSRF protection: check if a URL points to a private/internal IP address.
//!
//! Used by the Legado engine and other content-fetching paths to prevent
//! malicious book sources from reaching internal network addresses.

use std::net::IpAddr;
use std::net::ToSocketAddrs;

/// Returns `true` if the URL's host resolves to a private/internal IP.
///
/// Performs DNS resolution when the host is a domain name (not a literal IP).
/// If DNS resolution fails, returns `false` (allow the request — the fetch
/// itself will fail with a DNS error, which is the correct behaviour).
pub fn is_private_url(url_str: &str) -> bool {
    let url = match url::Url::parse(url_str) {
        Ok(u) => u,
        Err(_) => return false,
    };

    if !["http", "https"].contains(&url.scheme()) {
        return true; // Non-http schemes are considered unsafe for content fetch
    }

    let host = match url.host_str() {
        Some(h) => h,
        None => return true,
    };

    is_private_host(host)
}

/// Check if a host is a private/internal address.
/// Check if a host is a private/internal address.
///
/// If the host is a literal IP, checks it directly.
/// If the host is a domain name, resolves it via DNS and checks all results.
/// On DNS resolution failure, returns `false` (the fetch will fail naturally).
pub fn is_private_host(host: &str) -> bool {
    // Check common private hostnames
    let private_hosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];
    if private_hosts.contains(&host.to_lowercase().as_str()) {
        return true;
    }

    // Try to parse as literal IP first — no DNS resolution needed
    if let Ok(ip) = host.parse::<IpAddr>() {
        return is_private_ip(&ip);
    }

    // Check for internal domain patterns
    if host.ends_with(".local")
        || host.ends_with(".internal")
        || host.ends_with(".localhost")
    {
        return true;
    }

    // DNS resolution: check all resolved IPs
    // Use port 443 as a dummy port for resolution
    let host_port = format!("{host}:443");
    match host_port.to_socket_addrs() {
        Ok(addrs) => {
            for addr in addrs {
                if is_private_ip(&addr.ip()) {
                    return true;
                }
            }
            false
        },
        // DNS resolution failed — not private, the fetch will fail naturally
        Err(_) => false,
    }
}

/// Check if an IP address is private/internal
pub fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            ipv4.is_private()
                || ipv4.is_loopback()
                || ipv4.is_link_local()
                || ipv4.is_broadcast()
                || ipv4.is_unspecified()
                || (ipv4.octets()[0] == 169 && ipv4.octets()[1] == 254)
                || ipv4.octets()[0] == 10
                || (ipv4.octets()[0] == 172 && (16..=31).contains(&ipv4.octets()[1]))
                || (ipv4.octets()[0] == 192 && ipv4.octets()[1] == 168)
        },
        IpAddr::V6(ipv6) => {
            // Check IPv4-mapped IPv6 addresses (e.g. ::ffff:192.168.1.1)
            if let Some(mapped_v4) = ipv6.to_ipv4_mapped() {
                return is_private_ip(&IpAddr::V4(mapped_v4));
            }
            ipv6.is_loopback()
                || ipv6.is_unspecified()
                || ipv6.is_unique_local()        // fc00::/7
                || ipv6.is_unicast_link_local()  // fe80::/10
                || (ipv6.segments()[0] == 0x2001 && ipv6.segments()[1] == 0x0db8) // 2001:db8::/32 (documentation range)
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_literal_private_ips() {
        assert!(is_private_url("http://127.0.0.1/api"));
        assert!(is_private_url("http://localhost/api"));
        assert!(is_private_url("http://192.168.1.1/api"));
        assert!(is_private_url("http://10.0.0.1/api"));
        assert!(is_private_url("http://172.16.0.1/api"));
        assert!(is_private_url("http://169.254.169.254/latest/meta-data"));
    }

    #[test]
    fn test_public_urls() {
        assert!(!is_private_url("https://example.com/book"));
        assert!(!is_private_url("http://www.69shuba.com/book/123"));
    }

    #[test]
    fn test_internal_domains() {
        assert!(is_private_url("http://my-service.local/api"));
        assert!(is_private_url("http://db.internal/query"));
    }

    #[test]
    fn test_non_http_schemes() {
        assert!(is_private_url("file:///etc/passwd"));
        assert!(is_private_url("ftp://example.com/file"));
    }

    #[test]
    fn test_ipv6_private_addresses() {
        // Loopback
        assert!(is_private_url("http://[::1]/api"));
        // Unspecified
        assert!(is_private_url("http://[::]/api"));
        // Unique local (fc00::/7)
        assert!(is_private_url("http://[fc00::1]/api"));
        assert!(is_private_url("http://[fd00::abcd]/api"));
        // Unicast link-local (fe80::/10)
        assert!(is_private_url("http://[fe80::1]/api"));
        // Documentation range (2001:db8::/32)
        assert!(is_private_url("http://[2001:db8::1]/api"));
        // IPv4-mapped IPv6 with private IPv4
        assert!(is_private_url("http://[::ffff:192.168.1.1]/api"));
        assert!(is_private_url("http://[::ffff:10.0.0.1]/api"));
        assert!(is_private_url("http://[::ffff:127.0.0.1]/api"));
    }

    #[test]
    fn test_ipv6_public_addresses() {
        // Public IPv6 — should NOT be blocked
        assert!(!is_private_url("http://[2001:4860:4860::8888]/api")); // Google DNS
        assert!(!is_private_url("http://[2606:4700:4700::1111]/api")); // Cloudflare DNS
        // IPv4-mapped IPv6 with public IPv4 — should NOT be blocked
        assert!(!is_private_url("http://[::ffff:8.8.8.8]/api"));
    }
}
