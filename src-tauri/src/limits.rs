/// Paging and graph caps. Rust is authoritative; see docs/ARCHITECTURE.md.
pub const CHILD_PAGE_DEFAULT: u32 = 400;
pub const CHILD_PAGE_MAX: u32 = 1000;
pub const GRAPH_CHILD_CAP: usize = 60;
pub const PROGRESS_PREVIEW: usize = 200;
pub const PROGRESS_INTERVAL_MS: u64 = 100;
/// Largest top-level folders that carry moons on a progress tick.
pub const SATELLITE_PARENTS: usize = 12;
/// Largest direct children drawn as moons of each of those folders.
pub const SATELLITE_CHILDREN: usize = 5;
/// 5 GiB. Files at or above this size use the heavy category.
pub const HEAVY_FILE_BYTES: u64 = 5 * 1024 * 1024 * 1024;
/// Largest-files, search, and extension file pages. Same clamp as child pages.
pub const INSIGHT_PAGE_DEFAULT: u32 = CHILD_PAGE_DEFAULT;
/// Extension rollup keeps this many extensions, then one "other" row.
pub const EXTENSION_TOP: usize = 12;
/// Duplicate review ignores smaller files.
pub const DUPLICATE_MIN_BYTES: u64 = 1024 * 1024;
/// Duplicate groups returned to the webview.
pub const DUPLICATE_GROUP_CAP: usize = 100;
/// Largest files stored in one growth snapshot.
pub const GROWTH_FILE_CAP: usize = 200;
/// Review tier: Downloads files at or above this size.
pub const RECLAIM_DOWNLOAD_MIN_BYTES: u64 = 100 * 1024 * 1024;
/// Review tier: Downloads files older than this many days.
pub const RECLAIM_DOWNLOAD_AGE_DAYS: u64 = 30;

/// `0` means the default page. Anything larger than the max is clamped.
/// Insight pages use the same default and the same clamp.
pub fn page_limit(limit: u32) -> u32 {
    if limit == 0 {
        INSIGHT_PAGE_DEFAULT
    } else {
        limit.min(CHILD_PAGE_MAX)
    }
}
