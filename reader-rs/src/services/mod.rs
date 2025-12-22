mod book;
mod source;
mod replace;
mod group;
mod http;

pub use book::BookService;
pub use source::SourceService;
pub use replace::ReplaceService;
pub use group::GroupService;
pub use http::HttpClient;

/// 应用全局状态
pub struct AppState {
    pub book_service: BookService,
    pub source_service: SourceService,
    pub replace_service: ReplaceService,
    pub group_service: GroupService,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            book_service: BookService::new(),
            source_service: SourceService::new(),
            replace_service: ReplaceService::new(),
            group_service: GroupService::new(),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
