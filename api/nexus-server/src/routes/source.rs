use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_core::LegadoSource;
use serde::Serialize;

use crate::app::AppState;

fn sanitize_source_id(id: &str) -> Result<&str, StatusCode> {
    if id.contains("..") || id.contains('/') || id.contains('\\') || id.contains('\0') {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegadoSourceView {
    pub source: LegadoSource,
    pub classification: String,
}

fn classify_source(source: &LegadoSource) -> String {
    let text = format!("{:?}", source);
    if text.contains("startBrowser") || source.rule_content.as_ref().and_then(|c| c.web_js.as_ref()).is_some() {
        "webjs".to_string()
    } else if text.contains("@js:") || text.contains("<js>") || text.contains("java.") {
        "js".to_string()
    } else if text.contains("@xpath:") {
        "xpath".to_string()
    } else {
        "css".to_string()
    }
}

pub async fn import_legado_sources(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<Vec<LegadoSourceView>>, (StatusCode, String)> {
    let sources: Vec<LegadoSource> = if let Ok(array) = serde_json::from_value::<Vec<LegadoSource>>(payload.clone()) {
        array
    } else if let Ok(single) = serde_json::from_value::<LegadoSource>(payload) {
        vec![single]
    } else {
        return Err((StatusCode::BAD_REQUEST, "Invalid Legado source JSON".to_string()));
    };

    let mut imported = Vec::new();
    for source in sources {
        let id = source.infer_id();
        state.engine_registry.legado_store.save(&source).await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        state.engine_registry.invalidate(&id);

        if let Some(store) = state.engine_registry.legado_store.get(&id) {
            let classification = classify_source(&source);
            imported.push(LegadoSourceView { source, classification });
        }
    }

    Ok(Json(imported))
}

pub async fn list_legado_sources(
    State(state): State<AppState>,
) -> Json<Vec<LegadoSourceView>> {
    let sources = state.engine_registry.legado_store.get_all();
    let result: Vec<LegadoSourceView> = sources
        .into_iter()
        .map(|source| {
            let classification = classify_source(&source);
            LegadoSourceView { source, classification }
        })
        .collect();
    Json(result)
}

pub async fn delete_legado_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> StatusCode {
    let id = match sanitize_source_id(&id) {
        Ok(id) => id,
        Err(_) => return StatusCode::BAD_REQUEST,
    };

    let _ = state.engine_registry.legado_store.delete(id).await;
    state.engine_registry.invalidate(id);
    StatusCode::NO_CONTENT
}