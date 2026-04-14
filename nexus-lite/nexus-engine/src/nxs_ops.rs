use nexus_core::{BookInfo, BookItem, Chapter, EngineError};
use scraper::Html;

use crate::nxs_engine::NxsEngine;

pub(crate) struct SearchOperation<'a> {
    engine: &'a NxsEngine,
}

impl<'a> SearchOperation<'a> {
    pub(crate) fn new(engine: &'a NxsEngine) -> Self {
        Self { engine }
    }

    pub(crate) async fn execute(&self, query: &str) -> Result<Vec<BookItem>, EngineError> {
        let source = self.engine.source();
        let method = &source.search.method;
        let is_post = method.to_uppercase() == "POST";
        let encoded_query = self.engine.get_encoded_query(query);
        let url_path = source.search.path.replace("{q}", &encoded_query);
        let url = if url_path.starts_with("http") {
            url_path
        } else {
            format!("{}{}", source.url.trim_end_matches('/'), url_path)
        };
        let body = if is_post {
            source
                .search
                .body
                .as_ref()
                .map(|b| b.replace("{q}", &encoded_query))
        } else {
            None
        };

        let html = self.engine.fetch(&url, Some(method), body, None).await?;
        let doc = Html::parse_document(&html);
        Ok(self
            .engine
            .parser()
            .search_results(&doc, |value| self.engine.abs_url(value)))
    }
}

pub(crate) struct BookInfoOperation<'a> {
    engine: &'a NxsEngine,
}

impl<'a> BookInfoOperation<'a> {
    pub(crate) fn new(engine: &'a NxsEngine) -> Self {
        Self { engine }
    }

    pub(crate) async fn execute(&self, book_url: &str) -> Result<BookInfo, EngineError> {
        let url = self.engine.abs_url(book_url);
        let html = self.engine.fetch(&url, None, None, None).await?;
        let doc = Html::parse_document(&html);
        self.engine
            .parser()
            .book_info(&doc, |value| self.engine.abs_url(value))
    }
}

pub(crate) struct ChaptersOperation<'a> {
    engine: &'a NxsEngine,
}

impl<'a> ChaptersOperation<'a> {
    pub(crate) fn new(engine: &'a NxsEngine) -> Self {
        Self { engine }
    }

    pub(crate) async fn execute(&self, toc_url: &str) -> Result<Vec<Chapter>, EngineError> {
        let url = self.engine.abs_url(toc_url);
        let html = self.engine.fetch(&url, None, None, None).await?;
        let redirect_url = {
            let doc = Html::parse_document(&html);
            self.engine
                .parser()
                .chapter_redirect_url(&doc, |value| self.engine.abs_url(value))
        };

        let final_doc = if let Some(real_url) = redirect_url {
            if real_url != url && !real_url.contains('#') {
                let new_html = self.engine.fetch(&real_url, None, None, None).await?;
                Html::parse_document(&new_html)
            } else {
                Html::parse_document(&html)
            }
        } else {
            Html::parse_document(&html)
        };

        Ok(self
            .engine
            .parser()
            .chapters(&final_doc, |value| self.engine.abs_url(value)))
    }
}
