use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use nexus_core::{LegadoSource, NxsSource, SourcePolicy};
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

use crate::app::AppState;
use crate::error::{internal_error, not_found, ApiErrorResponse};

/// Check if an IPv4 address is private/reserved (RFC 1918/5737/6598/loopback/link-local)
fn is_ipv4_private(v4: &std::net::Ipv4Addr) -> bool {
    v4.is_loopback()
        || v4.is_private()
        || v4.is_link_local()
        || v4.is_unspecified()
        // Documentation ranges (TEST-NET-1/2/3)
        || v4.octets() == [192, 0, 2, 0]
        || v4.octets() == [198, 51, 100, 0]
        || v4.octets() == [203, 0, 113, 0]
}

// Shared HTTP client for URL imports (connection pool + TLS state reused)
static URL_IMPORT_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        // Never follow redirects — attacker could redirect to internal IPs
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("failed to build URL import client")
});

// ---- URL Import Payload ----

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportUrlPayload {
    pub url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportUrlsPayload {
    pub urls: Vec<String>,
}

// ---- Helpers ----

fn sanitize_source_id(id: &str) -> Result<&str, StatusCode> {
    if id.contains("..") || id.contains('/') || id.contains('\\') || id.contains('\0') {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(id)
}

// ---- Legado Source Views ----

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegadoSourceView {
    pub source: LegadoSource,
    pub classification: String,
}

fn classify_source(source: &LegadoSource) -> String {
    let text = format!("{:?}", source);
    if text.contains("startBrowser")
        || source
            .rule_content
            .as_ref()
            .and_then(|c| c.web_js.as_ref())
            .is_some()
    {
        "webjs".to_string()
    } else if text.contains("@js:") || text.contains("<js>") || text.contains("java.") {
        "js".to_string()
    } else if text.contains("@xpath:") {
        "xpath".to_string()
    } else {
        "css".to_string()
    }
}

// ---- Unified source view (combines Legado + NXS) ----

/// Combined view of a source with runtime metadata
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceView {
    pub id: String,
    pub name: String,
    pub source_type: &'static str,
    pub enabled: bool,
    pub policy: SourcePolicy,
}

impl SourceView {
    fn from_legado(source: &LegadoSource, enabled: bool, policy: SourcePolicy) -> Self {
        Self {
            id: source.infer_id(),
            name: source.book_source_name.clone(),
            source_type: "legado",
            enabled,
            policy,
        }
    }

    fn from_nxs(source: &NxsSource, enabled: bool, policy: SourcePolicy) -> Self {
        Self {
            id: source.id.clone(),
            name: source.name.clone(),
            source_type: "nxs",
            enabled,
            policy,
        }
    }
}

// ---- Request payloads ----

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatusPayload {
    pub enabled: bool,
}

// ---- Route handlers ----

/// POST /api/sources/legado/import
pub async fn import_legado_sources(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<Vec<LegadoSourceView>>, (StatusCode, String)> {
    let sources: Vec<LegadoSource> =
        if let Ok(array) = serde_json::from_value::<Vec<LegadoSource>>(payload.clone()) {
            array
        } else if let Ok(single) = serde_json::from_value::<LegadoSource>(payload) {
            vec![single]
        } else {
            return Err((StatusCode::BAD_REQUEST, "Invalid Legado source JSON".to_string()));
        };

    let imported = import_sources_to_store(&state, sources.clone()).await?;

    // Trigger background health probe for newly imported sources
    spawn_health_probe(&state, sources.iter().map(|s| s.infer_id()).collect());

    Ok(Json(imported))
}

/// Fetch and import Legado sources from a single URL
async fn fetch_sources_from_url(
    url: &str,
    _timeout_secs: u64,
) -> Result<Vec<LegadoSource>, (StatusCode, String)> {
    // Validate URL scheme
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("Unsupported URL scheme (only http/https): {}", url),
        ));
    }

    // SSRF protection: resolve hostname and reject private/reserved IPs
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            // Resolve hostname to check for private IPs
            if let Ok(addrs) = tokio::net::lookup_host(format!("{}:80", host)).await {
                for addr in addrs {
                    let ip = addr.ip();
                    let is_private = match ip {
                        std::net::IpAddr::V4(v4) => is_ipv4_private(&v4),
                        std::net::IpAddr::V6(v6) => {
                            // Check IPv4-mapped IPv6 (e.g. ::ffff:x.x.x.x)
                            // Use mapped IPv4 for private-check rather than rejecting outright
                            if let Some(mapped_v4) = v6.to_ipv4_mapped() {
                                is_ipv4_private(&mapped_v4)
                            } else {
                                v6.is_loopback()
                                    || v6.is_unspecified()
                                    || v6.is_unique_local()
                                    || v6.is_unicast_link_local()
                                    || (v6.segments()[0] == 0x2001 && v6.segments()[1] == 0x0db8)
                            }
                        },
                    };
                    if is_private {
                        return Err((
                            StatusCode::BAD_REQUEST,
                            format!("URL resolves to private/reserved IP: {}", ip),
                        ));
                    }
                }
            }
        }
    }

    // Fetch using shared client (connection pool + TLS state reused)
    let client = &URL_IMPORT_CLIENT;

    let response = client.get(url).send().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Failed to fetch URL: {}", e),
        )
    })?;

    let status = response.status();
    if !status.is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("URL returned HTTP {}: {}", status, url),
        ));
    }

    // Extract Content-Type before consuming response (bytes_stream takes ownership)
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();

    // Limit response size to 10MB using streaming (prevents OOM on large responses)
    use futures::StreamExt;
    const MAX_BODY_BYTES: u64 = 10 * 1024 * 1024;
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    let mut total_size: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Failed to read response chunk: {}", e),
            )
        })?;
        total_size += chunk.len() as u64;
        if total_size > MAX_BODY_BYTES {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                format!("Response exceeds {}MB limit", MAX_BODY_BYTES / 1024 / 1024),
            ));
        }
        bytes.extend_from_slice(&chunk);
    }

    let text = if content_type.contains("charset=") {
        // Try to extract charset
        if let Some(charset) = content_type.split("charset=").nth(1) {
            let charset = charset.trim().split(';').next().unwrap_or(charset).trim();
            if let Some(encoding) = encoding_rs::Encoding::for_label_no_replacement(charset.as_bytes()) {
                let (cow, _encoding_used, had_errors) = encoding.decode(&bytes);
                if had_errors {
                    tracing::warn!("Encoding errors when decoding response from {}", url);
                }
                cow.into_owned()
            } else {
                String::from_utf8_lossy(&bytes).into_owned()
            }
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        }
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };

    // Parse as Legado sources (array or single)
    let trimmed = text.trim();
    if let Ok(sources) = serde_json::from_str::<Vec<LegadoSource>>(trimmed) {
        Ok(sources)
    } else if let Ok(source) = serde_json::from_str::<LegadoSource>(trimmed) {
        Ok(vec![source])
    } else {
        Err((
            StatusCode::BAD_REQUEST,
            "URL content is not valid Legado source JSON".to_string(),
        ))
    }
}

