//! Visual Feature Extraction Module
//!
//! Extract CSS style and layout information from HTML elements.
//! Helps identify content vs non-content based on visual presentation.

use scraper::ElementRef;
use std::collections::HashMap;

/// Visual features extracted from an element
#[derive(Debug, Clone, Default)]
pub struct VisualFeatures {
    // Font properties
    pub font_size: Option<f32>,
    pub font_weight: Option<u32>,
    pub font_family: Option<String>,
    pub line_height: Option<f32>,
    pub letter_spacing: Option<f32>,

    // Layout properties
    pub display: Option<String>,
    pub visibility: Option<String>,
    pub position: Option<String>,
    pub float: Option<String>,

    // Spacing
    pub margin_top: Option<f32>,
    pub margin_bottom: Option<f32>,
    pub padding_top: Option<f32>,
    pub padding_bottom: Option<f32>,

    // Colors
    pub color: Option<String>,
    pub background_color: Option<String>,
    pub background_image: Option<String>,

    // Dimensions
    pub width: Option<String>,
    pub height: Option<String>,
    pub max_width: Option<String>,
    pub min_width: Option<String>,

    // Alignment
    pub text_align: Option<String>,
    pub vertical_align: Option<String>,

    // Other
    pub overflow: Option<String>,
    pub z_index: Option<i32>,
    pub opacity: Option<f32>,
}

impl VisualFeatures {
    /// Check if element is likely hidden based on visual properties
    pub fn is_hidden(&self) -> bool {
        if let Some(visibility) = &self.visibility {
            if visibility == "hidden" {
                return true;
            }
        }

        if let Some(display) = &self.display {
            if display == "none" {
                return true;
            }
        }

        if let Some(opacity) = self.opacity {
            if opacity < 0.1 {
                return true;
            }
        }

        false
    }

    /// Check if element is likely a sidebar or navigation based on visual properties
    pub fn is_sidebar(&self) -> bool {
        if let Some(width) = &self.width {
            if width.ends_with("px") {
                if let Ok(w) = width.trim_end_matches("px").parse::<f32>() {
                    if w < 300.0 {
                        return true;
                    }
                }
            }
        }

        if let Some(float) = &self.float {
            if float == "left" || float == "right" {
                return true;
            }
        }

        false
    }

    /// Check if element is likely a header or footer based on visual properties
    pub fn is_header_footer(&self) -> bool {
        if let Some(position) = &self.position {
            if position == "fixed" || position == "absolute" {
                if let Some(top) = self.margin_top {
                    if top == 0.0 {
                        return true;
                    }
                }
                if let Some(bottom) = self.margin_bottom {
                    if bottom == 0.0 {
                        return true;
                    }
                }
            }
        }

        false
    }

    /// Calculate a visual quality score for content
    pub fn quality_score(&self) -> f64 {
        let mut score = 0.0;

        // Font size: optimal range is 14-18px for reading
        if let Some(font_size) = self.font_size {
            if font_size >= 14.0 && font_size <= 18.0 {
                score += 50.0;
            } else if font_size >= 12.0 && font_size <= 20.0 {
                score += 30.0;
            } else if font_size < 12.0 {
                score -= 20.0;
            }
        }

        // Line height: optimal is 1.5-2.0
        if let Some(line_height) = self.line_height {
            if line_height >= 1.5 && line_height <= 2.0 {
                score += 30.0;
            } else if line_height >= 1.3 && line_height <= 2.5 {
                score += 15.0;
            }
        }

        // Text alignment: left or justify is good for content
        if let Some(text_align) = &self.text_align {
            if text_align == "left" || text_align == "justify" {
                score += 20.0;
            } else if text_align == "center" {
                score -= 10.0;
            }
        }

        // Penalize sidebar-like properties
        if self.is_sidebar() {
            score -= 100.0;
        }

        // Penalize header/footer-like properties
        if self.is_header_footer() {
            score -= 80.0;
        }

        // Penalize hidden elements
        if self.is_hidden() {
            score -= 200.0;
        }

        score
    }
}

/// Extract visual features from an HTML element
pub struct VisualFeatureExtractor;

impl VisualFeatureExtractor {
    pub fn new() -> Self {
        Self
    }

