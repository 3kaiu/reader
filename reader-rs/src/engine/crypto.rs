//! Cryptographic Provider - AES, DES, 3DES encryption/decryption, MD5, SHA hashing
//!
//! This module provides comprehensive cryptographic operations for book source rules,
//! supporting various modes (CBC, ECB) and padding (PKCS7, NoPadding).

use anyhow::{anyhow, Result};
use base64::Engine;
use sha2::{Digest, Sha256, Sha512};

// ============== Hash Functions ==============

/// MD5 encode (32 char hex)
pub fn md5_encode(input: &str) -> Result<String> {
    Ok(format!("{:x}", md5::compute(input.as_bytes())))
}

/// MD5 encode 16 (16 char hex, middle portion)
pub fn md5_encode16(input: &str) -> Result<String> {
    let full = format!("{:x}", md5::compute(input.as_bytes()));
    if full.len() >= 24 {
        Ok(full[8..24].to_string())
    } else {
        Ok(full)
    }
}

/// Calculate digest hash (MD5, SHA1, SHA256, SHA512)
pub fn digest_hex(input: &str, algorithm: &str) -> Result<String> {
    match algorithm.to_uppercase().as_str() {
        "MD5" => md5_encode(input),
        "SHA1" | "SHA-1" => {
            use sha1::{Digest as Sha1Digest, Sha1};
            let mut hasher = Sha1::new();
            hasher.update(input.as_bytes());
            Ok(format!("{:x}", hasher.finalize()))
        }
        "SHA256" | "SHA-256" => {
            let mut hasher = Sha256::new();
            hasher.update(input.as_bytes());
            Ok(format!("{:x}", hasher.finalize()))
        }
        "SHA512" | "SHA-512" => {
            let mut hasher = Sha512::new();
            hasher.update(input.as_bytes());
            Ok(format!("{:x}", hasher.finalize()))
        }
        _ => Err(anyhow!("Unsupported algorithm: {}", algorithm)),
    }
}

// ============== AES/DES Crypto Provider ==============

/// Crypto Provider for encryption/decryption operations
pub struct CryptoProvider;

impl CryptoProvider {
    // ============== AES ==============

    /// AES decode with Base64 encoded key/iv
    pub fn aes_decode_args_base64(
        data: &str,
        key_base64: &str,
        mode: &str,
        padding: &str,
        iv_base64: &str,
    ) -> Result<String> {
        let key = base64::engine::general_purpose::STANDARD.decode(key_base64)?;
        let iv = base64::engine::general_purpose::STANDARD.decode(iv_base64)?;

        let decrypted = Self::aes_decode_bytes(data.as_bytes(), &key, mode, padding, &iv)?;
        Ok(String::from_utf8_lossy(&decrypted).to_string())
    }

    /// AES encode with Base64 encoded key/iv, return Base64
    pub fn aes_encode_args_base64(
        data: &str,
        key_base64: &str,
        mode: &str,
        padding: &str,
        iv_base64: &str,
    ) -> Result<String> {
        let key = base64::engine::general_purpose::STANDARD.decode(key_base64)?;
        let iv = base64::engine::general_purpose::STANDARD.decode(iv_base64)?;

        let encrypted = Self::aes_encode_bytes(data.as_bytes(), &key, mode, padding, &iv)?;
        Ok(base64::engine::general_purpose::STANDARD.encode(&encrypted))
    }

