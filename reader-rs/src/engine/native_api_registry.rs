//! Native API Registry - Centralized API documentation and metadata
//!
//! This module provides a registry of all native APIs with documentation,
//! argument specifications, and metadata for tooling and introspection.

use crate::engine::preprocessor::NativeApi;

/// API Category for organization
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiCategory {
    Encoding,
    Cookie,
    Crypto,
    Time,
    Hash,
    Random,
    Http,
    File,
    Zip,
    String,
    Json,
    Storage,
    Misc,
}

impl ApiCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            ApiCategory::Encoding => "Encoding",
            ApiCategory::Cookie => "Cookie",
            ApiCategory::Crypto => "Crypto",
            ApiCategory::Time => "Time",
            ApiCategory::Hash => "Hash",
            ApiCategory::Random => "Random",
            ApiCategory::Http => "HTTP",
            ApiCategory::File => "File",
            ApiCategory::Zip => "ZIP",
            ApiCategory::String => "String",
            ApiCategory::Json => "JSON",
            ApiCategory::Storage => "Storage",
            ApiCategory::Misc => "Misc",
        }
    }
}

/// Simplified API metadata for documentation
#[derive(Debug, Clone)]
pub struct ApiInfo {
    /// Java method name
    pub java_name: &'static str,
    /// Category
    pub category: ApiCategory,
    /// Brief description
    pub description: &'static str,
    /// Example usage
    pub example: &'static str,
}

/// Get basic info for a NativeApi variant
pub fn get_api_info(api: &NativeApi) -> Option<ApiInfo> {
    match api {
        // Encoding
        NativeApi::Base64Encode => Some(ApiInfo {
            java_name: "base64Encode",
            category: ApiCategory::Encoding,
            description: "Encode string to Base64",
            example: "java.base64Encode('hello')",
        }),

        NativeApi::Base64Decode => Some(ApiInfo {
            java_name: "base64Decode",
            category: ApiCategory::Encoding,
            description: "Decode Base64 string",
            example: "java.base64Decode('aGVsbG8=')",
        }),

        NativeApi::Md5Encode => Some(ApiInfo {
            java_name: "md5Encode",
            category: ApiCategory::Hash,
            description: "Calculate MD5 hash (32 chars)",
            example: "java.md5Encode('test')",
        }),

        NativeApi::Md5Encode16 => Some(ApiInfo {
            java_name: "md5Encode16",
            category: ApiCategory::Hash,
            description: "Calculate MD5 hash (16 chars)",
            example: "java.md5Encode16('test')",
        }),

        NativeApi::EncodeUri => Some(ApiInfo {
            java_name: "encodeURI",
            category: ApiCategory::Encoding,
            description: "URL encode string",
            example: "java.encodeURI('hello world')",
        }),

        NativeApi::HexEncode => Some(ApiInfo {
            java_name: "hexEncodeToString",
            category: ApiCategory::Encoding,
            description: "Encode string to hex",
            example: "java.hexEncodeToString('test')",
        }),

        NativeApi::HexDecode => Some(ApiInfo {
            java_name: "hexDecodeToString",
            category: ApiCategory::Encoding,
            description: "Decode hex string",
            example: "java.hexDecodeToString('74657374')",
        }),

        // Random
        NativeApi::RandomUuid => Some(ApiInfo {
            java_name: "randomUUID",
            category: ApiCategory::Random,
            description: "Generate random UUID",
            example: "java.randomUUID()",
        }),

        // Time
        NativeApi::TimeFormat(_) => Some(ApiInfo {
            java_name: "timeFormat",
            category: ApiCategory::Time,
            description: "Format current time",
            example: "java.timeFormat('yyyy-MM-dd')",
        }),

        NativeApi::GetTimeMillis => Some(ApiInfo {
            java_name: "getTimeMillis",
            category: ApiCategory::Time,
            description: "Get current time in milliseconds",
            example: "java.getTimeMillis()",
        }),

        // HTTP
        NativeApi::HttpGet => Some(ApiInfo {
            java_name: "get",
            category: ApiCategory::Http,
            description: "HTTP GET request",
            example: "java.get('https://example.com')",
        }),

        NativeApi::HttpPost => Some(ApiInfo {
            java_name: "post",
            category: ApiCategory::Http,
            description: "HTTP POST request",
            example: "java.post('https://example.com', 'data')",
        }),

        // String operations
        NativeApi::StringTrim => Some(ApiInfo {
            java_name: "trim",
            category: ApiCategory::String,
            description: "Trim whitespace from both ends",
            example: "result.trim()",
        }),

        NativeApi::StringToLowerCase => Some(ApiInfo {
            java_name: "toLowerCase",
            category: ApiCategory::String,
            description: "Convert to lowercase",
            example: "result.toLowerCase()",
        }),

        NativeApi::StringToUpperCase => Some(ApiInfo {
            java_name: "toUpperCase",
            category: ApiCategory::String,
            description: "Convert to uppercase",
            example: "result.toUpperCase()",
        }),

        // JSON
        NativeApi::JsonParse => Some(ApiInfo {
            java_name: "parse",
            category: ApiCategory::Json,
            description: "Parse JSON string",
            example: "JSON.parse('{\"key\":\"value\"}')",
        }),

        NativeApi::JsonStringify => Some(ApiInfo {
            java_name: "stringify",
            category: ApiCategory::Json,
            description: "Stringify value to JSON",
            example: "JSON.stringify({key: 'value'})",
        }),

        // Storage
        NativeApi::CacheGet => Some(ApiInfo {
            java_name: "get",
            category: ApiCategory::Storage,
            description: "Get value from cache",
            example: "java.get('myKey')",
        }),

        NativeApi::CacheSet => Some(ApiInfo {
            java_name: "put",
            category: ApiCategory::Storage,
            description: "Set value in cache",
            example: "java.put('myKey', 'myValue')",
        }),

        // Cookie
        NativeApi::GetCookie => Some(ApiInfo {
            java_name: "getCookie",
            category: ApiCategory::Cookie,
            description: "Get cookie value",
            example: "java.getCookie('https://example.com', 'key')",
        }),

        NativeApi::SetCookie => Some(ApiInfo {
            java_name: "setCookie",
            category: ApiCategory::Cookie,
            description: "Set cookie value",
            example: "java.setCookie('https://example.com', 'key=value')",
        }),

        // Crypto
        NativeApi::AesEncode => Some(ApiInfo {
            java_name: "aesEncode",
            category: ApiCategory::Crypto,
            description: "AES encryption",
            example: "java.aesEncode(data, key, transformation, iv)",
        }),

        NativeApi::AesDecode => Some(ApiInfo {
            java_name: "aesDecode",
            category: ApiCategory::Crypto,
            description: "AES decryption",
            example: "java.aesDecode(data, key, transformation, iv)",
        }),

        NativeApi::DesEncode => Some(ApiInfo {
            java_name: "desEncode",
            category: ApiCategory::Crypto,
            description: "DES encryption",
            example: "java.desEncode(data, key, transformation, iv)",
        }),

        NativeApi::DesDecode => Some(ApiInfo {
            java_name: "desDecode",
            category: ApiCategory::Crypto,
            description: "DES decryption",
            example: "java.desDecode(data, key, transformation, iv)",
        }),

        // Default for unregistered APIs
        _ => None,
    }
}