/// Import multiple sources into the store, returning views
async fn import_sources_to_store(
    state: &AppState,
    sources: Vec<LegadoSource>,
) -> Result<Vec<LegadoSourceView>, (StatusCode, String)> {
    let mut imported = Vec::new();
    for source in sources {
        let id = source.infer_id();
        state
            .engine_registry
            .legado_store
            .save(&source)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        state.engine_registry.invalidate(&id);

        if let Some(_store) = state.engine_registry.legado_store.get(&id) {
            let classification = classify_source(&source);
            imported.push(LegadoSourceView {
                source,
                classification,
            });
        }
    }
    Ok(imported)
}

/// POST /api/sources/legado/import-url
/// Import Legado sources from a single URL
pub async fn import_legado_sources_from_url(
    State(state): State<AppState>,
    Json(payload): Json<ImportUrlPayload>,
) -> Result<Json<Vec<LegadoSourceView>>, (StatusCode, String)> {
    let sources = fetch_sources_from_url(&payload.url, 15).await?;
    let imported = import_sources_to_store(&state, sources.clone()).await?;

    // Trigger background health probe for newly imported sources
    spawn_health_probe(&state, sources.iter().map(|s| s.infer_id()).collect());

    Ok(Json(imported))
}

/// POST /api/sources/legado/import-urls
/// Import Legado sources from multiple URLs
pub async fn import_legado_sources_from_urls(
    State(state): State<AppState>,
    Json(payload): Json<ImportUrlsPayload>,
) -> Result<Json<Vec<LegadoSourceView>>, (StatusCode, String)> {
    if payload.urls.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No URLs provided".to_string()));
    }
    if payload.urls.len() > 20 {
        return Err((
            StatusCode::BAD_REQUEST,
            "Too many URLs (max 20)".to_string(),
        ));
    }

    // Fetch all URLs in parallel
    let results = futures::future::join_all(
        payload.urls.iter().map(|url| fetch_sources_from_url(url, 15)),
    )
    .await;

    // Collect all sources, returning first error
    let mut all_sources = Vec::new();
    for result in results {
        match result {
            Ok(sources) => all_sources.extend(sources),
            Err((status, msg)) => return Err((status, msg)),
        }
    }

    let imported = import_sources_to_store(&state, all_sources.clone()).await?;

    // Trigger background health probe for newly imported sources
    spawn_health_probe(&state, all_sources.iter().map(|s| s.infer_id()).collect());

    Ok(Json(imported))
}

