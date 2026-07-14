//! Node.js process pool — executes translated JS sources via JSON-RPC over stdio.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use tokio::sync::Mutex;
use tracing::{info, warn};

use nexus_core::{BookInfo, BookItem, Chapter, EngineError};

use super::{RunResult, Runner};

/// Configuration for the Node.js process pool.
#[derive(Debug, Clone)]
pub struct NodePoolConfig {
    pub node_path: String,
    pub worker_path: String,
    pub pool_size: usize,
    pub request_timeout_secs: u64,
    pub sources_dir: String,
}

impl Default for NodePoolConfig {
    fn default() -> Self {
        Self {
            node_path: "node".to_string(),
            worker_path: String::new(),
            pool_size: 2,
            request_timeout_secs: 30,
            sources_dir: String::new(),
        }
    }
}

struct NodeWorker {
    process: Child,
    stdin: std::process::ChildStdin,
    next_id: AtomicUsize,
}

impl NodeWorker {
    fn spawn(config: &NodePoolConfig) -> Result<Self, EngineError> {
        let mut process = Command::new(&config.node_path)
            .arg(&config.worker_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .env("SOURCES_DIR", &config.sources_dir)
            .spawn()
            .map_err(|e| EngineError::ContentExtractionFailed {
                reason: format!("spawn worker: {}", e),
            })?;

        let stdin = process
            .stdin
            .take()
            .ok_or_else(|| EngineError::ContentExtractionFailed {
                reason: "no worker stdin".to_string(),
            })?;

        Ok(Self {
            process,
            stdin,
            next_id: AtomicUsize::new(1),
        })
    }

    fn send_request(&mut self, method: &str, params: &str) -> Result<u64, EngineError> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let request = format!(r#"{{"id":{},"method":"{}","params":{}}}"#, id, method, params);
        writeln!(self.stdin, "{}", request).map_err(|e| EngineError::ContentExtractionFailed {
            reason: format!("worker write: {}", e),
        })?;
        Ok(id as u64)
    }

    fn read_response(
        &mut self,
        expected_id: u64,
        timeout_secs: u64,
    ) -> Result<String, EngineError> {
        let stdout =
            self.process
                .stdout
                .as_mut()
                .ok_or_else(|| EngineError::ContentExtractionFailed {
                    reason: "no worker stdout".to_string(),
                })?;

        let reader = BufReader::new(stdout);
        let start = std::time::Instant::now();

        for line in reader.lines() {
            if start.elapsed() > Duration::from_secs(timeout_secs) {
                return Err(EngineError::Timeout);
            }

            let text = line.map_err(|e| EngineError::ContentExtractionFailed {
                reason: format!("worker read: {}", e),
            })?;

            if text.contains("\"error\"") {
                let msg = extract_error(&text);
                return Err(EngineError::ContentExtractionFailed {
                    reason: format!("worker: {}", msg),
                });
            }
            if text.contains(&format!("\"id\":{}", expected_id)) {
                return Ok(text);
            }
        }

        Err(EngineError::ContentExtractionFailed {
            reason: "worker ended".to_string(),
        })
    }
}

pub struct NodeRunner {
    config: NodePoolConfig,
    workers: Arc<Mutex<VecDeque<NodeWorker>>>,
}

impl NodeRunner {
    pub fn new(config: NodePoolConfig) -> Result<Self, EngineError> {
        let mut workers = VecDeque::new();
        for i in 0..config.pool_size {
            match NodeWorker::spawn(&config) {
                Ok(w) => {
                    info!("Node.js worker {} spawned", i);
                    workers.push_back(w);
                },
                Err(e) => {
                    warn!("Failed to spawn worker {}: {}", i, e);
                },
            }
        }
        if workers.is_empty() {
            return Err(EngineError::ContentExtractionFailed {
                reason: "no workers available".to_string(),
            });
        }
        Ok(Self {
            config,
            workers: Arc::new(Mutex::new(workers)),
        })
    }

    async fn execute(
        &self,
        source_id: &str,
        method: &str,
        args: &[(&str, &str)],
    ) -> Result<String, EngineError> {
        let mut workers = self.workers.lock().await;
        let mut worker =
            workers
                .pop_front()
                .ok_or_else(|| EngineError::ContentExtractionFailed {
                    reason: "no workers".to_string(),
                })?;

        let params = build_params(source_id, args);
        let id = worker.send_request(method, &params)?;
        let response = worker.read_response(id, self.config.request_timeout_secs)?;
        workers.push_back(worker);
        Ok(response)
    }
}

#[async_trait]
impl Runner for NodeRunner {
    async fn search(
        &self,
        source_id: &str,
        keyword: &str,
        page: u32,
    ) -> Result<RunResult<Vec<BookItem>>, EngineError> {
        let response = self
            .execute(source_id, "search", &[("keyword", keyword), ("page", &page.to_string())])
            .await?;

        let items: Vec<BookItem> =
            serde_json::from_str(&extract_result(&response)).map_err(|e| {
                EngineError::ContentExtractionFailed {
                    reason: format!("parse search: {}", e),
                }
            })?;

        Ok(RunResult {
            data: items,
            needs_browser: None,
        })
    }

    async fn book_info(
        &self,
        source_id: &str,
        book_url: &str,
    ) -> Result<RunResult<BookInfo>, EngineError> {
        let response = self
            .execute(source_id, "bookInfo", &[("bookUrl", book_url)])
            .await?;
        let info: BookInfo = serde_json::from_str(&extract_result(&response)).map_err(|e| {
            EngineError::ContentExtractionFailed {
                reason: format!("parse bookInfo: {}", e),
            }
        })?;
        Ok(RunResult {
            data: info,
            needs_browser: None,
        })
    }

    async fn chapters(
        &self,
        source_id: &str,
        toc_url: &str,
    ) -> Result<RunResult<Vec<Chapter>>, EngineError> {
        let response = self
            .execute(source_id, "chapterList", &[("tocUrl", toc_url)])
            .await?;
        let chapters: Vec<Chapter> =
            serde_json::from_str(&extract_result(&response)).map_err(|e| {
                EngineError::ContentExtractionFailed {
                    reason: format!("parse chapters: {}", e),
                }
            })?;
        Ok(RunResult {
            data: chapters,
            needs_browser: None,
        })
    }

    async fn content(
        &self,
        source_id: &str,
        chapter_url: &str,
    ) -> Result<RunResult<String>, EngineError> {
        let response = self
            .execute(source_id, "chapterContent", &[("chapterUrl", chapter_url)])
            .await?;
        let content: String = serde_json::from_str(&extract_result(&response)).map_err(|e| {
            EngineError::ContentExtractionFailed {
                reason: format!("parse content: {}", e),
            }
        })?;
        Ok(RunResult {
            data: content,
            needs_browser: None,
        })
    }
}

fn build_params(source_id: &str, args: &[(&str, &str)]) -> String {
    let mut params = format!(r#"{{"sourceId":"{}""#, source_id);
    for (k, v) in args {
        params.push_str(&format!(r#","{}":"{}"#, k, v));
    }
    params.push('}');
    params
}

fn extract_result(response: &str) -> &str {
    if let Some(start) = response.find("\"result\":") {
        let after = &response[start + 9..];
        if let Some(end) = after.rfind('}') {
            return &after[..=end];
        }
    }
    response
}

fn extract_error(response: &str) -> String {
    if let Some(start) = response.find("\"message\":\"") {
        let after = &response[start + 11..];
        if let Some(end) = after.find('"') {
            return after[..end].to_string();
        }
    }
    "unknown".to_string()
}
