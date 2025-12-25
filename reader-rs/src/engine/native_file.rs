//! Native File Operations - Pure Rust File/ZIP API implementations
//!
//! This module provides Rust-native implementations of java file and ZIP APIs,
//! eliminating the need for JS execution.

use anyhow::Result;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Native File Operations provider
pub struct NativeFileOps {
    cache_dir: PathBuf,
}

impl NativeFileOps {
    /// Create a new NativeFileOps
    pub fn new(cache_dir: PathBuf) -> Self {
        Self { cache_dir }
    }
    
    /// Read file as bytes (returns hex encoded string)
    pub fn read_file(&self, path: &str) -> Result<String> {
        let bytes = fs::read(path)?;
        Ok(hex::encode(&bytes))
    }
    
    /// Read text file
    pub fn read_txt_file(&self, path: &str) -> Result<String> {
        Ok(fs::read_to_string(path)?)
    }
    
    /// Read text file with specific charset
    pub fn read_txt_file_with_charset(&self, path: &str, charset: &str) -> Result<String> {
        use encoding_rs::{GB18030, GBK, UTF_8};
        
        let bytes = fs::read(path)?;
        if bytes.is_empty() {
            return Ok(String::new());
        }
        
        let (result, _, _) = match charset.to_uppercase().as_str() {
            "GBK" | "GB2312" => GBK.decode(&bytes),
            "GB18030" => GB18030.decode(&bytes),
            _ => UTF_8.decode(&bytes),
        };
        
        Ok(result.to_string())
    }
    
    /// Delete file
    pub fn delete_file(&self, path: &str) -> bool {
        fs::remove_file(path).is_ok()
    }
    
    /// Get file path (resolve cache path)
    pub fn get_file(&self, path: &str) -> String {
        if path.starts_with('/') || path.starts_with('\\') {
            self.cache_dir.join(&path[1..]).to_string_lossy().to_string()
        } else {
            self.cache_dir.join(path).to_string_lossy().to_string()
        }
    }
    
    // ============== ZIP Operations ==============
    
    /// Read string content from ZIP file
    pub fn zip_read_string(&self, zip_source: &str, file_path: &str) -> Result<String> {
        self.zip_read_string_with_charset(zip_source, file_path, "UTF-8")
    }
    
    /// Read string content from ZIP with charset
    pub fn zip_read_string_with_charset(
        &self, 
        zip_source: &str, 
        file_path: &str,
        charset: &str,
    ) -> Result<String> {
        use encoding_rs::{GB18030, GBK, UTF_8};
        use zip::ZipArchive;
        
        // Get ZIP bytes
        let bytes = self.get_zip_bytes(zip_source)?;
        if bytes.is_empty() {
            return Ok(String::new());
        }
        
        // Open ZIP and read file
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = ZipArchive::new(cursor)?;
        
        let mut file = archive.by_name(file_path)?;
        let mut content_bytes = Vec::new();
        file.read_to_end(&mut content_bytes)?;
        
        // Decode with charset
        let (result, _, _) = match charset.to_uppercase().as_str() {
            "GBK" | "GB2312" => GBK.decode(&content_bytes),
            "GB18030" => GB18030.decode(&content_bytes),
            _ => UTF_8.decode(&content_bytes),
        };
        
        Ok(result.to_string())
    }
    
    /// Read bytes from ZIP (returns hex encoded string)
    pub fn zip_read_bytes(&self, zip_source: &str, file_path: &str) -> Result<String> {
        use zip::ZipArchive;
        
        let bytes = self.get_zip_bytes(zip_source)?;
        if bytes.is_empty() {
            return Ok(String::new());
        }
        
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = ZipArchive::new(cursor)?;
        
        let mut file = archive.by_name(file_path)?;
        let mut content = Vec::new();
        file.read_to_end(&mut content)?;
        
        Ok(hex::encode(&content))
    }
    
