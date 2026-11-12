mod build;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use ntfs_reader::{MftScan, NtfsFile, Volume};

use crate::error::AppError;
use crate::limits::PROGRESS_INTERVAL_MS;
use crate::models::ScanProgress;
use crate::services::elevation::wide;
use crate::services::index::ScanIndex;
use crate::services::paths::ntfs_device_path;

const METAFILES: &[&str] = &[
    "$MFT", "$MFTMirr", "$LogFile", "$Volume", "$AttrDef", "$Bitmap", "$Boot", "$BadClus", "$Secure",
    "$UpCase", "$Extend",
];

struct Rec {
    parent: u64,
    name: String,
    own: u64,
    rolled: u64,
    child_count: u64,
    folder_count: u64,
    file_count: u64,
    is_dir: bool,
    reparse: bool,
    skip: bool,
}

struct Table {
    records: HashMap<u64, Rec>,
    pending: HashMap<u64, u64>,
    root_children: Vec<u64>,
    /// Direct child record numbers, so a progress tick can pick moons without scanning every record.
    children: HashMap<u64, Vec<u64>>,
    root_number: Option<u64>,
    root_rolled: u64,
    root_folders: u64,
    root_files: u64,
    scanned: u64,
    last: Option<u64>,
}

/// `Ok(None)` means the volume cannot be read this way; the caller walks instead.
pub fn try_scan(
    root: &str,
    generation: u64,
    cancel: &Arc<AtomicBool>,
    mut on_progress: impl FnMut(ScanProgress),
) -> Result<Option<(ScanIndex, ScanProgress)>, AppError> {
    let Some(device) = ntfs_device_path(root) else {
        return Ok(None);
    };
    if !is_ntfs_volume(root) {
        return Ok(None);
    }
    let volume = match Volume::new(&device) {
        Ok(volume) => volume,
        Err(_) => return Ok(None),
    };
    let mut scan = match MftScan::new(volume) {
        Ok(scan) => scan,
        Err(_) => return Ok(None),
    };
    let started = Instant::now();
    let mut table = Table::default();
    let mut last_emit = started;
    while let Some(chunk) = scan.next_chunk().map_err(|err| AppError::Scan(err.to_string()))? {
        for file in chunk.files() {
            if cancel.load(Ordering::Relaxed) {
                return Ok(Some(table.finish(root, generation, started, 0, true)?));
            }
            table.ingest(&file);
            if last_emit.elapsed() >= Duration::from_millis(PROGRESS_INTERVAL_MS) {
                on_progress(table.progress(root, generation, started, false));
                last_emit = Instant::now();
            }
        }
    }
    let denied = scan.corrupt_records();
    Ok(Some(table.finish(root, generation, started, denied, cancel.load(Ordering::Relaxed))?))
}

impl Default for Table {
    fn default() -> Self {
        Self {
            records: HashMap::new(),
            pending: HashMap::new(),
            root_children: Vec::new(),
            children: HashMap::new(),
            root_number: None,
            root_rolled: 0,
            root_folders: 0,
            root_files: 0,
            scanned: 0,
            last: None,
        }
    }
}

impl Table {
    fn ingest(&mut self, file: &NtfsFile<'_>) {
        if file.is_extension() || file.is_deleted() || !file.is_used() {
            return;
        }
        let Some(best) = file.best_name() else {
            return;
        };
        // `best_name` is the Win32 name when the file has one, so the DOS alias is not stored twice.
        let name = best.to_os_string().to_string_lossy().into_owned();
        if name.is_empty() || name == "." || name == ".." {
            return;
        }
        let parent = best.parent_number();
        let number = file.number();
        if best.is_in_root() {
            self.note_root(parent);
        }
        if number == parent {
            self.note_root(number);
            return;
        }
        if self.records.contains_key(&number) {
            return;
        }
        if self.records.get(&parent).is_some_and(|rec| rec.skip || rec.reparse) {
            return;
        }
        let is_dir = file.is_directory();
        let reparse = best.is_reparse_point();
        let skip = skipped_dir(&name) || (best.is_in_root() && is_meta(&name));
        let own = if is_dir { 0 } else { logical_size(file) };
        self.records.insert(
            number,
            Rec {
                parent,
                name,
                own,
                rolled: 0,
                child_count: 0,
                folder_count: 0,
                file_count: 0,
                is_dir,
                reparse,
                skip,
            },
        );
        self.scanned += 1;
        self.last = Some(number);
        if !skip {
            self.children.entry(parent).or_default().push(number);
            if self.root_number == Some(parent) {
                self.root_children.push(number);
            }
            self.note_parent(parent, is_dir);
        }
        if skip || reparse {
            self.pending.remove(&number);
        } else if let Some(bytes) = self.pending.remove(&number) {
            self.add_bytes(number, bytes);
        }
        if !skip && own > 0 {
            self.add_bytes(number, own);
        }
    }

    fn note_root(&mut self, number: u64) {
        if self.root_number.is_some() {
            return;
        }
        self.root_number = Some(number);
        if let Some(bytes) = self.pending.remove(&number) {
            self.root_rolled = self.root_rolled.saturating_add(bytes);
        }
    }

    fn note_parent(&mut self, parent: u64, is_dir: bool) {
        if self.root_number == Some(parent) {
            if is_dir {
                self.root_folders += 1;
            } else {
                self.root_files += 1;
            }
            return;
        }
        let Some(rec) = self.records.get_mut(&parent) else {
            return;
        };
        rec.child_count += 1;
        if is_dir {
            rec.folder_count += 1;
        } else {
            rec.file_count += 1;
        }
    }

    fn add_bytes(&mut self, start: u64, bytes: u64) {
        if bytes == 0 {
            return;
        }
        let mut cur = start;
        let mut first = true;
        for _ in 0..1024 {
            if self.root_number == Some(cur) {
                self.root_rolled = self.root_rolled.saturating_add(bytes);
                return;
            }
            let parent = {
                let Some(rec) = self.records.get_mut(&cur) else {
                    *self.pending.entry(cur).or_default() += bytes;
                    return;
                };
                if rec.skip || (rec.reparse && !first) {
                    return;
                }
                rec.rolled = rec.rolled.saturating_add(bytes);
                rec.parent
            };
            first = false;
            if parent == cur {
                return;
            }
            cur = parent;
        }
    }
}

fn logical_size(file: &NtfsFile<'_>) -> u64 {
    file.data_streams().filter(|stream| stream.name.is_none()).map(|stream| stream.size).sum()
}

fn skipped_dir(name: &str) -> bool {
    name.eq_ignore_ascii_case("System Volume Information") || name.eq_ignore_ascii_case("$Recycle.Bin")
}

fn is_meta(name: &str) -> bool {
    METAFILES.iter().any(|item| name.eq_ignore_ascii_case(item))
}

fn is_ntfs_volume(root: &str) -> bool {
    let wide_root = wide(root);
    let mut name = [0u16; 16];
    let ok = unsafe {
        windows_sys::Win32::Storage::FileSystem::GetVolumeInformationW(
            wide_root.as_ptr(),
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            name.as_mut_ptr(),
            name.len() as u32,
        )
    };
    if ok == 0 {
        return false;
    }
    let end = name.iter().position(|unit| *unit == 0).unwrap_or(name.len());
    String::from_utf16_lossy(&name[..end]).eq_ignore_ascii_case("NTFS")
}
