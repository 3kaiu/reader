use super::FileStorage;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct KvData {
    // source_url -> key -> value
    pub source_vars: HashMap<String, HashMap<String, String>>,
    // key -> (value, expire_time)
    pub cache: HashMap<String, (String, i64)>,
}

#[derive(Clone)]
pub struct KvStore {
    data: Arc<Mutex<KvData>>,
    file_storage: FileStorage,
    filename: String,
}

impl KvStore {
    pub fn new(file_storage: FileStorage, filename: &str) -> Self {
        Self {
            data: Arc::new(Mutex::new(KvData::default())),
            file_storage,
            filename: filename.to_string(),
        }
    }

    pub async fn load(&self) -> anyhow::Result<()> {
        let data = self
            .file_storage
            .read_json_or_default::<KvData>(&self.filename)
            .await;
        if let Ok(mut guard) = self.data.lock() {
            *guard = data;
        }
        Ok(())
    }

    pub async fn save(&self) -> anyhow::Result<()> {
        let data = {
            let guard = self.data.lock().unwrap();
            guard.clone()
        };
        self.file_storage.write_json(&self.filename, &data).await
    }

    // Source Variable Methods
    pub fn get_source_var(&self, source_url: &str, key: &str) -> Option<String> {
        let guard = self.data.lock().unwrap();
        guard
            .source_vars
            .get(source_url)
            .and_then(|vars| vars.get(key).cloned())
    }

    pub fn set_source_var(&self, source_url: &str, key: &str, value: &str) {
        let mut guard = self.data.lock().unwrap();
        guard
            .source_vars
            .entry(source_url.to_string())
            .or_default()
            .insert(key.to_string(), value.to_string());
    }

    // Cache Methods
    pub fn get_cache(&self, key: &str) -> Option<String> {
        let guard = self.data.lock().unwrap();
        if let Some((value, expire)) = guard.cache.get(key) {
            // Check expiry (if expire > 0)
            if *expire > 0 {
                let now = chrono::Utc::now().timestamp_millis();
                if now > *expire {
                    return None;
                }
            }
            return Some(value.clone());
        }
        None
    }

    pub fn set_cache(&self, key: &str, value: &str, expire_time: i64) {
        let mut guard = self.data.lock().unwrap();
        guard
            .cache
            .insert(key.to_string(), (value.to_string(), expire_time));
    }

    pub fn remove_cache(&self, key: &str) {
        let mut guard = self.data.lock().unwrap();
        guard.cache.remove(key);
    }
}