    /// Extract ZIP file to cache directory
    pub fn zip_extract(&self, zip_path: &str) -> Result<String> {
        use zip::ZipArchive;
        
        if zip_path.is_empty() {
            return Ok(String::new());
        }
        
        let zip_file = fs::File::open(zip_path)?;
        let mut archive = ZipArchive::new(zip_file)?;
        
        // Create extraction directory
        let zip_name = Path::new(zip_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unzipped");
        let extract_dir = self.cache_dir.join(zip_name);
        fs::create_dir_all(&extract_dir)?;
        
        // Extract all files
        for i in 0..archive.len() {
            if let Ok(mut file) = archive.by_index(i) {
                let file_path = extract_dir.join(file.name());
                
                if file.is_dir() {
                    fs::create_dir_all(&file_path)?;
                } else {
                    if let Some(parent) = file_path.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    if let Ok(mut out_file) = fs::File::create(&file_path) {
                        std::io::copy(&mut file, &mut out_file)?;
                    }
                }
            }
        }
        
        // Return relative path
        Ok(extract_dir
            .strip_prefix(&self.cache_dir)
            .ok()
            .and_then(|p| p.to_str())
            .map(|s| format!("/{}", s))
            .unwrap_or_default())
    }
    
    /// Get ZIP bytes from URL or hex string
    fn get_zip_bytes(&self, zip_source: &str) -> Result<Vec<u8>> {
        if zip_source.starts_with("http://") || zip_source.starts_with("https://") {
            // Download from URL
            let client = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .danger_accept_invalid_certs(true)
                .build()?;
            
            let resp = client
                .get(zip_source)
                .header("User-Agent", "Mozilla/5.0")
                .send()?;
            
            Ok(resp.bytes()?.to_vec())
        } else {
            // Assume hex string
            Ok(hex::decode(zip_source).unwrap_or_default())
        }
    }
}

/// Native String Operations
pub struct NativeStringOps;

impl NativeStringOps {
    /// String replace (regex or literal)
    pub fn replace(
        input: &str, 
        pattern: &str, 
        replacement: &str, 
        is_regex: bool, 
        global: bool
    ) -> String {
        if is_regex {
            if let Ok(re) = regex::Regex::new(pattern) {
                if global {
                    re.replace_all(input, replacement).to_string()
                } else {
                    re.replace(input, replacement).to_string()
                }
            } else {
                input.to_string()
            }
        } else {
            if global {
                input.replace(pattern, replacement)
            } else {
                input.replacen(pattern, replacement, 1)
            }
        }
    }
    
    /// String split
    pub fn split(input: &str, delimiter: &str) -> Vec<String> {
        input.split(delimiter).map(|s| s.to_string()).collect()
    }
    
    /// String trim
    pub fn trim(input: &str) -> String {
        input.trim().to_string()
    }
    
    /// String substring
    pub fn substring(input: &str, start: i32, end: Option<i32>) -> String {
        let chars: Vec<char> = input.chars().collect();
        let len = chars.len() as i32;
        
        let start = if start < 0 { 0 } else { start.min(len) } as usize;
        let end = match end {
            Some(e) => (if e < 0 { len } else { e.min(len) }) as usize,
            None => chars.len(),
        };
        
        if start >= end {
            String::new()
        } else {
            chars[start..end].iter().collect()
        }
    }
    
    /// HTML to text (strip tags)
    pub fn html_to_text(html: &str) -> String {
        // Simple tag stripping - for complex HTML use a proper parser
        let re = regex::Regex::new(r"<[^>]*>").unwrap();
        let text = re.replace_all(html, "");
        
        // Decode HTML entities
        html_escape::decode_html_entities(&text).to_string()
    }
}

/// Native JSON Operations
pub struct NativeJsonOps;

impl NativeJsonOps {
    /// Execute JSONPath query
    pub fn json_path(input: &str, path: &str) -> Result<String> {
        use jsonpath_rust::JsonPath;
        
        let json_value: serde_json::Value = serde_json::from_str(input)?;
        
        // Ensure path starts with $
        let path = if path.starts_with("$.") {
            path.to_string()
        } else if path.starts_with(".") {
            format!("${}", path)
        } else {
            format!("$.{}", path)
        };
        
        let json_path = JsonPath::try_from(path.as_str())?;
        let result = json_path.find(&json_value);
        
        match result {
            serde_json::Value::Array(arr) => {
                if arr.len() == 1 {
                    match &arr[0] {
                        serde_json::Value::String(s) => Ok(s.clone()),
                        v => Ok(v.to_string().trim_matches('"').to_string()),
                    }
                } else {
                    Ok(serde_json::to_string(&arr)?)
                }
            }
            serde_json::Value::String(s) => Ok(s),
            serde_json::Value::Null => Ok(String::new()),
            v => Ok(v.to_string().trim_matches('"').to_string()),
        }
    }
    
    /// Parse JSON string
    pub fn parse(input: &str) -> Result<serde_json::Value> {
        Ok(serde_json::from_str(input)?)
    }
    
    /// Stringify to JSON
    pub fn stringify(value: &serde_json::Value) -> String {
        serde_json::to_string(value).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_string_replace_literal() {
        let result = NativeStringOps::replace("hello world", "world", "rust", false, true);
        assert_eq!(result, "hello rust");
    }
    
    #[test]
    fn test_string_replace_regex() {
        let result = NativeStringOps::replace("a1b2c3", r"\d", "X", true, true);
        assert_eq!(result, "aXbXcX");
    }
    
    #[test]
    fn test_string_split() {
        let result = NativeStringOps::split("a,b,c", ",");
        assert_eq!(result, vec!["a", "b", "c"]);
    }
    
    #[test]
    fn test_string_substring() {
        let result = NativeStringOps::substring("hello", 1, Some(4));
        assert_eq!(result, "ell");
    }
    
    #[test]
    fn test_html_to_text() {
        let result = NativeStringOps::html_to_text("<p>Hello &amp; World</p>");
        assert_eq!(result, "Hello & World");
    }
    
    #[test]
    fn test_json_path() {
        let json = r#"{"name": "test", "value": 123}"#;
        let result = NativeJsonOps::json_path(json, "name").unwrap();
        assert_eq!(result, "test");
    }
}
