//! CloudScraper 测试: 69shuba.com 搜索《方仙外道》

use cloudscraper_rs::CloudScraper;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== CloudScraper 测试: 69shuba.com ===\n");

    // 创建 CloudScraper 实例
    println!("[1] 创建 CloudScraper 实例...");
    let scraper = CloudScraper::new()?;
    println!("✓ CloudScraper 创建成功\n");

    // 步骤1: 访问首页
    println!("[2] 访问首页: https://www.69shuba.com/");
    let response = scraper.get("https://www.69shuba.com/").await?;

    let status = response.status();
    println!("  状态码: {}", status);

    let headers = response.headers().clone();
    println!("  CF-Ray: {:?}", headers.get("cf-ray"));
    println!("  CF-Mitigated: {:?}", headers.get("cf-mitigated"));
    println!("  Server: {:?}", headers.get("server"));

    let body = response.text().await?;
    println!("  响应长度: {} bytes", body.len());

    // 分析 CF 挑战类型
    println!("\n  === CF 挑战分析 ===");
    if body.contains("turnstile") {
        println!("  挑战类型: Turnstile");
    } else if body.contains("challenge") && body.contains("cf-") {
        println!("  挑战类型: Managed Challenge (v2)");
    } else if body.contains("Just a moment") {
        println!("  挑战类型: JavaScript Challenge (v1)");
    } else if body.contains("Checking your browser") {
        println!("  挑战类型: Browser Check");
    } else {
        println!("  挑战类型: 未知/其他");
    }

    // 输出响应片段用于调试
    if status == 403 || status == 429 {
        println!("\n  响应内容片段:");
        // 查找关键信息
        if let Some(start) = body.find("<title>") {
            let end = body.find("</title>").unwrap_or(start + 100);
            println!("  Title: {}", &body[start..end]);
        }
        // 查找 script 标签
        if body.contains("<script") {
            println!("  包含 JavaScript");
        }
        // 查找 iframe
        if body.contains("iframe") {
            println!("  包含 iframe");
        }
        // 查找 form
        if body.contains("<form") {
            println!("  包含 form");
        }
    }
    println!();

    // 步骤2: 尝试使用 request 方法（可能需要 POST）
    println!("[3] 尝试搜索《方仙外道》...");
    let search_url = url::Url::parse("https://www.69shuba.com/modules/article/search.php?searchkey=%E6%96%B9%E4%BB%99%E5%A4%96%E9%81%93")?;

    // 使用 GET 方式搜索
    let response = scraper.request(http::Method::GET, search_url, None).await?;

    let status = response.status();
    println!("  POST 状态码: {}", status);

    let headers = response.headers().clone();
    println!("  CF-Ray: {:?}", headers.get("cf-ray"));

    let body = response.text().await?;
    println!("  响应长度: {} bytes", body.len());

    if body.contains("方仙外道") {
        println!("  ✓ 找到《方仙外道》相关内容");
    } else if status == 403 {
        println!("  ⚠ 仍然被 CF 拦截");
    }

    println!("\n=== 测试完成 ===");
    println!("\n结论: cloudscraper-rs 当前版本可能不支持自动突破此站点的 CF 保护");
    println!("建议: 考虑使用 headless browser (如 headless-chrome) 或其他 CF bypass 方案");

    Ok(())
}
