use crate::models::ExtensionRow;

/// Sorted file ids and the extension rollup for one index revision.
/// Search hits stay here so they never enter the tree page cache.
pub struct InsightCache {
    pub revision: u64,
    pub files_desc: Vec<u32>,
    pub rows: Vec<ExtensionRow>,
    pub top: Vec<String>,
    pub search_key: String,
    pub search_hits: Vec<u32>,
}
