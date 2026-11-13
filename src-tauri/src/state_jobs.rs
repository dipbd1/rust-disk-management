use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::error::AppError;
use crate::models::DuplicateGroup;
use crate::services::guard::{self, GuardMode};
use crate::services::paths::{is_drive_root, normalize_path};

use super::{lock, AppState};

impl AppState {
    pub fn begin_duplicates(&self) -> Result<(u64, Arc<AtomicBool>), AppError> {
        let mut session = lock(&self.session);
        if session.scanning {
            return Err(AppError::Duplicates("wait until the scan finishes".into()));
        }
        session.duplicate_cancel.store(true, Ordering::Relaxed);
        session.duplicate_generation = session.duplicate_generation.wrapping_add(1);
        let cancel = Arc::new(AtomicBool::new(false));
        session.duplicate_cancel = Arc::clone(&cancel);
        session.duplicate_groups.clear();
        Ok((session.duplicate_generation, cancel))
    }

    pub fn duplicate_generation(&self) -> u64 {
        lock(&self.session).duplicate_generation
    }

    pub fn cancel_duplicates(&self) {
        lock(&self.session).duplicate_cancel.store(true, Ordering::Relaxed);
    }

    pub fn finish_duplicates(&self, generation: u64, groups: Vec<DuplicateGroup>) -> bool {
        let mut session = lock(&self.session);
        if session.duplicate_generation != generation {
            return false;
        }
        session.duplicate_groups = groups;
        true
    }

    pub fn duplicate_copy_paths(&self, paths: &[String]) -> Result<Vec<String>, AppError> {
        let session = lock(&self.session);
        let mut allowed = std::collections::HashSet::new();
        for group in &session.duplicate_groups {
            for copy in &group.copies {
                allowed.insert(copy.path.clone());
            }
        }
        if paths.is_empty() {
            return Err(AppError::Duplicates("nothing to recycle".into()));
        }
        let mut out = Vec::new();
        for path in paths {
            let path = normalize_path(path);
            if !allowed.contains(&path) {
                return Err(AppError::Duplicates(format!("not a duplicate copy: {path}")));
            }
            if is_drive_root(&path) || guard::is_refused(&path, GuardMode::Duplicates) {
                return Err(AppError::Protected(path));
            }
            if !out.iter().any(|item| item == &path) {
                out.push(path);
            }
        }
        Ok(out)
    }
}
