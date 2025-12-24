/// Robustly resolve an absolute URL from a base and a relative path.
/// 
/// If the base is not a valid URL (e.g. it's an ID like "DQuestQBall"),
/// it returns the URL as-is if it's already absolute, otherwise it returns
/// the original relative URL to avoid "DQuestQBall/path" errors.
pub fn resolve_absolute_url(base: &str, url: &str) -> String {
    let url = url.trim();
    let base = base.trim();

    // If the URL is already absolute, or starts with //, return it (with protocol added if //)
    if url.starts_with("http://") || url.starts_with("https://") {
        return url.to_string();
    }
    
    if url.starts_with("//") {
        return format!("https:{}", url);
    }

    // If base is not a real URL (e.g. just an ID "DQuestQBall"),
    // and the input URL is a path, we can't reliably make it absolute.
    // In this case, just return the URL as is to avoid "DQuestQBall/path"
    if !base.contains("://") {
        return url.to_string();
    }
    
    if url.starts_with('/') {
        // Get base domain
        if let Some(slash_pos) = base.find("://") {
            let after_proto = &base[slash_pos + 3..];
            if let Some(path_pos) = after_proto.find('/') {
                let domain = &base[..slash_pos + 3 + path_pos];
                return format!("{}{}", domain, url);
            } else {
                // Base URL is just a domain like https://example.com
                return format!("{}{}", base.trim_end_matches('/'), url);
            }
        }
    }
    
    // Relative URL
    if base.ends_with('/') {
        format!("{}{}", base, url)
    } else {
        // Check if we should append to the directory or the file
        // For common reading site patterns, if base has a slash but doesn't end with it,
        // it's likely a file.
        if let Some(pos) = base.rfind('/') {
            if pos > base.find("://").unwrap_or(0) + 2 {
                return format!("{}/{}", &base[..pos], url);
            }
        }
        format!("{}/{}", base, url)
    }
}

/// Purify HTML content by removing scripts, styles, and extracting readable text
pub fn purify_content(html: &str) -> String {
    use scraper::{Html, Selector};
    
    let doc = Html::parse_fragment(html);
    let mut lines: Vec<String> = Vec::new();
    
    // Try to find content paragraphs first
    if let Ok(p_selector) = Selector::parse("p") {
        for element in doc.select(&p_selector) {
            let text: String = element.text().collect::<Vec<_>>().join(" ");
            let text = text.trim();
            if !text.is_empty() && text.len() > 10 {
                lines.push(text.to_string());
            }
        }
    }
    
    // If no paragraphs, extract all text nodes
    if lines.is_empty() {
        for node in doc.tree.nodes() {
            if let Some(text) = node.value().as_text() {
                let text = text.trim();
                if !text.is_empty() && text.len() > 5 {
                    lines.push(text.to_string());
                }
            }
        }
    }
    
    lines.join("\n\n")
}

/// Extract image URLs from HTML, handling lazy-load attributes
pub fn extract_images(html: &str) -> Vec<String> {
    use scraper::{Html, Selector};
    
    let doc = Html::parse_fragment(html);
    let mut images: Vec<String> = Vec::new();
    
    if let Ok(img_selector) = Selector::parse("img") {
        for element in doc.select(&img_selector) {
            // Try multiple attributes for lazy-loaded images
            let src = element.value().attr("data-src")
                .or_else(|| element.value().attr("data-original"))
                .or_else(|| element.value().attr("data-lazy-src"))
                .or_else(|| element.value().attr("src"));
            
            if let Some(url) = src {
                if !url.is_empty() && !url.starts_with("data:") {
                    images.push(url.to_string());
                }
            }
        }
    }
    
    images
}

/// Convert Chinese numerals to Arabic numbers
/// E.g., "一" -> 1, "十二" -> 12, "一百二十三" -> 123
fn chinese_to_number(s: &str) -> Option<u32> {
    let chars: Vec<char> = s.chars().collect();
    if chars.is_empty() {
        return None;
    }
    
    let mut result = 0u32;
    let mut temp = 0u32;
    
    for c in chars {
        match c {
            '零' => {},
            '一' | '壹' => temp = 1,
            '二' | '贰' | '两' => temp = 2,
            '三' | '叁' => temp = 3,
            '四' | '肆' => temp = 4,
            '五' | '伍' => temp = 5,
            '六' | '陆' => temp = 6,
            '七' | '柒' => temp = 7,
            '八' | '捌' => temp = 8,
            '九' | '玖' => temp = 9,
            '十' | '拾' => {
                if temp == 0 { temp = 1; }
                temp *= 10;
                result += temp;
                temp = 0;
            },
            '百' | '佰' => {
                if temp == 0 { temp = 1; }
                temp *= 100;
                result += temp;
                temp = 0;
            },
            '千' | '仟' => {
                if temp == 0 { temp = 1; }
                temp *= 1000;
                result += temp;
                temp = 0;
            },
            _ => return None,
        }
    }
    
    Some(result + temp)
}

/// Convert chapter title with Chinese numerals to Arabic numbers
/// E.g., "第一章" -> "第1章", "第十二章" -> "第12章"
pub fn to_num_chapter(s: &str) -> String {
    let re = regex::Regex::new(r"(第)(.+?)(章|节|回|卷)").unwrap();
    
    re.replace(s, |caps: &regex::Captures| {
        let prefix = &caps[1];
        let num_str = &caps[2];
        let suffix = &caps[3];
        
        // Try to convert Chinese numerals
        if let Some(num) = chinese_to_number(num_str) {
            format!("{}{}{}", prefix, num, suffix)
        } else {
            // Not Chinese numerals, return as-is
            caps[0].to_string()
        }
    }).to_string()
}
