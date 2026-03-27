//! CloudScraper 测试脚本
//! 测试访问 69shuba.com 并搜索《方仙外道》

use cloudscraper_rs::CloudScraper;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== CloudScraper 测试: 69shuba.com ===\n");
    
    // 创建 CloudScraper 实例
    println!("[1] 创建 CloudScraper 实例...");
    let scraper = CloudScraper::new()?;
    println!("✓ CloudScraper 创建成功\n");
    
    // 测试目标 URL
    let base_url = "https://www.69shuba.com/";
    
    // 步骤1: 访问首页
    println!("[2] 访问首页: {}", base_url);
    let response = scraper.get(base_url).await?;
    
    let status = response.status();
    println!("  状态码: {}", status);
    
    let headers = response.headers().clone();
    println!("  CF-Ray: {:?}", headers.get("cf-ray"));
    
    let body = response.text().await?;
    println!("  响应长度: {} bytes", body.len());
    
    // 检查是否有 CF 保护
    let has_cf = is_cf_protected(status, &body, &headers);
    if has_cf {
        println!("  ⚠ 检测到 CF 保护");
    } else {
        println!("  ✓ 无 CF 保护");
    }
    println!();
    
    // 步骤2: 搜索《方仙外道》
    println!("[3] 搜索《方仙外道》...");
    // URL 编码: 方仙外道 = %E6%96%B9%E4%BB%99%E5%A4%96%E9%81%93
    let search_url = "https://www.69shuba.com/modules/article/search.php?searchkey=%E6%96%B9%E4%BB%99%E5%A4%96%E9%81%93";
    
    let response = scraper.get(search_url).await?;
    let status = response.status();
    println!("  状态码: {}", status);
    
    let headers = response.headers().clone();
    println!("  CF-Ray: {:?}", headers.get("cf-ray"));
    
    let body = response.text().await?;
    println!("  响应长度: {} bytes", body.len());
    
    // 检查搜索结果
    if body.contains("方仙外道") {
        println!("  ✓ 找到《方仙外道》相关内容");
        
        // 提取书籍链接
        let links = extract_book_links(&body);
        if !links.is_empty() {
            println!("  找到 {} 个相关链接:", links.len());
            for link in links.iter().take(5) {
                println!("    - {}", link);
            }
        }
    } else if is_cf_protected(status, &body, &headers) {
        println!("  ⚠ 被 CF 拦截，需要突破");
    } else {
        println!("  ✗ 未找到相关内容");
        // 输出部分响应内容用于调试
        if body.len() < 500 {
            println!("  响应内容: {}", body);
        } else {
            println!("  响应预览: {}...", &body[..500]);
        }
    }
    println!();
    
    println!("=== 测试完成 ===");
    Ok(())
}

/// 检查是否被 CF 保护
fn is_cf_protected(status: u16, body: &str, headers: &reqwest::header::HeaderMap) -> bool {
    // 状态码检测
    if status == 403 || status == 429 {
        return true;
    }
    
    // Header 检测
    if headers.contains_key("cf-ray") {
        // 有 CF-Ray 头，检查是否是挑战页面
        if body.contains("challenge") || body.contains("Just a moment") {
            return true;
        }
    }
    
    // Body 关键词检测
    body.contains("Checking your browser") 
        || body.contains("Just a moment") 
        || body.contains("Please Wait...")
        || body.contains("cf-browser-verify")
        || body.contains("cf_chl_opt")
        || body.contains("turnstile")
}

/// 提取书籍链接
fn extract_book_links(body: &str) -> Vec<String> {
    let mut links = Vec::new();
    
    // 查找所有书籍链接
    let mut pos = 0;
    while let Some(start) = body[pos..].find("href=\"") {
        let rest = &body[pos + start + 6..];
        if let Some(end) = rest.find('"') {
            let link = &rest[..end];
            if link.contains("/book/") || link.contains("article") {
                if link.starts_with("http") {
                    links.push(link.to_string());
                } else if link.starts_with("/") {
                    links.push(format!("https://www.69shuba.com{}", link));
                }
            }
            pos += start + 6 + end;
        } else {
            break;
        }
    }
    
    links
}