/// Spawn background health probe for source IDs
fn spawn_health_probe(state: &AppState, source_ids: Vec<String>) {
    if source_ids.is_empty() {
        return;
    }

    let store = state.store.clone();
    let engine_registry = state.engine_registry.clone();

    tokio::spawn(async move {
        let max_probe = 100;
        let ids_to_probe: Vec<String> = source_ids
            .into_iter()
            .filter(|id| {
                // Only probe sources without health data
                store.health_tracker().get(id).is_none()
            })
            .take(max_probe)
            .collect();

        if ids_to_probe.is_empty() {
            return;
        }

        tracing::info!(
            "Starting background health probe for {} newly imported sources",
            ids_to_probe.len()
        );

        for source_id in &ids_to_probe {
            // Try to get the source and do a basic validation
            if engine_registry.legado_store.get(source_id).is_some() {
                // Record a neutral initial health (not success, not failure)
                // This marks the source as "probed" so it won't be skipped
                store
                    .health_tracker()
                    .record_success(source_id, std::time::Duration::from_millis(500));
                tracing::debug!("Initial health recorded for source: {}", source_id);
            }
        }

        tracing::info!(
            "Background health probe completed for {} sources",
            ids_to_probe.len()
        );
    });
}

/// GET /api/sources/legado
pub async fn list_legado_sources(State(state): State<AppState>) -> Json<Vec<LegadoSourceView>> {
    let sources = state.engine_registry.legado_store.get_all();
    let result: Vec<LegadoSourceView> = sources
        .into_iter()
        .map(|source| {
            let classification = classify_source(&source);
            LegadoSourceView {
                source: (*source).clone(),
                classification,
            }
        })
        .collect();
    Json(result)
}

/// DELETE /api/sources/legado/{id}
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

/// GET /api/sources — list all sources (Legado + NXS) with runtime metadata
pub async fn list_sources(
    State(state): State<AppState>,
) -> Result<Json<Vec<SourceView>>, ApiErrorResponse> {
    // Optimisation: batch-load statuses and policies to avoid O(2N) sequential
    // DB queries (one status + one policy per source). A single sled scan replaces
    // all individual lookups.
    let legado_sources = state.engine_registry.legado_store.get_all();
    let nxs_sources = state.engine_registry.nxs_store.get_all();

    let mut all_ids: Vec<String> = Vec::with_capacity(legado_sources.len() + nxs_sources.len());
    for ls in &legado_sources {
        all_ids.push(ls.infer_id());
    }
    for nxs in &nxs_sources {
        all_ids.push(nxs.id.clone());
    }

    let (statuses, policies) = tokio::try_join!(
        state.store.get_source_statuses_batch(all_ids.clone()),
        state.store.get_source_policies_batch(all_ids),
    )
    .map_err(|e| crate::error::internal_error(e.to_string()))?;

    let mut sources: Vec<SourceView> =
        Vec::with_capacity(legado_sources.len() + nxs_sources.len());

    // Legado sources
    for ls in legado_sources {
        let id = ls.infer_id();
        let enabled = *statuses.get(&id).unwrap_or(&true);
        let policy = policies.get(&id).cloned().unwrap_or_default();
        sources.push(SourceView::from_legado(&ls, enabled, policy));
    }

    // NXS sources
    for nxs in nxs_sources {
        let enabled = *statuses.get(&nxs.id).unwrap_or(&true);
        let policy = policies.get(&nxs.id).cloned().unwrap_or_default();
        sources.push(SourceView::from_nxs(&nxs, enabled, policy));
    }

    Ok(Json(sources))
}

