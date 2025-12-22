use scraper::{Html, Selector};

pub struct CssParser;

impl CssParser {
    /// 使用 CSS 选择器获取单个字符串
    pub fn get_string(content: &str, rule: &str) -> Result<String, anyhow::Error> {
        let document = Html::parse_document(content);
        let selector = Selector::parse(rule)
            .map_err(|e| anyhow::anyhow!("CSS parse error: {:?}", e))?;
        
        let element = document.select(&selector).next();
        Ok(element.map(|e| e.text().collect::<String>()).unwrap_or_default())
    }

    /// 使用 CSS 选择器获取列表
    pub fn get_list(content: &str, rule: &str) -> Result<Vec<String>, anyhow::Error> {
        let document = Html::parse_document(content);
        let selector = Selector::parse(rule)
            .map_err(|e| anyhow::anyhow!("CSS parse error: {:?}", e))?;
        
        Ok(document.select(&selector)
            .map(|e| e.text().collect::<String>())
            .collect())
    }

    /// 获取属性值
    pub fn get_attr(content: &str, rule: &str, attr: &str) -> Result<String, anyhow::Error> {
        let document = Html::parse_document(content);
        let selector = Selector::parse(rule)
            .map_err(|e| anyhow::anyhow!("CSS parse error: {:?}", e))?;
        
        let element = document.select(&selector).next();
        Ok(element
            .and_then(|e| e.value().attr(attr).map(|s| s.to_string()))
            .unwrap_or_default())
    }
}
