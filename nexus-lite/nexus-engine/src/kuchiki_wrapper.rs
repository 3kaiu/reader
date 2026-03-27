//! Kuchiki HTML Tree Integration
//!
//! Advanced HTML tree manipulation and traversal using kuchiki.
//! Provides efficient DOM tree operations for content extraction.

use kuchiki::traits::TendrilSink;
use kuchiki::{Attribute, ExpandedName, NodeRef, NodeData, ElementData};

/// Enhanced HTML tree operations using kuchiki
pub struct KuchikiTreeOps {
    root: NodeRef,
}

impl KuchikiTreeOps {
    /// Parse HTML into a kuchiki tree
    pub fn parse(html: &str) -> Result<Self, String> {
        let root = kuchiki::parse_html().one(html);
        Ok(Self { root })
    }

    /// Find content nodes by CSS selector
    pub fn find_by_selector(&self, selector: &str) -> Vec<NodeRef> {
        let mut nodes = Vec::new();
        
        for node in self.root.descendants() {
            if let Some(element) = node.as_element() {
                if &*element.name.local == selector || &*element.name.ns == selector {
                    nodes.push(node);
                }
            }
        }
        
        nodes
    }

    /// Find nodes with specific attributes
    pub fn find_by_attribute(&self, attr_name: &str, attr_value: Option<&str>) -> Vec<NodeRef> {
        let mut nodes = Vec::new();
        
        for node in self.root.descendants() {
            if let Some(element) = node.as_element() {
                let matches = if let Some(value) = element.attributes.borrow().get(attr_name) {
                    attr_value.is_none() || value == attr_value.unwrap()
                } else {
                    false
                };
                if matches {
                    nodes.push(node.clone());
                }
            }
        }
        
        nodes
    }

    /// Extract text content from a subtree
    pub fn extract_text(&self, node: &NodeRef) -> String {
        let mut text = String::new();
        
        for child in node.descendants() {
            if let NodeData::Text(t) = child.data() {
                text.push_str(&t.borrow());
            }
        }
        
        text
    }

    /// Find the largest text node (likely main content)
    pub fn find_largest_text_node(&self) -> Option<NodeRef> {
        let mut best_node = None;
        let mut best_length = 0;
        
        for node in self.root.descendants() {
            if let NodeData::Element(_) = node.data() {
                let text = self.extract_text(&node);
                let length = text.chars().count();
                
                if length > best_length && length > 100 {
                    best_length = length;
                    best_node = Some(node);
                }
            }
        }
        
        best_node
    }

    /// Remove nodes by selector
    pub fn remove_by_selector(&mut self, selector: &str) {
        let nodes_to_remove: Vec<_> = self.find_by_selector(selector)
            .into_iter()
            .collect();
        
        for node in nodes_to_remove {
            node.detach();
        }
    }

    /// Remove navigation and boilerplate elements
    pub fn remove_boilerplate(&mut self) {
        let boilerplate_selectors = vec![
            "nav",
            "header",
            "footer",
            "aside",
            ".navigation",
            ".menu",
            ".sidebar",
            ".ad",
            ".advertisement",
            "#navigation",
            "#menu",
            "#sidebar",
            "#ad",
        ];
        
        for selector in boilerplate_selectors {
            self.remove_by_selector(selector);
        }
    }

    /// Get tree statistics
    pub fn get_stats(&self) -> TreeStats {
        let mut stats = TreeStats::default();
        
        for node in self.root.descendants() {
            match node.data() {
                NodeData::Element(_) => stats.element_count += 1,
                NodeData::Text(_) => stats.text_node_count += 1,
                NodeData::Comment(_) => stats.comment_count += 1,
                NodeData::Document(_) => {}
                NodeData::DocumentFragment => {}
                NodeData::Doctype(_) => stats.doctype_count += 1,
                NodeData::ProcessingInstruction(_) => stats.pi_count += 1,
            }
        }
        
        stats
    }

    /// Convert tree back to HTML
    pub fn to_html(&self) -> String {
        let mut html = Vec::new();
        self.root.serialize(&mut html);
        String::from_utf8_lossy(&html).to_string()
    }
}

/// Tree statistics
#[derive(Debug, Clone, Default)]
pub struct TreeStats {
    pub element_count: usize,
    pub text_node_count: usize,
    pub comment_count: usize,
    pub doctype_count: usize,
    pub pi_count: usize,
}

/// Advanced content extraction using kuchiki
pub struct KuchikiContentExtractor {
    tree_ops: KuchikiTreeOps,
}

impl KuchikiContentExtractor {
    pub fn new(html: &str) -> Result<Self, String> {
        let tree_ops = KuchikiTreeOps::parse(html)?;
        Ok(Self { tree_ops })
    }

    /// Extract main content using tree traversal
    pub fn extract_main_content(&self) -> Option<String> {
        // Try to find the largest text node
        if let Some(node) = self.tree_ops.find_largest_text_node() {
            let text = self.tree_ops.extract_text(&node);
            if !text.is_empty() {
                return Some(self.clean_text(text));
            }
        }

        // Fallback: extract from specific content containers
        let content_selectors = vec![
            ".content",
            "#content",
            ".article-content",
            "#article-content",
            ".chapter-content",
            "#chapter-content",
            ".novel-content",
            "#novel-content",
            "article",
            "main",
        ];

        for selector in content_selectors {
            let nodes = self.tree_ops.find_by_selector(selector);
            if !nodes.is_empty() {
                let mut combined_text = String::new();
                for node in nodes {
                    combined_text.push_str(&self.tree_ops.extract_text(&node));
                    combined_text.push_str("\n\n");
                }
                if !combined_text.trim().is_empty() {
                    return Some(self.clean_text(combined_text));
                }
            }
        }

        None
    }

    /// Clean extracted text
    fn clean_text(&self, text: String) -> String {
        text.lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Remove boilerplate and extract content
    pub fn extract_clean(&mut self) -> Option<String> {
        self.tree_ops.remove_boilerplate();
        self.extract_main_content()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kuchiki_tree_ops() {
        let html = r#"
            <html>
                <body>
                    <div class="content">
                        <p>Test content</p>
                    </div>
                </body>
            </html>
        "#;

        let tree_ops = KuchikiTreeOps::parse(html).unwrap();
        let nodes = tree_ops.find_by_selector(".content");
        assert!(!nodes.is_empty());
    }

    #[test]
    fn test_kuchiki_content_extractor() {
        let html = r#"
            <html>
                <body>
                    <div class="content">
                        <h1>第一章</h1>
                        <p>这是一段测试文本。</p>
                    </div>
                </body>
            </html>
        "#;

        let extractor = KuchikiContentExtractor::new(html).unwrap();
        let content = extractor.extract_main_content();
        assert!(content.is_some());
    }

    #[test]
    fn test_remove_boilerplate() {
        let html = r#"
            <html>
                <body>
                    <nav>Navigation</nav>
                    <div class="content">
                        <p>Main content</p>
                    </div>
                    <footer>Footer</footer>
                </body>
            </html>
        "#;

        let mut tree_ops = KuchikiTreeOps::parse(html).unwrap();
        tree_ops.remove_boilerplate();
        
        let stats = tree_ops.get_stats();
        assert!(stats.element_count < 5); // nav and footer should be removed
    }
}