/// Get category for a NativeApi
pub fn get_api_category(api: &NativeApi) -> ApiCategory {
    match api {
        // Encoding
        NativeApi::Base64Encode
        | NativeApi::Base64Decode
        | NativeApi::Base64DecodeWithFlags(_)
        | NativeApi::EncodeUri
        | NativeApi::EncodeUriWithEnc(_)
        | NativeApi::Utf8ToGbk
        | NativeApi::HtmlFormat
        | NativeApi::HexEncode
        | NativeApi::HexDecode => ApiCategory::Encoding,

        // Hash
        NativeApi::Md5Encode | NativeApi::Md5Encode16 | NativeApi::DigestHex(_) => {
            ApiCategory::Hash
        }

        // Cookie
        NativeApi::GetCookie | NativeApi::SetCookie => ApiCategory::Cookie,

        // Crypto
        NativeApi::AesEncode
        | NativeApi::AesDecode
        | NativeApi::AesEncodeArgsBase64
        | NativeApi::AesDecodeArgsBase64
        | NativeApi::DesEncode
        | NativeApi::DesDecode
        | NativeApi::TripleDesDecodeStr
        | NativeApi::TripleDesDecodeArgsBase64
        | NativeApi::TripleDesEncodeBase64
        | NativeApi::TripleDesEncodeArgsBase64 => ApiCategory::Crypto,

        // Time
        NativeApi::TimeFormat(_) | NativeApi::TimeFormatUtc | NativeApi::GetTimeMillis => {
            ApiCategory::Time
        }

        // Random
        NativeApi::RandomUuid => ApiCategory::Random,

        // HTTP
        NativeApi::HttpGet
        | NativeApi::HttpPost
        | NativeApi::HttpRequest
        | NativeApi::HttpGetAll => ApiCategory::Http,

        // File
        NativeApi::CacheFile
        | NativeApi::ReadFile
        | NativeApi::ReadTxtFile
        | NativeApi::ReadTxtFileWithCharset
        | NativeApi::DeleteFile
        | NativeApi::GetFile
        | NativeApi::ImportScript => ApiCategory::File,

        // Zip
        NativeApi::ZipReadString
        | NativeApi::ZipReadStringWithCharset
        | NativeApi::ZipReadBytes
        | NativeApi::ZipExtract => ApiCategory::Zip,

        // String
        NativeApi::StringReplace { .. }
        | NativeApi::StringSplit { .. }
        | NativeApi::StringTrim
        | NativeApi::StringSubstring { .. }
        | NativeApi::HtmlToText
        | NativeApi::StringToLowerCase
        | NativeApi::StringToUpperCase
        | NativeApi::StringPadStart { .. }
        | NativeApi::StringPadEnd { .. }
        | NativeApi::StringRepeat { .. }
        | NativeApi::StringCharAt { .. }
        | NativeApi::StringCharCodeAt { .. }
        | NativeApi::StringIncludes { .. }
        | NativeApi::StringStartsWith { .. }
        | NativeApi::StringEndsWith { .. }
        | NativeApi::StringIndexOf { .. }
        | NativeApi::StringLastIndexOf { .. } => ApiCategory::String,

        // JSON
        NativeApi::JsonPath | NativeApi::JsonParse | NativeApi::JsonStringify => ApiCategory::Json,

        // Storage
        NativeApi::CacheGet
        | NativeApi::CacheSet
        | NativeApi::SourceVarGet
        | NativeApi::SourceVarSet => ApiCategory::Storage,

        // Misc
        NativeApi::Log | NativeApi::Unknown(_) => ApiCategory::Misc,
    }
}

