use crate::app::AppState;
use crate::orchestrator::SearchResult;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures::{sink::SinkExt, stream::StreamExt};
use nexus_core::SystemEvent;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

/// WebSocket Handler
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

#[derive(Deserialize)]
struct SearchRequest {
    keyword: String,
    sources: Vec<String>,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum WsResponse {
    Result { data: nexus_core::BookItem },
    Error { source_id: String, message: String },
    Done,
    System(SystemEvent),
    Pong,
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    info!("WebSocket connected");

    // Split socket into sender and receiver
    let (mut sender, mut receiver) = socket.split();

    // Create a channel for outgoing messages
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();

    // Spawn task to write messages to the socket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Err(e) = sender.send(msg).await {
                warn!("Failed to send WS message: {}", e);
                break;
            }
        }
    });

    // Spawn task to subscribe to EventBus
    let tx_events = tx.clone();
    let event_bus = state.event_bus.clone();
    let event_sub = tokio::spawn(async move {
        let mut bus_rx = event_bus.subscribe();
        while let Ok(event) = bus_rx.recv().await {
            let response = WsResponse::System(event);
            if let Ok(json) = serde_json::to_string(&response) {
                if tx_events.send(Message::Text(json.into())).is_err() {
                    break;
                }
            }
        }
    });

    // Main loop: Handle incoming messages
    while let Some(Ok(msg)) = receiver.next().await {
        if let Message::Text(text) = msg {
            // Handle ping/pong implementation
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                if json.get("type").and_then(|v| v.as_str()) == Some("ping") {
                    let response = WsResponse::Pong;
                    if let Ok(json) = serde_json::to_string(&response) {
                        let _ = tx.send(Message::Text(json.into()));
                    }
                    continue;
                }
            }

            // Validating request
            let req: SearchRequest = match serde_json::from_str(&text) {
                Ok(req) => req,
                Err(e) => {
                    let _ = tx.send(Message::Text(format!("Invalid request: {}", e).into()));
                    continue;
                }
            };

            info!("WS Search: keyword={}, sources={}", req.keyword, req.sources.len());

            // Resolve sources
            let source_ids = if req.sources.is_empty() {
                state
                    .engine_registry
                    .source_store()
                    .get_all()
                    .iter()
                    .map(|s| s.id.clone())
                    .collect()
            } else {
                req.sources
            };

            // Spawn search task to avoid blocking the main loop
            // Use local Orchestrator
            let orchestrator = state.orchestrator.clone();
            let tx_search = tx.clone();
            let keyword = req.keyword.clone();

            tokio::spawn(async move {
                let mut results = orchestrator.search(source_ids, keyword);
                while let Some(result) = results.recv().await {
                    let response = match result {
                        SearchResult::Item(item) => WsResponse::Result { data: item },
                        SearchResult::Error { source_id, error } => WsResponse::Error {
                            source_id,
                            message: error,
                        },
                        SearchResult::Done => WsResponse::Done,
                    };

                    if let Ok(json) = serde_json::to_string(&response) {
                        if tx_search.send(Message::Text(json.into())).is_err() {
                            break;
                        }
                    }
                }
            });
        } else if let Message::Close(_) = msg {
            info!("WebSocket closed by client");
            break;
        }
    }

    // Abort helper tasks when main loop ends
    event_sub.abort();
    send_task.abort();
    info!("WebSocket disconnected");
}
