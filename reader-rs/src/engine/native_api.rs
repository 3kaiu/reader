//! Native API Provider - Execute java.* APIs directly in Rust
//!
//! This module provides Rust-native implementations of commonly used java.* APIs,
//! eliminating the need for JS execution in many cases.

use super::cookie::CookieManager;
use super::error::EngineError;
use super::native::HandlerRegistry;
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
    /// Handler registry for modular API dispatch
    handler_registry: HandlerRegistry,
}

/// Execution context for Native API calls
#[derive(Debug, Default, Clone)]
pub struct ExecutionContext {
    pub base_url: String,
}

impl NativeApiProvider {
    /// Create a new NativeApiProvider
    pub fn new(cookie_manager: Arc<CookieManager>, kv_store: Arc<KvStore>) -> Self {
        Self {
            cookie_manager,
            kv_store,
            handler_registry: HandlerRegistry::new(),
        }
    }

    /// Create with existing kv_store (deprecated name but keeping signature similar if needed, or just remove)
    pub fn with_store(cookie_manager: Arc<CookieManager>, kv_store: Arc<KvStore>) -> Self {
        Self {
            cookie_manager,
            kv_store,
            handler_registry: HandlerRegistry::new(),
        }
    }

    /// Execute a native API call
    pub fn execute(
        &self,
        api: &NativeApi,
        args: &[String],
        context: &ExecutionContext,
    ) -> Result<String> {
        // Record native execution for stats
        crate::engine::stats::STATS.record_native(&format!("{:?}", api));

        // Try handler registry first (covers Encoding, Time, String, Misc, Hash, JSON)
        if let Some(result) = self.handler_registry.execute(api, args, context) {
            return result;
        }

        // Fall back to inline implementations for stateful APIs (Cookie, Crypto, HTTP, Storage)
        match api {
            // Cookie - needs cookie_manager
            NativeApi::GetCookie => {
                let url = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str());

                // Extract domain from URL
                let domain = reqwest::Url::parse(url)
                    .ok()
                    .and_then(|u| u.host_str().map(|h| h.to_string()))
                    .unwrap_or_else(|| url.to_string());

                // Use the get_cookie method with proper signature
                let cookie_str = self.cookie_manager.get_cookie(&domain, key);
                Ok(cookie_str)
            }

            NativeApi::SetCookie => {
                let url = args.first().map(|s| s.as_str()).unwrap_or("");
                let cookie = args.get(1).map(|s| s.as_str()).unwrap_or("");

                let domain = reqwest::Url::parse(url)
                    .ok()
                    .and_then(|u| u.host_str().map(|h| h.to_string()))
                    .unwrap_or_else(|| url.to_string());
                self.cookie_manager.parse_set_cookie(&domain, cookie);
                Ok(String::new())
            }


            // Crypto - AES
            // Crypto - AES
            NativeApi::AesEncode => {
                use aes::Aes128;
                use base64::Engine;
                use cbc::{
                    cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit},
                    Encryptor,
                };

                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");
                // Optional transformation and iv from args currently supported if passed
                let iv = args.get(3).map(|s| s.as_str()).unwrap_or("");

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

            NativeApi::AesDecode => {
                use aes::Aes128;
                use base64::Engine;
                use cbc::{
                    cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit},
                    Decryptor,
                };

                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let iv = args.get(3).map(|s| s.as_str()).unwrap_or("");

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
            NativeApi::DesEncode => {
                use cbc::{
                    cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit},
                    Encryptor,
                };
                use des::Des;

                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let iv = args.get(3).map(|s| s.as_str()).unwrap_or("");

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

            NativeApi::DesDecode => {
                use cbc::{
                    cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit},
                    Decryptor,
                };
                use des::Des;

                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let iv = args.get(3).map(|s| s.as_str()).unwrap_or("");

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
            // 3DES (Triple DES / DESede)
            NativeApi::TripleDesDecodeStr => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");
                // args order for 3DES: data, key, mode, padding, iv
                let mode = args.get(2).map(|s| s.as_str()).unwrap_or("");
                let padding = args.get(3).map(|s| s.as_str()).unwrap_or("");
                let iv = args.get(4).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::triple_des_decode_str(data, key, mode, padding, iv)
            }