/// Get total count of registered native APIs
pub fn get_api_count() -> usize {
    // Approximate count based on preprocessor.rs NativeApi enum
    60
}

/// API statistics for coverage analysis
#[derive(Debug, Default, Clone)]
pub struct ApiCoverageStats {
    pub encoding: usize,
    pub cookie: usize,
    pub crypto: usize,
    pub time: usize,
    pub hash: usize,
    pub random: usize,
    pub http: usize,
    pub file: usize,
    pub zip: usize,
    pub string: usize,
    pub json: usize,
    pub storage: usize,
    pub misc: usize,
}

impl ApiCoverageStats {
    /// Create stats based on NativeApi enum variants
    pub fn from_enum() -> Self {
        Self {
            encoding: 10,
            cookie: 2,
            crypto: 10,
            time: 3,
            hash: 3,
            random: 1,
            http: 4,
            file: 7,
            zip: 4,
            string: 17,
            json: 3,
            storage: 4,
            misc: 2,
        }
    }

    /// Total API count
    pub fn total(&self) -> usize {
        self.encoding
            + self.cookie
            + self.crypto
            + self.time
            + self.hash
            + self.random
            + self.http
            + self.file
            + self.zip
            + self.string
            + self.json
            + self.storage
            + self.misc
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_api_info() {
        let info = get_api_info(&NativeApi::Base64Encode);
        assert!(info.is_some());
        let info = info.unwrap();
        assert_eq!(info.java_name, "base64Encode");
        assert_eq!(info.category, ApiCategory::Encoding);
    }

    #[test]
    fn test_get_api_category() {
        assert_eq!(
            get_api_category(&NativeApi::Base64Encode),
            ApiCategory::Encoding
        );
        assert_eq!(get_api_category(&NativeApi::Md5Encode), ApiCategory::Hash);
        assert_eq!(get_api_category(&NativeApi::HttpGet), ApiCategory::Http);
        assert_eq!(
            get_api_category(&NativeApi::StringTrim),
            ApiCategory::String
        );
    }

    #[test]
    fn test_api_category_as_str() {
        assert_eq!(ApiCategory::Encoding.as_str(), "Encoding");
        assert_eq!(ApiCategory::Http.as_str(), "HTTP");
    }

    #[test]
    fn test_coverage_stats() {
        let stats = ApiCoverageStats::from_enum();
        assert!(stats.total() > 50);
    }
}
