use crate::models::{ExtensionRow, LargestSort};

/// Sorted file ids and the extension rollup for one index revision.
/// Search hits stay here so they never enter the tree page cache.
/// `files_desc` is size descending. `order` is the last other largest-files order.
pub struct InsightCache {
    pub revision: u64,
    pub files_desc: Vec<u32>,
    pub rows: Vec<ExtensionRow>,
    pub top: Vec<String>,
    pub search_key: String,
    pub search_hits: Vec<u32>,
    pub order_sort: Option<LargestSort>,
    pub order_desc: bool,
    pub order: Vec<u32>,
}
