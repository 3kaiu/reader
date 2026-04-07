//! Test CF cookie extraction using headless Chrome

use nexus_engine::anti_crawl::CfCookieManager;
use reqwest::header::{HeaderMap, HeaderValue, COOKIE};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== CF Cookie 测试: 69shuba.com ===\n");

    // 创建 cookie manager
    println!("[1] 创建 CfCookieManager...");
    let manager = CfCookieManager::new();
    println!("✓ Cookie Manager 创建成功\n");

    // 测试 URL
    let test_url = "https://www.69shuba.com/";

    // 获取 CF cookies
    println!("[2] 使用 Headless Chrome 获取 CF cookies...");
    println!("  目标: {}", test_url);
    println!("  这可能需要 10-20 秒...\n");

    let cookies = manager.get_cookies(test_url).await?;

    if cookies.is_empty() {
        println!("✗ 未获取到 CF cookies");
        return Ok(());
    }

    println!("✓ 获取到 {} 个 CF cookies:", cookies.len());
    for cookie in &cookies {
        println!(
            "  - {} = {}... (domain: {})",
            cookie.name,
            &cookie.value[..cookie.value.len().min(20)],
            cookie.domain
        );
    }
    println!();

    // 使用 cookies 请求页面
    println!("[3] 使用 cookies 请求首页...");
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()?;

    let cookie_str = cookies
        .iter()
        .map(|c| c.to_cookie_string())
        .collect::<Vec<_>>()
        .join("; ");

    let mut headers = HeaderMap::new();
    headers.insert(COOKIE, HeaderValue::from_str(&cookie_str)?);

    let response = client.get(test_url).headers(headers).send().await?;

    let status = response.status();
    println!("  状态码: {}", status);

    let body = response.text().await?;
    println!("  响应长度: {} bytes", body.len());

    // 检查是否成功
    if status == 200 {
        println!("  ✓ 成功访问页面！");

        // 检查是否是 CF 挑战页
        if body.contains("Just a moment") || body.contains("Checking your browser") {
            println!("  ⚠ 仍然是 CF 挑战页");
        } else if body.contains("69书吧") || body.contains("小说") {
            println!("  ✓ 获取到正常页面内容");
        }
    } else if status == 403 {
        println!("  ⚠ 仍然被拦截 (403)");
    }
    println!();

    // 测试搜索
    println!("[4] 测试搜索《方仙外道》...");
    let search_url = "https://www.69shuba.com/modules/article/search.php?searchkey=%E6%96%B9%E4%BB%99%E5%A4%96%E9%81%93";

    let response = client
        .get(search_url)
        .header(COOKIE, &cookie_str)
        .send()
        .await?;

    let status = response.status();
    println!("  状态码: {}", status);

    let body = response.text().await?;
    println!("  响应长度: {} bytes", body.len());

    if body.contains("方仙外道") {
        println!("  ✓ 找到《方仙外道》相关内容！");

        // 提取书籍链接
        let links = extract_book_links(&body);
        if !links.is_empty() {
            println!("  找到 {} 个相关链接:", links.len());
            for link in links.iter().take(5) {
                println!("    - {}", link);
            }
        }
    } else if status == 403 {
        println!("  ⚠ 搜索被拦截");
    } else {
        println!("  未找到相关内容");
    }

    println!("\n=== 测试完成 ===");
    Ok(())
}

fn extract_book_links(body: &str) -> Vec<String> {
    let mut links = Vec::new();
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
