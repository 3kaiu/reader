#![allow(dead_code)]
//! Image processing pipeline for comic book sources
//!
//! Implements Legado-style `prepareImage` and `processImage` hooks:
//!
//! - **prepareImage** (download hook): rewrite image URL, inject custom headers
//!   (Referer, Origin, Cookie) before the Rust-level download.
//!
//! - **processImage** (post-download hook): decode, transform (reassemble strips,
//!   remove watermarks, decrypt), and re-encode images.
//!
//! Execution flow:
//!   1. prepareImage (serial, per-page) — determine final URL + headers
//!   2. Rust concurrent download (tokio)
//!   3. processImage (serial, per-page) — transform decoded image

use image::DynamicImage;
use std::collections::HashMap;

/// Result from prepareImage hook
pub struct PrepareImageResult {
    /// Override download URL; None = use original URL
    pub url: Option<String>,
    /// Extra/mutated request headers (merged with defaults)
    pub headers: HashMap<String, String>,
}

/// Configuration for a single image download + processing
pub struct ImageDownloadConfig {
    pub original_url: String,
    pub page_index: usize,
    pub chapter_url: String,
    pub base_url: String,
    /// Custom headers from the source (e.g. Referer, Origin)
    pub source_headers: HashMap<String, String>,
}

/// Result of the full image download + process pipeline
pub struct ProcessedImage {
    pub data: Vec<u8>,
    pub format: ImageFormat,
    pub original_url: String,
    pub page_index: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Jpeg,
    Png,
    Gif,
    WebP,
    Unknown,
}

impl ImageFormat {
    // No public methods currently needed; format is determined at runtime
}

/// Build default image request headers (matching Legado Tauri behavior)
pub fn default_image_headers(
    chapter_url: &str,
    base_url: &str,
    user_agent: Option<&str>,
) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    headers.insert(
        "User-Agent".to_string(),
        user_agent.unwrap_or(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
             AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ).to_string(),
    );
    headers.insert(
        "Accept".to_string(),
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8".to_string(),
    );
    // Use chapter URL as Referer (if it's an HTTP URL)
    if chapter_url.starts_with("http://") || chapter_url.starts_with("https://") {
        headers.insert("Referer".to_string(), chapter_url.to_string());
    } else {
        headers.insert("Referer".to_string(), base_url.to_string());
    }
    headers
}

/// Apply prepareImage logic: if the source defines a `prepareImage` JavaScript
/// function, we simulate its effect here. For now, this is a Rust-level
/// implementation of the common patterns.
///
/// Returns (url, headers) where url may be overridden.
pub fn apply_prepare_image(
    config: &ImageDownloadConfig,
    override_url: Option<String>,
    override_headers: Option<HashMap<String, String>>,
) -> (String, HashMap<String, String>) {
    let mut headers = default_image_headers(&config.chapter_url, &config.base_url, None);

    // Merge source-level headers (e.g. Referer/Origin from book source)
    for (k, v) in &config.source_headers {
        headers.insert(k.to_string(), v.to_string());
    }

    // Merge override headers (from prepareImage)
    if let Some(extra) = override_headers {
        for (k, v) in extra {
            headers.insert(k, v);
        }
    }

    let url = override_url.unwrap_or_else(|| config.original_url.clone());

    // Remove fragment from URL before returning (Rust download doesn't send it)
    let clean_url = url.split('#').next().unwrap_or(&url).to_string();

    (clean_url, headers)
}

/// Decode image bytes into a DynamicImage
pub fn decode_image(data: &[u8]) -> Result<DynamicImage, String> {
    image::load_from_memory(data).map_err(|e| format!("Image decode failed: {}", e))
}

