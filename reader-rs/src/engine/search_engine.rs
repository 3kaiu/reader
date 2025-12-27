use anyhow::Result;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{Index, IndexReader, IndexWriter, TantivyDocument, Term};

/// 搜索结果项
#[derive(Debug, serde::Serialize)]
pub struct SearchResult {
    pub book_id: String,
    pub title: String,
    pub author: String,
    pub intro: String,
    pub score: f32,
}

/// 搜索管理器
#[derive(Clone)]
pub struct SearchEngine {
    index: Index,
    reader: IndexReader,
    writer: Arc<Mutex<IndexWriter>>,
    // 字段句柄
    fields: Arc<SearchFields>,
}

struct SearchFields {
    book_id: Field,
    title: Field,
    author: Field,
    intro: Field,
}

impl SearchEngine {
    /// 初始化搜索引擎
    pub fn new(storage_dir: &str) -> Result<Self> {
        let index_path = Path::new(storage_dir).join("index");
        if !index_path.exists() {
            fs::create_dir_all(&index_path)?;
        }

        // 定义 Schema
        let mut schema_builder = Schema::builder();

        // 注册结巴分词器配置
        // 注意：Tantivy 是按字段配置分词器的，我们需要先注册分词器
        // 这里的注册逻辑稍后在 index 创建后进行

        // 定义字段
        // book_id: 存储，不索引（用于精确查找 update）或索引（用于删除）
        let book_id = schema_builder.add_text_field("book_id", STRING | STORED);
        
        // 使用中文分词的文本字段
        let text_options = TextOptions::default()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer("default") // 使用默认分词
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            )
            .set_stored();

        let title = schema_builder.add_text_field("title", text_options.clone());
        let author = schema_builder.add_text_field("author", text_options.clone());
        let intro = schema_builder.add_text_field("intro", text_options);

        let schema = schema_builder.build();

        // 打开或创建索引
        // 打开或创建索引
        let meta_path = index_path.join("meta.json");
        let index = if meta_path.exists() {
            Index::open_in_dir(&index_path)?
        } else {
            Index::create_in_dir(&index_path, schema.clone())?
        };

        // 注册结巴分词器


        // 创建 Reader
        let reader = index
            .reader_builder()
            .try_into()?;

        // 创建 Writer (分配 50MB 缓冲区)
        let writer = index.writer(50_000_000)?;

        Ok(Self {
            index,
            reader,
            writer: Arc::new(Mutex::new(writer)),
            fields: Arc::new(SearchFields {
                book_id,
                title,
                author,
                intro,
            }),
        })
    }

    /// 添加或更新书籍索引
    pub fn index_book(&self, id: &str, title: &str, author: &str, intro: &str) -> Result<()> {
        let mut writer = self.writer.lock().unwrap();
        
        // 先删除旧的（如果存在）
        let term = Term::from_field_text(self.fields.book_id, id);
        writer.delete_term(term);

        // 添加新的
        let mut doc = TantivyDocument::default();
        doc.add_text(self.fields.book_id, id);
        doc.add_text(self.fields.title, title);
        doc.add_text(self.fields.author, author);
        doc.add_text(self.fields.intro, intro);

        writer.add_document(doc)?;
        writer.commit()?;
        
        Ok(())
    }

    /// 删除书籍索引
    pub fn delete_book(&self, id: &str) -> Result<()> {
        let mut writer = self.writer.lock().unwrap();
        let term = Term::from_field_text(self.fields.book_id, id);
        writer.delete_term(term);
        writer.commit()?;
        Ok(())
    }

    /// 搜索
    pub fn search(&self, query_str: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let searcher = self.reader.searcher();
        
        // 定义查询解析器，设置权重
        let mut query_parser = QueryParser::for_index(
            &self.index,
            vec![self.fields.title, self.fields.author, self.fields.intro],
        );
        
        // 设置字段权重
        query_parser.set_field_boost(self.fields.title, 10.0);
        query_parser.set_field_boost(self.fields.author, 5.0);
        query_parser.set_field_boost(self.fields.intro, 1.0);

        let query = query_parser.parse_query(query_str)?;
        
        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit))?;

        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let retrieved_doc: TantivyDocument = searcher.doc(doc_address)?;
            
            let book_id = retrieved_doc
                .get_first(self.fields.book_id)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
                
            let title = retrieved_doc
                .get_first(self.fields.title)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            let author = retrieved_doc
                .get_first(self.fields.author)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            let intro = retrieved_doc
                .get_first(self.fields.intro)
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();

            results.push(SearchResult {
                book_id,
                title,
                author,
                intro,
                score,
            });
        }

        Ok(results)
    }
    
    /// 重建索引（清空并重新添加）
    pub fn clear_index(&self) -> Result<()> {
        let mut writer = self.writer.lock().unwrap();
        writer.delete_all_documents()?;
        writer.commit()?;
        Ok(())
    }
}
