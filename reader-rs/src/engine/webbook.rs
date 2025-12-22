use reqwest::Client;
use std::time::Duration;
use anyhow::Result;

use crate::models::{BookSourceFull, SearchResult, Chapter};
use crate::engine::{CssParser, JsonPathParser, RegexParser};

/// 网络书籍解析器
pub struct WebBook {
    client: Client,
}

impl WebBook {
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

    /// 搜索书籍
    pub async fn search(&self, source: &BookSourceFull, keyword: &str) -> Result<Vec<SearchResult>> {
        let search_url = source.search_url
            .replace("{{key}}", keyword)
            .replace("{{page}}", "1");
        
        let content = self.client.get(&search_url).send().await?.text().await?;
        
        let rule_search = match &source.rule_search {
            Some(r) => r,
            None => return Ok(vec![]),
        };
        
        // 解析书籍列表
        let book_list = self.parse_list(&content, &rule_search.book_list)?;
        
        let mut results = Vec::new();
        for book_html in book_list {
            let name = self.parse_string(&book_html, &rule_search.name)?;
            let author = self.parse_string(&book_html, &rule_search.author)?;
            let book_url = self.parse_string(&book_html, &rule_search.book_url)?;
            let cover_url = self.parse_string(&book_html, &rule_search.cover_url).ok();
            let intro = self.parse_string(&book_html, &rule_search.intro).ok();
            
            if !name.is_empty() && !book_url.is_empty() {
                results.push(SearchResult {
                    book_url: self.absolute_url(&source.book_source_url, &book_url),
                    name,
                    author,
                    cover_url,
                    intro,
                    origin_name: Some(source.book_source_name.clone()),
                });
            }
        }
        
        Ok(results)
    }

    /// 获取章节列表
    pub async fn get_chapter_list(&self, source: &BookSourceFull, toc_url: &str) -> Result<Vec<Chapter>> {
        let content = self.client.get(toc_url).send().await?.text().await?;
        
        let rule_toc = match &source.rule_toc {
            Some(r) => r,
            None => return Ok(vec![]),
        };
        
        let chapter_list = self.parse_list(&content, &rule_toc.chapter_list)?;
        
        let mut chapters = Vec::new();
        for (index, chapter_html) in chapter_list.iter().enumerate() {
            let title = self.parse_string(chapter_html, &rule_toc.chapter_name)?;
            let url = self.parse_string(chapter_html, &rule_toc.chapter_url)?;
            
            if !title.is_empty() {
                chapters.push(Chapter {
                    title,
                    url: self.absolute_url(toc_url, &url),
                    index: index as i32,
                });
            }
        }
        
        Ok(chapters)
    }

    /// 获取章节内容
    pub async fn get_content(&self, source: &BookSourceFull, chapter_url: &str) -> Result<String> {
        let content = self.client.get(chapter_url).send().await?.text().await?;
        
        let rule_content = match &source.rule_content {
            Some(r) => r,
            None => return Ok(content),
        };
        
        let mut text = self.parse_string(&content, &rule_content.content)?;
        
        // 应用替换规则
        if !rule_content.replace_regex.is_empty() {
            text = self.apply_replace(&text, &rule_content.replace_regex)?;
        }
        
        Ok(text)
    }

    /// 解析获取字符串
    fn parse_string(&self, content: &str, rule: &str) -> Result<String> {
        if rule.is_empty() {
            return Ok(String::new());
        }
        
        // 检测规则类型
        if rule.starts_with("$.") || rule.starts_with("$[") {
            JsonPathParser::get_string(content, rule)
        } else if rule.starts_with("##") {
            RegexParser::get_string(content, &rule[2..])
        } else {
            // 处理 CSS 规则中的属性选择
            // 格式: selector@attr 或 selector@@text
            if let Some(pos) = rule.rfind('@') {
                let selector = &rule[..pos];
                let attr = &rule[pos+1..];
                
                if attr == "@text" || attr.is_empty() {
                    CssParser::get_string(content, selector)
                } else {
                    CssParser::get_attr(content, selector, attr)
                }
            } else {
                CssParser::get_string(content, rule)
            }
        }
    }

    /// 解析获取列表
    fn parse_list(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        if rule.is_empty() {
            return Ok(vec![content.to_string()]);
        }
        
        if rule.starts_with("$.") || rule.starts_with("$[") {
            JsonPathParser::get_list(content, rule)
        } else if rule.starts_with("##") {
            RegexParser::get_list(content, &rule[2..])
        } else {
            // CSS 选择器 - 返回匹配元素的 outer HTML
            self.get_elements_html(content, rule)
        }
    }

    /// 获取 CSS 匹配元素的 HTML
    fn get_elements_html(&self, content: &str, selector: &str) -> Result<Vec<String>> {
        use scraper::{Html, Selector};
        
        let document = Html::parse_document(content);
        let sel = Selector::parse(selector)
            .map_err(|e| anyhow::anyhow!("CSS parse error: {:?}", e))?;
        
        Ok(document.select(&sel)
            .map(|e| e.html())
            .collect())
    }

    /// 应用替换规则
    fn apply_replace(&self, content: &str, replace_rule: &str) -> Result<String> {
        // 格式: pattern##replacement
        let parts: Vec<&str> = replace_rule.split("##").collect();
        if parts.len() >= 2 {
            RegexParser::replace(content, parts[0], parts[1])
        } else {
            Ok(content.to_string())
        }
    }

    /// 转换为绝对 URL
    fn absolute_url(&self, base: &str, url: &str) -> String {
        if url.starts_with("http://") || url.starts_with("https://") {
            url.to_string()
        } else if url.starts_with("//") {
            format!("https:{}", url)
        } else if url.starts_with('/') {
            // 提取 base 的域名
            if let Some(pos) = base.find("://") {
                let after_protocol = &base[pos + 3..];
                if let Some(end) = after_protocol.find('/') {
                    let domain = &base[..pos + 3 + end];
                    return format!("{}{}", domain, url);
                }
            }
            format!("{}{}", base, url)
        } else {
            // 相对路径
            if let Some(pos) = base.rfind('/') {
                format!("{}/{}", &base[..pos], url)
            } else {
                format!("{}/{}", base, url)
            }
        }
    }
}

impl Default for WebBook {
    fn default() -> Self {
        Self::new()
    }
}
