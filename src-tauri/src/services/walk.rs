use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{GetLastError, ERROR_ACCESS_DENIED, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Storage::FileSystem::{
    FindClose, FindFirstFileExW, FindNextFileW, FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT,
    FIND_FIRST_EX_LARGE_FETCH, FindExInfoBasic, FindExSearchNameMatch, WIN32_FIND_DATAW,
};

use crate::error::AppError;
use crate::limits::PROGRESS_INTERVAL_MS;
use crate::models::ScanProgress;
use crate::services::elevation::wide;
use crate::services::index::ScanIndex;
use crate::services::preview::snapshot;

struct Found {
    path: String,
    is_dir: bool,
    size: u64,
    reparse: bool,
}

struct Batch {
    denied: bool,
    entries: Vec<Found>,
    child_dirs: Vec<String>,
}

struct WorkState {
    dirs: VecDeque<String>,
    /// Directories queued or being read. Hits zero when the walk has nothing left.
    pending: usize,
    done: bool,
}

/// Parallel `FindFirstFileExW` walk. Size and the reparse bit come from the find buffer.
pub fn scan(
    root: &str,
    generation: u64,
    cancel: &Arc<AtomicBool>,
    mut on_progress: impl FnMut(ScanProgress),
) -> Result<(ScanIndex, ScanProgress), AppError> {
    let started = Instant::now();
    std::fs::symlink_metadata(root).map_err(|err| AppError::Scan(err.to_string()))?;
    let mut index = ScanIndex::new(generation);
    index.insert_ready(root.to_string(), true, 0)?;
    if cancel.load(Ordering::Relaxed) {
        return Ok(finish(index, 0, root, started, 0, true));
    }

    let shared = Arc::new((
        Mutex::new(WorkState {
            dirs: VecDeque::from([root.to_string()]),
            pending: 1,
            done: false,
        }),
        Condvar::new(),
    ));
    let (tx, rx) = std::sync::mpsc::sync_channel::<Batch>(32);
    let workers = std::thread::available_parallelism()
        .map(|n| n.get().clamp(1, 16))
        .unwrap_or(4);
    let mut handles = Vec::with_capacity(workers);
    for _ in 0..workers {
        let tx = tx.clone();
        let shared = Arc::clone(&shared);
        let cancel = Arc::clone(cancel);
        let handle = std::thread::Builder::new()
            .name("scan-walk".into())
            .spawn(move || worker(tx, shared, cancel))
            .map_err(|err| AppError::Scan(format!("walk thread failed: {err}")))?;
        handles.push(handle);
    }
    drop(tx);

    let mut scanned = 0u64;
    let mut denied = 0u64;
    let mut current = root.to_string();
    let mut last_emit = started;
    while !cancel.load(Ordering::Relaxed) {
        let batch = match rx.recv() {
            Ok(batch) => batch,
            Err(_) => break,
        };
        if batch.denied {
            denied += 1;
        }
        for entry in batch.entries {
            index.insert_ready(entry.path.clone(), entry.is_dir, entry.size)?;
            scanned += 1;
            current = entry.path;
            if last_emit.elapsed() >= Duration::from_millis(PROGRESS_INTERVAL_MS) {
                on_progress(snapshot(&index, scanned, &current, started, denied, false));
                last_emit = Instant::now();
            }
        }
    }
    stop(&shared);
    drop(rx);
    for handle in handles {
        let _ = handle.join();
    }
    Ok(finish(
        index,
        scanned,
        &current,
        started,
        denied,
        cancel.load(Ordering::Relaxed),
    ))
}

fn finish(
    mut index: ScanIndex,
    scanned: u64,
    current: &str,
    started: Instant,
    denied: u64,
    cancelled: bool,
) -> (ScanIndex, ScanProgress) {
    index.sort_children();
    let mut progress = snapshot(&index, scanned, current, started, denied, true);
    progress.cancelled = cancelled;
    (index, progress)
}

fn worker(
    tx: std::sync::mpsc::SyncSender<Batch>,
    shared: Arc<(Mutex<WorkState>, Condvar)>,
    cancel: Arc<AtomicBool>,
) {
    let (lock, cv) = &*shared;
    loop {
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        let dir = {
            let mut state = lock_work(lock);
            loop {
                if state.done || cancel.load(Ordering::Relaxed) {
                    return;
                }
                if let Some(dir) = state.dirs.pop_front() {
                    break dir;
                }
                state = cv.wait(state).unwrap_or_else(|err| err.into_inner());
            }
        };
        let batch = read_dir(&dir);
        let stop = cancel.load(Ordering::Relaxed);
        {
            let mut state = lock_work(lock);
            if !stop && !state.done {
                state.dirs.extend(batch.child_dirs.iter().cloned());
                state.pending = state.pending.saturating_sub(1) + batch.child_dirs.len();
            } else {
                state.pending = state.pending.saturating_sub(1);
            }
            if state.pending == 0 {
                state.done = true;
            }
            cv.notify_all();
        }
        if tx.send(batch).is_err() {
            return;
        }
    }
}

fn stop(shared: &Arc<(Mutex<WorkState>, Condvar)>) {
    let (lock, cv) = &**shared;
    lock_work(lock).done = true;
    cv.notify_all();
}

fn lock_work(lock: &Mutex<WorkState>) -> MutexGuard<'_, WorkState> {
    lock.lock().unwrap_or_else(|err| err.into_inner())
}

