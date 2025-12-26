use axum::{
    routing::{get, post},
    Router,
};
use std::sync::Arc;

mod book;
mod file;
pub mod group;
mod manage;
mod migration;
mod replace;
mod source;

use crate::services::AppState;

pub fn routes() -> Router {
    let state = Arc::new(AppState::new());

    Router::new()
        // 书籍 API
        .route("/getBookshelf", get(book::get_bookshelf))
        .route("/getChapterList", get(book::get_chapter_list))
        .route("/getBookContent", get(book::get_book_content))
        .route("/getBookInfo", get(book::get_book_info))
        .route("/search", get(book::search))
        .route("/searchBookMultiSSE", get(book::search_book_multi_sse))
        .route("/saveBook", post(book::save_book))
        .route("/deleteBook", post(book::delete_book))
        .route("/saveBookProgress", post(book::save_book_progress))
        // 书源 API
        .route("/getBookSources", get(source::get_book_sources))
        .route(
            "/getAvailableBookSource",
            post(source::get_available_book_source),
        )
        .route("/setBookSource", post(source::set_book_source))
        .route("/searchBookSourceSSE", get(source::search_book_source_sse))
        .route("/saveBookSource", post(source::save_book_source))
        .route("/deleteBookSource", post(source::delete_book_source))
        .route("/importBookSource", post(source::import_book_source))
        .route(
            "/readRemoteSourceFile",
            post(source::read_remote_source_file),
        )
        .route("/saveBookSources", post(source::save_book_sources))
        .route("/testBookSource", post(source::test_book_source))
        .route("/deleteBookSources", post(source::delete_book_sources))
        .route(
            "/saveFromRemoteSource",
            post(source::save_from_remote_source),
        )
        // 替换规则 API
        .route("/getReplaceRules", get(replace::get_replace_rules))
        .route("/saveReplaceRule", post(replace::save_replace_rule))
        .route("/saveReplaceRules", post(replace::save_replace_rules))
        .route("/deleteReplaceRules", post(replace::delete_replace_rules))
        // 分组 API
        .route("/getBookGroups", get(group::get_book_groups))
        .route("/saveBookGroup", post(group::save_book_group))
        .route("/deleteBookGroup", post(group::delete_book_group))
        .route("/saveBookGroupOrder", post(group::save_book_group_order))
        // 批量管理 API
        .route("/deleteBooks", post(manage::delete_books))
        .route("/addBookGroupMulti", post(manage::add_book_group_multi))
        .route(
            "/removeBookGroupMulti",
            post(manage::remove_book_group_multi),
        )
        // 迁移 API
        .route("/migrate", post(migration::migrate))
        // 文件 API
        .route("/file/get", get(file::file_get))
        .route("/file/save", post(file::file_save))
        // 静态资源
        .route("/cover", get(book::get_cover))
        // 统计 API
        .route("/stats", get(get_stats))
        .route("/stats/reset", post(reset_stats))
        .with_state(state)
}

/// Get execution statistics
async fn get_stats() -> axum::Json<crate::engine::stats::StatsSnapshot> {
    axum::Json(crate::engine::stats::STATS.snapshot())
}

/// Reset execution statistics
async fn reset_stats() -> &'static str {
    crate::engine::stats::STATS.reset();
    "ok"
}
