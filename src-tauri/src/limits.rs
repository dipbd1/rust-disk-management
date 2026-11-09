/// Paging and graph caps. Rust is authoritative; see docs/ARCHITECTURE.md.
pub const CHILD_PAGE_DEFAULT: u32 = 400;
pub const CHILD_PAGE_MAX: u32 = 1000;
pub const GRAPH_CHILD_CAP: usize = 60;
pub const PROGRESS_PREVIEW: usize = 200;
pub const PROGRESS_INTERVAL_MS: u64 = 100;
/// 5 GiB. Files at or above this size use the heavy category.
pub const HEAVY_FILE_BYTES: u64 = 5 * 1024 * 1024 * 1024;

/// `0` means the default page. Anything larger than the max is clamped.
pub fn page_limit(limit: u32) -> u32 {
    if limit == 0 {
        CHILD_PAGE_DEFAULT
    } else {
        limit.min(CHILD_PAGE_MAX)
    }
}
