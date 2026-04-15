use nexus_storage::SledStore;
use std::sync::Arc;

#[derive(Clone)]
pub struct SourceBuilderState {
    pub store: Arc<SledStore>,
}