fn read_dir(dir: &str) -> Batch {
    let pattern = search_pattern(dir);
    let mut data: WIN32_FIND_DATAW = unsafe { std::mem::zeroed() };
    let handle = unsafe {
        FindFirstFileExW(
            pattern.as_ptr(),
            FindExInfoBasic,
            &mut data as *mut _ as *mut _,
            FindExSearchNameMatch,
            std::ptr::null(),
            FIND_FIRST_EX_LARGE_FETCH,
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        let denied = unsafe { GetLastError() } == ERROR_ACCESS_DENIED;
        return Batch { denied, entries: Vec::new(), child_dirs: Vec::new() };
    }
    let mut entries = Vec::new();
    let mut child_dirs = Vec::new();
    loop {
        if let Some(found) = take_entry(dir, &data) {
            if found.is_dir && !found.reparse {
                child_dirs.push(found.path.clone());
            }
            entries.push(found);
        }
        if unsafe { FindNextFileW(handle, &mut data) } == 0 {
            break;
        }
    }
    unsafe { FindClose(handle) };
    Batch { denied: false, entries, child_dirs }
}

fn take_entry(dir: &str, data: &WIN32_FIND_DATAW) -> Option<Found> {
    let name = utf16_name(&data.cFileName);
    if name.is_empty() || name == "." || name == ".." || skipped_dir(&name) {
        return None;
    }
    let is_dir = data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY != 0;
    let reparse = data.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    let size = if is_dir {
        0
    } else {
        ((data.nFileSizeHigh as u64) << 32) | (data.nFileSizeLow as u64)
    };
    Some(Found {
        path: join_child(dir, &name),
        is_dir,
        size,
        reparse,
    })
}

fn skipped_dir(name: &str) -> bool {
    name.eq_ignore_ascii_case("System Volume Information") || name.eq_ignore_ascii_case("$Recycle.Bin")
}

fn join_child(parent: &str, name: &str) -> String {
    if parent.ends_with('\\') {
        format!("{parent}{name}")
    } else {
        format!("{parent}\\{name}")
    }
}

fn search_pattern(path: &str) -> Vec<u16> {
    let trimmed = path.trim_end_matches('\\');
    wide(&format!("\\\\?\\{trimmed}\\*"))
}

fn utf16_name(buf: &[u16]) -> String {
    let end = buf.iter().position(|unit| *unit == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}