    /// Extract visual features from an element
    pub fn extract(&self, el: &ElementRef) -> VisualFeatures {
        let mut features = VisualFeatures::default();

        // Extract inline style
        if let Some(style) = el.value().attr("style") {
            let style_map = self.parse_style(style);
            self.apply_style_map(&mut features, &style_map);
        }

        // Extract class-based styles (simplified - would need CSS parser for full support)
        if let Some(class) = el.value().attr("class") {
            self.apply_class_hints(&mut features, class);
        }

        features
    }

    /// Parse CSS style string into a map
    fn parse_style(&self, style: &str) -> HashMap<String, String> {
        let mut map = HashMap::new();

        for declaration in style.split(';') {
            let declaration = declaration.trim();
            if declaration.is_empty() {
                continue;
            }

            if let Some((property, value)) = declaration.split_once(':') {
                let property = property.trim().to_lowercase();
                let value = value.trim().to_lowercase();
                map.insert(property, value);
            }
        }

        map
    }

    /// Apply style map to visual features
    fn apply_style_map(&self, features: &mut VisualFeatures, style_map: &HashMap<String, String>) {
        // Font properties
        if let Some(value) = style_map.get("font-size") {
            features.font_size = self.parse_font_size(value);
        }

        if let Some(value) = style_map.get("font-weight") {
            features.font_weight = self.parse_font_weight(value);
        }

        if let Some(value) = style_map.get("font-family") {
            features.font_family = Some(value.clone());
        }

        if let Some(value) = style_map.get("line-height") {
            features.line_height = self.parse_length(value);
        }

        if let Some(value) = style_map.get("letter-spacing") {
            features.letter_spacing = self.parse_length(value);
        }

        // Layout properties
        if let Some(value) = style_map.get("display") {
            features.display = Some(value.clone());
        }

        if let Some(value) = style_map.get("visibility") {
            features.visibility = Some(value.clone());
        }

        if let Some(value) = style_map.get("position") {
            features.position = Some(value.clone());
        }

        if let Some(value) = style_map.get("float") {
            features.float = Some(value.clone());
        }

        // Spacing
        if let Some(value) = style_map.get("margin-top") {
            features.margin_top = self.parse_length(value);
        }

        if let Some(value) = style_map.get("margin-bottom") {
            features.margin_bottom = self.parse_length(value);
        }

        if let Some(value) = style_map.get("padding-top") {
            features.padding_top = self.parse_length(value);
        }

        if let Some(value) = style_map.get("padding-bottom") {
            features.padding_bottom = self.parse_length(value);
        }

        // Colors
        if let Some(value) = style_map.get("color") {
            features.color = Some(value.clone());
        }

        if let Some(value) = style_map.get("background-color") {
            features.background_color = Some(value.clone());
        }

        if let Some(value) = style_map.get("background-image") {
            features.background_image = Some(value.clone());
        }

        // Dimensions
        if let Some(value) = style_map.get("width") {
            features.width = Some(value.clone());
        }

        if let Some(value) = style_map.get("height") {
            features.height = Some(value.clone());
        }

        if let Some(value) = style_map.get("max-width") {
            features.max_width = Some(value.clone());
        }

        if let Some(value) = style_map.get("min-width") {
            features.min_width = Some(value.clone());
        }

        // Alignment
        if let Some(value) = style_map.get("text-align") {
            features.text_align = Some(value.clone());
        }

        if let Some(value) = style_map.get("vertical-align") {
            features.vertical_align = Some(value.clone());
        }

        // Other
        if let Some(value) = style_map.get("overflow") {
            features.overflow = Some(value.clone());
        }

        if let Some(value) = style_map.get("z-index") {
            features.z_index = value.parse().ok();
        }

        if let Some(value) = style_map.get("opacity") {
            features.opacity = value.parse().ok();
        }
    }

    /// Apply class-based hints (simplified)
    fn apply_class_hints(&self, features: &mut VisualFeatures, class: &str) {
        let classes: Vec<&str> = class.split_whitespace().collect();

        for class_name in classes {
            let class_name = class_name.to_lowercase();

            // Hidden classes
            if class_name.contains("hidden") || class_name == "sr-only" {
                features.visibility = Some("hidden".to_string());
            }

            // Sidebar classes
            if class_name.contains("sidebar") || class_name.contains("aside") {
                features.width = Some("250px".to_string());
            }

            // Header/footer classes
            if class_name.contains("header") || class_name.contains("footer") {
                features.position = Some("fixed".to_string());
            }

            // Navigation classes
            if class_name.contains("nav") {
                features.display = Some("block".to_string());
            }

            // Content classes
            if class_name.contains("content") || class_name.contains("article") {
                features.display = Some("block".to_string());
            }
        }
    }

