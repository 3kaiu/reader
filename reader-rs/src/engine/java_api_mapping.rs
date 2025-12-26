//! Java API to Native API Mapping
//!
//! This module provides a mapping from legacy Legado `java.xxx()` API calls
//! to the Rust engine's native `native.xxx()` equivalents.
//!
//! Used by SourceRewriter during book source import to transpile calls.

use once_cell::sync::Lazy;
use std::collections::HashMap;

/// Static mapping from java.xxx to native.xxx API names
pub static JAVA_TO_NATIVE: Lazy<HashMap<&'static str, &'static str>> = Lazy::new(|| {
    let mut m = HashMap::new();

    // ============== Encoding ==============
    m.insert("java.base64Encode", "native.base64Encode");
    m.insert("java.base64Decode", "native.base64Decode");
    m.insert("java.base64DecodeToByteArray", "native.base64DecodeToBytes");
    m.insert("java.md5Encode", "native.md5");
    m.insert("java.md5Encode16", "native.md516");
    m.insert("java.encodeURI", "native.encodeUri");
    m.insert("java.decodeURI", "native.decodeUri");
    m.insert("java.encodeURIWithEnc", "native.encodeUriWithCharset");
    m.insert("java.hexEncodeToString", "native.hexEncode");
    m.insert("java.hexDecodeToString", "native.hexDecode");
    m.insert("java.hexStringToByte", "native.hexToBytes");
    m.insert("java.byteToHexString", "native.bytesToHex");
    m.insert("java.utf8ToGbk", "native.utf8ToGbk");
    m.insert("java.gbkToUtf8", "native.gbkToUtf8");
    m.insert("java.htmlFormat", "native.htmlFormat");

    // ============== Storage (KvStore) ==============
    m.insert("java.put", "native.put");
    m.insert("java.get", "native.get");
    m.insert("java.remove", "native.remove");

    // ============== HTTP/Network ==============
    m.insert("java.ajax", "native.httpGet");
    m.insert("java.post", "native.httpPost");
    m.insert("java.connect", "native.httpConnect");
    m.insert("java.ajaxAll", "native.httpGetAll");
    m.insert("java.postAll", "native.httpPostAll");
    m.insert("java.webView", "native.webView");

    // ============== Cookie ==============
    m.insert("java.getCookie", "native.getCookie");
    m.insert("java.setCookie", "native.setCookie");
    m.insert("java.removeCookie", "native.removeCookie");

    // ============== Crypto - AES ==============
    m.insert("java.aesEncode", "native.aesEncrypt");
    m.insert("java.aesEncodeArgsBase64", "native.aesEncryptBase64");
    m.insert("java.aesEncodeToBase64", "native.aesEncryptToBase64");
    m.insert("java.aesDecode", "native.aesDecrypt");
    m.insert("java.aesDecodeArgsBase64", "native.aesDecryptBase64");
    m.insert("java.aesDecodeToString", "native.aesDecryptToString");

    // ============== Crypto - DES/3DES ==============
    m.insert("java.desEncode", "native.desEncrypt");
    m.insert("java.desDecode", "native.desDecrypt");
    m.insert("java.tripleDesEncode", "native.tripleDesEncrypt");
    m.insert("java.tripleDesDecode", "native.tripleDesDecrypt");

    // ============== Crypto - Hash ==============
    m.insert("java.digestHex", "native.digestHex");
    m.insert("java.sha256", "native.sha256");
    m.insert("java.sha512", "native.sha512");

    // ============== Time ==============
    m.insert("java.timeFormat", "native.timeFormat");
    m.insert("java.timeFormatUTC", "native.timeFormatUtc");

    // ============== Random/UUID ==============
    m.insert("java.randomUUID", "native.uuid");
    m.insert("java.androidId", "native.deviceId");

    // ============== Logging ==============
    m.insert("java.log", "native.log");
    m.insert("java.logType", "native.logType");

    // ============== File Operations ==============
    m.insert("java.cacheFile", "native.cacheFile");
    m.insert("java.readFile", "native.readFile");
    m.insert("java.readTxtFile", "native.readTxtFile");
    m.insert(
        "java.readTxtFileWithCharset",
        "native.readTxtFileWithCharset",
    );
    m.insert("java.deleteFile", "native.deleteFile");
    m.insert("java.downloadFile", "native.downloadFile");
    m.insert("java.getFile", "native.getFile");
    m.insert("java.importScript", "native.importScript");

    // ============== ZIP Operations ==============
    m.insert("java.zipRead", "native.zipRead");
    m.insert("java.zipReadString", "native.zipReadString");
    m.insert(
        "java.zipReadStringWithCharset",
        "native.zipReadStringWithCharset",
    );
    m.insert("java.zipReadBytes", "native.zipReadBytes");
    m.insert("java.unzipFile", "native.zipExtract");

    // ============== String Operations ==============
    m.insert("java.getString", "native.getString");
    m.insert("java.strReplace", "native.strReplace");
    m.insert("java.strTrim", "native.strTrim");
    m.insert("java.strSplit", "native.strSplit");
    m.insert("java.strSubstring", "native.strSubstring");

    // ============== JSON Operations ==============
    m.insert("java.jsonPath", "native.jsonPath");

    // ============== Source/Book Context ==============
    m.insert("java.getSource", "native.getSource");
    m.insert("java.getBook", "native.getBook");
    m.insert("java.getChapter", "native.getChapter");

    // ============== Jsoup/DOM Helpers ==============
    m.insert("java.getElements", "native.getElements");
    m.insert("java.getElement", "native.getElement");
    m.insert("java.getElementsByClass", "native.getElementsByClass");
    m.insert("java.getElementById", "native.getElementById");
    m.insert("java.selectFirst", "native.selectFirst");
    m.insert("java.select", "native.select");
    m.insert("java.selectList", "native.selectList");
    m.insert("java.queryXPath", "native.queryXPath");
    m.insert("java.queryJsonPath", "native.queryJsonPath");

    m
});

/// Get the native API name for a java API call
pub fn get_native_api(java_api: &str) -> Option<&'static str> {
    JAVA_TO_NATIVE.get(java_api).copied()
}

/// Check if a java API has a native equivalent
pub fn has_native_equivalent(java_api: &str) -> bool {
    JAVA_TO_NATIVE.contains_key(java_api)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mapping_exists() {
        assert_eq!(
            get_native_api("java.base64Encode"),
            Some("native.base64Encode")
        );
        assert_eq!(get_native_api("java.ajax"), Some("native.httpGet"));
        assert_eq!(get_native_api("java.put"), Some("native.put"));
    }

    #[test]
    fn test_unknown_api() {
        assert_eq!(get_native_api("java.unknownMethod"), None);
    }

    #[test]
    fn test_mapping_count() {
        // Ensure we have a comprehensive mapping
        assert!(
            JAVA_TO_NATIVE.len() >= 60,
            "Expected at least 60 mappings, got {}",
            JAVA_TO_NATIVE.len()
        );
    }
}
