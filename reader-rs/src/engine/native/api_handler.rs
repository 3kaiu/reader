//! API Handler Trait - Modular API execution dispatch
//!
//! This module provides a trait-based approach for organizing Native API execution,
//! allowing each domain module to handle its own API subset.

use anyhow::Result;

use crate::engine::native_api::ExecutionContext;
use crate::engine::preprocessor::NativeApi;

/// Trait for domain-specific API handlers
pub trait ApiHandler: Send + Sync {
    /// Check if this handler can process the given API
    fn can_handle(&self, api: &NativeApi) -> bool;

    /// Execute the API and return the result
    fn execute(
        &self,
        api: &NativeApi,
        args: &[String],
        context: &ExecutionContext,
    ) -> Result<String>;
}

/// Encoding API Handler
pub struct EncodingHandler;

impl EncodingHandler {
    pub fn is_encoding_api(api: &NativeApi) -> bool {
        matches!(
            api,
            NativeApi::Base64Encode
                | NativeApi::Base64Decode
                | NativeApi::Base64DecodeWithFlags(_)
                | NativeApi::EncodeUri
                | NativeApi::EncodeUriWithEnc(_)
                | NativeApi::Utf8ToGbk
                | NativeApi::HtmlFormat
                | NativeApi::HexEncode
                | NativeApi::HexDecode
        )
    }
}

impl ApiHandler for EncodingHandler {
    fn can_handle(&self, api: &NativeApi) -> bool {
        Self::is_encoding_api(api)
    }

    fn execute(
        &self,
        api: &NativeApi,
        args: &[String],
        _context: &ExecutionContext,
    ) -> Result<String> {
        let input = args.first().map(|s| s.as_str()).unwrap_or("");

        match api {
            NativeApi::Base64Encode => super::encoding::base64_encode(input),
            NativeApi::Base64Decode => super::encoding::base64_decode(input),
            NativeApi::Base64DecodeWithFlags(flags) => {
                super::encoding::base64_decode_with_flags(input, *flags)
            }
            NativeApi::EncodeUri => super::encoding::encode_uri(input),
            NativeApi::EncodeUriWithEnc(enc) => {
                if enc.eq_ignore_ascii_case("gbk") || enc.eq_ignore_ascii_case("gb2312") {
                    use encoding_rs::GBK;
                    let (encoded, _, _) = GBK.encode(input);
                    Ok(urlencoding::encode_binary(&encoded).to_string())
                } else {
                    super::encoding::encode_uri(input)
                }
            }
            NativeApi::Utf8ToGbk => super::encoding::utf8_to_gbk(input),
            NativeApi::HtmlFormat => super::encoding::html_format(input),
            NativeApi::HexEncode => super::encoding::hex_encode(input),
            NativeApi::HexDecode => super::encoding::hex_decode(input),
            _ => unreachable!("EncodingHandler should only handle encoding APIs"),
        }
    }
}

/// Time API Handler
pub struct TimeHandler;

impl TimeHandler {
    pub fn is_time_api(api: &NativeApi) -> bool {
        matches!(
            api,
            NativeApi::TimeFormat(_) | NativeApi::TimeFormatUtc | NativeApi::GetTimeMillis
        )
    }
}

impl ApiHandler for TimeHandler {
    fn can_handle(&self, api: &NativeApi) -> bool {
        Self::is_time_api(api)
    }

    fn execute(
        &self,
        api: &NativeApi,
        args: &[String],
        _context: &ExecutionContext,
    ) -> Result<String> {
        match api {
            NativeApi::TimeFormat(format) => {
                let timestamp = args.first().and_then(|s| s.parse::<i64>().ok());
                super::time::time_format(timestamp, format.as_deref())
            }
            NativeApi::TimeFormatUtc => {
                let timestamp = args
                    .first()
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
                let format = args.get(1).map(|s| s.as_str()).unwrap_or("%Y-%m-%d %H:%M:%S");
                let offset = args.get(2).and_then(|s| s.parse::<i32>().ok()).unwrap_or(0);
                super::time::time_format_utc(timestamp, format, offset)
            }
            NativeApi::GetTimeMillis => Ok(super::time::get_time_millis().to_string()),
            _ => unreachable!(),
        }
    }
}

/// String Operations Handler
pub struct StringOpsHandler;

impl StringOpsHandler {
    pub fn is_string_api(api: &NativeApi) -> bool {
        matches!(
            api,
            NativeApi::StringTrim
                | NativeApi::StringToLowerCase
                | NativeApi::StringToUpperCase
                | NativeApi::HtmlToText
                | NativeApi::StringReplace { .. }
                | NativeApi::StringSplit { .. }
                | NativeApi::StringSubstring { .. }
                | NativeApi::StringPadStart { .. }
                | NativeApi::StringPadEnd { .. }
                | NativeApi::StringRepeat { .. }
                | NativeApi::StringCharAt { .. }
                | NativeApi::StringCharCodeAt { .. }
                | NativeApi::StringIncludes { .. }
                | NativeApi::StringStartsWith { .. }
                | NativeApi::StringEndsWith { .. }
                | NativeApi::StringIndexOf { .. }
                | NativeApi::StringLastIndexOf { .. }
        )
    }
}

