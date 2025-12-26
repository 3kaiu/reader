//! Bridge Mapper - Maps (namespace, method, args) to NativeApi enum
//!
//! This module acts as the router for the Universal JS Bridge.
//! It converts string-based calls from JS into strongly-typed NativeApi variants.

use crate::engine::native::misc::log_message;
use crate::engine::preprocessor::NativeApi;

/// Map a bridge call to NativeApi
pub fn map_to_api(ns: &str, method: &str, args: &[String]) -> NativeApi {
    // Debug log
    log_message(&format!(
        "Bridge: {}.{}(args len={})",
        ns,
        method,
        args.len()
    ));

    match method {
        // ============== Nested Utils Support ==============
        "encode" if ns.ends_with("base64") => NativeApi::Base64Encode,
        "decode" if ns.ends_with("base64") => NativeApi::Base64Decode,

        "encrypt" if ns.contains("aes") => NativeApi::AesEncode,
        "decrypt" if ns.contains("aes") => NativeApi::AesDecode,

        // ============== Encoding ==============
        "base64Encode" => NativeApi::Base64Encode,
        "base64Decode" => NativeApi::Base64Decode,
        "base64DecodeToHex" => NativeApi::Base64Decode,
        "md5Encode" | "md5" => NativeApi::Md5Encode,
        "md5Encode16" => NativeApi::Md5Encode16,
        "encodeURI" | "encodeUrl" => NativeApi::EncodeUri,
        "hexEncode" | "hexEncodeToString" | "byteToHexString" => NativeApi::HexEncode,
        "hexDecode" | "hexDecodeToString" | "hexStringToByte" => NativeApi::HexDecode,
        "htmlFormat" => NativeApi::HtmlFormat,

        // ============== Storage - Source Vars ==============
        "put" | "set" => {
            if ns == "cache" {
                NativeApi::CacheSet
            } else {
                NativeApi::SourceVarSet
            }
        }
        "get" if ns == "cache" => NativeApi::CacheGet,

        "putVariable" => NativeApi::SourceVarSet,
        "getVariable" => NativeApi::SourceVarGet,

        // ============== Network ==============
        "ajax" => NativeApi::HttpGet,
        "connect" => NativeApi::HttpGet,
        "get" => {
            let is_http = args.get(0).map(|s| s.starts_with("http")).unwrap_or(false);
            if args.len() > 1 || is_http {
                NativeApi::HttpGet
            } else {
                NativeApi::SourceVarGet
            }
        }
        "post" => NativeApi::HttpPost,

        // ============== Crypto ==============
        "aesEncode" | "aesEncrypt" => NativeApi::AesEncode,
        "aesDecode" | "aesDecrypt" => NativeApi::AesDecode,
        "desEncode" | "desEncrypt" => NativeApi::DesEncode,
        "desDecode" | "desDecrypt" => NativeApi::DesDecode,

        // ============== String ==============
        "getString" => NativeApi::SourceVarGet,

        // ============== Cookies ==============
        "getCookie" => NativeApi::GetCookie,
        "setCookie" => NativeApi::SetCookie,

        // ============== Time ==============
        "timeFormat" | "dateFormat" => NativeApi::TimeFormat(args.get(0).cloned()),
        "timeFormatUtc" => NativeApi::TimeFormatUtc,

        // ============== Misc ==============
        "randomUUID" => NativeApi::RandomUuid,
        "log" => NativeApi::Log,

        _ => NativeApi::Unknown(format!("{}.{}", ns, method)),
    }
}