    /// AES decode bytes
    pub fn aes_decode_bytes(
        data: &[u8],
        key: &[u8],
        mode: &str,
        padding: &str,
        iv: &[u8],
    ) -> Result<Vec<u8>> {
        use aes::Aes128;
        use cbc::cipher::{
            block_padding::NoPadding, block_padding::Pkcs7, BlockDecryptMut, KeyIvInit,
        };

        let key_arr = ensure_16_bytes(key);
        let iv_arr = ensure_16_bytes(iv);

        // Try to decode input as base64 first
        let encrypted = base64::engine::general_purpose::STANDARD
            .decode(data)
            .unwrap_or_else(|_| data.to_vec());

        match mode.to_uppercase().as_str() {
            "CBC" | "" => match padding.to_uppercase().as_str() {
                "PKCS5PADDING" | "PKCS7PADDING" | "PKCS7" | "PKCS5" | "" => {
                    type Aes128CbcDec = cbc::Decryptor<Aes128>;
                    let cipher = Aes128CbcDec::new(&key_arr.into(), &iv_arr.into());
                    let mut buf = encrypted.clone();
                    cipher
                        .decrypt_padded_mut::<Pkcs7>(&mut buf)
                        .map(|d| d.to_vec())
                        .map_err(|e| anyhow!("AES decrypt error: {:?}", e))
                }
                "NOPADDING" => {
                    type Aes128CbcDec = cbc::Decryptor<Aes128>;
                    let cipher = Aes128CbcDec::new(&key_arr.into(), &iv_arr.into());
                    let mut buf = encrypted.clone();
                    cipher
                        .decrypt_padded_mut::<NoPadding>(&mut buf)
                        .map(|d| d.to_vec())
                        .map_err(|e| anyhow!("AES decrypt error: {:?}", e))
                }
                _ => Err(anyhow!("Unsupported padding: {}", padding)),
            },
            "ECB" => {
                use ecb::cipher::{BlockDecryptMut as EcbBlockDecryptMut, KeyInit};
                match padding.to_uppercase().as_str() {
                    "PKCS5PADDING" | "PKCS7PADDING" | "PKCS7" | "PKCS5" | "" => {
                        type Aes128EcbDec = ecb::Decryptor<Aes128>;
                        let cipher = Aes128EcbDec::new(&key_arr.into());
                        let mut buf = encrypted.clone();
                        cipher
                            .decrypt_padded_mut::<Pkcs7>(&mut buf)
                            .map(|d| d.to_vec())
                            .map_err(|e| anyhow!("AES ECB decrypt error: {:?}", e))
                    }
                    _ => Err(anyhow!("Unsupported padding for ECB: {}", padding)),
                }
            }
            _ => Err(anyhow!("Unsupported mode: {}", mode)),
        }
    }

    /// AES encode bytes
    pub fn aes_encode_bytes(
        data: &[u8],
        key: &[u8],
        mode: &str,
        _padding: &str,
        iv: &[u8],
    ) -> Result<Vec<u8>> {
        use aes::Aes128;
        use cbc::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};

        let key_arr = ensure_16_bytes(key);
        let iv_arr = ensure_16_bytes(iv);

