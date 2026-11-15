use crate::models::NodeKind;
use crate::services::index::ScanIndex;

/// Path, name, kind, and size copied while the session lock is held.
pub struct NodeFact {
    pub path: String,
    pub name: String,
    pub kind: NodeKind,
    pub size: u64,
}

pub fn snapshot(index: &ScanIndex) -> Vec<NodeFact> {
    index
        .live_ids()
        .into_iter()
        .filter_map(|id| {
            Some(NodeFact {
                path: index.path_at(id)?.to_string(),
                name: index.name_at(id)?.to_string(),
                kind: index.kind_at(id)?,
                size: index.size_at(id).unwrap_or(0),
            })
        })
        .collect()
}