    /// Parse font size value
    fn parse_font_size(&self, value: &str) -> Option<f32> {
        let value = value.trim();

        // Handle px values
        if value.ends_with("px") {
            return value.trim_end_matches("px").parse().ok();
        }

        // Handle em values (assuming base font size of 16px)
        if value.ends_with("em") {
            if let Ok(em) = value.trim_end_matches("em").parse::<f32>() {
                return Some(em * 16.0);
            }
        }

        // Handle rem values (assuming root font size of 16px)
        if value.ends_with("rem") {
            if let Ok(rem) = value.trim_end_matches("rem").parse::<f32>() {
                return Some(rem * 16.0);
            }
        }

        // Handle percentage values
        if value.ends_with("%") {
            if let Ok(percent) = value.trim_end_matches("%").parse::<f32>() {
                return Some(percent * 0.16);
            }
        }

        // Handle named font sizes
        match value {
            "xx-small" => Some(10.0),
            "x-small" => Some(12.0),
            "small" => Some(13.0),
            "medium" => Some(16.0),
            "large" => Some(18.0),
            "x-large" => Some(24.0),
            "xx-large" => Some(32.0),
            _ => None,
        }
    }

    /// Parse font weight value
    fn parse_font_weight(&self, value: &str) -> Option<u32> {
        let value = value.trim();

        match value {
            "normal" => Some(400),
            "bold" => Some(700),
            "lighter" => Some(300),
            "bolder" => Some(900),
            _ => value.parse().ok(),
        }
    }

    /// Parse length value (px, em, rem, %)
    fn parse_length(&self, value: &str) -> Option<f32> {
        let value = value.trim();

        if value.ends_with("px") {
            return value.trim_end_matches("px").parse().ok();
        }

        if value.ends_with("em") {
            if let Ok(em) = value.trim_end_matches("em").parse::<f32>() {
                return Some(em * 16.0);
            }
        }

        if value.ends_with("rem") {
            if let Ok(rem) = value.trim_end_matches("rem").parse::<f32>() {
                return Some(rem * 16.0);
            }
        }

        if value.ends_with("%") {
            if let Ok(percent) = value.trim_end_matches("%").parse::<f32>() {
                return Some(percent / 100.0 * 16.0);
            }
        }

        value.parse().ok()
    }
}

impl Default for VisualFeatureExtractor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use scraper::Html;

    #[test]
    fn test_visual_feature_extraction() {
        let extractor = VisualFeatureExtractor::new();
        let html = Html::parse_fragment(
            r#"<div style="font-size: 16px; line-height: 1.5; color: #333;">
                Test content
            </div>"#,
        );

        let el = html.select(&scraper::Selector::parse("div").unwrap()).next().unwrap();
        let features = extractor.extract(&el);

        assert_eq!(features.font_size, Some(16.0));
        assert_eq!(features.line_height, Some(1.5));
        assert_eq!(features.color, Some("#333".to_string()));
    }

    #[test]
    fn test_hidden_detection() {
        let extractor = VisualFeatureExtractor::new();
        let html = Html::parse_fragment(
            r#"<div style="display: none;">
                Hidden content
            </div>"#,
        );

        let el = html.select(&scraper::Selector::parse("div").unwrap()).next().unwrap();
        let features = extractor.extract(&el);

        assert!(features.is_hidden());
    }

    #[test]
    fn test_quality_score() {
        let extractor = VisualFeatureExtractor::new();
        let html = Html::parse_fragment(
            r#"<div style="font-size: 16px; line-height: 1.5; text-align: left;">
                Good content
            </div>"#,
        );

        let el = html.select(&scraper::Selector::parse("div").unwrap()).next().unwrap();
        let features = extractor.extract(&el);

        let score = features.quality_score();
        assert!(score > 0.0);
    }

    #[test]
    fn test_sidebar_detection() {
        let extractor = VisualFeatureExtractor::new();
        let html = Html::parse_fragment(
            r#"<div style="width: 250px; float: left;">
                Sidebar content
            </div>"#,
        );

        let el = html.select(&scraper::Selector::parse("div").unwrap()).next().unwrap();
        let features = extractor.extract(&el);

        assert!(features.is_sidebar());
    }
}
