use scraper::{Html, Selector};

pub struct CssParser;

impl CssParser {
    /// 使用 CSS 选择器获取单个字符串
    pub fn get_string(content: &str, rule: &str) -> Result<String, anyhow::Error> {
        if rule.trim().is_empty() {
            return Ok(String::new());
        }
        let document = Html::parse_document(content);
        let selector = match Selector::parse(rule) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("CSS parse error for '{}': {:?}", rule, e);
                return Ok(String::new());
            }
        };
        
        let element = document.select(&selector).next();
        Ok(element.map(|e| e.text().collect::<String>()).unwrap_or_default())
    }

    /// 使用 CSS 选择器获取列表
    pub fn get_list(content: &str, rule: &str) -> Result<Vec<String>, anyhow::Error> {
        if rule.trim().is_empty() {
            return Ok(vec![]);
        }
        let document = Html::parse_document(content);
        let selector = match Selector::parse(rule) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("CSS parse error for '{}': {:?}", rule, e);
                return Ok(vec![]);
            }
        };
        
        Ok(document.select(&selector)
            .map(|e| e.text().collect::<String>())
            .collect())
    }

    /// 获取属性值
    pub fn get_attr(content: &str, rule: &str, attr: &str) -> Result<String, anyhow::Error> {
        if rule.trim().is_empty() {
            return Ok(String::new());
        }
        let document = Html::parse_document(content);
        let selector = match Selector::parse(rule) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("CSS parse error for '{}': {:?}", rule, e);
                return Ok(String::new());
            }
        };
        
        let element = document.select(&selector).next();
        Ok(element
            .and_then(|e| e.value().attr(attr).map(|s| s.to_string()))
            .unwrap_or_default())
    }
}
