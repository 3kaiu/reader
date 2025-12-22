use regex::Regex;

pub struct RegexParser;

impl RegexParser {
    /// 使用正则表达式获取单个匹配
    pub fn get_string(content: &str, pattern: &str) -> Result<String, anyhow::Error> {
        let re = Regex::new(pattern)?;
        Ok(re.find(content)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default())
    }

    /// 使用正则表达式获取所有匹配
    pub fn get_list(content: &str, pattern: &str) -> Result<Vec<String>, anyhow::Error> {
        let re = Regex::new(pattern)?;
        Ok(re.find_iter(content)
            .map(|m| m.as_str().to_string())
            .collect())
    }

    /// 替换匹配内容
    pub fn replace(content: &str, pattern: &str, replacement: &str) -> Result<String, anyhow::Error> {
        let re = Regex::new(pattern)?;
        Ok(re.replace_all(content, replacement).to_string())
    }
}
