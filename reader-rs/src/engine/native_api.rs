//! Native API Provider - Execute java.* APIs directly in Rust
//!
//! This module provides Rust-native implementations of commonly used java.* APIs,
//! eliminating the need for JS execution in many cases.

use super::cookie::CookieManager;
use super::preprocessor::NativeApi;
use crate::storage::kv::KvStore;
use anyhow::Result;
use chrono::TimeZone;

use std::sync::Arc;

/// Native API Provider - executes java.* APIs in pure Rust
pub struct NativeApiProvider {
    /// Cookie manager for getCookie/setCookie
    cookie_manager: Arc<CookieManager>,
    /// Persistent KV Store
    kv_store: Arc<KvStore>,
    /// Base URL for relative URL resolution
    pub base_url: String,
}

impl NativeApiProvider {
    /// Create a new NativeApiProvider
    pub fn new(cookie_manager: Arc<CookieManager>, kv_store: Arc<KvStore>) -> Self {
        Self {
            cookie_manager,
            kv_store,
            base_url: String::new(),
        }
    }

    /// Create with existing kv_store (deprecated name but keeping signature similar if needed, or just remove)
    pub fn with_store(cookie_manager: Arc<CookieManager>, kv_store: Arc<KvStore>) -> Self {
        Self {
            cookie_manager,
            kv_store,
            base_url: String::new(),
        }
    }

    /// Execute a native API call
    pub fn execute(&self, api: &NativeApi, args: &[String]) -> Result<String> {
        match api {
            // Encoding
            NativeApi::Base64Encode => {
                use base64::Engine;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(base64::engine::general_purpose::STANDARD.encode(input.as_bytes()))
            }

            NativeApi::Base64Decode => {
                use base64::Engine;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                base64::engine::general_purpose::STANDARD
                    .decode(input.as_bytes())
                    .ok()
                    .and_then(|bytes| String::from_utf8(bytes).ok())
                    .map(Ok)
                    .unwrap_or(Ok(String::new()))
            }

            NativeApi::Base64DecodeWithFlags(flags) => {
                use base64::Engine;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
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

            NativeApi::Md5Encode => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(format!("{:x}", md5::compute(input.as_bytes())))
            }

            NativeApi::Md5Encode16 => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                let full = format!("{:x}", md5::compute(input.as_bytes()));
                if full.len() >= 24 {
                    Ok(full[8..24].to_string())
                } else {
                    Ok(full)
                }
            }

            NativeApi::EncodeUri => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(urlencoding::encode(input).to_string())
            }

