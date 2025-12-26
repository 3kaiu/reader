//! Encoding Operations - Base64, Hex, URI encoding/decoding
//!
//! Native Rust implementations of encoding APIs.

use anyhow::Result;
use base64::Engine;

/// Base64 encode a string
pub fn base64_encode(input: &str) -> Result<String> {
    Ok(base64::engine::general_purpose::STANDARD.encode(input.as_bytes()))
}

/// Base64 decode a string
pub fn base64_decode(input: &str) -> Result<String> {
    base64::engine::general_purpose::STANDARD
        .decode(input.as_bytes())
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .map(Ok)
        .unwrap_or(Ok(String::new()))
}

/// Base64 decode with flags (8 = URL_SAFE)
pub fn base64_decode_with_flags(input: &str, flags: i32) -> Result<String> {
    let engine = if flags & 8 != 0 {
        &base64::engine::general_purpose::URL_SAFE
    } else {
        &base64::engine::general_purpose::STANDARD
    };
    engine
        .decode(input.as_bytes())
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .map(Ok)
        .unwrap_or(Ok(String::new()))
}

/// URI encode a string
pub fn encode_uri(input: &str) -> Result<String> {
    Ok(urlencoding::encode(input).to_string())
}

/// URI encode with charset (charset parameter is ignored, always UTF-8)
pub fn encode_uri_with_enc(input: &str, _enc: &str) -> Result<String> {
    Ok(urlencoding::encode(input).to_string())
}

/// URI decode a string
pub fn decode_uri(input: &str) -> Result<String> {
    urlencoding::decode(input)
        .map(|s| s.into_owned())
        .map_err(|e| anyhow::anyhow!("URI decode error: {}", e))
}

/// Hex encode a string
pub fn hex_encode(input: &str) -> Result<String> {
    Ok(hex::encode(input.as_bytes()))
}

/// Hex decode a string
pub fn hex_decode(input: &str) -> Result<String> {
    hex::decode(input)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .map(Ok)
        .unwrap_or(Ok(String::new()))
}

/// HTML format (unescape HTML entities)
pub fn html_format(input: &str) -> Result<String> {
    Ok(html_escape::decode_html_entities(input).to_string())
}

/// UTF-8 to GBK conversion (placeholder - returns input as-is)
pub fn utf8_to_gbk(input: &str) -> Result<String> {
    // GBK encoding requires external crate, returning as-is for now
    Ok(input.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_encode() {
        assert_eq!(base64_encode("hello").unwrap(), "aGVsbG8=");
    }

    #[test]
    fn test_base64_decode() {
        assert_eq!(base64_decode("aGVsbG8=").unwrap(), "hello");
    }

    #[test]
    fn test_encode_uri() {
        assert_eq!(encode_uri("hello world").unwrap(), "hello%20world");
    }

    #[test]
    fn test_hex_encode() {
        assert_eq!(hex_encode("AB").unwrap(), "4142");
    }
}
