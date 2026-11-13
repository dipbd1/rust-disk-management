mod catalog;

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;
use crate::limits::{RECLAIM_DOWNLOAD_AGE_DAYS, RECLAIM_DOWNLOAD_MIN_BYTES};
use crate::models::{NodeKind, ReclaimReport, ReclaimRow, ReclaimTier, RecycleBinStatus};
use crate::services::guard::{self, GuardMode};
use crate::services::index::ScanIndex;
use crate::services::paths::{is_drive_root, ready_parent};

use catalog::{FileHit, match_dir, match_file};

pub fn report(index: &ScanIndex, recycle_bin: RecycleBinStatus) -> ReclaimReport {
    ReclaimReport {
        rows: collect(index),
        recycle_bin,
    }
}

pub fn recycle_paths(index: &ScanIndex, ids: &[String]) -> Result<Vec<String>, AppError> {
    if ids.is_empty() {
        return Err(AppError::Reclaim("nothing to recycle".into()));
    }
    let rows = collect(index);
    let mut paths = Vec::new();
    for id in ids {
        let Some(row) = rows.iter().find(|row| row.id == id.as_str()) else {
            return Err(AppError::Reclaim(format!("unknown reclaim item {id}")));
        };
        if !row.can_recycle {
            return Err(AppError::Reclaim(format!("no delete action for {}", row.title)));
        }
        for path in &row.paths {
            if is_drive_root(path) || guard::is_refused(path, GuardMode::Reclaim) {
                return Err(AppError::Protected(path.clone()));
            }
            if !paths.iter().any(|existing| existing == path) {
                paths.push(path.clone());
            }
        }
    }
    if paths.is_empty() {
        return Err(AppError::Reclaim("nothing to recycle".into()));
    }
    Ok(paths)
}

fn collect(index: &ScanIndex) -> Vec<ReclaimRow> {
    let mut rows = Vec::new();
    let mut thumbs: HashMap<String, (u64, Vec<String>)> = HashMap::new();
    for id in index.live_ids() {
        let Some(path) = index.path_at(id).map(str::to_string) else { continue };
        let Some(name) = index.name_at(id).map(str::to_string) else { continue };
        let Some(kind) = index.kind_at(id) else { continue };
        let size = index.size_at(id).unwrap_or(0);
        if guard::is_refused(&path, GuardMode::Reclaim) {
            continue;
        }
        if kind == NodeKind::Folder {
            if let Some(hit) = match_dir(&path, &name) {
                rows.push(row(
                    format!("{}:{path}", hit.id),
                    hit.tier,
                    hit.title,
                    hit.sentence,
                    &path,
                    size,
                    1,
                    true,
                    vec![path.clone()],
                ));
            }
            continue;
        }
        if kind != NodeKind::File {
            continue;
        }
        match match_file(&path, &name) {
            Some(FileHit::System { title, sentence }) => rows.push(row(
                format!("system:{path}"),
                ReclaimTier::System,
                title,
                sentence,
                &path,
                size,
                1,
                false,
                Vec::new(),
            )),
            Some(FileHit::Thumb) => {
                let parent = ready_parent(&path).unwrap_or("").to_string();
                let entry = thumbs.entry(parent).or_insert((0, Vec::new()));
                entry.0 = entry.0.saturating_add(size);
                entry.1.push(path);
            }
            Some(FileHit::Download) => {
                if let Some(download) = download_row(&path, &name, size) {
                    rows.push(download);
                }
            }
            Some(FileHit::Disk) => rows.push(row(
                format!("virtual-disk:{path}"),
                ReclaimTier::Review,
                &name,
                "This virtual disk holds a Docker or WSL environment. Recycling it removes that environment.",
                &path,
                size,
                1,
                true,
                vec![path.clone()],
            )),
            None => {}
        }
    }
    for (parent, (size, paths)) in thumbs {
        let count = paths.len() as u64;
        rows.push(row(
            format!("thumbnail:{parent}"),
            ReclaimTier::Safe,
            "Thumbnail cache",
            "Explorer rebuilds thumbnail images the next time you open a folder.",
            &parent,
            size,
            count,
            true,
            paths,
        ));
    }
    rows.sort_by(|a, b| tier_rank(a.tier).cmp(&tier_rank(b.tier)).then(b.size_bytes.cmp(&a.size_bytes)));
    rows
}

