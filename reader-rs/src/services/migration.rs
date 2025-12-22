use std::path::Path;
use tokio::fs;
use anyhow::Result;
use serde_json::Value;

use crate::models::{Book, BookSourceFull, ReplaceRule, BookGroup};
use crate::storage::FileStorage;

/// 数据迁移工具 - 从旧版 Kotlin 后端迁移数据
pub struct Migration {
    storage: FileStorage,
}

impl Migration {
    pub fn new() -> Self {
        Self {
            storage: FileStorage::default(),
        }
    }

    /// 从旧版存储目录迁移所有数据
    pub async fn migrate_from_legacy(&self, legacy_path: &str) -> Result<MigrationResult> {
        let mut result = MigrationResult::default();

        // 迁移书源
        let sources_path = format!("{}/bookSource.json", legacy_path);
        if Path::new(&sources_path).exists() {
            let count = self.migrate_sources(&sources_path).await?;
            result.sources_migrated = count;
        }

        // 迁移书架
        let books_path = format!("{}/bookshelf.json", legacy_path);
        if Path::new(&books_path).exists() {
            let count = self.migrate_books(&books_path).await?;
            result.books_migrated = count;
        }

        // 迁移替换规则
        let rules_path = format!("{}/replaceRule.json", legacy_path);
        if Path::new(&rules_path).exists() {
            let count = self.migrate_replace_rules(&rules_path).await?;
            result.rules_migrated = count;
        }

        // 迁移分组
        let groups_path = format!("{}/bookGroup.json", legacy_path);
        if Path::new(&groups_path).exists() {
            let count = self.migrate_groups(&groups_path).await?;
            result.groups_migrated = count;
        }

        Ok(result)
    }

    /// 迁移书源
    async fn migrate_sources(&self, path: &str) -> Result<usize> {
        let content = fs::read_to_string(path).await?;
        let sources: Vec<BookSourceFull> = serde_json::from_str(&content)?;
        let count = sources.len();
        self.storage.write_json("bookSources.json", &sources).await?;
        tracing::info!("Migrated {} book sources", count);
        Ok(count)
    }

    /// 迁移书架
    async fn migrate_books(&self, path: &str) -> Result<usize> {
        let content = fs::read_to_string(path).await?;
        
        // 尝试解析为标准格式
        let books: Vec<Book> = match serde_json::from_str(&content) {
            Ok(b) => b,
            Err(_) => {
                // 尝试兼容旧版格式
                let raw: Vec<Value> = serde_json::from_str(&content)?;
                raw.into_iter()
                    .filter_map(|v| self.convert_legacy_book(v).ok())
                    .collect()
            }
        };
        
        let count = books.len();
        self.storage.write_json("bookshelf.json", &books).await?;
        tracing::info!("Migrated {} books", count);
        Ok(count)
    }

    /// 转换旧版书籍格式
    fn convert_legacy_book(&self, value: Value) -> Result<Book> {
        Ok(Book {
            book_url: value["bookUrl"].as_str().unwrap_or_default().to_string(),
            name: value["name"].as_str().unwrap_or_default().to_string(),
            author: value["author"].as_str().unwrap_or_default().to_string(),
            cover_url: value["coverUrl"].as_str().map(|s| s.to_string()),
            custom_cover_url: value["customCoverUrl"].as_str().map(|s| s.to_string()),
            toc_url: value["tocUrl"].as_str().map(|s| s.to_string()),
            origin: value["origin"].as_str().map(|s| s.to_string()),
            origin_name: value["originName"].as_str().map(|s| s.to_string()),
            intro: value["intro"].as_str().map(|s| s.to_string()),
            kind: value["kind"].as_str().map(|s| s.to_string()),
            book_type: value["type"].as_i64().map(|i| i as i32),
            group: value["group"].as_i64(),
            dur_chapter_index: value["durChapterIndex"].as_i64().map(|i| i as i32),
            dur_chapter_pos: value["durChapterPos"].as_i64().map(|i| i as i32),
            dur_chapter_time: value["durChapterTime"].as_i64(),
            dur_chapter_title: value["durChapterTitle"].as_str().map(|s| s.to_string()),
            total_chapter_num: value["totalChapterNum"].as_i64().map(|i| i as i32),
            latest_chapter_title: value["latestChapterTitle"].as_str().map(|s| s.to_string()),
            can_update: value["canUpdate"].as_bool(),
        })
    }

    /// 迁移替换规则
    async fn migrate_replace_rules(&self, path: &str) -> Result<usize> {
        let content = fs::read_to_string(path).await?;
        let rules: Vec<ReplaceRule> = serde_json::from_str(&content)?;
        let count = rules.len();
        self.storage.write_json("replaceRules.json", &rules).await?;
        tracing::info!("Migrated {} replace rules", count);
        Ok(count)
    }

    /// 迁移分组
    async fn migrate_groups(&self, path: &str) -> Result<usize> {
        let content = fs::read_to_string(path).await?;
        let groups: Vec<BookGroup> = serde_json::from_str(&content)?;
        let count = groups.len();
        self.storage.write_json("bookGroups.json", &groups).await?;
        tracing::info!("Migrated {} book groups", count);
        Ok(count)
    }
}

/// 迁移结果
#[derive(Default)]
pub struct MigrationResult {
    pub sources_migrated: usize,
    pub books_migrated: usize,
    pub rules_migrated: usize,
    pub groups_migrated: usize,
}

impl MigrationResult {
    pub fn total(&self) -> usize {
        self.sources_migrated + self.books_migrated + self.rules_migrated + self.groups_migrated
    }
}

impl Default for Migration {
    fn default() -> Self {
        Self::new()
    }
}
