use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ── Request / Response types ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecodeRequest {
    pub book_id: String,
    pub chapter_index: usize,
    pub selected_text: String,
    pub surrounding_text: String,
    pub context_meta: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecodeResponse {
    pub term: String,
    pub explanation: Option<String>,
    pub candidate_mappings: Vec<CandidateMapping>,
    pub confidence: ConfidenceLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanRequest {
    pub book_id: String,
    pub chapter_index: usize,
    pub chapter_title: String,
    pub chapter_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub book_id: String,
    pub chapter_index: usize,
    pub aliases: Vec<AliasEntry>,
    pub events: Vec<EventEntry>,
    pub confidence: ConfidenceLevel,
}

// ── Domain types ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateMapping {
    pub alias: String,
    pub canonical: String,
    pub category: MappingCategory,
    pub confidence: f32,
    pub context_clue: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AliasMapping {
    pub id: String,
    pub book_id: String,
    pub alias: String,
    pub canonical: String,
    pub category: MappingCategory,
    pub confidence: f32,
    pub source: MappingSource,
    pub confirmed: bool,
    pub context_clues: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub confirmed_at: Option<DateTime<Utc>>,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AliasEntry {
    pub alias: String,
    pub canonical: Option<String>,
    pub category: MappingCategory,
    pub first_seen_at: String,
    pub context_snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventEntry {
    pub reference: String,
    pub description: Option<String>,
    pub category: MappingCategory,
    pub context_snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterMeta {
    pub book_id: String,
    pub chapter_index: usize,
    pub chapter_title: String,
    pub summary: Option<String>,
    pub alias_count: usize,
    pub scanned_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncLogEntry {
    pub id: String,
    pub book_id: String,
    pub action: SyncAction,
    pub mapping_id: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SyncAction {
    Created,
    Updated,
    Deleted,
}

// ── Enums ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConfidenceLevel {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MappingCategory {
    Person,
    Place,
    Event,
    Faction,
    Meme,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MappingSource {
    Ai,
    User,
    Community,
}
