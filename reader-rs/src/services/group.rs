use std::sync::Arc;
use tokio::sync::RwLock;

use crate::models::BookGroup;
use crate::storage::FileStorage;
use crate::api::group::GroupOrderItem;

/// 分组存储文件名
const GROUPS_FILE: &str = "bookGroups.json";

pub struct GroupService {
    storage: FileStorage,
    groups: Arc<RwLock<Vec<BookGroup>>>,
}

impl GroupService {
    pub fn new() -> Self {
        Self {
            storage: FileStorage::default(),
            groups: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// 获取所有分组
    pub async fn get_all_groups(&self) -> Result<Vec<BookGroup>, anyhow::Error> {
        let groups = self.groups.read().await;
        
        if groups.is_empty() {
            drop(groups);
            let loaded: Vec<BookGroup> = self.storage.read_json_or_default(GROUPS_FILE).await;
            let mut cache = self.groups.write().await;
            *cache = loaded.clone();
            return Ok(loaded);
        }
        
        Ok(groups.clone())
    }

    /// 保存分组
    pub async fn save_group(&self, mut group: BookGroup) -> Result<BookGroup, anyhow::Error> {
        let mut groups = self.groups.write().await;
        
        // 生成 ID
        if group.group_id == 0 {
            let max_id = groups.iter().map(|g| g.group_id).max().unwrap_or(0);
            group.group_id = max_id + 1;
        }
        
        // 更新或添加
        if let Some(pos) = groups.iter().position(|g| g.group_id == group.group_id) {
            groups[pos] = group.clone();
        } else {
            groups.push(group.clone());
        }
        
        self.storage.write_json(GROUPS_FILE, &*groups).await?;
        Ok(group)
    }

    /// 删除分组
    pub async fn delete_group(&self, group_id: i64) -> Result<(), anyhow::Error> {
        let mut groups = self.groups.write().await;
        groups.retain(|g| g.group_id != group_id);
        self.storage.write_json(GROUPS_FILE, &*groups).await?;
        Ok(())
    }

    /// 保存分组顺序
    pub async fn save_group_order(&self, order: Vec<GroupOrderItem>) -> Result<(), anyhow::Error> {
        let mut groups = self.groups.write().await;
        
        for item in order {
            if let Some(group) = groups.iter_mut().find(|g| g.group_id == item.group_id) {
                group.order = item.order;
            }
        }
        
        // 按顺序排序
        groups.sort_by_key(|g| g.order);
        
        self.storage.write_json(GROUPS_FILE, &*groups).await?;
        Ok(())
    }
}

impl Default for GroupService {
    fn default() -> Self {
        Self::new()
    }
}
