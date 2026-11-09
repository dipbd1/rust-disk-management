use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use crate::error::AppError;
use crate::services::index::ScanIndex;
use crate::services::watcher::FolderWatcher;

struct Session {
    index: Option<ScanIndex>,
    /// Latest `start_scan`. An older walk must not replace this generation's index.
    generation: u64,
    /// Shared with the active scan. `cancel_scan` sets it; relaxed ordering is enough.
    cancel: Arc<AtomicBool>,
}

pub struct AppState {
    session: Mutex<Session>,
    watcher: Mutex<Option<FolderWatcher>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(Session {
                index: None,
                generation: 0,
                cancel: Arc::new(AtomicBool::new(false)),
            }),
            watcher: Mutex::new(None),
        }
    }

    pub fn begin_scan(&self) -> (u64, Arc<AtomicBool>) {
        let mut session = lock(&self.session);
        session.cancel.store(true, Ordering::Relaxed);
        session.generation = session.generation.wrapping_add(1);
        let cancel = Arc::new(AtomicBool::new(false));
        session.cancel = Arc::clone(&cancel);
        (session.generation, cancel)
    }

    pub fn cancel_scan(&self) {
        lock(&self.session).cancel.store(true, Ordering::Relaxed);
    }

    pub fn finish_scan(&self, generation: u64, index: ScanIndex) -> bool {
        let mut session = lock(&self.session);
        if session.generation == generation {
            session.index = Some(index);
            true
        } else {
            false
        }
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
