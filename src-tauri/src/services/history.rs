use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::limits::GROWTH_FILE_CAP;
use crate::models::{GrowthDelta, GrowthEntry, NodeKind};
use crate::services::index::ScanIndex;

const FILE_NAME: &str = "growth-snapshots.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SnapshotStore {
    snaps: Vec<Snapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Snapshot {
    root: String,
    total_bytes: u64,
    children: Vec<ChildSnap>,
    files: Vec<FileSnap>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ChildSnap {
    path: String,
    name: String,
    kind: NodeKind,
    size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FileSnap {
    path: String,
    name: String,
    size_bytes: u64,
}

pub fn record(dir: &Path, index: &ScanIndex) -> Result<GrowthDelta, AppError> {
    let snap = snapshot(index)?;
    std::fs::create_dir_all(dir).map_err(|err| AppError::History(err.to_string()))?;
    let path = store_path(dir);
    let mut store = read_store(&path);
    let previous = store.snaps.iter().find(|item| item.root == snap.root).cloned();
    let delta = match &previous {
        Some(prev) => diff(prev, &snap),
        None => GrowthDelta {
            root: snap.root.clone(),
            has_baseline: false,
            previous_total: 0,
            total_bytes: snap.total_bytes,
            entries: Vec::new(),
        },
    };
    if let Some(pos) = store.snaps.iter().position(|item| item.root == snap.root) {
        store.snaps[pos] = snap;
    } else {
        store.snaps.push(snap);
    }
    write_store(&path, &store)?;
    Ok(delta)
}

fn snapshot(index: &ScanIndex) -> Result<Snapshot, AppError> {
    let root = index
        .root_path()
        .ok_or_else(|| AppError::History("scan has no root".into()))?;
    let children = index
        .direct_children()
        .into_iter()
        .map(|node| ChildSnap {
            path: node.path,
            name: node.name,
            kind: node.kind,
            size_bytes: node.size_bytes,
        })
        .collect();
    Ok(Snapshot {
        root,
        total_bytes: index.root_size(),
        children,
        files: largest_files(index),
    })
}

fn largest_files(index: &ScanIndex) -> Vec<FileSnap> {
    let mut files = Vec::new();
    for id in index.live_ids() {
        if index.kind_at(id) != Some(NodeKind::File) {
            continue;
        }
        let Some(path) = index.path_at(id) else { continue };
        let Some(name) = index.name_at(id) else { continue };
        files.push(FileSnap {
            path: path.to_string(),
            name: name.to_string(),
            size_bytes: index.size_at(id).unwrap_or(0),
        });
    }
    files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes).then_with(|| a.path.cmp(&b.path)));
    files.truncate(GROWTH_FILE_CAP);
    files
}

fn diff(previous: &Snapshot, current: &Snapshot) -> GrowthDelta {
    let prev_children: HashMap<&str, u64> = previous
        .children
        .iter()
        .map(|child| (child.path.as_str(), child.size_bytes))
        .collect();
    let prev_files: HashMap<&str, u64> = previous
        .files
        .iter()
        .map(|file| (file.path.as_str(), file.size_bytes))
        .collect();
    let mut entries = Vec::new();
    for child in &current.children {
        if child.kind != NodeKind::Folder {
            continue;
        }
        let previous_bytes = prev_children.get(child.path.as_str()).copied().unwrap_or(0);
        if child.size_bytes > previous_bytes {
            entries.push(entry(&child.path, &child.name, NodeKind::Folder, previous_bytes, child.size_bytes));
        }
    }
    for file in &current.files {
        let known = prev_files.get(file.path.as_str()).copied();
        let previous_bytes = known.unwrap_or(0);
        if known.is_none() || file.size_bytes > previous_bytes {
            entries.push(entry(&file.path, &file.name, NodeKind::File, previous_bytes, file.size_bytes));
        }
    }
    entries.sort_by(|a, b| b.delta_bytes.cmp(&a.delta_bytes).then(a.path.cmp(&b.path)));
    GrowthDelta {
        root: current.root.clone(),
        has_baseline: true,
        previous_total: previous.total_bytes,
        total_bytes: current.total_bytes,
        entries,
    }
}

fn entry(path: &str, name: &str, kind: NodeKind, previous_bytes: u64, size_bytes: u64) -> GrowthEntry {
    GrowthEntry {
        path: path.to_string(),
        name: name.to_string(),
        kind,
        previous_bytes,
        size_bytes,
        delta_bytes: size_bytes.saturating_sub(previous_bytes),
    }
}

fn store_path(dir: &Path) -> PathBuf {
    dir.join(FILE_NAME)
}

fn read_store(path: &Path) -> SnapshotStore {
    let Ok(text) = std::fs::read_to_string(path) else {
        return SnapshotStore::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_store(path: &Path, store: &SnapshotStore) -> Result<(), AppError> {
    let text = serde_json::to_string(store).map_err(|err| AppError::History(err.to_string()))?;
    std::fs::write(path, text).map_err(|err| AppError::History(err.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(files: &[(&str, u64)]) -> ScanIndex {
        let mut index = ScanIndex::new(1);
        index.insert("C:\\data", true, 0).unwrap();
        for (path, size) in files {
            if path.contains("\\docs\\") {
                index.insert("C:\\data\\docs", true, 0).unwrap();
            }
            index.insert(path, false, *size).unwrap();
        }
        index.sort_children();
        index
    }

    #[test]
    fn growth_delta_lists_folders_that_grew_and_new_or_bigger_files() {
        let dir = std::env::temp_dir().join(format!("lsm-growth-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let first = tree(&[("C:\\data\\docs\\a.txt", 10), ("C:\\data\\big.bin", 100)]);
        let baseline = record(&dir, &first).unwrap();
        assert!(!baseline.has_baseline);
        assert!(baseline.entries.is_empty());
        let second = tree(&[
            ("C:\\data\\docs\\a.txt", 10),
            ("C:\\data\\docs\\b.txt", 50),
            ("C:\\data\\big.bin", 100),
            ("C:\\data\\new.bin", 80),
        ]);
        let delta = record(&dir, &second).unwrap();
        assert!(delta.has_baseline);
        assert!(delta.entries.iter().any(|entry| entry.path == "C:\\data\\docs" && entry.delta_bytes == 50));
        assert!(delta.entries.iter().any(|entry| entry.path == "C:\\data\\new.bin" && entry.previous_bytes == 0));
        assert!(delta.entries.iter().all(|entry| entry.path != "C:\\data\\big.bin"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