        match mode.to_uppercase().as_str() {
            "CBC" | "" => {
                type Aes128CbcEnc = cbc::Encryptor<Aes128>;
                let cipher = Aes128CbcEnc::new(&key_arr.into(), &iv_arr.into());

                let buf_len = ((data.len() / 16) + 1) * 16;
                let mut buf = vec![0u8; buf_len];
                buf[..data.len()].copy_from_slice(data);

                cipher
                    .encrypt_padded_mut::<Pkcs7>(&mut buf, data.len())
                    .map(|e| e.to_vec())
                    .map_err(|e| anyhow!("AES encrypt error: {:?}", e))
            }
            "ECB" => {
                use ecb::cipher::{BlockEncryptMut as EcbBlockEncryptMut, KeyInit};
                type Aes128EcbEnc = ecb::Encryptor<Aes128>;
                let cipher = Aes128EcbEnc::new(&key_arr.into());

                let buf_len = ((data.len() / 16) + 1) * 16;
                let mut buf = vec![0u8; buf_len];
                buf[..data.len()].copy_from_slice(data);

                cipher
                    .encrypt_padded_mut::<Pkcs7>(&mut buf, data.len())
                    .map(|e| e.to_vec())
                    .map_err(|e| anyhow!("AES ECB encrypt error: {:?}", e))
            }
            _ => Err(anyhow!("Unsupported mode: {}", mode)),
        }
    }

    // ============== 3DES (Triple DES / DESede) ==============

    /// 3DES decode string
    pub fn triple_des_decode_str(
        data: &str,
        key: &str,
        mode: &str,
        padding: &str,
        iv: &str,
    ) -> Result<String> {
        let decrypted = Self::triple_des_decode_bytes(
            data.as_bytes(),
            key.as_bytes(),
            mode,
            padding,
            iv.as_bytes(),
        )?;
        Ok(String::from_utf8_lossy(&decrypted).to_string())
    }

    /// 3DES decode with Base64 encoded key/iv
    pub fn triple_des_decode_args_base64(
        data: &str,
        key_base64: &str,
        mode: &str,
        padding: &str,
        iv_base64: &str,
    ) -> Result<String> {
        let key = base64::engine::general_purpose::STANDARD.decode(key_base64)?;
        let iv = base64::engine::general_purpose::STANDARD.decode(iv_base64)?;

        let decrypted = Self::triple_des_decode_bytes(data.as_bytes(), &key, mode, padding, &iv)?;
        Ok(String::from_utf8_lossy(&decrypted).to_string())
    }

    /// 3DES encode to Base64
    pub fn triple_des_encode_base64(
        data: &str,
        key: &str,
        mode: &str,
        padding: &str,
        iv: &str,
    ) -> Result<String> {
        let encrypted = Self::triple_des_encode_bytes(
            data.as_bytes(),
            key.as_bytes(),
            mode,
            padding,
            iv.as_bytes(),
        )?;
        Ok(base64::engine::general_purpose::STANDARD.encode(&encrypted))
    }

    /// 3DES encode with Base64 encoded key/iv
    pub fn triple_des_encode_args_base64(
        data: &str,
        key_base64: &str,
        mode: &str,
        padding: &str,
        iv_base64: &str,
    ) -> Result<String> {
        let key = base64::engine::general_purpose::STANDARD.decode(key_base64)?;
        let iv = base64::engine::general_purpose::STANDARD.decode(iv_base64)?;

        let encrypted = Self::triple_des_encode_bytes(data.as_bytes(), &key, mode, padding, &iv)?;
        Ok(base64::engine::general_purpose::STANDARD.encode(&encrypted))
    }

    /// 3DES decode bytes
    pub fn triple_des_decode_bytes(
        data: &[u8],
        key: &[u8],
        mode: &str,
        padding: &str,
        iv: &[u8],
    ) -> Result<Vec<u8>> {
        use cbc::cipher::{
            block_padding::NoPadding, block_padding::Pkcs7, BlockDecryptMut, KeyIvInit,
        };
        use des::TdesEde3;

        let key_arr = ensure_24_bytes(key);
        let iv_arr = ensure_8_bytes(iv);

        // Try to decode input as base64 first
        let encrypted = base64::engine::general_purpose::STANDARD
            .decode(data)
            .unwrap_or_else(|_| data.to_vec());

        match mode.to_uppercase().as_str() {
            "CBC" | "" => match padding.to_uppercase().as_str() {
                "PKCS5PADDING" | "PKCS7PADDING" | "PKCS7" | "PKCS5" | "" => {
                    type Tdes3CbcDec = cbc::Decryptor<TdesEde3>;
                    let cipher = Tdes3CbcDec::new(&key_arr.into(), &iv_arr.into());
                    let mut buf = encrypted.clone();
                    cipher
                        .decrypt_padded_mut::<Pkcs7>(&mut buf)
                        .map(|d| d.to_vec())
                        .map_err(|e| anyhow!("3DES decrypt error: {:?}", e))
                }
                "NOPADDING" => {
                    type Tdes3CbcDec = cbc::Decryptor<TdesEde3>;
                    let cipher = Tdes3CbcDec::new(&key_arr.into(), &iv_arr.into());
                    let mut buf = encrypted.clone();
                    cipher
                        .decrypt_padded_mut::<NoPadding>(&mut buf)
                        .map(|d| d.to_vec())
                        .map_err(|e| anyhow!("3DES decrypt error: {:?}", e))
                }
                _ => Err(anyhow!("Unsupported padding: {}", padding)),
            },
            "ECB" => {
                use ecb::cipher::{BlockDecryptMut as EcbBlockDecryptMut, KeyInit};
                type Tdes3EcbDec = ecb::Decryptor<TdesEde3>;
                let cipher = Tdes3EcbDec::new(&key_arr.into());
                let mut buf = encrypted.clone();
                cipher
                    .decrypt_padded_mut::<Pkcs7>(&mut buf)
                    .map(|d| d.to_vec())
                    .map_err(|e| anyhow!("3DES ECB decrypt error: {:?}", e))
            }
            _ => Err(anyhow!("Unsupported mode: {}", mode)),
        }
    }

    /// 3DES encode bytes
    pub fn triple_des_encode_bytes(
        data: &[u8],
        key: &[u8],
        mode: &str,
        _padding: &str,
        iv: &[u8],
    ) -> Result<Vec<u8>> {
        use cbc::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
        use des::TdesEde3;

        let key_arr = ensure_24_bytes(key);
        let iv_arr = ensure_8_bytes(iv);

        match mode.to_uppercase().as_str() {
            "CBC" | "" => {
                type Tdes3CbcEnc = cbc::Encryptor<TdesEde3>;
                let cipher = Tdes3CbcEnc::new(&key_arr.into(), &iv_arr.into());

                let buf_len = ((data.len() / 8) + 1) * 8;
                let mut buf = vec![0u8; buf_len];
                buf[..data.len()].copy_from_slice(data);

                cipher
                    .encrypt_padded_mut::<Pkcs7>(&mut buf, data.len())
                    .map(|e| e.to_vec())
                    .map_err(|e| anyhow!("3DES encrypt error: {:?}", e))
            }
            "ECB" => {
                use ecb::cipher::{BlockEncryptMut as EcbBlockEncryptMut, KeyInit};
                type Tdes3EcbEnc = ecb::Encryptor<TdesEde3>;
                let cipher = Tdes3EcbEnc::new(&key_arr.into());

                let buf_len = ((data.len() / 8) + 1) * 8;
                let mut buf = vec![0u8; buf_len];
                buf[..data.len()].copy_from_slice(data);

                cipher
                    .encrypt_padded_mut::<Pkcs7>(&mut buf, data.len())
                    .map(|e| e.to_vec())
                    .map_err(|e| anyhow!("3DES ECB encrypt error: {:?}", e))
            }
            _ => Err(anyhow!("Unsupported mode: {}", mode)),
        }
    }
}

