use std::sync::Arc;
use tokio::sync::RwLock;

use crate::models::ReplaceRule;
use crate::storage::FileStorage;

/// 替换规则存储文件名
const RULES_FILE: &str = "replaceRules.json";

pub struct ReplaceService {
    storage: FileStorage,
    rules: Arc<RwLock<Vec<ReplaceRule>>>,
}

impl ReplaceService {
    pub fn new() -> Self {
        Self {
            storage: FileStorage::default(),
            rules: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// 获取所有规则
    pub async fn get_all_rules(&self) -> Result<Vec<ReplaceRule>, anyhow::Error> {
        let rules = self.rules.read().await;
        
        if rules.is_empty() {
            drop(rules);
            let loaded: Vec<ReplaceRule> = self.storage.read_json_or_default(RULES_FILE).await;
            let mut cache = self.rules.write().await;
            *cache = loaded.clone();
            return Ok(loaded);
        }
        
        Ok(rules.clone())
    }

    /// 保存单条规则
    pub async fn save_rule(&self, mut rule: ReplaceRule) -> Result<ReplaceRule, anyhow::Error> {
        let mut rules = self.rules.write().await;
        
        // 生成 ID
        if rule.id.is_none() {
            let max_id = rules.iter()
                .filter_map(|r| r.id)
                .max()
                .unwrap_or(0);
            rule.id = Some(max_id + 1);
        }
        
        // 更新或添加
        if let Some(pos) = rules.iter().position(|r| r.id == rule.id) {
            rules[pos] = rule.clone();
        } else {
            rules.push(rule.clone());
        }
        
        self.storage.write_json(RULES_FILE, &*rules).await?;
        Ok(rule)
    }

    /// 批量保存规则
    pub async fn save_rules(&self, new_rules: Vec<ReplaceRule>) -> Result<(), anyhow::Error> {
        let mut rules = self.rules.write().await;
        
        for mut rule in new_rules {
            if rule.id.is_none() {
                let max_id = rules.iter()
                    .filter_map(|r| r.id)
                    .max()
                    .unwrap_or(0);
                rule.id = Some(max_id + 1);
            }
            
            if let Some(pos) = rules.iter().position(|r| r.id == rule.id) {
                rules[pos] = rule;
            } else {
                rules.push(rule);
            }
        }
        
        self.storage.write_json(RULES_FILE, &*rules).await?;
        Ok(())
    }

    /// 删除规则
    pub async fn delete_rules(&self, to_delete: Vec<ReplaceRule>) -> Result<(), anyhow::Error> {
        let ids: Vec<i64> = to_delete.iter().filter_map(|r| r.id).collect();
        let mut rules = self.rules.write().await;
        rules.retain(|r| !r.id.map(|id| ids.contains(&id)).unwrap_or(false));
        self.storage.write_json(RULES_FILE, &*rules).await?;
        Ok(())
    }
}

impl Default for ReplaceService {
    fn default() -> Self {
        Self::new()
    }
}
