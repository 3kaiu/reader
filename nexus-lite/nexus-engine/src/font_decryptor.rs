//! Font Decryption Module
//!
//! Provides font parsing and decryption for anti-crawl font encryption:
//! - Parse TTF/WOFF/WOFF2 font files
//! - Extract CMAP character mappings
//! - Decrypt obfuscated text

use std::collections::HashMap;
use ttf_parser::Face;
use thiserror::Error;

/// Font decryption error
#[derive(Debug, Error)]
pub enum FontDecryptError {
    #[error("Failed to parse font: {0}")]
    ParseError(String),
    
    #[error("Failed to download font: {0}")]
    DownloadError(String),
    
    #[error("No CMAP table found")]
    NoCmapTable,
    
    #[error("Invalid character mapping")]
    InvalidMapping,
}

/// Character mapping from encrypted to decrypted
pub type CharMapping = HashMap<char, char>;

/// Font decryptor
pub struct FontDecryptor {
    /// Cached character mappings
    mappings: HashMap<String, CharMapping>,
}

impl FontDecryptor {
    /// Create a new font decryptor
    pub fn new() -> Self {
        Self {
            mappings: HashMap::new(),
        }
    }

    /// Parse font data and extract character mapping
    pub fn parse_font(&self, data: &[u8]) -> Result<CharMapping, FontDecryptError> {
        let face = Face::parse(data, 0)
            .map_err(|e| FontDecryptError::ParseError(e.to_string()))?;

        let mut mapping = CharMapping::new();

        // Extract CMAP table
        if let Some(cmap) = face.tables().cmap {
            for subtable in cmap.subtables {
                // Parse character to glyph mapping
                subtable.codepoints(|codepoint| {
                    if subtable.glyph_index(codepoint).is_some() {
                        // Try to get the actual character from the glyph
                        // This is a simplified approach - real font encryption
                        // requires more sophisticated analysis
                        if let Some(c) = char::from_u32(codepoint) {
                            // For now, map to itself (real implementation would
                            // analyze glyph shapes or use OCR)
                            mapping.insert(c, c);
                        }
                    }
                });
            }
        } else {
            return Err(FontDecryptError::NoCmapTable);
        }

        Ok(mapping)
    }

    /// Parse font from URL (async version for HTTP download)
    pub async fn parse_font_from_url(&self, _url: &str) -> Result<CharMapping, FontDecryptError> {
        // This would require HTTP client integration
        // For now, return an error suggesting to download first
        Err(FontDecryptError::DownloadError(
            "Use parse_font with downloaded data".to_string()
        ))
    }

    /// Decrypt text using character mapping
    pub fn decrypt(&self, text: &str, mapping: &CharMapping) -> String {
        text.chars()
            .map(|c| mapping.get(&c).copied().unwrap_or(c))
            .collect()
    }

    /// Cache a mapping for reuse
    pub fn cache_mapping(&mut self, key: String, mapping: CharMapping) {
        self.mappings.insert(key, mapping);
    }

    /// Get cached mapping
    pub fn get_cached_mapping(&self, key: &str) -> Option<&CharMapping> {
        self.mappings.get(key)
    }

    /// Build mapping from known pairs (for manual font decryption)
    pub fn build_mapping_from_pairs(&self, pairs: &[(char, char)]) -> CharMapping {
        pairs.iter().cloned().collect()
    }

    /// Analyze font for common obfuscation patterns
    pub fn analyze_obfuscation(&self, data: &[u8]) -> Result<ObfuscationAnalysis, FontDecryptError> {
        let face = Face::parse(data, 0)
            .map_err(|e| FontDecryptError::ParseError(e.to_string()))?;

        let mut analysis = ObfuscationAnalysis::default();

        // Check for suspicious patterns
        if let Some(cmap) = face.tables().cmap {
            let mut char_count = 0;
            let mut mapped_count = 0;

            for subtable in cmap.subtables {
                subtable.codepoints(|codepoint| {
                    char_count += 1;
                    if subtable.glyph_index(codepoint).is_some() {
                        mapped_count += 1;
                    }
                });
            }

            analysis.total_chars = char_count;
            analysis.mapped_chars = mapped_count;
            
            // If mapping ratio is unusual, likely obfuscated
            if char_count > 0 {
                let ratio = mapped_count as f64 / char_count as f64;
                analysis.mapping_ratio = ratio;
                analysis.is_likely_obfuscated = ratio < 0.5 || ratio > 0.95;
            }
        }

        Ok(analysis)
    }
}

impl Default for FontDecryptor {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of font obfuscation analysis
#[derive(Debug, Default)]
pub struct ObfuscationAnalysis {
    /// Total characters in font
    pub total_chars: usize,
    /// Characters with glyph mapping
    pub mapped_chars: usize,
    /// Mapping ratio
    pub mapping_ratio: f64,
    /// Whether font appears to be obfuscated
    pub is_likely_obfuscated: bool,
}

/// Simple font mapping for common Chinese novel sites
/// These are pre-built mappings for known obfuscation patterns
#[cfg(test)]
pub mod common_mappings {
    use super::CharMapping;

    /// Build a simple substitution mapping
    /// This is useful when you know the substitution pattern
    pub fn build_substitution_mapping(
        encrypted: &str,
        decrypted: &str,
    ) -> CharMapping {
        encrypted
            .chars()
            .zip(decrypted.chars())
            .collect()
    }

    /// Example: Common obfuscation pattern where characters are shifted
    pub fn build_shift_mapping(shift: i32) -> CharMapping {
        let mut mapping = CharMapping::new();
        
        // Common Chinese characters used in novels
        let common_chars = "的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题导程展五果料象员革位入情文物教被利什合化其";
        
        for c in common_chars.chars() {
            if let Some(shifted) = char::from_u32((c as u32).wrapping_add(shift as u32)) {
                mapping.insert(shifted, c);
            }
        }
        
        mapping
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_mapping_from_pairs() {
        let decryptor = FontDecryptor::new();
        let pairs = vec![('a', 'b'), ('c', 'd')];
        let mapping = decryptor.build_mapping_from_pairs(&pairs);
        
        assert_eq!(mapping.get(&'a'), Some(&'b'));
        assert_eq!(mapping.get(&'c'), Some(&'d'));
    }

    #[test]
    fn test_decrypt() {
        let decryptor = FontDecryptor::new();
        let mut mapping = CharMapping::new();
        mapping.insert('a', 'b');
        mapping.insert('c', 'd');
        
        let encrypted = "ac";
        let decrypted = decryptor.decrypt(encrypted, &mapping);
        assert_eq!(decrypted, "bd");
    }

    #[test]
    fn test_build_substitution_mapping() {
        let mapping = common_mappings::build_substitution_mapping(
            "abcdef",
            "123456"
        );
        
        assert_eq!(mapping.get(&'a'), Some(&'1'));
        assert_eq!(mapping.get(&'f'), Some(&'6'));
    }
}