/// Ensure key is exactly 16 bytes for AES-128
fn ensure_16_bytes(input: &[u8]) -> [u8; 16] {
    let mut result = [0u8; 16];
    let len = input.len().min(16);
    result[..len].copy_from_slice(&input[..len]);
    result
}

/// Ensure key is exactly 8 bytes for DES IV
fn ensure_8_bytes(input: &[u8]) -> [u8; 8] {
    let mut result = [0u8; 8];
    let len = input.len().min(8);
    result[..len].copy_from_slice(&input[..len]);
    result
}

/// Ensure key is exactly 24 bytes for 3DES
fn ensure_24_bytes(input: &[u8]) -> [u8; 24] {
    let mut result = [0u8; 24];
    let len = input.len().min(24);
    result[..len].copy_from_slice(&input[..len]);
    // If key is 16 bytes, repeat first 8 bytes to make 24
    if input.len() == 16 {
        result[16..24].copy_from_slice(&input[..8]);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aes_cbc_pkcs7() {
        let key = "1234567890123456";
        let iv = "1234567890123456";
        let data = "Hello World";

        // Encode
        let encrypted = CryptoProvider::aes_encode_bytes(
            data.as_bytes(),
            key.as_bytes(),
            "CBC",
            "PKCS7",
            iv.as_bytes(),
        )
        .unwrap();

        // Decode
        let encrypted_b64 = base64::engine::general_purpose::STANDARD.encode(&encrypted);
        let decrypted = CryptoProvider::aes_decode_bytes(
            encrypted_b64.as_bytes(),
            key.as_bytes(),
            "CBC",
            "PKCS7",
            iv.as_bytes(),
        )
        .unwrap();

        assert_eq!(String::from_utf8_lossy(&decrypted), data);
    }

    #[test]
    fn test_triple_des_cbc() {
        let key = "123456789012345678901234"; // 24 bytes
        let iv = "12345678"; // 8 bytes
        let data = "Hello 3DES";

        // Encode
        let encrypted = CryptoProvider::triple_des_encode_bytes(
            data.as_bytes(),
            key.as_bytes(),
            "CBC",
            "PKCS7",
            iv.as_bytes(),
        )
        .unwrap();

        // Decode
        let encrypted_b64 = base64::engine::general_purpose::STANDARD.encode(&encrypted);
        let decrypted = CryptoProvider::triple_des_decode_bytes(
            encrypted_b64.as_bytes(),
            key.as_bytes(),
            "CBC",
            "PKCS7",
            iv.as_bytes(),
        )
        .unwrap();

        assert_eq!(String::from_utf8_lossy(&decrypted), data);
    }

    #[test]
    fn test_aes_args_base64() {
        let data = "Hello";
        let key_b64 = base64::engine::general_purpose::STANDARD.encode("1234567890123456");
        let iv_b64 = base64::engine::general_purpose::STANDARD.encode("1234567890123456");

        let encrypted =
            CryptoProvider::aes_encode_args_base64(data, &key_b64, "CBC", "PKCS7", &iv_b64)
                .unwrap();

        let decrypted =
            CryptoProvider::aes_decode_args_base64(&encrypted, &key_b64, "CBC", "PKCS7", &iv_b64)
                .unwrap();

        assert_eq!(decrypted, data);
    }

    #[test]
    fn test_triple_des_args_base64() {
        let data = "Hello 3DES";
        let key_b64 = base64::engine::general_purpose::STANDARD.encode("123456789012345678901234");
        let iv_b64 = base64::engine::general_purpose::STANDARD.encode("12345678");

        let encrypted =
            CryptoProvider::triple_des_encode_args_base64(data, &key_b64, "CBC", "PKCS7", &iv_b64)
                .unwrap();

        let decrypted = CryptoProvider::triple_des_decode_args_base64(
            &encrypted, &key_b64, "CBC", "PKCS7", &iv_b64,
        )
        .unwrap();

        assert_eq!(decrypted, data);
    }
}
