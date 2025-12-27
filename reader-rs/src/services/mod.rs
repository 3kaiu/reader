mod book;
mod source;
mod replace;
mod group;
mod http;
mod migration;

pub use book::BookService;
pub use source::SourceService;
pub use replace::ReplaceService;
pub use group::GroupService;
pub use migration::Migration;

use crate::engine::search_engine::SearchEngine;
use std::sync::Arc;

/// 应用全局状态
pub struct AppState {
    pub book_service: BookService,
    pub source_service: SourceService,
    pub replace_service: ReplaceService,
    pub group_service: GroupService,
    pub search_engine: Arc<SearchEngine>,
}

impl AppState {
    pub fn new() -> Self {
        let storage_dir = "./storage"; // TODO: Configure this via env or config
        let search_engine = Arc::new(SearchEngine::new(storage_dir).expect("Failed to initialize search engine"));
        
        Self {
            book_service: BookService::new(search_engine.clone()),
            source_service: SourceService::new(),
            replace_service: ReplaceService::new(),
            group_service: GroupService::new(),
            search_engine,
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
