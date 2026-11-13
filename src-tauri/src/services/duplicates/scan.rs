use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};

use sha2::{Digest, Sha256};

use crate::limits::DUPLICATE_MIN_BYTES;
use crate::models::{DuplicateProgress, NodeKind};
use crate::services::guard::{self, GuardMode};
use crate::services::index::ScanIndex;

use super::group::{self, Candidate};

pub struct FileCand {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
}

struct ReadyFile {
    file: FileCand,
    volume: u32,
    file_index: u64,
}

pub fn candidate_files(index: &ScanIndex) -> Vec<FileCand> {
    let mut files = Vec::new();
    for id in index.live_ids() {
        if index.kind_at(id) != Some(NodeKind::File) {
            continue;
        }
        let size = index.size_at(id).unwrap_or(0);
        if size < DUPLICATE_MIN_BYTES {
            continue;
        }
        let Some(path) = index.path_at(id) else { continue };
        if guard::is_refused(path, GuardMode::Duplicates) {
            continue;
        }
        let Some(name) = index.name_at(id) else { continue };
        files.push(FileCand {
            path: path.to_string(),
            name: name.to_string(),
            size_bytes: size,
        });
    }
    files
}

pub fn review_files(
    files: Vec<FileCand>,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(&DuplicateProgress),
) -> DuplicateProgress {
    if cancel.load(Ordering::Relaxed) {
        return finished(true, Vec::new(), 0, 0);
    }
    let mut by_size: HashMap<u64, Vec<FileCand>> = HashMap::new();
    for file in files {
        by_size.entry(file.size_bytes).or_default().push(file);
    }
    let mut to_hash = Vec::new();
    for group in by_size.into_values() {
        if group.len() < 2 {
            continue;
        }
        if cancel.load(Ordering::Relaxed) {
            return finished(true, Vec::new(), 0, 0);
        }
        let unique = collapse_paths(group);
        if unique.len() >= 2 {
            to_hash.extend(unique);
        }
    }
    let total = to_hash.len() as u64;
    let mut hashed = Vec::new();
    for (index, file) in to_hash.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return finished(true, hashed, index as u64, total);
        }
        on_progress(&tick(index as u64, total, &file.file.path, false));
        match hash_file(&file.file.path, cancel) {
            ReadHash::Cancelled => return finished(true, hashed, index as u64, total),
            ReadHash::Skip => {}
            ReadHash::Done(hash) => hashed.push(candidate(file, hash)),
        }
    }
    finished(false, hashed, total, total)
}

fn collapse_paths(group: Vec<FileCand>) -> Vec<ReadyFile> {
    let mut unique: HashMap<(u32, u64), ReadyFile> = HashMap::new();
    for file in group {
        let Some(id) = file_identity(&file.path) else { continue };
        let ready = ReadyFile {
            file,
            volume: id.0,
            file_index: id.1,
        };
        match unique.get(&id) {
            Some(current) if !group::better_keeper(&ready.file.path, &current.file.path) => {}
            _ => {
                unique.insert(id, ready);
            }
        }
    }
    unique.into_values().collect()
}

fn candidate(file: &ReadyFile, hash: String) -> Candidate {
    Candidate {
        path: file.file.path.clone(),
        name: file.file.name.clone(),
        size_bytes: file.file.size_bytes,
        volume: file.volume,
        file_index: file.file_index,
        hash,
    }
}

fn file_identity(path: &str) -> Option<(u32, u64)> {
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::fs::MetadataExt;
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, FILE_FLAG_BACKUP_SEMANTICS,
        FILE_FLAG_OPEN_REPARSE_POINT, FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        OPEN_EXISTING,
    };
    const OFFLINE: u32 = 0x1000;
    const REPARSE: u32 = 0x400;
    const RECALL_ON_OPEN: u32 = 0x0004_0000;
    const RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;
    let meta = std::fs::symlink_metadata(path).ok()?;
    if meta.file_attributes() & (OFFLINE | REPARSE | RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS) != 0 {
        return None;
    }
    let wide: Vec<u16> = std::ffi::OsStr::new(path).encode_wide().chain(std::iter::once(0)).collect();
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            FILE_READ_ATTRIBUTES,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return None;
    }
    let time = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
    let mut info = BY_HANDLE_FILE_INFORMATION {
        dwFileAttributes: 0,
        ftCreationTime: time,
        ftLastAccessTime: time,
        ftLastWriteTime: time,
        dwVolumeSerialNumber: 0,
        nFileSizeHigh: 0,
        nFileSizeLow: 0,
        nNumberOfLinks: 0,
        nFileIndexHigh: 0,
        nFileIndexLow: 0,
    };
    let ok = unsafe { GetFileInformationByHandle(handle, &mut info) };
    unsafe { CloseHandle(handle) };
    if ok == 0 {
        return None;
    }
    let index = (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow);
    Some((info.dwVolumeSerialNumber, index))
}

enum ReadHash {
    Done(String),
    Skip,
    Cancelled,
}

fn hash_file(path: &str, cancel: &AtomicBool) -> ReadHash {
    let mut file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return ReadHash::Skip,
    };
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return ReadHash::Cancelled;
        }
        match file.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => hasher.update(&buf[..n]),
            Err(_) => return ReadHash::Skip,
        }
    }
    ReadHash::Done(hex_encode(&hasher.finalize()))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn tick(checked: u64, total: u64, path: &str, done: bool) -> DuplicateProgress {
    DuplicateProgress {
        checked,
        total,
        current_path: path.to_string(),
        done,
        cancelled: false,
        truncated: false,
        groups: Vec::new(),
    }
}

fn finished(cancelled: bool, hashed: Vec<Candidate>, checked: u64, total: u64) -> DuplicateProgress {
    let (groups, truncated) = group::build_groups(hashed);
    DuplicateProgress {
        checked,
        total,
        current_path: String::new(),
        done: true,
        cancelled,
        truncated,
        groups,
    }
}

#[cfg(test)]
#[path = "scan_tests.rs"]
mod tests;
