use nexus_core::{BookInfo, BookItem, Chapter, EngineError, NxsSource};
use scraper::Html;
use std::sync::Arc;

use crate::nxs_engine::CompiledNxs;
use crate::selector_cache::extract_attr;

pub(crate) struct NxsParser<'a> {
    pub(crate) source: &'a NxsSource,
    pub(crate) compiled: &'a CompiledNxs,
}

impl<'a> NxsParser<'a> {
    pub(crate) fn search_results<F>(&self, doc: &Html, abs_url: F) -> Vec<BookItem>
    where
        F: Fn(&str) -> String,
    {
        let items = self.compiled.search_list.select_all(doc);

        let source_domain = self
            .source
            .url
            .strip_prefix("https://")
            .or_else(|| self.source.url.strip_prefix("http://"))
            .unwrap_or(&self.source.url)
            .trim_end_matches('/');

        let source_id: Arc<str> = self.source.id.as_str().into();
        let source_name: Arc<str> = self.source.name.as_str().into();

        items
            .iter()
            .filter_map(|el| {
                let name = self.compiled.search_name.select_from_and_extract(el)?;
                let url = self.compiled.search_url.select_from_and_extract(el)?;
                let book_url = abs_url(&url);

                let is_external = !url.starts_with('/') && !url.contains(source_domain);
                if is_external && !book_url.contains(source_domain) {
                    return None;
                }

                if let Some(filter) = &self.source.search.result_filter {
                    if !book_url.contains(filter) {
                        return None;
                    }
                }

                let mut item =
                    BookItem::new(name, book_url, source_id.clone(), source_name.clone());
                item.author = self
                    .compiled
                    .search_author
                    .select_from_and_extract(el)
                    .map(|s| s.into());
                item.cover_url = self
                    .compiled
                    .search_cover
                    .select_from_and_extract(el)
                    .map(|u| abs_url(&u).into());
                item.intro = self
                    .compiled
                    .search_intro
                    .select_from_and_extract(el)
                    .map(|s| s.into());
                Some(item)
            })
            .collect()
    }

    pub(crate) fn book_info<F>(&self, doc: &Html, abs_url: F) -> Result<BookInfo, EngineError>
    where
        F: Fn(&str) -> String,
    {
        let name =
            self.compiled
                .book_name
                .select_and_extract(doc)
                .ok_or(EngineError::RuleMismatch {
                    rule: "book.name".to_string(),
                })?;

        Ok(BookInfo {
            name: name.into(),
            author: self
                .compiled
                .book_author
                .select_and_extract(doc)
                .unwrap_or_default()
                .into(),
            intro: self
                .compiled
                .book_intro
                .select_and_extract(doc)
                .map(|s| s.into()),
            cover_url: self
                .compiled
                .book_cover
                .select_and_extract(doc)
                .map(|u| abs_url(&u).into()),
            toc_url: self
                .compiled
                .book_toc
                .select_and_extract(doc)
                .map(|u| abs_url(&u).into()),
            last_chapter: None,
            word_count: None,
            update_time: None,
            status: None,
            category: None,
            meta: None,
        })
    }

    pub(crate) fn chapter_redirect_url<F>(&self, doc: &Html, abs_url: F) -> Option<String>
    where
        F: Fn(&str) -> String,
    {
        self.compiled
            .book_toc
            .select_and_extract(doc)
            .map(|u| abs_url(&u))
    }

    pub(crate) fn chapters<F>(&self, doc: &Html, abs_url: F) -> Vec<Chapter>
    where
        F: Fn(&str) -> String,
    {
        let items = self.compiled.toc_list.select_all(doc);

        let mut chapters: Vec<Chapter> = items
            .iter()
            .enumerate()
            .filter_map(|(idx, el)| {
                let name = if self.compiled.toc_name.is_empty() {
                    extract_attr(*el, "text")
                } else {
                    self.compiled
                        .toc_name
                        .select_from_and_extract(el)
                        .or_else(|| extract_attr(*el, "text"))
                };

                let url = if self.compiled.toc_url.is_empty() {
                    el.value().attr("href").map(|s| s.to_string())
                } else {
                    self.compiled
                        .toc_url
                        .select_from_and_extract(el)
                        .or_else(|| el.value().attr("href").map(|s| s.to_string()))
                };

                let url = url?;
                let name = name?;
                if name.is_empty() {
                    return None;
                }

                Some(Chapter {
                    title: name.into(),
                    url: abs_url(&url).into(),
                    index: idx,
                    is_vip: false,
                    word_count: None,
                })
            })
            .collect();

        if self.source.toc.reverse {
            chapters.reverse();
            for (idx, chapter) in chapters.iter_mut().enumerate() {
                chapter.index = idx;
            }
        }

        chapters
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nxs_engine::CompiledNxs;
    use std::path::PathBuf;

    fn fixture_path(rel: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
    }

    fn load_source(rel: &str) -> NxsSource {
        let raw = std::fs::read_to_string(fixture_path(rel)).expect("read source fixture");
        serde_json::from_str(&raw).expect("parse source fixture")
    }

    #[test]
    fn parser_filters_external_search_results_and_maps_fields() {
        let source = load_source("../sources/hetushu.nxs");
        let compiled = CompiledNxs::compile(&source).expect("compile source");
        let parser = NxsParser {
            source: &source,
            compiled: &compiled,
        };
        let html = Html::parse_document(
            r#"
            <div class="result">
              <a class="result__a">本地结果</a>
              <a class="result__url" href="https://www.hetushu.com/book/1/index.html">链接</a>
              <a class="result__snippet">简介一</a>
            </div>
            <div class="result">
              <a class="result__a">外站结果</a>
              <a class="result__url" href="https://example.com/book/2.html">链接</a>
              <a class="result__snippet">简介二</a>
            </div>
            "#,
        );

        let results = parser.search_results(&html, |value| value.to_string());

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name.as_ref(), "本地结果");
        assert!(results[0].book_url.contains("hetushu.com/book/1"));
        assert_eq!(results[0].intro.as_deref(), Some("简介一"));
    }

    #[test]
    fn parser_reindexes_reversed_chapters() {
        let mut source = load_source("../sources/hetushu.nxs");
        source.toc.reverse = true;
        let compiled = CompiledNxs::compile(&source).expect("compile source");
        let parser = NxsParser {
            source: &source,
            compiled: &compiled,
        };
        let html = Html::parse_document(
            r#"
            <dl id="dir">
              <dd><a href="/book/1/a.html">第一章</a></dd>
              <dd><a href="/book/1/b.html">第二章</a></dd>
            </dl>
            "#,
        );

        let chapters = parser.chapters(&html, |value| format!("https://www.hetushu.com{value}"));

        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title.as_ref(), "第二章");
        assert_eq!(chapters[0].index, 0);
        assert_eq!(chapters[1].title.as_ref(), "第一章");
        assert_eq!(chapters[1].index, 1);
    }
}
