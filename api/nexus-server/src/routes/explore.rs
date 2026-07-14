//! Explore/Discovery API routes
//!
//! Provides endpoints for curated catalog browsing from book sources
//! that implement the `ExploreEngine` trait.

use axum::{extract::State, Json};
use nexus_core::ExploreCategory;
use serde::{Deserialize, Serialize};

use crate::app::AppState;
use crate::error::{internal_error, not_found, ApiErrorResponse};

#[derive(Deserialize)]
pub struct ExploreCategoriesQuery {
    pub source: String,
}

#[derive(Deserialize)]
pub struct ExploreQuery {
    pub source: String,
    pub category_url: String,
    #[allow(dead_code)]
    pub page: Option<usize>,
}

#[derive(Serialize)]
pub struct ExploreCategoriesResponse {
    pub categories: Vec<ExploreCategory>,
}

/// Get available explore categories for a source
pub async fn explore_categories(
    State(state): State<AppState>,
    Json(query): Json<ExploreCategoriesQuery>,
) -> Result<Json<ExploreCategoriesResponse>, ApiErrorResponse> {
    let engine = state
        .engine_registry
        .get_explore_engine(&query.source)
        .ok_or_else(|| not_found("Source or source does not support explore"))?;

    let categories = engine
        .explore_categories()
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    Ok(Json(ExploreCategoriesResponse { categories }))
}

/// Get books in a category from a source
pub async fn explore(
    State(state): State<AppState>,
    Json(query): Json<ExploreQuery>,
) -> Result<Json<Vec<nexus_core::BookItem>>, ApiErrorResponse> {
    let engine = state
        .engine_registry
        .get_explore_engine(&query.source)
        .ok_or_else(|| not_found("Source or source does not support explore"))?;

    let book_items = engine
        .explore(&query.category_url)
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    Ok(Json(book_items))
}