            NativeApi::TripleDesDecodeArgsBase64 => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key_base64 = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let mode = args.get(2).map(|s| s.as_str()).unwrap_or("");
                let padding = args.get(3).map(|s| s.as_str()).unwrap_or("");
                let iv_base64 = args.get(4).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::triple_des_decode_args_base64(
                    data, key_base64, mode, padding, iv_base64,
                )
            }

            NativeApi::TripleDesEncodeBase64 => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let mode = args.get(2).map(|s| s.as_str()).unwrap_or("");
                let padding = args.get(3).map(|s| s.as_str()).unwrap_or("");
                let iv = args.get(4).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::triple_des_encode_base64(
                    data, key, mode, padding, iv,
                )
            }

            NativeApi::TripleDesEncodeArgsBase64 => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key_base64 = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let mode = args.get(2).map(|s| s.as_str()).unwrap_or("");
                let padding = args.get(3).map(|s| s.as_str()).unwrap_or("");
                let iv_base64 = args.get(4).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::triple_des_encode_args_base64(
                    data, key_base64, mode, padding, iv_base64,
                )
            }

            // AES with Base64 encoded args
            NativeApi::AesDecodeArgsBase64 => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key_base64 = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let mode = args.get(2).map(|s| s.as_str()).unwrap_or("");
                let padding = args.get(3).map(|s| s.as_str()).unwrap_or("");
                let iv_base64 = args.get(4).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::aes_decode_args_base64(
                    data, key_base64, mode, padding, iv_base64,
                )
            }

            NativeApi::AesEncodeArgsBase64 => {
                let data = args.first().map(|s| s.as_str()).unwrap_or("");
                let key_base64 = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let mode = args.get(2).map(|s| s.as_str()).unwrap_or("");
                let padding = args.get(3).map(|s| s.as_str()).unwrap_or("");
                let iv_base64 = args.get(4).map(|s| s.as_str()).unwrap_or("");

                super::crypto::CryptoProvider::aes_encode_args_base64(
                    data, key_base64, mode, padding, iv_base64,
                )
            }

            // Time with UTC offset
            // Time with UTC offset
            NativeApi::TimeFormatUtc => {
                use chrono::{FixedOffset, TimeZone as _, Utc};

                let timestamp = args
                    .first()
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or_else(|| Utc::now().timestamp_millis());

                let format = args
                    .get(1)
                    .map(|s| s.as_str())
                    .unwrap_or("%Y-%m-%d %H:%M:%S");
                // args order: timestamp, format, offset_hours ?
                // Java: timeFormatUtc(time, format, offset)

                let offset_hours = args.get(2).and_then(|s| s.parse::<i32>().ok()).unwrap_or(0);

                let offset = FixedOffset::east_opt(offset_hours * 3600)
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

            // HTTP APIs - Delegate to native_http module
            // HTTP APIs
            NativeApi::HttpGet => {
                use super::native_http::NativeHttpClient;
                let url = args.first().map(|s| s.as_str()).unwrap_or("");
                // Headers parsing if needed, assumed empty for now or parse args[1] if JSON
                let headers = std::collections::HashMap::new();

                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let client = NativeHttpClient::with_headers(cache_dir, headers.clone())?;
                let resp = client.get(url, &headers)?;
                Ok(resp.body) // Return body string for legacy java.ajax compatibility
            }

            NativeApi::HttpPost => {
                use super::native_http::NativeHttpClient;
                let url = args.first().map(|s| s.as_str()).unwrap_or("");
                let body = args.get(1).map(|s| s.as_str()).unwrap_or("");

                let headers_json = args.get(2).map(|s| s.as_str()).unwrap_or("{}");
                let headers: std::collections::HashMap<String, String> =
                    serde_json::from_str(headers_json).unwrap_or_default();

                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let client = NativeHttpClient::with_headers(cache_dir, headers.clone())?;
                let resp = client.post(url, body, &headers)?;
                Ok(resp.body) // Return body string for legacy java.post compatibility
            }

            NativeApi::HttpRequest => {
                // args: method, url, body, headers(json)?
                use super::native_http::NativeHttpClient;
                let method = args.first().map(|s| s.as_str()).unwrap_or("GET");
                let url = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let body = args.get(2).map(|s| s.as_str());
                let headers = std::collections::HashMap::new();

                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let client = NativeHttpClient::with_headers(cache_dir, headers.clone())?;
                let resp = client.request(method, url, body, &headers)?;
                Ok(resp.to_json())
            }

            NativeApi::HttpGetAll => {
                // args: [url, url, ...] - all args are urls
                use super::native_http::NativeHttpClient;
                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let client = NativeHttpClient::new(cache_dir)?;

                let urls: Vec<String> = args.iter().map(|s| s.to_string()).collect();

                let responses = client.get_all(&urls);
                let bodies: Vec<String> = responses.into_iter().map(|r| r.body).collect();
                Ok(serde_json::to_string(&bodies).unwrap_or_default())
            }

            // KV Storage - delegated to native::storage
            // KV Storage - delegated to native::storage
            NativeApi::CacheGet => {
                let key = args.first().map(|s| s.as_str()).unwrap_or("");
                super::native::storage::cache_get(&self.kv_store, key)
            }
            NativeApi::CacheSet => {
                let key = args.first().map(|s| s.as_str()).unwrap_or("");
                let value = args.get(1).map(|s| s.as_str()).unwrap_or("");
                super::native::storage::cache_set(&self.kv_store, key, value)
            }
            NativeApi::SourceVarGet => {
                let key = args.first().map(|s| s.as_str()).unwrap_or("");

                // Source URL is required for source variables
                let source_url = if context.base_url.is_empty() {
                    "global"
                } else {
                    &context.base_url
                };
                Ok(
                    super::native::storage::get_source_var(&self.kv_store, source_url, key)
                        .unwrap_or_default(),
                )
            }
            NativeApi::SourceVarSet => {
                let key = args.first().map(|s| s.as_str()).unwrap_or("");
                let value = args.get(1).map(|s| s.as_str()).unwrap_or("");

                let source_url = if context.base_url.is_empty() {
                    "global"
                } else {
                    &context.base_url
                };
                super::native::storage::set_source_var(&self.kv_store, source_url, key, value);
                Ok(String::new())
            }

            // Logging
            NativeApi::Log => {
                let message = args.first().map(|s| s.as_str()).unwrap_or("");
                super::native::misc::log_message(message);
                Ok(String::new())
            }

            // File APIs - Delegate to native_file module
            // File APIs - Delegate to native_file module
            NativeApi::CacheFile => {
                use super::native_http::NativeHttpClient;
                let url = args.first().map(|s| s.as_str()).unwrap_or("");
                let save_time = args.get(1).and_then(|s| s.parse::<i32>().ok()).unwrap_or(0);

                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let client = NativeHttpClient::new(cache_dir)?;
                client.cache_file(url, save_time)
            }

            NativeApi::ReadFile => {
                use super::native_file::NativeFileOps;
                let path = args.first().map(|s| s.as_str()).unwrap_or("");
                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.read_file(path)
            }

            NativeApi::ReadTxtFile => {
                use super::native_file::NativeFileOps;
                let path = args.first().map(|s| s.as_str()).unwrap_or("");
                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.read_txt_file(path)
            }

            NativeApi::ReadTxtFileWithCharset => {
                use super::native_file::NativeFileOps;
                let path = args.first().map(|s| s.as_str()).unwrap_or("");
                let charset = args.get(1).map(|s| s.as_str()).unwrap_or("");

                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.read_txt_file_with_charset(path, charset)
            }

            NativeApi::GetFile => {
                use super::native_file::NativeFileOps;
                let path = args.first().map(|s| s.as_str()).unwrap_or("");
                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let ops = NativeFileOps::new(cache_dir);
                Ok(ops.get_file(path))
            }

            NativeApi::ImportScript => {
                use super::native_http::NativeHttpClient;
                let path = args.first().map(|s| s.as_str()).unwrap_or("");
                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let client = NativeHttpClient::new(cache_dir)?;
                client.import_script(path)
            }

            // ZIP APIs
            NativeApi::ZipReadString => {
                use super::native_file::NativeFileOps;
                let zip_source = args.first().map(|s| s.as_str()).unwrap_or("");
                let file_path = args.get(1).map(|s| s.as_str()).unwrap_or("");

                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.zip_read_string(zip_source, file_path)
            }

            NativeApi::ZipReadStringWithCharset => {
                use super::native_file::NativeFileOps;
                let zip_source = args.first().map(|s| s.as_str()).unwrap_or("");
                let file_path = args.get(1).map(|s| s.as_str()).unwrap_or("");
                let charset = args.get(2).map(|s| s.as_str()).unwrap_or("");

                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.zip_read_string_with_charset(zip_source, file_path, charset)
            }

            NativeApi::ZipReadBytes => {
                use super::native_file::NativeFileOps;
                let zip_source = args.first().map(|s| s.as_str()).unwrap_or("");
                let file_path = args.get(1).map(|s| s.as_str()).unwrap_or("");

                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.zip_read_bytes(zip_source, file_path)
            }

            NativeApi::ZipExtract => {
                use super::native_file::NativeFileOps;
                let zip_path = args.first().map(|s| s.as_str()).unwrap_or("");
                let cache_dir = std::env::current_dir()
                    .unwrap_or_default()
                    .join("data")
                    .join("cache");
                let ops = NativeFileOps::new(cache_dir);
                ops.zip_extract(zip_path)
            }

            // String APIs
            NativeApi::StringReplace {
                pattern,
                replacement,
                is_regex,
                global,
            } => {
                use super::native_file::NativeStringOps;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(NativeStringOps::replace(
                    input,
                    pattern,
                    replacement,
                    *is_regex,
                    *global,
                ))
            }

            NativeApi::StringSplit { delimiter } => {
                use super::native_file::NativeStringOps;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(
                    serde_json::to_string(&NativeStringOps::split(input, delimiter))
                        .unwrap_or_default(),
                )
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
            NativeApi::JsonPath => {
                use super::native_file::NativeJsonOps;
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                let path = args.get(1).map(|s| s.as_str()).unwrap_or("");
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

            // String case conversion
            NativeApi::StringToLowerCase => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(input.to_lowercase())
            }

            NativeApi::StringToUpperCase => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(input.to_uppercase())
            }

            // String padding
            NativeApi::StringPadStart { length, pad_char } => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                let pad = if pad_char.is_empty() { " " } else { pad_char };
                let current_len = input.chars().count() as i32;
                if current_len >= *length {
                    Ok(input.to_string())
                } else {
                    let padding_needed = (*length - current_len) as usize;
                    let repeated: String = pad.chars().cycle().take(padding_needed).collect();
                    Ok(format!("{}{}", repeated, input))
                }
            }

            NativeApi::StringPadEnd { length, pad_char } => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                let pad = if pad_char.is_empty() { " " } else { pad_char };
                let current_len = input.chars().count() as i32;
                if current_len >= *length {
                    Ok(input.to_string())
                } else {
                    let padding_needed = (*length - current_len) as usize;
                    let repeated: String = pad.chars().cycle().take(padding_needed).collect();
                    Ok(format!("{}{}", input, repeated))
                }
            }

            NativeApi::StringRepeat { count } => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(input.repeat((*count).max(0) as usize))
            }

            NativeApi::StringCharAt { index } => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(input
                    .chars()
                    .nth((*index).max(0) as usize)
                    .map(|c| c.to_string())
                    .unwrap_or_default())
            }

            NativeApi::StringCharCodeAt { index } => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(input
                    .chars()
                    .nth((*index).max(0) as usize)
                    .map(|c| (c as u32).to_string())
                    .unwrap_or_else(|| "NaN".to_string()))
            }

            NativeApi::StringIncludes { search } => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(input.contains(search).to_string())
            }

            NativeApi::StringStartsWith { prefix } => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(input.starts_with(prefix).to_string())
            }

            NativeApi::StringEndsWith { suffix } => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(input.ends_with(suffix).to_string())
            }

            NativeApi::StringIndexOf { search } => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(input
                    .find(search)
                    .map(|i| i as i32)
                    .unwrap_or(-1)
                    .to_string())
            }

            NativeApi::StringLastIndexOf { search } => {
                let input = args.first().map(|s| s.as_str()).unwrap_or("");
                Ok(input
                    .rfind(search)
                    .map(|i| i as i32)
                    .unwrap_or(-1)
                    .to_string())
            }

            // Time
            NativeApi::GetTimeMillis => {
                use std::time::{SystemTime, UNIX_EPOCH};
                let millis = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                Ok(millis.to_string())
            }

            // Unknown - should not reach here, fallback needed
            NativeApi::Unknown(name) => {
                tracing::warn!("Unknown native API called: {}", name);
                Err(EngineError::UnknownApi(name.clone()).into())
            }

            // All other APIs should have been handled by HandlerRegistry
            // This is a fallback for safety
            _ => {
                tracing::warn!("API {:?} not handled by registry or fallback", api);
                Err(EngineError::ApiExecution(format!("Unhandled API: {:?}", api)).into())
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
            .execute(
                &NativeApi::Base64Encode,
                &["hello".to_string()],
                &ExecutionContext::default(),
            )
            .unwrap();
        assert_eq!(result, "aGVsbG8=");
    }

    #[test]
    fn test_base64_decode() {
        let cm = Arc::new(CookieManager::new());
        let provider = NativeApiProvider::new(cm, create_test_kv());

        let result = provider
            .execute(
                &NativeApi::Base64Decode,
                &["aGVsbG8=".to_string()],
                &ExecutionContext::default(),
            )
            .unwrap();
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_md5_encode() {
        let cm = Arc::new(CookieManager::new());
        let provider = NativeApiProvider::new(cm, create_test_kv());

        let result = provider
            .execute(
                &NativeApi::Md5Encode,
                &["hello".to_string()],
                &ExecutionContext::default(),
            )
            .unwrap();
        assert_eq!(result, "5d41402abc4b2a76b9719d911017c592");
    }

    #[test]
    fn test_encode_uri() {
        let cm = Arc::new(CookieManager::new());
        let provider = NativeApiProvider::new(cm, create_test_kv());

        let result = provider
            .execute(
                &NativeApi::EncodeUri,
                &["hello world".to_string()],
                &ExecutionContext::default(),
            )
            .unwrap();
        assert_eq!(result, "hello%20world");
    }

    #[test]
    fn test_random_uuid() {
        let cm = Arc::new(CookieManager::new());
        let provider = NativeApiProvider::new(cm, create_test_kv());

        let result = provider
            .execute(&NativeApi::RandomUuid, &[], &ExecutionContext::default())
            .unwrap();
        assert!(result.len() == 36); // UUID format
    }
}
