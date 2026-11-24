use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;
use crate::limits::DELETION_LOG_CAP;
use crate::models::{DeletionLogEntry, DeletionMethod};

const FILE_NAME: &str = "deletion-log.jsonl";

pub fn append(
    dir: &Path,
    path: &str,
    size_bytes: u64,
    method: DeletionMethod,
) -> Result<(), AppError> {
    std::fs::create_dir_all(dir).map_err(|err| AppError::DeletionLog(err.to_string()))?;
    let entry = DeletionLogEntry {
        unix_ms: unix_ms_now(),
        path: path.to_string(),
        size_bytes,
        method,
    };
    let line =
        serde_json::to_string(&entry).map_err(|err| AppError::DeletionLog(err.to_string()))?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(store_path(dir))
        .map_err(|err| AppError::DeletionLog(err.to_string()))?;
    writeln!(file, "{line}").map_err(|err| AppError::DeletionLog(err.to_string()))
}

/// Newest entries first, capped at `DELETION_LOG_CAP`.
pub fn recent(dir: &Path) -> Result<Vec<DeletionLogEntry>, AppError> {
    let path = store_path(dir);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let file = std::fs::File::open(&path).map_err(|err| AppError::DeletionLog(err.to_string()))?;
    let mut entries = Vec::new();
    for line in BufReader::new(file).lines() {
        let line = line.map_err(|err| AppError::DeletionLog(err.to_string()))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<DeletionLogEntry>(trimmed) {
            entries.push(entry);
        }
    }
    entries.reverse();
    entries.truncate(DELETION_LOG_CAP);
    Ok(entries)
}

fn store_path(dir: &Path) -> PathBuf {
    dir.join(FILE_NAME)
}

fn unix_ms_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lsm-del-log-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn appends_and_reads_newest_first() {
        let dir = temp_dir("append");
        append(&dir, "C:\\Users\\me\\a.txt", 10, DeletionMethod::RecycleBin).unwrap();
        append(&dir, "C:\\Users\\me\\b.txt", 20, DeletionMethod::Permanent).unwrap();
        let entries = recent(&dir).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, "C:\\Users\\me\\b.txt");
        assert_eq!(entries[0].method, DeletionMethod::Permanent);
        assert_eq!(entries[0].size_bytes, 20);
        assert_eq!(entries[1].path, "C:\\Users\\me\\a.txt");
        assert_eq!(entries[1].method, DeletionMethod::RecycleBin);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_file_returns_empty() {
        let dir = temp_dir("missing");
        assert!(recent(&dir).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn skips_corrupt_lines() {
        let dir = temp_dir("corrupt");
        let path = store_path(&dir);
        std::fs::write(
            &path,
            "not-json\n{\"unixMs\":1,\"path\":\"C:\\\\ok.txt\",\"sizeBytes\":3,\"method\":\"recycleBin\"}\n",
        )
        .unwrap();
        let entries = recent(&dir).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "C:\\ok.txt");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