impl ApiHandler for StringOpsHandler {
    fn can_handle(&self, api: &NativeApi) -> bool {
        Self::is_string_api(api)
    }

    fn execute(
        &self,
        api: &NativeApi,
        args: &[String],
        _context: &ExecutionContext,
    ) -> Result<String> {
        let input = args.first().map(|s| s.as_str()).unwrap_or("");

        match api {
            NativeApi::StringTrim => super::string_ops::string_trim(input),
            NativeApi::StringToLowerCase => super::string_ops::to_lower_case(input),
            NativeApi::StringToUpperCase => super::string_ops::to_upper_case(input),
            NativeApi::HtmlToText => {
                // Simple HTML tag stripping
                let re = regex::Regex::new(r"<[^>]+>").unwrap();
                Ok(re.replace_all(input, "").trim().to_string())
            }
            NativeApi::StringReplace {
                pattern,
                replacement,
                is_regex,
                global,
            } => super::string_ops::string_replace(input, pattern, replacement, *is_regex, *global),
            NativeApi::StringSplit { delimiter } => {
                let parts = super::string_ops::string_split(input, delimiter)?;
                Ok(serde_json::to_string(&parts).unwrap_or_default())
            }
            NativeApi::StringSubstring { start, end } => {
                super::string_ops::string_substring(input, *start, *end)
            }
            NativeApi::StringPadStart { length, pad_char } => {
                let current_len = input.chars().count();
                if current_len >= *length as usize {
                    return Ok(input.to_string());
                }
                let pad_len = *length as usize - current_len;
                let pad = pad_char.repeat(pad_len);
                Ok(format!("{}{}", &pad[..pad_len], input))
            }
            NativeApi::StringPadEnd { length, pad_char } => {
                let current_len = input.chars().count();
                if current_len >= *length as usize {
                    return Ok(input.to_string());
                }
                let pad_len = *length as usize - current_len;
                let pad = pad_char.repeat(pad_len);
                Ok(format!("{}{}", input, &pad[..pad_len]))
            }
            NativeApi::StringRepeat { count } => Ok(input.repeat(*count as usize)),
            NativeApi::StringCharAt { index } => Ok(input
                .chars()
                .nth(*index as usize)
                .map(|c| c.to_string())
                .unwrap_or_default()),
            NativeApi::StringCharCodeAt { index } => Ok(input
                .chars()
                .nth(*index as usize)
                .map(|c| (c as u32).to_string())
                .unwrap_or_default()),
            NativeApi::StringIncludes { search } => {
                Ok(super::string_ops::contains(input, search).to_string())
            }
            NativeApi::StringStartsWith { prefix } => {
                Ok(super::string_ops::starts_with(input, prefix).to_string())
            }
            NativeApi::StringEndsWith { suffix } => {
                Ok(super::string_ops::ends_with(input, suffix).to_string())
            }
            NativeApi::StringIndexOf { search } => {
                Ok(super::string_ops::index_of(input, search).to_string())
            }
            NativeApi::StringLastIndexOf { search } => {
                Ok(input
                    .rfind(search.as_str())
                    .map(|i| i as i32)
                    .unwrap_or(-1)
                    .to_string())
            }
            _ => unreachable!(),
        }
    }
}

/// Miscellaneous API Handler
pub struct MiscHandler;

impl MiscHandler {
    pub fn is_misc_api(api: &NativeApi) -> bool {
        matches!(api, NativeApi::RandomUuid | NativeApi::Log)
    }
}

impl ApiHandler for MiscHandler {
    fn can_handle(&self, api: &NativeApi) -> bool {
        Self::is_misc_api(api)
    }

    fn execute(
        &self,
        api: &NativeApi,
        args: &[String],
        _context: &ExecutionContext,
    ) -> Result<String> {
        match api {
            NativeApi::RandomUuid => super::misc::random_uuid(),
            NativeApi::Log => {
                let msg = args.first().map(|s| s.as_str()).unwrap_or("");
                super::misc::log_message(msg);
                Ok(String::new())
            }
            _ => unreachable!(),
        }
    }
}

/// Hash API Handler (MD5, DigestHex)
pub struct HashHandler;

impl HashHandler {
    pub fn is_hash_api(api: &NativeApi) -> bool {
        matches!(
            api,
            NativeApi::Md5Encode | NativeApi::Md5Encode16 | NativeApi::DigestHex(_)
        )
    }
}

impl ApiHandler for HashHandler {
    fn can_handle(&self, api: &NativeApi) -> bool {
        Self::is_hash_api(api)
    }

