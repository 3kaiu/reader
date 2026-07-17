use std::sync::Arc;

use super::window::ContextWindow;
use crate::client::inference::ChapterContext;
use crate::error::AiError;
use crate::knowledge::store::KnowledgeStore;

/// Builds ChapterContext payloads for inference requests.
///
/// Combines stored knowledge with the sliding context window
/// to give the AI model the best possible picture of the ongoing story.
pub struct ContextAssembler {
    store: Arc<dyn KnowledgeStore>,
    window: ContextWindow,
}

impl ContextAssembler {
    pub fn new(store: Arc<dyn KnowledgeStore>, max_chapters: usize) -> Self {
        Self {
            store,
            window: ContextWindow::new(max_chapters),
        }
    }

    /// Assemble context for a given chapter.
    pub async fn assemble(
        &self,
        book_id: &str,
        chapter_index: usize,
        chapter_title: &str,
    ) -> Result<ChapterContext, AiError> {
        let known_mappings = self.store.list_mappings(book_id).await?;
        let chapter_meta = self
            .store
            .get_chapter_meta(book_id, chapter_index)
            .await?;
        let summary = chapter_meta
            .as_ref()
            .and_then(|m| m.summary.clone())
            .unwrap_or_default();

        Ok(ChapterContext {
            book_id: book_id.to_string(),
            chapter_index,
            chapter_title: chapter_title.to_string(),
            known_mappings,
            recent_chapter_summaries: {
                let mut s = self.window.summaries().to_vec();
                if !summary.is_empty() {
                    s.push(summary);
                }
                s
            },
        })
    }

    /// Record a chapter scan summary into the context window.
    pub fn record_summary(&mut self, summary: String) {
        self.window.push(summary);
    }
}
