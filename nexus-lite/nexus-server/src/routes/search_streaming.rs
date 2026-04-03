use axum::response::sse::Event;
use nexus_core::BookItem;

use super::SearchEvent;

pub(super) fn event_result(item: BookItem) -> Event {
    let event = SearchEvent::Result { data: item };
    Event::default()
        .event("result")
        .data(serde_json::to_string(&event).unwrap_or_default())
}

pub(super) fn event_error(source_id: String, error: String) -> Event {
    let event = SearchEvent::Error { source_id, error };
    Event::default()
        .event("error")
        .data(serde_json::to_string(&event).unwrap_or_default())
}

pub(super) fn event_done(total: usize) -> Event {
    let event = SearchEvent::Done { total };
    Event::default()
        .event("done")
        .data(serde_json::to_string(&event).unwrap_or_default())
}
