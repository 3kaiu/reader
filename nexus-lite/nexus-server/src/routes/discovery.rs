use crate::app::AppState;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use nexus_core::{DiscoveryItem, DiscoveryResponse, DiscoverySection};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Deserialize)]
pub struct DiscoveryQuery {
    pub period: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QidianData {
    pub periods: HashMap<String, QidianPeriod>,
}

#[derive(Debug, Deserialize)]
struct QidianPeriod {
    pub _period: String,
    pub start_date: String,
    pub end_date: String,
    pub items: Vec<QidianItem>,
}

#[derive(Debug, Deserialize)]
struct QidianItem {
    pub book_id: String,
    pub name: String,
    pub book_url: String,
    pub cover_url: Option<String>,
    pub section: String,
    pub position: u32,
    pub author: Option<String>,
    pub intro: Option<String>,
    pub followers: Option<u32>,
}

pub async fn list_discovery(
    State(_state): State<AppState>,
    Query(query): Query<DiscoveryQuery>,
) -> Result<Json<DiscoveryResponse>, (StatusCode, String)> {
    // 1. Locate data files
    let base_path = PathBuf::from("../cf-bypass-service/data/qidian");
    let rec_path = base_path.join("editor_recommend.json");
    let sign_path = base_path.join("new_sign.json");

    // 2. Load and parse data
    let rec_data: QidianData = load_json(&rec_path)?;
    let sign_data: QidianData = load_json(&sign_path)?;

    // 3. Aggregate all available periods
    let mut all_periods: Vec<String> = rec_data.periods.keys().cloned().collect();
    for p in sign_data.periods.keys() {
        if !all_periods.contains(p) {
            all_periods.push(p.clone());
        }
    }
    all_periods.sort_by(|a, b| b.cmp(a)); // Newest first

    // 4. Select target period
    let target_period = query
        .period
        .unwrap_or_else(|| all_periods.first().cloned().unwrap_or_default());

    if target_period.is_empty() {
        return Err((
            StatusCode::NOT_FOUND,
            "No discovery data available".to_string(),
        ));
    }

    // 5. Gather sections for the period
    let mut sections = Vec::new();

    // From editor_recommend
    if let Some(p_data) = rec_data.periods.get(&target_period) {
        let mut section_map: HashMap<String, Vec<DiscoveryItem>> = HashMap::new();
        for item in &p_data.items {
            section_map
                .entry(item.section.clone())
                .or_default()
                .push(map_item(item));
        }

        // Add sections in preferred order
        for s_type in ["carousel", "image_list", "list"] {
            if let Some(items) = section_map.get(s_type) {
                sections.push(DiscoverySection {
                    section: s_type.to_string(),
                    items: items.clone(),
                });
            }
        }
    }

    // From new_sign
    if let Some(p_data) = sign_data.periods.get(&target_period) {
        let mut sign_items: Vec<DiscoveryItem> = p_data.items.iter().map(map_item).collect();
        sign_items.sort_by_key(|i| i.position);

        sections.push(DiscoverySection {
            section: "new_sign".to_string(),
            items: sign_items,
        });
    }

    // Get dates from any available data
    let (start_date, end_date) = if let Some(p) = rec_data.periods.get(&target_period) {
        (p.start_date.clone(), p.end_date.clone())
    } else if let Some(p) = sign_data.periods.get(&target_period) {
        (p.start_date.clone(), p.end_date.clone())
    } else {
        ("".to_string(), "".to_string())
    };

    Ok(Json(DiscoveryResponse {
        period: target_period,
        start_date,
        end_date,
        sections,
        available_periods: all_periods,
    }))
}

fn load_json<T: serde::de::DeserializeOwned>(path: &PathBuf) -> Result<T, (StatusCode, String)> {
    let content = std::fs::read_to_string(path).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to read data file: {}", e),
        )
    })?;
    serde_json::from_str(&content).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to parse data: {}", e),
        )
    })
}

fn map_item(item: &QidianItem) -> DiscoveryItem {
    DiscoveryItem {
        book_id: item.book_id.clone(),
        name: item.name.clone(),
        author: item.author.clone(),
        cover_url: item.cover_url.clone(),
        book_url: item.book_url.clone(),
        intro: item.intro.clone(),
        followers: item.followers,
        position: item.position,
    }
}
