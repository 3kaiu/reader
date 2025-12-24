use reqwest::Client;
use std::time::Duration;
use anyhow::Result;
use std::sync::{Arc, Mutex};

use crate::models::{BookSourceFull, SearchResult, Chapter};
use crate::engine::{JsonPathParser, RegexParser, LegadoJsEngine};
use crate::engine::book_source::{BookSource, BookSourceEngine};
use super::utils::resolve_absolute_url;

/// 网络书籍解析器
#[derive(Clone)]
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

    /// Parse source headers from JSON string
    fn parse_source_headers(&self, source: &BookSourceFull) -> Vec<(String, String)> {
        let mut headers = Vec::new();
        if let Some(header_str) = &source.header {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(header_str) {
                if let Some(obj) = json.as_object() {
                    for (key, value) in obj {
                        if let Some(v) = value.as_str() {
                            headers.push((key.clone(), v.to_string()));
                        }
                    }
                }
            }
        }
        headers
    }

    /// Build request with source headers
    fn build_request(&self, url: &str, source: &BookSourceFull) -> reqwest::RequestBuilder {
        let mut req = self.client.get(url);
        for (key, value) in self.parse_source_headers(source) {
            req = req.header(&key, &value);
        }
        req
    }

    /// 获取书源的真实基础 URL (处理 ID 格式)
    fn get_base_url(&self, source: &BookSourceFull) -> String {
        if source.book_source_url.contains("://") {
            return source.book_source_url.clone();
        }

        // 尝试从 search_url 派生
        if !source.search_url.is_empty() {
            let url = &source.search_url;
            if let Some(pos) = url.find("://") {
                let domain_end = url[pos + 3..].find('/').unwrap_or(url.len() - (pos + 3));
                return url[..pos + 3 + domain_end].to_string();
            }
        }
        
        source.book_source_url.clone()
    }

    /// 搜索书籍
    pub async fn search(&self, source: &BookSourceFull, keyword: &str) -> Result<Vec<SearchResult>> {
        // 创建共享缓存
        let cache = Some(Arc::new(Mutex::new(std::collections::HashMap::<String, String>::new())));

        // 获取搜索 URL
        let search_url = self.resolve_url(&source.search_url, keyword, 1, source, cache.clone())?;
        
        tracing::debug!("Resolved search URL: {}", search_url);
        
        // 解析可能的请求配置（JSON 格式）
        let (url, method, body) = self.parse_request_config(&search_url);
        
        // 处理相对 URL - 转换为绝对 URL
        let base_url = self.get_base_url(source);
        let absolute_url = resolve_absolute_url(&base_url, &url);
        
        let content = self.fetch_content(&absolute_url, &method, body.as_deref()).await?;
        
        let rule_search = match &source.rule_search {
            Some(r) => r,
            None => return Ok(vec![]),
        };
        
        // 解析书籍列表
        let book_list = self.parse_list(&content, &rule_search.book_list, source, cache.clone())?;
        
        let mut results = Vec::new();
        for book_html in book_list {
            let name = self.parse_string(&book_html, &rule_search.name, source, cache.clone())?;
            let author = self.parse_string(&book_html, &rule_search.author, source, cache.clone())?;
            let book_url = self.parse_string(&book_html, &rule_search.book_url, source, cache.clone())?;
            let cover_url = self.parse_string(&book_html, &rule_search.cover_url, source, cache.clone()).ok();
            let intro = self.parse_string(&book_html, &rule_search.intro, source, cache.clone()).ok();
            
            if !name.is_empty() && !book_url.is_empty() {
                let base_url = self.get_base_url(source);
                results.push(SearchResult {
                    book_url: resolve_absolute_url(&base_url, &book_url),
                    name,
                    author,
                    cover_url,
                    intro,
                    kind: None,
                    word_count: None,
                    latest_chapter_title: None,
                    update_time: None,
                    origin_name: Some(source.book_source_name.clone()),
                    origin: None,
                });
            }
        }
        
        Ok(results)
    }

    /// 解析 URL 规则（支持 @js:）
    fn resolve_url(&self, url_rule: &str, key: &str, page: i32, source: &BookSourceFull, cache: Option<crate::engine::js::JsCache>) -> Result<String> {
        let url_rule = url_rule.trim();
        
        // 处理 @js: 规则
        if url_rule.starts_with("@js:") {
            let code = &url_rule[4..];
            let mut engine = LegadoJsEngine::new(cache);
            
            // 设置 source 对象
            let source_json = serde_json::to_string(source).unwrap_or_default();
            engine.set_source_json(&source_json);
            
            return engine.eval_search_url(code, key, page);
        }
        
        // 处理普通模板 URL
        let url = url_rule
            .replace("{{key}}", key)
            .replace("{{page}}", &page.to_string());
        
        Ok(url)
    }

    /// 解析请求配置 (支持 Legado 格式: URL,{JSON} 或纯 JSON {url,method,body})
    fn parse_request_config(&self, url_str: &str) -> (String, String, Option<String>) {
        let url_str = url_str.trim();
        
        // 尝试纯 JSON 格式: {"url": "...", "method": "...", "body": "..."}
        if url_str.starts_with('{') {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(url_str) {
                if let Some(url) = json.get("url").and_then(|v| v.as_str()) {
                    let method = json.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
                    let body = json.get("body").and_then(|v| v.as_str()).map(|s| s.to_string());
                    return (url.to_string(), method.to_string(), body);
                }
            }
        }
        
        // 尝试 Legado 格式: http://xxx.com,{"method": "POST", "body": "..."}
        // 找到最后一个 ',{' 分割点
        if let Some(pos) = url_str.rfind(",{") {
            let url_part = &url_str[..pos];
            let json_part = &url_str[pos + 1..];
            
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(json_part) {
                let method = json.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
                let body = json.get("body").and_then(|v| v.as_str()).map(|s| s.to_string());
                tracing::debug!("Parsed comma-separated URL: {} method={}", url_part, method);
                return (url_part.to_string(), method.to_string(), body);
            }
        }
        
        // 默认 GET 请求
        (url_str.to_string(), "GET".to_string(), None)
    }

    /// 获取 URL 内容
    async fn fetch_content(&self, url: &str, method: &str, body: Option<&str>) -> Result<String> {
        let mut req = match method.to_uppercase().as_str() {
            "POST" => self.client.post(url),
            _ => self.client.get(url),
        };
        
        if let Some(b) = body {
            req = req.body(b.to_string());
        }
        
        let resp = req.send().await?;
        let text = resp.text().await?;
        Ok(text)
    }

    /// 获取章节列表
    pub async fn get_chapter_list(&self, source: &BookSourceFull, toc_url: &str) -> Result<Vec<Chapter>> {
        let source_json = serde_json::to_string(source)?;
        
        // Spawn blocking task for engine execution
        let toc_url_str = toc_url.to_string();
        let chapters = tokio::task::spawn_blocking(move || {
            let engine_source: BookSource = serde_json::from_str(&source_json)?;
            let engine = BookSourceEngine::new(engine_source)?;
            engine.get_chapters(&toc_url_str)
        }).await??;
        
        let result = chapters.into_iter().enumerate().map(|(i, c)| Chapter {
            title: c.title,
            url: c.url,
            index: i as i32,
        }).collect();
        
        Ok(result)
    }

    /// 获取章节内容 (支持分页)
    pub async fn get_content(&self, source: &BookSourceFull, chapter_url: &str) -> Result<String> {
        let rule_content = match &source.rule_content {
            Some(r) => r,
            None => {
                let abs_url = resolve_absolute_url(&source.book_source_url, chapter_url);
                return Ok(self.client.get(&abs_url).send().await?.text().await?);
            }
        };
        
        let cache = Some(Arc::new(Mutex::new(std::collections::HashMap::<String, String>::new())));
        let mut all_content = String::new();
        let mut current_url = chapter_url.to_string();
        let max_pages = 10; // 防止无限循环
        
        let base_url = self.get_base_url(source);
        for _ in 0..max_pages {
            let abs_url = resolve_absolute_url(&base_url, &current_url);
            let html = self.client.get(&abs_url).send().await?
                .text().await
                .map_err(|e| anyhow::anyhow!("Failed to fetch {}: {}", abs_url, e))?;
            
            // 解析正文内容
            let page_content = self.parse_string(&html, &rule_content.content, source, cache.clone())?;
            
            if !all_content.is_empty() && !page_content.is_empty() {
                all_content.push_str("\n\n");
            }
            all_content.push_str(&page_content);
            
            // 检查是否有下一页
            if rule_content.next_content_url.is_empty() {
                break;
            }
            
            match self.parse_string(&html, &rule_content.next_content_url, source, cache.clone()) {
                Ok(next_url) if !next_url.is_empty() && next_url != current_url => {
                    let base_url = self.get_base_url(source);
                    current_url = resolve_absolute_url(&base_url, &next_url);
                }
                _ => break, // 没有下一页或解析失败
            }
        }
        
        // 应用替换规则
        if !rule_content.replace_regex.is_empty() {
            all_content = self.apply_replace(&all_content, &rule_content.replace_regex)?;
        }
        
        Ok(all_content)
    }

    /// 解析获取字符串（支持 Legado 扩展语法）
    fn parse_string(&self, content: &str, rule: &str, source: &BookSourceFull, cache: Option<crate::engine::js::JsCache>) -> Result<String> {
        if rule.is_empty() {
            return Ok(String::new());
        }
        
        // 处理 || 备选语法：尝试多个规则直到成功
        if rule.contains("||") {
            let alternatives: Vec<&str> = rule.split("||").collect();
            for alt in alternatives {
                if let Ok(result) = self.parse_string(content, alt.trim(), source, cache.clone()) { // recursive call correct? parse_single_rule needs cache?
                    // actually parse_single_rule was defined below, wait. 
                    // I will update parse_single_rule too
                    if !result.is_empty() {
                        return Ok(result);
                    }
                }
            }
            return Ok(String::new());
        }
        
        // 处理 @js: 后处理语法
        if let Some(js_pos) = rule.find("@js:") {
            let base_rule = &rule[..js_pos];
            let js_code = &rule[js_pos + 4..];
            
            // 先执行基础规则
            let result = self.parse_single_rule(content, base_rule, source, cache.clone())?; // Updated signature
            
            // 再用 JS 处理结果
            let mut engine = LegadoJsEngine::new(cache);
            let source_json = serde_json::to_string(source).unwrap_or_default();
            engine.set_source_json(&source_json);
            
            engine.set_global("result", &result);
            return engine.eval_url(js_code, &[]);
        }
        
        // 处理 @put: 语法
        if let Some(put_pos) = rule.find("@put:") {
            let base_rule = &rule[..put_pos];
            return self.parse_single_rule(content, base_rule, source, cache);
        }
        
        self.parse_single_rule(content, rule, source, cache)
    }

    /// 解析单个规则
    fn parse_single_rule(&self, content: &str, rule: &str, source: &BookSourceFull, cache: Option<crate::engine::js::JsCache>) -> Result<String> {
        let rule = rule.trim();
        if rule.is_empty() {
            return Ok(String::new());
        }

        // 处理正则替换 (Rule##RegexReplacement)
        if !rule.starts_with("##") {
            if let Some(pos) = rule.find("##") {
                let base_rule = &rule[..pos];
                let replace_regex = &rule[pos + 2..];
                
                let result = self.parse_single_rule(content, base_rule, source, cache)?;
                
                return RegexParser::replace(&result, replace_regex, "");
            }
        }
        
        // 检测规则类型
        if rule.starts_with("$.") || rule.starts_with("$[") {
            JsonPathParser::get_string(content, rule)
        } else if rule.starts_with("##") {
            RegexParser::get_string(content, &rule[2..])
        } else if rule.starts_with("<js>") {
            // 处理 <js>...</js> 规则
            let code = rule.trim_start_matches("<js>").trim_end_matches("</js>");
            let mut engine = LegadoJsEngine::new(cache);
            let source_json = serde_json::to_string(source).unwrap_or_default();
            engine.set_source_json(&source_json);

            engine.set_global("result", content);
            engine.eval_url(code, &[])
        } else {
             // CSS rules...
             // Use our new get_elements_html which handles @attr and ::text
             // But get_elements_html expects Vec<String>. 
             // We want single string. Join them?
             let list = self.get_elements_html(content, rule)?;
             Ok(list.join("\n"))
        } 
    }

    /// 解析获取列表
    fn parse_list(&self, content: &str, rule: &str, source: &BookSourceFull, cache: Option<crate::engine::js::JsCache>) -> Result<Vec<String>> {
        let rule = rule.trim();
        if rule.is_empty() {
            return Ok(vec![content.to_string()]);
        }
        
        // 处理 || 备选语法
        if rule.contains("||") {
            let alternatives: Vec<&str> = rule.split("||").collect();
            for alt in alternatives {
                if let Ok(result) = self.parse_list(content, alt.trim(), source, cache.clone()) {
                    if !result.is_empty() {
                        return Ok(result);
                    }
                }
            }
            return Ok(Vec::new());
        }

        // 处理 <js>...</js> 规则 (可能在规则开头或结尾)
        if rule.trim_start().starts_with("<js>") {
            let code = rule.trim_start().trim_start_matches("<js>").trim_end_matches("</js>");
            let mut engine = LegadoJsEngine::new(cache.clone());
            let source_json = serde_json::to_string(source).unwrap_or_default();
            engine.set_source_json(&source_json);

            engine.set_global("result", content);
            match engine.eval_url(code, &[]) {
                Ok(res_str) => {
                     // Try to parse as JSON array
                     if let Ok(list) = serde_json::from_str::<Vec<String>>(&res_str) {
                         return Ok(list);
                     }
                     return Ok(vec![res_str]);
                },
                Err(e) => {
                    tracing::warn!("JS list rule failed: {}", e);
                    return Ok(Vec::new());
                }
            }
        }
        
        if rule.contains("@js:") {
            let parts: Vec<&str> = rule.split("@js:").collect();
            if parts.len() == 2 {
                let base_rule = parts[0];
                let js_code = parts[1];
                
                let list = self.parse_list(content, base_rule, source, cache.clone())?;
                if list.is_empty() { return Ok(list); }
                
                let list_json = serde_json::to_string(&list).unwrap_or_default();
                
                let mut engine = LegadoJsEngine::new(cache); // use cache
                let source_json = serde_json::to_string(source).unwrap_or_default();
                engine.set_source_json(&source_json);
                engine.set_global("result", &list_json);
                
                match engine.eval_url(js_code, &[]) {
                     Ok(res_str) => {
                         if let Ok(new_list) = serde_json::from_str::<Vec<String>>(&res_str) {
                             return Ok(new_list);
                         }
                         return Ok(vec![res_str]);
                     },
                     Err(e) => {
                         tracing::warn!("JS list post-processing failed: {}", e);
                         return Ok(list); 
                     }
                }
            }
        }
        
        // 处理规则中包含 <js>...</js> 的情况 (如 $.data<js>...</js>)
        if rule.contains("<js>") && !rule.trim_start().starts_with("<js>") {
            if let Some(js_pos) = rule.find("<js>") {
                let base_rule = &rule[..js_pos];
                let js_part = &rule[js_pos..];
                let js_code = js_part.trim_start_matches("<js>").trim_end_matches("</js>");
                
                // 先用基础规则解析
                let list = self.parse_list(content, base_rule.trim(), source, cache.clone())?;
                if list.is_empty() { return Ok(list); }
                
                let list_json = serde_json::to_string(&list).unwrap_or_default();
                
                let mut engine = LegadoJsEngine::new(cache);
                let source_json = serde_json::to_string(source).unwrap_or_default();
                engine.set_source_json(&source_json);
                engine.set_global("result", &list_json);
                
                match engine.eval_url(js_code, &[]) {
                    Ok(res_str) => {
                        if let Ok(new_list) = serde_json::from_str::<Vec<String>>(&res_str) {
                            return Ok(new_list);
                        }
                        return Ok(vec![res_str]);
                    },
                    Err(e) => {
                        tracing::warn!("JS post-processing in list rule failed: {}", e);
                        return Ok(list);
                    }
                }
            }
        }

        if rule.starts_with("$.") || rule.starts_with("$[") {
            JsonPathParser::get_list(content, rule)
        } else if rule.starts_with("##") {
            RegexParser::get_list(content, &rule[2..])
        } else {
            self.get_elements_html(content, rule)
        }
    }

    /// 获取 CSS 匹配元素的 HTML (支持 @attr, ::text)
    fn get_elements_html(&self, content: &str, rule: &str) -> Result<Vec<String>> {
        use scraper::{Html, Selector};
        
        // 处理 Legado CSS 扩展语法
        let (selector, attr) = if let Some(pos) = rule.rfind('@') {
            (&rule[..pos], Some(&rule[pos+1..]))
        } else if rule.ends_with("::text") {
            (&rule[..rule.len()-6], Some("text"))
        } else {
            (rule, None)
        };
        
        if selector.trim().is_empty() {
            return Ok(vec![]);
        }
        
        let document = Html::parse_document(content);
        let sel = match Selector::parse(selector) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("CSS parse error in get_elements_html for '{}': {:?}", selector, e);
                return Ok(vec![]);
            }
        };
        
        Ok(document.select(&sel)
            .map(|e| {
                match attr {
                    Some("text") => e.text().collect::<Vec<_>>().join(""),
                    Some(a) => e.value().attr(a).unwrap_or("").to_string(),
                    None => e.html(),
                }
            })
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
}

impl Default for WebBook {
    fn default() -> Self {
        Self::new()
    }
}
