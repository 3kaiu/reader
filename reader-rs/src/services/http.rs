use std::time::Duration;
use reqwest::{Client, header};
use anyhow::Result;

/// HTTP 客户端封装
pub struct HttpClient {
    client: Client,
}

impl HttpClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .gzip(true)
            .brotli(true)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .build()
            .expect("Failed to create HTTP client");
        
        Self { client }
    }

    /// GET 请求获取文本
    pub async fn get_text(&self, url: &str) -> Result<String> {
        let resp = self.client.get(url).send().await?;
        let text = resp.text().await?;
        Ok(text)
    }

    /// GET 请求获取字节
    pub async fn get_bytes(&self, url: &str) -> Result<Vec<u8>> {
        let resp = self.client.get(url).send().await?;
        let bytes = resp.bytes().await?.to_vec();
        Ok(bytes)
    }

    /// 带自定义请求头的 GET
    pub async fn get_with_headers(&self, url: &str, headers: Vec<(&str, &str)>) -> Result<String> {
        let mut req = self.client.get(url);
        
        for (key, value) in headers {
            req = req.header(key, value);
        }
        
        let resp = req.send().await?;
        let text = resp.text().await?;
        Ok(text)
    }

    /// POST 请求
    pub async fn post(&self, url: &str, body: &str) -> Result<String> {
        let resp = self.client
            .post(url)
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(body.to_string())
            .send()
            .await?;
        let text = resp.text().await?;
        Ok(text)
    }
}

impl Default for HttpClient {
    fn default() -> Self {
        Self::new()
    }
}