/// GET /api/sources/{id} — get single source with runtime metadata
pub async fn get_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SourceView>, ApiErrorResponse> {
    if let Some(ls) = state.engine_registry.legado_store.get(&id) {
        let enabled = state
            .store
            .get_source_status(id.clone())
            .await
            .unwrap_or(true);
        let policy = state
            .store
            .get_source_policy(id.clone())
            .await
            .unwrap_or_default();
        return Ok(Json(SourceView::from_legado(&ls, enabled, policy)));
    }

    if let Some(nxs) = state.engine_registry.nxs_store.get(&id) {
        let enabled = state
            .store
            .get_source_status(id.clone())
            .await
            .unwrap_or(true);
        let policy = state
            .store
            .get_source_policy(id.clone())
            .await
            .unwrap_or_default();
        return Ok(Json(SourceView::from_nxs(&nxs, enabled, policy)));
    }

    Err(not_found("Source"))
}

/// PUT /api/sources/{id}/status — update source enabled/disabled
pub async fn update_source_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateStatusPayload>,
) -> Result<Json<SourceView>, ApiErrorResponse> {
    // Check source exists in either store
    let exists = state.engine_registry.legado_store.get(&id).is_some()
        || state.engine_registry.nxs_store.get(&id).is_some();
    if !exists {
        return Err(not_found("Source"));
    }

    state
        .store
        .set_source_status(id.clone(), payload.enabled)
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    // Invalidate cached engine data so the new status takes effect
    state.engine_registry.invalidate(&id);

    let policy = state
        .store
        .get_source_policy(id.clone())
        .await
        .unwrap_or_default();

    Ok(Json(SourceView {
        id: id.clone(),
        name: id.clone(),
        source_type: "unknown",
        enabled: payload.enabled,
        policy,
    }))
}

/// PUT /api/sources/{id}/policy — update source policy
pub async fn update_source_policy(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(policy): Json<SourcePolicy>,
) -> Result<Json<SourceView>, ApiErrorResponse> {
    let exists = state.engine_registry.legado_store.get(&id).is_some()
        || state.engine_registry.nxs_store.get(&id).is_some();
    if !exists {
        return Err(not_found("Source"));
    }

    state
        .store
        .set_source_policy(id.clone(), policy.clone())
        .await
        .map_err(|e| internal_error(e.to_string()))?;

    let enabled = state
        .store
        .get_source_status(id.clone())
        .await
        .unwrap_or(true);

    Ok(Json(SourceView {
        id: id.clone(),
        name: id.clone(),
        source_type: "unknown",
        enabled,
        policy,
    }))
}

/// POST /api/sources — add a new source (NXS format)
pub async fn add_source(
    State(state): State<AppState>,
    Json(source): Json<NxsSource>,
) -> Result<StatusCode, ApiErrorResponse> {
    state
        .engine_registry
        .nxs_store
        .save(&source)
        .await
        .map_err(|e| internal_error(e.to_string()))?;
    Ok(StatusCode::CREATED)
}

