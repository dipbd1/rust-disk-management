mod catalog;
mod facts;

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;
use crate::limits::{RECLAIM_DOWNLOAD_AGE_DAYS, RECLAIM_DOWNLOAD_MIN_BYTES};
use crate::models::{NodeKind, ReclaimReport, ReclaimRow, ReclaimTier, RecycleBinStatus};
use crate::services::guard::{self, GuardMode};
#[cfg(test)]
use crate::services::index::ScanIndex;
use crate::services::paths::{is_drive_root, ready_parent};

use catalog::{FileHit, match_dir, match_file};
pub use facts::snapshot;
use facts::NodeFact;

#[cfg(test)]
pub fn report(index: &ScanIndex, recycle_bin: RecycleBinStatus) -> ReclaimReport {
    report_from(&snapshot(index), recycle_bin)
}

pub fn report_from(facts: &[NodeFact], recycle_bin: RecycleBinStatus) -> ReclaimReport {
    ReclaimReport {
        rows: collect(facts),
        recycle_bin,
    }
}

#[cfg(test)]
pub fn recycle_paths(index: &ScanIndex, ids: &[String]) -> Result<Vec<String>, AppError> {
    recycle_paths_from(&snapshot(index), ids)
}

pub fn recycle_paths_from(facts: &[NodeFact], ids: &[String]) -> Result<Vec<String>, AppError> {
    if ids.is_empty() {
        return Err(AppError::Reclaim("nothing to recycle".into()));
    }
    let rows = collect(facts);
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

fn collect(facts: &[NodeFact]) -> Vec<ReclaimRow> {
    let mut rows = Vec::new();
    let mut thumbs: HashMap<String, (u64, Vec<String>)> = HashMap::new();
    for fact in facts {
        let path = fact.path.clone();
        let name = fact.name.clone();
        let kind = fact.kind;
        let size = fact.size;
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
mod tests;