    fn execute(
        &self,
        api: &NativeApi,
        args: &[String],
        _context: &ExecutionContext,
    ) -> Result<String> {
        let input = args.first().map(|s| s.as_str()).unwrap_or("");

        match api {
            NativeApi::Md5Encode => crate::engine::crypto::md5_encode(input),
            NativeApi::Md5Encode16 => crate::engine::crypto::md5_encode16(input),
            NativeApi::DigestHex(algorithm) => {
                crate::engine::crypto::digest_hex(input, algorithm)
            }
            _ => unreachable!(),
        }
    }
}

/// JSON API Handler
pub struct JsonHandler;

impl JsonHandler {
    pub fn is_json_api(api: &NativeApi) -> bool {
        matches!(
            api,
            NativeApi::JsonPath | NativeApi::JsonParse | NativeApi::JsonStringify
        )
    }
}

impl ApiHandler for JsonHandler {
    fn can_handle(&self, api: &NativeApi) -> bool {
        Self::is_json_api(api)
    }

    fn execute(
        &self,
        api: &NativeApi,
        args: &[String],
        _context: &ExecutionContext,
    ) -> Result<String> {
        let input = args.first().map(|s| s.as_str()).unwrap_or("");

        match api {
            NativeApi::JsonPath => {
                // JSONPath query - use existing parser
                let path = args.get(1).map(|s| s.as_str()).unwrap_or("$");
                // Use serde_json for basic path resolution
                if let Ok(_json) = serde_json::from_str::<serde_json::Value>(input) {
                    // Simple path extraction
                    if path == "$" || path.is_empty() {
                        return Ok(input.to_string());
                    }
                    // For more complex paths, return input (handled by full parser elsewhere)
                    Ok(input.to_string())
                } else {
                    Ok(String::new())
                }
            }
            NativeApi::JsonParse => {
                // Just validate and return as-is (it's already JSON)
                match serde_json::from_str::<serde_json::Value>(input) {
                    Ok(_) => Ok(input.to_string()),
                    Err(_) => Ok("null".to_string()),
                }
            }
            NativeApi::JsonStringify => {
                // Already a string, just return
                Ok(input.to_string())
            }
            _ => unreachable!(),
        }
    }
}

/// Handler Registry - Coordinates all API handlers
pub struct HandlerRegistry {
    handlers: Vec<Box<dyn ApiHandler>>,
}

impl Default for HandlerRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl HandlerRegistry {
    /// Create a new registry with all standard handlers
    pub fn new() -> Self {
        Self {
            handlers: vec![
                Box::new(EncodingHandler),
                Box::new(TimeHandler),
                Box::new(StringOpsHandler),
                Box::new(MiscHandler),
                Box::new(HashHandler),
                Box::new(JsonHandler),
            ],
        }
    }

    /// Find a handler that can process the given API
    pub fn find_handler(&self, api: &NativeApi) -> Option<&dyn ApiHandler> {
        self.handlers
            .iter()
            .find(|h| h.can_handle(api))
            .map(|h| h.as_ref())
    }

    /// Execute an API using the appropriate handler
    pub fn execute(
        &self,
        api: &NativeApi,
        args: &[String],
        context: &ExecutionContext,
    ) -> Option<Result<String>> {
        self.find_handler(api)
            .map(|h| h.execute(api, args, context))
    }

    /// Check if any handler can process this API
    pub fn can_handle(&self, api: &NativeApi) -> bool {
        self.handlers.iter().any(|h| h.can_handle(api))
    }

    /// Get count of registered handlers
    pub fn handler_count(&self) -> usize {
        self.handlers.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encoding_handler() {
        let handler = EncodingHandler;
        assert!(handler.can_handle(&NativeApi::Base64Encode));
        assert!(!handler.can_handle(&NativeApi::RandomUuid));

        let ctx = ExecutionContext::default();
        let result = handler.execute(&NativeApi::Base64Encode, &["hello".to_string()], &ctx);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "aGVsbG8=");
    }

    #[test]
    fn test_time_handler() {
        let handler = TimeHandler;
        assert!(handler.can_handle(&NativeApi::GetTimeMillis));
        assert!(!handler.can_handle(&NativeApi::Base64Encode));

        let ctx = ExecutionContext::default();
        let result = handler.execute(&NativeApi::GetTimeMillis, &[], &ctx);
        assert!(result.is_ok());
    }

    #[test]
    fn test_string_ops_handler() {
        let handler = StringOpsHandler;
        assert!(handler.can_handle(&NativeApi::StringTrim));

        let ctx = ExecutionContext::default();
        let result = handler.execute(&NativeApi::StringTrim, &["  hello  ".to_string()], &ctx);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "hello");
    }

    #[test]
    fn test_misc_handler() {
        let handler = MiscHandler;
        assert!(handler.can_handle(&NativeApi::RandomUuid));

        let ctx = ExecutionContext::default();
        let result = handler.execute(&NativeApi::RandomUuid, &[], &ctx);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 36);
    }
}
