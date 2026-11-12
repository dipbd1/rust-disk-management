use std::time::Instant;

use crate::limits::PROGRESS_PREVIEW;
use crate::models::ScanProgress;
use crate::services::index::ScanIndex;

pub(crate) fn snapshot(
    index: &ScanIndex,
    scanned_count: u64,
    current_path: &str,
    started: Instant,
    access_denied_count: u64,
    done: bool,
) -> ScanProgress {
    let (root, top_level) = index.preview(PROGRESS_PREVIEW);
    ScanProgress {
        generation: index.generation(),
        scanned_count,
        current_path: current_path.to_string(),
        elapsed_ms: started.elapsed().as_millis() as u64,
        access_denied_count,
        root,
        top_level,
        satellites: index.satellite_groups(),
        done,
        cancelled: false,
    }
}
