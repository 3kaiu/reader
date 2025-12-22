use super::css::CssParser;
use super::jsonpath::JsonPathParser;
use super::regex::RegexParser;

/// 规则解析模式
pub enum RuleMode {
    Css,
    JsonPath,
    Regex,
    XPath,
}

/// 规则解析器
pub struct AnalyzeRule {
    content: String,
    base_url: Option<String>,
}

impl AnalyzeRule {
    pub fn new(content: String) -> Self {
        Self { content, base_url: None }
    }

    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = Some(url);
        self
    }

    /// 自动检测规则类型
    fn detect_mode(rule: &str) -> RuleMode {
        if rule.starts_with("$.") || rule.starts_with("$[") {
            RuleMode::JsonPath
        } else if rule.starts_with("/") || rule.starts_with("//") {
            RuleMode::XPath
        } else if rule.starts_with("##") {
            RuleMode::Regex
        } else {
            RuleMode::Css
        }
    }

    /// 执行规则获取字符串
    pub fn get_string(&self, rule: &str) -> Result<String, anyhow::Error> {
        let mode = Self::detect_mode(rule);
        match mode {
            RuleMode::Css => CssParser::get_string(&self.content, rule),
            RuleMode::JsonPath => JsonPathParser::get_string(&self.content, rule),
            RuleMode::Regex => RegexParser::get_string(&self.content, &rule[2..]),
            RuleMode::XPath => {
                // TODO: 实现 XPath
                Ok(String::new())
            }
        }
    }

    /// 执行规则获取列表
    pub fn get_list(&self, rule: &str) -> Result<Vec<String>, anyhow::Error> {
        let mode = Self::detect_mode(rule);
        match mode {
            RuleMode::Css => CssParser::get_list(&self.content, rule),
            RuleMode::JsonPath => JsonPathParser::get_list(&self.content, rule),
            RuleMode::Regex => RegexParser::get_list(&self.content, &rule[2..]),
            RuleMode::XPath => {
                // TODO: 实现 XPath
                Ok(vec![])
            }
        }
    }
}