            NativeApi::EncodeUriWithEnc(enc) => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                // For non-UTF8 encodings, first convert then URL encode
                if enc.eq_ignore_ascii_case("gbk") || enc.eq_ignore_ascii_case("gb2312") {
                    use encoding_rs::GBK;
                    let (encoded, _, _) = GBK.encode(input);
                    Ok(urlencoding::encode_binary(&encoded).to_string())
                } else {
                    Ok(urlencoding::encode(input).to_string())
                }
            }

            NativeApi::Utf8ToGbk => {
                use encoding_rs::GBK;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                let (encoded, _, _) = GBK.encode(input);
                Ok(hex::encode(&encoded))
            }

            NativeApi::HtmlFormat => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(html_escape::decode_html_entities(input).to_string())
            }

            // Cookie
            NativeApi::GetCookie { url, key } => {
                // Extract domain from URL
                let domain = reqwest::Url::parse(url)
                    .ok()
                    .and_then(|u| u.host_str().map(|h| h.to_string()))
                    .unwrap_or_else(|| url.to_string());

                // Use the get_cookie method with proper signature
                let cookie_str = self.cookie_manager.get_cookie(&domain, key.as_deref());
                Ok(cookie_str)
            }

            // Time
            NativeApi::TimeFormat(format) => {
                use chrono::Utc;
                let timestamp = args
                    .first()
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or_else(|| Utc::now().timestamp_millis());

                let fmt = format.as_deref().unwrap_or("%Y-%m-%d %H:%M:%S");

                chrono::Utc
                    .timestamp_opt(timestamp / 1000, 0)
                    .single()
                    .map(|dt| dt.format(fmt).to_string())
                    .map(Ok)
                    .unwrap_or(Ok(String::new()))
            }

            // Hash
            NativeApi::DigestHex(algorithm) => {
                use sha1::Sha1;
                use sha2::{Digest, Sha256, Sha512};

                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                let data_bytes = input.as_bytes();

                match algorithm.to_uppercase().as_str() {
                    "MD5" => Ok(format!("{:x}", md5::compute(data_bytes))),
                    "SHA1" | "SHA-1" => {
                        let mut hasher = Sha1::new();
                        hasher.update(data_bytes);
                        Ok(format!("{:x}", hasher.finalize()))
                    }
                    "SHA256" | "SHA-256" => {
                        let mut hasher = Sha256::new();
                        hasher.update(data_bytes);
                        Ok(format!("{:x}", hasher.finalize()))
                    }
                    "SHA512" | "SHA-512" => {
                        let mut hasher = Sha512::new();
                        hasher.update(data_bytes);
                        Ok(format!("{:x}", hasher.finalize()))
                    }
                    _ => Ok(format!("{:x}", md5::compute(data_bytes))),
                }
            }

            // Random
            NativeApi::RandomUuid => Ok(uuid::Uuid::new_v4().to_string()),

            // Crypto - AES
            NativeApi::AesEncode {
                transformation: _,
                iv,
            } => {
                use aes::Aes128;
                use base64::Engine;
                use cbc::{
                    cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit},
                    Encryptor,
                };

                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");

                type Aes128CbcEnc = Encryptor<Aes128>;

                let key_bytes = ensure_16_bytes(key.as_bytes());
                let iv_bytes = ensure_16_bytes(iv.as_bytes());

                let cipher = Aes128CbcEnc::new(&key_bytes.into(), &iv_bytes.into());

                let data_bytes = data.as_bytes();
                let buf_len = ((data_bytes.len() / 16) + 1) * 16;
                let mut buf = vec![0u8; buf_len];
                buf[..data_bytes.len()].copy_from_slice(data_bytes);

                match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
                    Ok(encrypted) => {
                        Ok(base64::engine::general_purpose::STANDARD.encode(encrypted))
                    }
                    Err(_) => Ok(String::new()),
                }
            }

            NativeApi::AesDecode {
                transformation: _,
                iv,
            } => {
                use aes::Aes128;
                use base64::Engine;
                use cbc::{
                    cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit},
                    Decryptor,
                };

                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");

                type Aes128CbcDec = Decryptor<Aes128>;

                let encrypted = base64::engine::general_purpose::STANDARD
                    .decode(data.as_bytes())
                    .unwrap_or_default();
                if encrypted.is_empty() {
                    return Ok(String::new());
                }

                let key_bytes = ensure_16_bytes(key.as_bytes());
                let iv_bytes = ensure_16_bytes(iv.as_bytes());

                let cipher = Aes128CbcDec::new(&key_bytes.into(), &iv_bytes.into());

                let mut buf = encrypted.clone();
                match cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                    Ok(decrypted) => Ok(String::from_utf8_lossy(decrypted).to_string()),
                    Err(_) => Ok(String::new()),
                }
            }

            // DES
            NativeApi::DesEncode {
                transformation: _,
                iv,
            } => {
                use cbc::{
                    cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit},
                    Encryptor,
                };
                use des::Des;

                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");

                type DesCbcEnc = Encryptor<Des>;

                let key_bytes = ensure_8_bytes(key.as_bytes());
                let iv_bytes = ensure_8_bytes(iv.as_bytes());

                let cipher = DesCbcEnc::new(&key_bytes.into(), &iv_bytes.into());

                let data_bytes = data.as_bytes();
                let buf_len = ((data_bytes.len() / 8) + 1) * 8;
                let mut buf = vec![0u8; buf_len];
                buf[..data_bytes.len()].copy_from_slice(data_bytes);

                match cipher.encrypt_padded_mut::<Pkcs7>(&mut buf, data_bytes.len()) {
                    Ok(encrypted) => Ok(hex::encode(encrypted)),
                    Err(_) => Ok(String::new()),
                }
            }

            NativeApi::DesDecode {
                transformation: _,
                iv,
            } => {
                use cbc::{
                    cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit},
                    Decryptor,
                };
                use des::Des;

                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");

                type DesCbcDec = Decryptor<Des>;

                let encrypted = hex::decode(data).unwrap_or_default();
                if encrypted.is_empty() {
                    return Ok(String::new());
                }

                let key_bytes = ensure_8_bytes(key.as_bytes());
                let iv_bytes = ensure_8_bytes(iv.as_bytes());

                let cipher = DesCbcDec::new(&key_bytes.into(), &iv_bytes.into());

                let mut buf = encrypted.clone();
                match cipher.decrypt_padded_mut::<Pkcs7>(&mut buf) {
                    Ok(decrypted) => Ok(String::from_utf8_lossy(decrypted).to_string()),
                    Err(_) => Ok(String::new()),
                }
            }

            // 3DES (Triple DES / DESede)
            NativeApi::TripleDesDecodeStr { mode, padding } => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let iv = args.get(2).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::triple_des_decode_str(data, key, mode, padding, iv)
            }

            NativeApi::TripleDesDecodeArgsBase64 { mode, padding } => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key_base64 = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let iv_base64 = args.get(2).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::triple_des_decode_args_base64(
                    data, key_base64, mode, padding, iv_base64,
                )
            }

            NativeApi::TripleDesEncodeBase64 { mode, padding } => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let iv = args.get(2).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::triple_des_encode_base64(
                    data, key, mode, padding, iv,
                )
            }

            NativeApi::TripleDesEncodeArgsBase64 { mode, padding } => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key_base64 = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let iv_base64 = args.get(2).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::triple_des_encode_args_base64(
                    data, key_base64, mode, padding, iv_base64,
                )
            }

            // AES with Base64 encoded args
            NativeApi::AesDecodeArgsBase64 { mode, padding } => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key_base64 = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let iv_base64 = args.get(2).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::aes_decode_args_base64(
                    data, key_base64, mode, padding, iv_base64,
                )
            }

            NativeApi::AesEncodeArgsBase64 { mode, padding } => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key_base64 = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let iv_base64 = args.get(2).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::aes_encode_args_base64(
                    data, key_base64, mode, padding, iv_base64,
                )
            }

            // Time with UTC offset
            NativeApi::TimeFormatUtc {
                format,
                offset_hours,
            } => {
                use chrono::{FixedOffset, TimeZone as _, Utc};

                let timestamp = args
                    .first()
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or_else(|| Utc::now().timestamp_millis());

                let offset = FixedOffset::east_opt(*offset_hours * 3600)
                    .unwrap_or_else(|| FixedOffset::east_opt(0).unwrap());

                offset
                    .timestamp_opt(timestamp / 1000, 0)
                    .single()
                    .map(|dt| dt.format(format).to_string())
                    .map(Ok)
                    .unwrap_or(Ok(String::new()))
            }

            // Delete file
            NativeApi::DeleteFile => {
                let path = args.first().map(|s| s.as_str()).unwrap_or("");
                if path.is_empty() {
                    return Ok("false".to_string());
                }
                match std::fs::remove_file(path) {
                    Ok(_) => Ok("true".to_string()),
                    Err(_) => Ok("false".to_string()),
                }
            }
            
            // ============== New APIs ==============
            
            // Hex encoding
            NativeApi::HexEncode => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(hex::encode(input.as_bytes()))
            }
            
            NativeApi::HexDecode => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                hex::decode(input)
                    .ok()
                    .and_then(|bytes| String::from_utf8(bytes).ok())
                    .map(Ok)
                    .unwrap_or(Ok(String::new()))
            }
            
            // Set Cookie
            NativeApi::SetCookie { url, cookie } => {
                let domain = reqwest::Url::parse(url)
                    .ok()
                    .and_then(|u| u.host_str().map(|h| h.to_string()))
                    .unwrap_or_else(|| url.to_string());
                self.cookie_manager.parse_set_cookie(&domain, cookie);
                Ok(String::new())
            }
            
            // HTTP APIs - Delegate to native_http module
            NativeApi::HttpGet { url, headers } => {
                use super::native_http::NativeHttpClient;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let client = NativeHttpClient::with_headers(cache_dir, headers.clone())?;
                let resp = client.get(url, headers)?;
                Ok(resp.to_json())
            }
            
            NativeApi::HttpPost { url, body, headers } => {
                use super::native_http::NativeHttpClient;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let client = NativeHttpClient::with_headers(cache_dir, headers.clone())?;
                let resp = client.post(url, body, headers)?;
                Ok(resp.to_json())
            }
            
            NativeApi::HttpRequest { method, url, body, headers } => {
                use super::native_http::NativeHttpClient;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let client = NativeHttpClient::with_headers(cache_dir, headers.clone())?;
                let resp = client.request(method, url, body.as_deref(), headers)?;
                Ok(resp.to_json())
            }
            
            NativeApi::HttpGetAll { urls } => {
                use super::native_http::NativeHttpClient;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let client = NativeHttpClient::new(cache_dir)?;
                let responses = client.get_all(urls);
                let bodies: Vec<String> = responses.into_iter().map(|r| r.body).collect();
                Ok(serde_json::to_string(&bodies).unwrap_or_default())
            }
            
            // File APIs - Delegate to native_file module
            NativeApi::CacheFile { url, save_time } => {
                use super::native_http::NativeHttpClient;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let client = NativeHttpClient::new(cache_dir)?;
                client.cache_file(url, *save_time)
            }
            
            NativeApi::ReadFile { path } => {
                use super::native_file::NativeFileOps;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.read_file(path)
            }
            
            NativeApi::ReadTxtFile { path } => {
                use super::native_file::NativeFileOps;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.read_txt_file(path)
            }
            
            NativeApi::ReadTxtFileWithCharset { path, charset } => {
                use super::native_file::NativeFileOps;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.read_txt_file_with_charset(path, charset)
            }
            
            NativeApi::GetFile { path } => {
                use super::native_file::NativeFileOps;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let ops = NativeFileOps::new(cache_dir);
                Ok(ops.get_file(path))
            }
            
            NativeApi::ImportScript { path } => {
                use super::native_http::NativeHttpClient;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let client = NativeHttpClient::new(cache_dir)?;
                client.import_script(path)
            }
            
            // ZIP APIs
            NativeApi::ZipReadString { zip_source, file_path } => {
                use super::native_file::NativeFileOps;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.zip_read_string(zip_source, file_path)
            }
            
            NativeApi::ZipReadStringWithCharset { zip_source, file_path, charset } => {
                use super::native_file::NativeFileOps;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.zip_read_string_with_charset(zip_source, file_path, charset)
            }
            
            NativeApi::ZipReadBytes { zip_source, file_path } => {
                use super::native_file::NativeFileOps;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.zip_read_bytes(zip_source, file_path)
            }
            
            NativeApi::ZipExtract { zip_path } => {
                use super::native_file::NativeFileOps;
                let cache_dir = std::env::current_dir().unwrap_or_default().join("data").join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.zip_extract(zip_path)
            }
            
            // String APIs
            NativeApi::StringReplace { pattern, replacement, is_regex, global } => {
                use super::native_file::NativeStringOps;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(NativeStringOps::replace(input, pattern, replacement, *is_regex, *global))
            }
            
            NativeApi::StringSplit { delimiter } => {
                use super::native_file::NativeStringOps;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(serde_json::to_string(&NativeStringOps::split(input, delimiter)).unwrap_or_default())
            }
            
            NativeApi::StringTrim => {
                use super::native_file::NativeStringOps;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(NativeStringOps::trim(input))
            }
            
            NativeApi::StringSubstring { start, end } => {
                use super::native_file::NativeStringOps;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(NativeStringOps::substring(input, *start, *end))
            }
            
            NativeApi::HtmlToText => {
                use super::native_file::NativeStringOps;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(NativeStringOps::html_to_text(input))
            }
            
            // JSON APIs
            NativeApi::JsonPath { path } => {
                use super::native_file::NativeJsonOps;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                NativeJsonOps::json_path(input, path)
            }
            
            NativeApi::JsonParse => {
                // Just validate and return the input (actual parsing is done in caller)
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                serde_json::from_str::<serde_json::Value>(input)
                    .map(|_| input.to_string())
                    .map_err(|e| anyhow::anyhow!("JSON parse error: {}", e))
            }
            
            NativeApi::JsonStringify => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                // If already a string, just return it; otherwise treat as raw
                Ok(input.to_string())
            }
            
            // Misc
            NativeApi::Log { message } => {
                tracing::info!("Native log: {}", message);
                Ok(String::new())
            }

            // Unknown - should not reach here, fallback needed
            NativeApi::Unknown(name) => {
                tracing::warn!("Unknown native API called: {}", name);
                Err(anyhow::anyhow!("Unknown API: {}", name))
            }
        }
    }

    /// Get a cached value
    pub fn get_cache(&self, key: &str) -> Option<String> {
        self.kv_store.get_cache(key)
    }

    /// Set a cached value
    pub fn set_cache(&self, key: &str, value: &str) {
        self.kv_store.set_cache(key, value, 0); // 0 = no expiry for now, or default
                                                // Async save
        let store = self.kv_store.clone();
        tokio::task::spawn(async move {
            let _ = store.save().await;
        });
    }

    /// Get source variable
    pub fn get_source_var(&self, source_url: &str, key: &str) -> Option<String> {
        self.kv_store.get_source_var(source_url, key)
    }

    /// Set source variable
    pub fn set_source_var(&self, source_url: &str, key: &str, value: &str) {
        self.kv_store.set_source_var(source_url, key, value);
        let store = self.kv_store.clone();
        tokio::task::spawn(async move {
            let _ = store.save().await;
        });
    }
}

