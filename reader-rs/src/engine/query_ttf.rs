//! QueryTTF - Font parser for anti-crawl measures
//!
//! Some book sources use custom TTF fonts to obfuscate text.
//! This module provides tools to parse and decode such fonts.
//!
//! Main functionality:
//! - Parse TTF font files to extract glyph-to-unicode mappings
//! - Replace characters using font mapping between two fonts
//!
//! Usage in JavaScript:
//! ```js
//! var font1 = java.queryTTF("http://example.com/font.ttf");
//! var font2 = java.queryTTF("http://example.com/standard.ttf");
//! var decoded = java.replaceFont(encodedText, font1, font2);
//! ```

use std::collections::HashMap;
use std::hash::{Hash, Hasher};

/// TTF font parser and glyph mapper
#[derive(Clone, Default)]
pub struct QueryTTF {
    /// Unicode codepoint -> Glyph ID
    cmap: HashMap<u32, u16>,
    /// Glyph ID -> Unicode codepoint (reverse mapping)
    glyph_to_code: HashMap<u16, u32>,
    /// Glyph shape hash for cross-font matching
    glyph_hashes: HashMap<u16, u64>,
    /// Valid unicode range start
    range_start: u32,
    /// Valid unicode range end
    range_end: u32,
}

impl QueryTTF {
    /// Create a new QueryTTF from font data bytes
    pub fn new(font_data: &[u8]) -> Option<Self> {
        use ttf_parser::Face;
        
        let face = Face::parse(font_data, 0).ok()?;
        
        let mut qtf = QueryTTF::default();
        let mut min_code = u32::MAX;
        let mut max_code = u32::MIN;
        
        // Build cmap from font
        // Iterate through common unicode ranges used for text
        for codepoint in 0x0020..0xFFFF_u32 {
            if let Some(ch) = char::from_u32(codepoint) {
                if let Some(glyph_id) = face.glyph_index(ch) {
                    let id = glyph_id.0;
                    if id > 0 {
                        qtf.cmap.insert(codepoint, id);
                        qtf.glyph_to_code.insert(id, codepoint);
                        
                        // Calculate glyph shape hash
                        let hash = Self::calculate_glyph_hash(&face, glyph_id);
                        qtf.glyph_hashes.insert(id, hash);
                        
                        if codepoint < min_code { min_code = codepoint; }
                        if codepoint > max_code { max_code = codepoint; }
                    }
                }
            }
        }
        
        qtf.range_start = min_code;
        qtf.range_end = max_code;
        
        if qtf.cmap.is_empty() {
            return None;
        }
        
        Some(qtf)
    }
    
    /// Calculate a hash for a glyph's shape
    fn calculate_glyph_hash(face: &ttf_parser::Face, glyph_id: ttf_parser::GlyphId) -> u64 {
        use std::collections::hash_map::DefaultHasher;
        
        let mut hasher = DefaultHasher::new();
        
        // Use bounding box and advance width as shape signature
        if let Some(bbox) = face.glyph_bounding_box(glyph_id) {
            bbox.x_min.hash(&mut hasher);
            bbox.y_min.hash(&mut hasher);
            bbox.x_max.hash(&mut hasher);
            bbox.y_max.hash(&mut hasher);
        }
        
        if let Some(advance) = face.glyph_hor_advance(glyph_id) {
            advance.hash(&mut hasher);
        }
        
        // Outline points for more accuracy
        struct OutlineHasher<'a> {
            hasher: &'a mut DefaultHasher,
        }
        
        impl ttf_parser::OutlineBuilder for OutlineHasher<'_> {
            fn move_to(&mut self, x: f32, y: f32) {
                (x as i32).hash(self.hasher);
                (y as i32).hash(self.hasher);
            }
            fn line_to(&mut self, x: f32, y: f32) {
                (x as i32).hash(self.hasher);
                (y as i32).hash(self.hasher);
            }
            fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
                (x1 as i32).hash(self.hasher);
                (y1 as i32).hash(self.hasher);
                (x as i32).hash(self.hasher);
                (y as i32).hash(self.hasher);
            }
            fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
                (x1 as i32).hash(self.hasher);
                (y1 as i32).hash(self.hasher);
                (x2 as i32).hash(self.hasher);
                (y2 as i32).hash(self.hasher);
                (x as i32).hash(self.hasher);
                (y as i32).hash(self.hasher);
            }
            fn close(&mut self) {}
        }
        
        let mut outline_hasher = OutlineHasher { hasher: &mut hasher };
        let _ = face.outline_glyph(glyph_id, &mut outline_hasher);
        
        hasher.finish()
    }
    
    /// Check if a character is within the font's defined range
    pub fn in_limit(&self, c: char) -> bool {
        let code = c as u32;
        code >= self.range_start && code <= self.range_end && self.cmap.contains_key(&code)
    }
    
    /// Get glyph ID for a unicode codepoint
    pub fn get_glyph_by_code(&self, code: u32) -> Option<u16> {
        self.cmap.get(&code).copied()
    }
    
    /// Get unicode codepoint for a glyph ID
    pub fn get_code_by_glyph(&self, glyph_id: u16) -> Option<u32> {
        self.glyph_to_code.get(&glyph_id).copied()
    }
    
    /// Get shape hash for a glyph
    pub fn get_glyph_hash(&self, glyph_id: u16) -> Option<u64> {
        self.glyph_hashes.get(&glyph_id).copied()
    }
    
    /// Find glyph by shape hash in this font
    pub fn find_glyph_by_hash(&self, hash: u64) -> Option<u16> {
        for (&glyph_id, &h) in &self.glyph_hashes {
            if h == hash {
                return Some(glyph_id);
            }
        }
        None
    }
    
    /// Get number of mapped glyphs
    pub fn len(&self) -> usize {
        self.cmap.len()
    }
    
    /// Check if font is empty
    pub fn is_empty(&self) -> bool {
        self.cmap.is_empty()
    }
}

/// Replace characters in text using font mapping
/// 
/// Given text encoded with font1, decode it using font2 as reference
pub fn replace_font(text: &str, font1: &QueryTTF, font2: &QueryTTF) -> String {
    text.chars().map(|c| {
        // If character is in font1's range
        if font1.in_limit(c) {
            let code = c as u32;
            
            // Get the glyph ID and its shape hash from font1
            if let Some(glyph_id) = font1.get_glyph_by_code(code) {
                if let Some(hash) = font1.get_glyph_hash(glyph_id) {
                    // Find the same shape in font2
                    if let Some(font2_glyph) = font2.find_glyph_by_hash(hash) {
                        // Get the correct unicode for this glyph in font2
                        if let Some(correct_code) = font2.get_code_by_glyph(font2_glyph) {
                            if let Some(correct_char) = char::from_u32(correct_code) {
                                return correct_char;
                            }
                        }
                    }
                }
            }
        }
        c
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_query_ttf_empty() {
        let qtf = QueryTTF::new(&[]);
        assert!(qtf.is_none());
    }
    
    #[test]
    fn test_default_query_ttf() {
        let qtf = QueryTTF::default();
        assert!(qtf.is_empty());
        assert_eq!(qtf.len(), 0);
    }
}