/// Encode DynamicImage back to bytes in the specified format
pub fn encode_image(img: &DynamicImage, format: ImageFormat, _quality: u8) -> Result<Vec<u8>, String> {
    let mut buf = std::io::Cursor::new(Vec::new());

    match format {
        ImageFormat::Jpeg => {
            img.write_to(&mut buf, image::ImageFormat::Jpeg)
                .map_err(|e| format!("JPEG encode failed: {}", e))?;
        }
        ImageFormat::Png => {
            img.write_to(&mut buf, image::ImageFormat::Png)
                .map_err(|e| format!("PNG encode failed: {}", e))?;
        }
        ImageFormat::Gif => {
            img.write_to(&mut buf, image::ImageFormat::Gif)
                .map_err(|e| format!("GIF encode failed: {}", e))?;
        }
        ImageFormat::WebP => {
            // WebP encoding is not supported by the `image` crate directly.
            // Fall back to PNG.
            img.write_to(&mut buf, image::ImageFormat::Png)
                .map_err(|e| format!("WebP fallback to PNG encode failed: {}", e))?;
        }
        ImageFormat::Unknown => {
            // Default to PNG for unknown formats
            img.write_to(&mut buf, image::ImageFormat::Png)
                .map_err(|e| format!("Unknown format fallback to PNG encode failed: {}", e))?;
        }
    }

    Ok(buf.into_inner())
}

/// Reassemble image strips (Legado's common comic decryption pattern).
///
/// Some comic sites split an image into N horizontal strips and shuffle them.
/// `order` specifies the correct strip order (0-indexed positions).
/// Returns the reassembled image.
pub fn reassemble_strips(img: &DynamicImage, order: &[usize]) -> Result<DynamicImage, String> {
    if order.is_empty() {
        return Ok(img.clone());
    }

    let (width, height) = (img.width(), img.height());
    let strip_count = order.len() as u32;
    let strip_height = height / strip_count;

    // Create destination image
    let mut dest = DynamicImage::new_rgba8(width, height);
    let _dest_rgba = dest.as_mut_rgba8().ok_or("Failed to get RGBA mut buffer")?;

    for (dest_idx, &src_idx) in order.iter().enumerate() {
        let src_y = src_idx as u32 * strip_height;
        let dest_y = dest_idx as u32 * strip_height;

        if src_y + strip_height > height || dest_y + strip_height > height {
            continue; // skip out-of-bounds strips
        }

        let strip = img.crop_imm(0, src_y, width, strip_height);
        image::imageops::overlay(&mut dest, &strip, 0, dest_y as i64);
    }

    Ok(dest)
}

