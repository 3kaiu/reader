use serde::{Deserialize, Serialize};

/// Catalog item (book representation in curated feeds)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryItem {
    pub book_id: String,
    pub name: String,
    pub author: Option<String>,
    pub cover_url: Option<String>,
    pub book_url: String,
    pub intro: Option<String>,
    pub followers: Option<u32>,
    pub position: u32,
}

/// Catalog section (Carousel, List, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySection {
    pub section: String,
    pub items: Vec<DiscoveryItem>,
}

/// Catalog response (aggregated for a period)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryResponse {
    pub period: String,
    pub start_date: String,
    pub end_date: String,
    pub sections: Vec<DiscoverySection>,
    pub available_periods: Vec<String>,
}
