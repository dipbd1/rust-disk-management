use std::collections::HashMap;

use crate::limits::DUPLICATE_GROUP_CAP;
use crate::models::{DuplicateFile, DuplicateGroup};
use crate::services::guard::{self, segments, GuardMode};

pub struct Candidate {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub volume: u32,
    pub file_index: u64,
    pub hash: String,
}

pub fn build_groups(items: Vec<Candidate>) -> (Vec<DuplicateGroup>, bool) {
    let mut by_hash: HashMap<String, Vec<Candidate>> = HashMap::new();
    for item in items {
        if guard::is_refused(&item.path, GuardMode::Duplicates) {
            continue;
        }
        by_hash.entry(item.hash.clone()).or_default().push(item);
    }
    let mut groups = Vec::new();
    for (hash, bucket) in by_hash {
        let unique = collapse_ids(bucket);
        if unique.len() < 2 {
            continue;
        }
        let Some(size) = unique.first().map(|item| item.size_bytes) else {
            continue;
        };
        let keeper_at = keeper_index(&unique);
        let wasted = size.saturating_mul(unique.len() as u64 - 1);
        let mut copies = Vec::new();
        let mut keeper = None;
        for (index, item) in unique.into_iter().enumerate() {
            let file = DuplicateFile {
                path: item.path,
                name: item.name,
                size_bytes: item.size_bytes,
            };
            if index == keeper_at {
                keeper = Some(file);
            } else {
                copies.push(file);
            }
        }
        let Some(keeper) = keeper else { continue };
        groups.push(DuplicateGroup {
            id: hash,
            size_bytes: size,
            wasted_bytes: wasted,
            keeper,
            copies,
        });
    }
    groups.sort_by(|a, b| b.wasted_bytes.cmp(&a.wasted_bytes).then(a.id.cmp(&b.id)));
    let truncated = groups.len() > DUPLICATE_GROUP_CAP;
    groups.truncate(DUPLICATE_GROUP_CAP);
    (groups, truncated)
}

pub fn better_keeper(path: &str, other: &str) -> bool {
    let path_lib = in_user_library(path);
    let other_lib = in_user_library(other);
    if path_lib != other_lib {
        return !path_lib;
    }
    path.len() < other.len() || (path.len() == other.len() && path < other)
}

fn collapse_ids(bucket: Vec<Candidate>) -> Vec<Candidate> {
    let mut unique: HashMap<(u32, u64), Candidate> = HashMap::new();
    for item in bucket {
        let key = (item.volume, item.file_index);
        match unique.get(&key) {
            Some(current) if !better_keeper(&item.path, &current.path) => {}
            _ => {
                unique.insert(key, item);
            }
        }
    }
    unique.into_values().collect()
}

fn keeper_index(items: &[Candidate]) -> usize {
    let mut best = 0;
    for (index, item) in items.iter().enumerate().skip(1) {
        if better_keeper(&item.path, &items[best].path) {
            best = index;
        }
    }
    best
}

fn in_user_library(path: &str) -> bool {
    let segs = segments(path);
    let Some(users) = segs.iter().position(|seg| seg == "users") else {
        return false;
    };
    segs[users + 2..].iter().any(|seg| {
        matches!(seg.as_str(), "documents" | "music" | "pictures" | "videos" | "desktop")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(path: &str, hash: &str, file_index: u64) -> Candidate {
        Candidate {
            path: path.to_string(),
            name: path.rsplit('\\').next().unwrap_or(path).to_string(),
            size_bytes: 10,
            volume: 1,
            file_index,
            hash: hash.to_string(),
        }
    }

    #[test]
    fn duplicate_groups_skip_different_content_same_file_id_and_protected_paths() {
        let items = vec![
            item("C:\\work\\a.bin", "hash-a", 1),
            item("C:\\work\\b.bin", "hash-b", 2),
            item("C:\\work\\link.bin", "hash-c", 3),
            item("C:\\work\\link-again.bin", "hash-c", 3),
            item("C:\\Windows\\System32\\e.bin", "hash-d", 4),
            item("C:\\work\\e-copy.bin", "hash-d", 5),
            item("C:\\Users\\me\\Documents\\photo.bin", "hash-e", 6),
            item("C:\\projects\\photo.bin", "hash-e", 7),
        ];
        let (groups, _) = build_groups(items);
        assert!(groups.iter().all(|group| group.id != "hash-a" && group.id != "hash-b"));
        assert!(groups.iter().all(|group| group.id != "hash-c"));
        assert!(groups.iter().all(|group| group.id != "hash-d"));
        let photo = groups.iter().find(|group| group.id == "hash-e").expect("photo group");
        assert_eq!(photo.keeper.path, "C:\\projects\\photo.bin");
        assert_eq!(photo.wasted_bytes, 10);
        assert_eq!(photo.copies.len(), 1);
        assert!(better_keeper("C:\\Windows\\Temp\\a.bin", "C:\\work\\a.bin") == false);
    }
}
