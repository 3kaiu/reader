/// Sliding window of recent chapters for context assembly.
///
/// Maintains up to N chapter summaries, dropping oldest when the window slides.
/// Used by ContextAssembler to provide ChapterContext with limited history.
pub struct ContextWindow {
    max_chapters: usize,
    summaries: Vec<String>,
}

impl ContextWindow {
    pub fn new(max_chapters: usize) -> Self {
        Self {
            max_chapters,
            summaries: Vec::with_capacity(max_chapters + 1),
        }
    }

    /// Add a new chapter summary (evicts oldest if at capacity).
    pub fn push(&mut self, summary: String) {
        self.summaries.push(summary);
        if self.summaries.len() > self.max_chapters {
            self.summaries.remove(0);
        }
    }

    pub fn summaries(&self) -> &[String] {
        &self.summaries
    }

    pub fn len(&self) -> usize {
        self.summaries.len()
    }
}
