use serde::{Deserialize, Serialize};

/// 书源完整定义 (用于解析规则)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BookSourceFull {
    /// 书源 URL
    pub book_source_url: String,
    /// 书源名称
    pub book_source_name: String,
    /// 书源分组
    #[serde(default)]
    pub book_source_group: String,
    /// 书源类型: 0 文字, 1 音频, 2 图片
    #[serde(default)]
    pub book_source_type: i32,
    /// 排序权重
    #[serde(default)]
    pub weight: i32,
    /// 是否启用
    #[serde(default = "default_true")]
    pub enabled: bool,

    // === 搜索规则 ===
    #[serde(default)]
    pub search_url: String,
    #[serde(default)]
    pub rule_search: Option<SearchRule>,

    // === 发现 URL ===
    #[serde(default)]
    pub explore_url: String,

    // === 书籍信息规则 ===
    #[serde(default)]
    pub rule_book_info: Option<BookInfoRule>,

    // === 目录规则 ===
    #[serde(default)]
    pub rule_toc: Option<TocRule>,

    // === 正文规则 ===
    #[serde(default)]
    pub rule_content: Option<ContentRule>,

    // === 发现规则 ===
    #[serde(default)]
    pub rule_explore: Option<ExploreRule>,

    // === HTTP 相关 ===
    #[serde(default)]
    pub header: Option<String>,
    #[serde(default)]
    pub login_url: Option<String>,

    // === JS 库 ===
    #[serde(default)]
    pub js_lib: Option<String>,
}

fn default_true() -> bool {
    true
}

/// 搜索规则
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchRule {
    #[serde(default)]
    pub book_list: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub intro: String,
    #[serde(default)]
    pub cover_url: String,
    #[serde(default)]
    pub book_url: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub last_chapter: String,
    #[serde(default)]
    pub word_count: String,
    #[serde(default)]
    pub update_time: String,
}

/// 书籍信息规则
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BookInfoRule {
    #[serde(default)]
    pub init: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub intro: String,
    #[serde(default)]
    pub cover_url: String,
    #[serde(default)]
    pub toc_url: String,
    #[serde(default)]
    pub last_chapter: String,
    #[serde(default)]
    pub word_count: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub update_time: String,
}

/// 目录规则
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TocRule {
    #[serde(default)]
    pub chapter_list: String,
    #[serde(default)]
    pub chapter_name: String,
    #[serde(default)]
    pub chapter_url: String,
    #[serde(default)]
    pub next_toc_url: String,
}

/// 正文规则
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentRule {
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub next_content_url: String,
    #[serde(default)]
    pub replace_regex: String,
}

/// 发现规则
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExploreRule {
    #[serde(default)]
    pub book_list: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub cover_url: String,
    #[serde(default)]
    pub book_url: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_deserialize_book_sources() {
        // try to find the file relative to the project root
        let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        path.push("storage/data/bookSources.json");
        
        if !path.exists() {
            println!("Book sources file not found at {:?}, skipping test", path);
            return;
        }

        let content = std::fs::read_to_string(&path).unwrap();
        match serde_json::from_str::<Vec<BookSourceFull>>(&content) {
            Ok(sources) => println!("Successfully parsed {} sources", sources.len()),
            Err(e) => panic!("Failed to parse book sources: {}", e),
        }
    }
}