/// Remove a watermark region from the image by filling with nearby content.
/// Simple implementation: fill the watermark region with a solid color
/// sampled from the edge.
pub fn remove_watermark(
    img: &DynamicImage,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> DynamicImage {
    let mut result = img.clone();
    let rgba = result.as_mut_rgba8();
    let (img_w, img_h) = (img.width(), img.height());

    if let Some(buf) = rgba {
        // Sample a pixel just above the watermark region
        let sample_y = if y > 5 { y - 5 } else { (y + h + 5).min(img_h - 1) };
        let sample_pixel = if sample_y < img_h {
            *buf.get_pixel(x + 10, sample_y)
        } else {
            image::Rgba([255, 255, 255, 255])
        };

        for py in y..(y + h).min(img_h) {
            for px in x..(x + w).min(img_w) {
                buf.put_pixel(px, py, sample_pixel);
            }
        }
    }

    result
}

/// Apply a simple image style transformation.
/// Supported styles:
/// - "grayscale": convert to grayscale
/// - "invert": invert colors
/// - "brightness_N": adjust brightness (N = 0-200, 100 = no change)
/// - "contrast_N": adjust contrast (N = 0-200, 100 = no change)
pub fn apply_image_style(img: &DynamicImage, style: &str) -> Result<DynamicImage, String> {
    match style {
        "grayscale" | "gray" => Ok(img.grayscale()),
        "invert" => {
            let mut inverted = img.clone();
            // Manual invert via RGBA buffer
            if let Some(buf) = inverted.as_mut_rgba8() {
                for pixel in buf.pixels_mut() {
                    pixel.0[0] = 255 - pixel.0[0];
                    pixel.0[1] = 255 - pixel.0[1];
                    pixel.0[2] = 255 - pixel.0[2];
                }
            }
            Ok(inverted)
        }
        s if s.starts_with("brightness_") => {
            let val: f32 = s.trim_start_matches("brightness_")
                .parse()
                .map_err(|_| format!("Invalid brightness value: {}", s))?;
            let factor = val / 100.0;
            let mut result = img.clone();
            if let Some(buf) = result.as_mut_rgba8() {
                for pixel in buf.pixels_mut() {
                    for c in 0..3 {
                        pixel.0[c] = (pixel.0[c] as f32 * factor).min(255.0).max(0.0) as u8;
                    }
                }
            }
            Ok(result)
        }
        s if s.starts_with("contrast_") => {
            let val: f32 = s.trim_start_matches("contrast_")
                .parse()
                .map_err(|_| format!("Invalid contrast value: {}", s))?;
            let factor = val / 100.0;
            let mut result = img.clone();
            if let Some(buf) = result.as_mut_rgba8() {
                for pixel in buf.pixels_mut() {
                    for c in 0..3 {
                        let v = pixel.0[c] as f32;
                        let adjusted = ((v / 255.0 - 0.5) * factor + 0.5) * 255.0;
                        pixel.0[c] = adjusted.min(255.0).max(0.0) as u8;
                    }
                }
            }
            Ok(result)
        }
        _ => {
            // Unknown style, return original
            Ok(img.clone())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_image_headers() {
        let headers = default_image_headers(
            "https://example.com/chapter/1",
            "https://example.com",
            None,
        );
        assert!(headers.contains_key("Referer"));
        assert_eq!(headers.get("Referer").unwrap(), "https://example.com/chapter/1");
        assert!(headers.contains_key("User-Agent"));
        assert!(headers.contains_key("Accept"));
    }

    #[test]
    fn test_apply_prepare_image() {
        let config = ImageDownloadConfig {
            original_url: "https://example.com/img/001.jpg#fragment".to_string(),
            page_index: 0,
            chapter_url: "https://example.com/chapter/1".to_string(),
            base_url: "https://example.com".to_string(),
            source_headers: HashMap::new(),
        };

        let (url, _) = apply_prepare_image(&config, None, None);
        // Fragment should be stripped
        assert_eq!(url, "https://example.com/img/001.jpg");
    }

    #[test]
    fn test_apply_prepare_image_with_override() {
        let config = ImageDownloadConfig {
            original_url: "https://example.com/img/001.jpg".to_string(),
            page_index: 0,
            chapter_url: "https://example.com/chapter/1".to_string(),
            base_url: "https://example.com".to_string(),
            source_headers: {
                let mut h = HashMap::new();
                h.insert("Referer".to_string(), "https://example.com/".to_string());
                h
            },
        };

        let mut override_headers = HashMap::new();
        override_headers.insert("Authorization".to_string(), "Bearer token123".to_string());

        let (url, headers) = apply_prepare_image(&config, Some("https://cdn.example.com/img/001.jpg".to_string()), Some(override_headers));
        assert_eq!(url, "https://cdn.example.com/img/001.jpg");
        assert_eq!(headers.get("Authorization").unwrap(), "Bearer token123");
        assert_eq!(headers.get("Referer").unwrap(), "https://example.com/");
    }

    #[test]
    fn test_reassemble_strips() {
        // Create a simple 100x100 test image
        let img = DynamicImage::new_rgba8(100, 100);
        // Order: [2, 1, 0] means reverse the strips
        let result = reassemble_strips(&img, &[2, 1, 0]).unwrap();
        assert_eq!(result.width(), 100);
        assert_eq!(result.height(), 100);
    }

    #[test]
    fn test_remove_watermark() {
        let img = DynamicImage::new_rgba8(200, 200);
        let result = remove_watermark(&img, 50, 50, 100, 20);
        assert_eq!(result.width(), 200);
        assert_eq!(result.height(), 200);
    }

    #[test]
    fn test_apply_image_style_grayscale() {
        let img = DynamicImage::new_rgba8(10, 10);
        let result = apply_image_style(&img, "grayscale").unwrap();
        // Grayscale output should have same dimensions
        assert_eq!(result.width(), 10);
        assert_eq!(result.height(), 10);
    }

    #[test]
    fn test_apply_image_style_unknown() {
        let img = DynamicImage::new_rgba8(10, 10);
        let result = apply_image_style(&img, "unknown_style").unwrap();
        assert_eq!(result.width(), 10);
        assert_eq!(result.height(), 10);
    }
}