fn download_row(path: &str, name: &str, size: u64) -> Option<ReclaimRow> {
    if size < RECLAIM_DOWNLOAD_MIN_BYTES || !download_is_old(path) {
        return None;
    }
    Some(row(
        format!("download:{path}"),
        ReclaimTier::Review,
        name,
        "This file has been in Downloads for over 30 days. Review it before recycling.",
        path,
        size,
        1,
        true,
        vec![path.to_string()],
    ))
}

pub(crate) fn download_is_old(path: &str) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = meta.modified() else {
        return false;
    };
    let Ok(modified_secs) = modified.duration_since(UNIX_EPOCH) else {
        return false;
    };
    let Ok(now) = SystemTime::now().duration_since(UNIX_EPOCH) else {
        return false;
    };
    now.as_secs().saturating_sub(modified_secs.as_secs()) >= RECLAIM_DOWNLOAD_AGE_DAYS * 24 * 60 * 60
}

fn row(
    id: String,
    tier: ReclaimTier,
    title: &str,
    sentence: &str,
    reveal: &str,
    size: u64,
    count: u64,
    can_recycle: bool,
    paths: Vec<String>,
) -> ReclaimRow {
    ReclaimRow {
        id,
        tier,
        title: title.to_string(),
        sentence: sentence.to_string(),
        reveal_path: reveal.to_string(),
        size_bytes: size,
        item_count: count,
        can_recycle,
        paths,
    }
}

fn tier_rank(tier: ReclaimTier) -> u8 {
    match tier {
        ReclaimTier::Safe => 0,
        ReclaimTier::Rebuild => 1,
        ReclaimTier::Review => 2,
        ReclaimTier::System => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> ScanIndex {
        let mut index = ScanIndex::new(1);
        let nodes = [
            ("C:\\", true, 0),
            ("C:\\Windows", true, 0),
            ("C:\\Windows\\System32", true, 0),
            ("C:\\Windows\\System32\\notepad.exe", false, 1000),
            ("C:\\Windows\\System32\\node_modules", true, 0),
            ("C:\\Windows\\System32\\node_modules\\pkg.js", false, 500),
            ("C:\\Windows\\Temp", true, 0),
            ("C:\\Windows\\Temp\\a.tmp", false, 40),
            ("C:\\Program Files", true, 0),
            ("C:\\Program Files\\App", true, 0),
            ("C:\\Program Files\\App\\node_modules", true, 0),
            ("C:\\Program Files\\App\\node_modules\\x.js", false, 80),
            ("C:\\Users", true, 0),
            ("C:\\Users\\me", true, 0),
            ("C:\\Users\\me\\AppData", true, 0),
            ("C:\\Users\\me\\AppData\\Local", true, 0),
            ("C:\\Users\\me\\AppData\\Local\\Temp", true, 0),
            ("C:\\Users\\me\\AppData\\Local\\Temp\\b.tmp", false, 70),
            ("C:\\Users\\me\\proj", true, 0),
            ("C:\\Users\\me\\proj\\node_modules", true, 0),
            ("C:\\Users\\me\\proj\\node_modules\\leftpad.js", false, 20),
            ("C:\\hiberfil.sys", false, 100),
        ];
        for (path, is_dir, size) in nodes {
            index.insert(path, is_dir, size).unwrap();
        }
        index.sort_children();
        index
    }

    #[test]
    fn reclaim_never_matches_system32_or_program_files() {
        let rows = collect(&sample());
        assert!(rows.iter().all(|row| !row.reveal_path.to_ascii_lowercase().contains("system32")));
        assert!(rows.iter().all(|row| !row.paths.iter().any(|path| path.to_ascii_lowercase().contains("system32"))));
        assert!(rows.iter().all(|row| !row.reveal_path.to_ascii_lowercase().contains("program files")));
        assert!(rows.iter().any(|row| row.id.starts_with("windows-temp:")));
        assert!(rows.iter().any(|row| row.id.starts_with("user-temp:")));
        assert!(rows.iter().any(|row| row.reveal_path == "C:\\Users\\me\\proj\\node_modules"));
        let hiber = rows.iter().find(|row| row.title == "hiberfil.sys").expect("hiberfil");
        assert!(!hiber.can_recycle);
        assert!(recycle_paths(&sample(), &[hiber.id.clone()]).is_err());
    }
}
