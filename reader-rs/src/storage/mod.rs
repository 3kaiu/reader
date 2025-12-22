use std::path::{Path, PathBuf};
use tokio::fs;
use serde::{de::DeserializeOwned, Serialize};
use anyhow::Result;

/// 文件存储服务
pub struct FileStorage {
    base_path: PathBuf,
}

impl FileStorage {
    pub fn new(base_path: impl AsRef<Path>) -> Self {
        Self {
            base_path: base_path.as_ref().to_path_buf(),
        }
    }

    /// 获取数据目录路径
    fn data_path(&self, filename: &str) -> PathBuf {
        self.base_path.join("data").join(filename)
    }

    /// 读取 JSON 文件
    pub async fn read_json<T: DeserializeOwned>(&self, filename: &str) -> Result<T> {
        let path = self.data_path(filename);
        let content = fs::read_to_string(&path).await?;
        let data: T = serde_json::from_str(&content)?;
        Ok(data)
    }

    /// 读取 JSON 文件，不存在则返回默认值
    pub async fn read_json_or_default<T: DeserializeOwned + Default>(&self, filename: &str) -> T {
        self.read_json(filename).await.unwrap_or_default()
    }

    /// 写入 JSON 文件
    pub async fn write_json<T: Serialize>(&self, filename: &str, data: &T) -> Result<()> {
        let path = self.data_path(filename);
        
        // 确保目录存在
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        
        let content = serde_json::to_string_pretty(data)?;
        fs::write(&path, content).await?;
        Ok(())
    }

    /// 检查文件是否存在
    pub async fn exists(&self, filename: &str) -> bool {
        let path = self.data_path(filename);
        fs::try_exists(&path).await.unwrap_or(false)
    }

    /// 删除文件
    pub async fn delete(&self, filename: &str) -> Result<()> {
        let path = self.data_path(filename);
        fs::remove_file(&path).await?;
        Ok(())
    }

    /// 获取缓存目录
    pub fn cache_path(&self, filename: &str) -> PathBuf {
        self.base_path.join("cache").join(filename)
    }

    /// 读取缓存
    pub async fn read_cache(&self, filename: &str) -> Result<String> {
        let path = self.cache_path(filename);
        let content = fs::read_to_string(&path).await?;
        Ok(content)
    }

    /// 写入缓存
    pub async fn write_cache(&self, filename: &str, content: &str) -> Result<()> {
        let path = self.cache_path(filename);
        
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        
        fs::write(&path, content).await?;
        Ok(())
    }
}

impl Default for FileStorage {
    fn default() -> Self {
        // 默认使用当前目录下的 storage
        Self::new("./storage")
    }
}