/// Ensure key is exactly 16 bytes for AES-128
fn ensure_16_bytes(input: &[u8]) -> [u8; 16] {
    let mut result = [0u8; 16];
    let len = input.len().min(16);
    result[..len].copy_from_slice(&input[..len]);
    result
}

/// Ensure key is exactly 8 bytes for DES
fn ensure_8_bytes(input: &[u8]) -> [u8; 8] {
    let mut result = [0u8; 8];
    let len = input.len().min(8);
    result[..len].copy_from_slice(&input[..len]);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::kv::KvStore;
    use crate::storage::FileStorage;

    fn create_test_kv() -> Arc<KvStore> {
        let fs = FileStorage::new("/tmp/reader_tests");
        Arc::new(KvStore::new(fs, "test_kv.json"))
    }

    #[test]
    fn test_base64_encode() {
        let cm = Arc::new(CookieManager::new());
        let provider = NativeApiProvider::new(cm, create_test_kv());

        let result = provider
            .execute(&NativeApi::Base64Encode, &["hello".to_string()])
            .unwrap();
        assert_eq!(result, "aGVsbG8=");
    }

    #[test]
    fn test_base64_decode() {
        let cm = Arc::new(CookieManager::new());
        let provider = NativeApiProvider::new(cm, create_test_kv());

        let result = provider
            .execute(&NativeApi::Base64Decode, &["aGVsbG8=".to_string()])
            .unwrap();
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_md5_encode() {
        let cm = Arc::new(CookieManager::new());
        let provider = NativeApiProvider::new(cm, create_test_kv());

        let result = provider
            .execute(&NativeApi::Md5Encode, &["hello".to_string()])
            .unwrap();
        assert_eq!(result, "5d41402abc4b2a76b9719d911017c592");
    }

    #[test]
    fn test_encode_uri() {
        let cm = Arc::new(CookieManager::new());
        let provider = NativeApiProvider::new(cm, create_test_kv());

        let result = provider
            .execute(&NativeApi::EncodeUri, &["hello world".to_string()])
            .unwrap();
        assert_eq!(result, "hello%20world");
    }

    #[test]
    fn test_random_uuid() {
        let cm = Arc::new(CookieManager::new());
        let provider = NativeApiProvider::new(cm, create_test_kv());

        let result = provider.execute(&NativeApi::RandomUuid, &[]).unwrap();
        assert!(result.len() == 36); // UUID format
    }
}
