use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use crate::error::AppError;
use crate::models::{DuplicateGroup, GrowthDelta, ScanProgress};
use crate::services::index::ScanIndex;
use crate::services::insights::InsightCache;
use crate::services::watcher::FolderWatcher;

#[path = "state_jobs.rs"]
mod jobs;

struct Session {
    index: Option<ScanIndex>,
    /// Latest `start_scan`. An older walk must not replace this generation's index.
    generation: u64,
    /// Shared with the active scan. `cancel_scan` sets it; relaxed ordering is enough.
    cancel: Arc<AtomicBool>,
    scanning: bool,
    scan_path: String,
    latest: Option<ScanProgress>,
    /// Bumps on every stored preview so the browser emit loop can skip stale ticks.
    progress_seq: u64,
    growth: Option<GrowthDelta>,
    duplicate_generation: u64,
    duplicate_cancel: Arc<AtomicBool>,
    duplicate_groups: Vec<DuplicateGroup>,
}

/// How a browser `start_scan_remote` should treat the scan already in memory.
pub enum RemoteScan {
    /// A walk for this path is in progress. Do not cancel it.
    Attach,
    /// This path already finished. Replay `latest` instead of walking again.
    Replay,
    /// No usable scan for this path.
    Start,
}

pub struct AppState {
    session: Mutex<Session>,
    watcher: Mutex<Option<FolderWatcher>>,
    /// One in-flight browser emit. Further ticks only update `latest`.
    emit_scheduled: AtomicBool,
    /// Separate from the session lock so a query can borrow the index and the cache together.
    insight: Mutex<Option<InsightCache>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(Session {
                index: None,
                generation: 0,
                cancel: Arc::new(AtomicBool::new(false)),
                scanning: false,
                scan_path: String::new(),
                latest: None,
                progress_seq: 0,
                growth: None,
                duplicate_generation: 0,
                duplicate_cancel: Arc::new(AtomicBool::new(false)),
                duplicate_groups: Vec::new(),
            }),
            watcher: Mutex::new(None),
            emit_scheduled: AtomicBool::new(false),
            insight: Mutex::new(None),
        }
    }

    pub fn begin_scan(&self, path: &str) -> (u64, Arc<AtomicBool>) {
        let mut session = lock(&self.session);
        session.cancel.store(true, Ordering::Relaxed);
        session.generation = session.generation.wrapping_add(1);
        let cancel = Arc::new(AtomicBool::new(false));
        session.cancel = Arc::clone(&cancel);
        session.scanning = true;
        session.scan_path = path.to_string();
        session.latest = None;
        session.progress_seq = session.progress_seq.wrapping_add(1);
        session.growth = None;
        session.duplicate_groups.clear();
        session.duplicate_generation = session.duplicate_generation.wrapping_add(1);
        session.duplicate_cancel.store(true, Ordering::Relaxed);
        let generation = session.generation;
        drop(session);
        *lock(&self.insight) = None;
        (generation, cancel)
    }

    pub fn remote_scan(&self, path: &str) -> RemoteScan {
        let session = lock(&self.session);
        if session.scanning && session.scan_path == path {
            RemoteScan::Attach
        } else if !session.scanning
            && session.scan_path == path
            && session.latest.as_ref().is_some_and(|progress| progress.done)
        {
            RemoteScan::Replay
        } else {
            RemoteScan::Start
        }
    }

    /// Keeps the preview a joining browser will replay. Returns false if a newer scan replaced this one.
    pub fn note_progress(&self, generation: u64, progress: ScanProgress) -> bool {
        let mut session = lock(&self.session);
        if session.generation != generation {
            return false;
        }
        session.latest = Some(progress);
        session.progress_seq = session.progress_seq.wrapping_add(1);
        true
    }

    pub fn progress_seq(&self) -> u64 {
        lock(&self.session).progress_seq
    }

    pub fn latest_progress(&self) -> Option<ScanProgress> {
        lock(&self.session).latest.clone()
    }

    /// True when another task already owns the browser emit loop.
    pub fn claim_emit(&self) -> bool {
        self.emit_scheduled.swap(true, Ordering::AcqRel)
    }

    pub fn release_emit(&self) {
        self.emit_scheduled.store(false, Ordering::Release);
    }

    pub fn fail_scan(&self, generation: u64) {
        let mut session = lock(&self.session);
        if session.generation == generation {
            session.scanning = false;
        }
    }

    pub fn cancel_scan(&self) {
        lock(&self.session).cancel.store(true, Ordering::Relaxed);
    }

    pub fn finish_scan(&self, generation: u64, index: ScanIndex) -> bool {
        let mut session = lock(&self.session);
        let stored = session.generation == generation;
        if stored {
            session.index = Some(index);
            session.scanning = false;
        }
        drop(session);
        if stored {
            *lock(&self.insight) = None;
        }
        stored
    }

    pub fn with_insight<T>(
        &self,
        f: impl FnOnce(&ScanIndex, &mut Option<InsightCache>) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let session = lock(&self.session);
        let Some(index) = session.index.as_ref() else {
            return Err(AppError::NotFound("no scan".into()));
        };
        let mut cache = lock(&self.insight);
        f(index, &mut cache)
    }

    pub fn set_growth(&self, delta: GrowthDelta) {
        lock(&self.session).growth = Some(delta);
    }

    pub fn growth(&self) -> Option<GrowthDelta> {
        lock(&self.session).growth.clone()
    }

    pub fn with_index<T>(
        &self,
        f: impl FnOnce(&ScanIndex) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let session = lock(&self.session);
        match session.index.as_ref() {
            Some(index) => f(index),
            None => Err(AppError::NotFound("no scan".into())),
        }
    }

    pub fn with_index_mut<T>(
        &self,
        f: impl FnOnce(&mut ScanIndex) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let mut session = lock(&self.session);
        match session.index.as_mut() {
            Some(index) => f(index),
            None => Err(AppError::NotFound("no scan".into())),
        }
    }

    pub fn set_watcher(&self, watcher: FolderWatcher) {
        *lock(&self.watcher) = Some(watcher);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ScanProgress;
    use crate::services::index::ScanIndex;

    fn done_progress() -> ScanProgress {
        ScanProgress {
            generation: 1,
            scanned_count: 1,
            current_path: "C:\\".into(),
            elapsed_ms: 1,
            access_denied_count: 0,
            root: None,
            top_level: Vec::new(),
            satellites: Vec::new(),
            done: true,
            cancelled: false,
        }
    }

    #[test]
    fn browser_joins_the_scan_already_running_for_that_path() {
        let state = AppState::new();
        state.begin_scan("C:\\");
        assert!(matches!(state.remote_scan("C:\\"), RemoteScan::Attach));
        assert!(matches!(state.remote_scan("D:\\"), RemoteScan::Start));
    }

    #[test]
    fn browser_replays_a_finished_scan_instead_of_starting_another() {
        let state = AppState::new();
        let (generation, _) = state.begin_scan("C:\\");
        assert!(state.note_progress(generation, done_progress()));
        assert!(state.finish_scan(generation, ScanIndex::new(generation)));
        assert!(matches!(state.remote_scan("C:\\"), RemoteScan::Replay));
    }
}