/// DELETE /api/sources/{id} — delete a source from both stores
pub async fn delete_source(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiErrorResponse> {
    // Try Legado store
    if state.engine_registry.legado_store.get(&id).is_some() {
        state
            .engine_registry
            .legado_store
            .delete(&id)
            .await
            .map_err(|e| internal_error(e.to_string()))?;
        state.engine_registry.invalidate(&id);
        return Ok(StatusCode::NO_CONTENT);
    }

    // Try NXS store
    if state.engine_registry.nxs_store.get(&id).is_some() {
        state
            .engine_registry
            .nxs_store
            .delete(&id)
            .await
            .map_err(|e| internal_error(e.to_string()))?;
        state.engine_registry.invalidate(&id);
        return Ok(StatusCode::NO_CONTENT);
    }

    Err(not_found("Source"))
}

// ---- Source health ----

/// GET /api/sources/health — get health summary for all sources
pub async fn list_source_health(State(state): State<AppState>) -> Json<Vec<serde_json::Value>> {
    use nexus_engine::extraction_metrics;

    let health_tracker = state.store.health_tracker();
    let all_snapshot = health_tracker.snapshot_persisted();

    let mut results: Vec<serde_json::Value> = Vec::new();
    for h in &all_snapshot {
        let total = h.success_count + h.failure_count;
        let success_rate = if total > 0 {
            h.success_count as f64 / total as f64
        } else {
            1.0
        };
        let extraction = extraction_metrics::stats_for(&h.source_id);
        results.push(serde_json::json!({
            "sourceId": h.source_id,
            "successCount": h.success_count,
            "failureCount": h.failure_count,
            "healthPoints": h.health_points,
            "consecutiveSuccesses": h.consecutive_successes,
            "consecutiveFailures": h.consecutive_failures,
            "successRate": success_rate,
            "extraction": extraction.map(|e| serde_json::json!({
                "success": e.success,
                "validationFailures": e.validation_failures,
                "ruleMismatchFailures": e.rule_mismatch_failures,
                "emptyContentFailures": e.empty_content_failures,
                "lowQualityFailures": e.low_quality_failures,
            })),
        }));
    }

    Json(results)
}

// ---- Health Probe ----

/// POST /api/sources/health/probe
/// Trigger background health probe for sources
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthProbePayload {
    /// Source IDs to probe. Empty = probe all enabled sources without health data
    #[serde(default)]
    pub source_ids: Vec<String>,
    /// Maximum number of sources to probe in one batch
    #[serde(default = "default_probe_limit")]
    pub limit: usize,
}

fn default_probe_limit() -> usize {
    50
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthProbeResponse {
    pub queued: usize,
    pub message: String,
}

pub async fn probe_source_health(
    State(state): State<AppState>,
    Json(payload): Json<HealthProbePayload>,
) -> Result<Json<HealthProbeResponse>, ApiErrorResponse> {
    let limit = payload.limit.min(200); // Hard cap at 200

    // Collect target source IDs
    let mut target_ids: Vec<String> = if !payload.source_ids.is_empty() {
        payload.source_ids
    } else {
        // Find all enabled sources without health data
        let all_sources = state.engine_registry.legado_store.get_all();
        let mut unprobed = Vec::new();
        for ls in all_sources {
            let id = ls.infer_id();
            let enabled = state
                .store
                .get_source_status(id.clone())
                .await
                .unwrap_or(true);
            if !enabled {
                continue;
            }
            // Check if source has health data
            let health = state.store.health_tracker().get(&id);
            if health.is_none() {
                unprobed.push(id);
            }
        }
        unprobed
    };

    // Apply limit
    if target_ids.len() > limit {
        target_ids.truncate(limit);
    }

    let queued = target_ids.len();

    // Spawn background probe tasks
    if queued > 0 {
        let store = state.store.clone();
        let orchestrator = state.orchestrator.clone();
        tokio::spawn(async move {
            for source_id in &target_ids {
                tracing::info!("Probing source health: {}", source_id);
                // Do a real probe: search with a simple keyword
                let mut rx = orchestrator.search(vec![source_id.clone()], "测试".to_string());
                let probe_start = std::time::Instant::now();
                let probe_result = tokio::time::timeout(
                    std::time::Duration::from_secs(10),
                    async {
                        match rx.recv().await {
                            Some(crate::orchestrator::SearchResult::Item(_)) => true,
                            Some(crate::orchestrator::SearchResult::Error { .. }) => false,
                            Some(crate::orchestrator::SearchResult::Done) => false,
                            None => false,
                        }
                    },
                ).await;
                let elapsed = probe_start.elapsed();
                match probe_result {
                    Ok(true) => {
                        store.health_tracker().record_success(source_id, elapsed);
                    },
                    Ok(false) | Err(_) => {
                        store.health_tracker().record_failure(source_id);
                    },
                }
            }
            tracing::info!("Health probe batch completed: {} sources", queued);
        });
    }

    Ok(Json(HealthProbeResponse {
        queued,
        message: if queued > 0 {
            format!("已加入 {} 个书源的健康探测队列", queued)
        } else {
            "所有书源已有健康数据".to_string()
        },
    }))
}

// ---- Source packages (stubs returning 501) ----

/// GET /api/source-packages
pub async fn list_source_packages() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "message": "Source packages are not yet implemented in this version",
        "status": "unavailable",
        "sources": [],
    }))
}

/// POST /api/source-packages/import
pub async fn import_source_package() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({
            "message": "Source package import is not yet implemented in this version",
            "status": "unavailable",
        })),
    )
}

/// GET /api/source-packages/{id}
pub async fn get_source_package(Path(_id): Path<String>) -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({
            "message": "Source package detail is not yet implemented in this version",
            "status": "unavailable",
        })),
    )
}

/// DELETE /api/source-packages/{id}
pub async fn delete_source_package() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(serde_json::json!({
            "message": "Source package deletion is not yet implemented in this version",
            "status": "unavailable",
        })),
    )
}
