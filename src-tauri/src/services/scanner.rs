use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use jwalk::{DirEntry, WalkDirGeneric};

use crate::error::AppError;
use crate::limits::{PROGRESS_INTERVAL_MS, PROGRESS_PREVIEW};
use crate::models::ScanProgress;
use crate::services::index::ScanIndex;
use crate::services::paths::{is_reparse_point, normalize_path};

#[derive(Debug, Default)]
struct EntryMeta {
    size_bytes: u64,
    is_dir: bool,
    access_denied: bool,
}

/// Walk `root` on the calling thread. `on_progress` fires at most every 100ms.
/// The returned progress is the terminal snapshot (`done` is true) and is not
/// passed to the callback, so the caller can store the index before publishing it.
pub fn scan_tree(
    root: &str,
    generation: u64,
    cancel: &Arc<AtomicBool>,
    mut on_progress: impl FnMut(ScanProgress),
) -> Result<(ScanIndex, ScanProgress), AppError> {
    let root = normalize_path(root);
    if root.is_empty() {
        return Err(AppError::Scan("empty path".into()));
    }
    let cancel_flag = Arc::clone(cancel);
    let walk = WalkDirGeneric::<((), EntryMeta)>::new(&root)
        .skip_hidden(false)
        .follow_links(false)
        .process_read_dir(move |_depth, _path, _state, children| {
            prepare_children(children, &cancel_flag);
        });
    let iter = walk
        .try_into_iter()
        .map_err(|err| AppError::Scan(err.to_string()))?;

    let started = Instant::now();
    let mut last_emit = started;
    let mut index = ScanIndex::new(generation);
    let mut scanned_count = 0u64;
    let mut access_denied_count = 0u64;
    let mut current_path = root.clone();

    for item in iter {
        match item {
            Ok(entry) => {
                if entry.client_state.access_denied {
                    access_denied_count += 1;
                }
                if entry
                    .read_children
                    .as_ref()
                    .and_then(|children| children.error())
                    .is_some()
                {
                    access_denied_count += 1;
                }
                current_path = normalize_path(&entry.path().to_string_lossy());
                index.insert(
                    &current_path,
                    entry.client_state.is_dir,
                    entry.client_state.size_bytes,
                )?;
                scanned_count += 1;
            }
            Err(err) => {
                access_denied_count += 1;
                if index.preview(0).0.is_none() {
                    return Err(AppError::Scan(err.to_string()));
                }
            }
        }
        if last_emit.elapsed() >= Duration::from_millis(PROGRESS_INTERVAL_MS) {
            on_progress(snapshot(
                &index,
                scanned_count,
                &current_path,
                started,
                access_denied_count,
                false,
            ));
            last_emit = Instant::now();
        }
    }

    if index.preview(0).0.is_none() {
        return Err(AppError::Scan(format!(
            "scan produced no entries for {root}"
        )));
    }
    index.sort_children();
    let mut progress = snapshot(
        &index,
        scanned_count,
        &current_path,
        started,
        access_denied_count,
        true,
    );
    progress.cancelled = cancel.load(Ordering::Relaxed);
    Ok((index, progress))
}

fn snapshot(
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
        done,
        cancelled: false,
    }
}

fn prepare_children(
    children: &mut Vec<Result<DirEntry<((), EntryMeta)>, jwalk::Error>>,
    cancel: &AtomicBool,
) {
    let stop = cancel.load(Ordering::Relaxed);
    children.retain(|child| match child {
        Ok(entry) => !skipped_dir(entry.file_name()),
        Err(_) => true,
    });
    for child in children.iter_mut() {
        let Ok(entry) = child else {
            continue;
        };
        if stop {
            entry.read_children = None;
        }
        match entry.metadata() {
            Ok(meta) => {
                let is_dir = entry.file_type().is_dir();
                let reparse = entry.file_type().is_symlink() || is_reparse_point(&meta);
                entry.client_state.is_dir = is_dir;
                if is_dir {
                    entry.client_state.size_bytes = 0;
                    if reparse || stop {
                        entry.read_children = None;
                    }
                } else {
                    entry.client_state.size_bytes = meta.len();
                    entry.read_children = None;
                }
            }
            Err(_) => {
                entry.client_state.access_denied = true;
                entry.client_state.is_dir = entry.file_type().is_dir();
                entry.read_children = None;
            }
        }
    }
}

fn skipped_dir(name: &std::ffi::OsStr) -> bool {
    let Some(text) = name.to_str() else {
        return false;
    };
    text.eq_ignore_ascii_case("System Volume Information")
        || text.eq_ignore_ascii_case("$Recycle.Bin")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicBool;

    struct TempTree(PathBuf);
    impl Drop for TempTree {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn scans_a_temp_directory_and_honors_cancel() {
        let dir = std::env::temp_dir().join(format!("liquid-scan-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("a.txt"), vec![1u8; 10]).unwrap();
        fs::write(dir.join("sub").join("b.txt"), vec![2u8; 25]).unwrap();
        fs::write(dir.join(".secret"), b"hide").unwrap();
        let scratch = TempTree(dir.clone());
        let root = normalize_path(&scratch.0.to_string_lossy());

        let cancel = Arc::new(AtomicBool::new(false));
        let mut callbacks = 0u32;
        let (index, progress) = scan_tree(&root, 7, &cancel, |_| callbacks += 1).unwrap();
        assert!(progress.done);
        assert!(!progress.cancelled);
        assert_eq!(progress.generation, 7);
        assert_eq!(index.size_of(&root), Some(10 + 25 + 4));
        assert_eq!(index.size_of(&format!("{root}\\sub")), Some(25));
        let page = index.children_page(&root, 0, 10, None).unwrap();
        assert!(page.nodes.iter().any(|node| node.name == ".secret"));
        assert!(
            page.nodes
                .windows(2)
                .all(|pair| pair[0].size_bytes >= pair[1].size_bytes)
        );
        let _ = callbacks;

        let cancel = Arc::new(AtomicBool::new(true));
        let (partial, stopped) = scan_tree(&root, 8, &cancel, |_| {}).unwrap();
        assert!(stopped.cancelled);
        assert!(stopped.done);
        assert_eq!(partial.size_of(&root), Some(0));
        assert!(
            partial
                .children_page(&root, 0, 10, None)
                .unwrap()
                .nodes
                .is_empty()
        );
    }
}
