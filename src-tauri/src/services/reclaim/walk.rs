use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::models::{
    NodeKind, ReclaimGroupStatus, ReclaimGroupTick, ReclaimPhase, ReclaimProgress, ReclaimRow,
    ReclaimTier,
};
use crate::services::guard::{self, GuardMode};
use crate::services::paths::ready_parent;

use super::catalog::{FileHit, match_dir, match_file};
use super::facts::NodeFact;

const GROUPS: [(&str, &str); 6] = [
    ("temp", "Temporary files"),
    ("browser", "Browser caches"),
    ("thumbnail", "Thumbnail cache"),
    ("build", "Build caches"),
    ("review", "Downloads and previous Windows"),
    ("system", "System files"),
];

/// Borrowed view of one index step. The command clones it only when it publishes.
pub struct WalkTick<'a> {
    pub checked: u64,
    pub total: u64,
    pub current_path: &'a str,
    pub group_bytes: &'a [u64; 6],
    pub cancelled: bool,
    pub index_done: bool,
}

pub struct WalkOutcome {
    pub rows: Vec<ReclaimRow>,
    pub cancelled: bool,
    pub group_bytes: [u64; 6],
}

/// One pass over the snapshot. `on_progress` runs for every fact; the caller throttles sends.
pub fn walk(
    facts: &[NodeFact],
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(&WalkTick<'_>),
) -> WalkOutcome {
    let total = facts.len() as u64;
    let mut rows = Vec::new();
    let mut thumbs: HashMap<String, (u64, Vec<String>)> = HashMap::new();
    let mut group_bytes = [0_u64; 6];
    let mut last_path = "";

    for (seen, fact) in facts.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            on_progress(&tick(
                seen as u64,
                total,
                &fact.path,
                &group_bytes,
                true,
                false,
            ));
            return WalkOutcome {
                rows,
                cancelled: true,
                group_bytes,
            };
        }
        last_path = fact.path.as_str();
        on_progress(&tick(
            seen as u64 + 1,
            total,
            last_path,
            &group_bytes,
            false,
            false,
        ));
        if !push_fact(fact, &mut rows, &mut thumbs, &mut group_bytes) {
            continue;
        }
    }
    fold_thumbs(&mut rows, thumbs);
    rows.sort_by(|a, b| {
        super::tier_rank(a.tier)
            .cmp(&super::tier_rank(b.tier))
            .then(b.size_bytes.cmp(&a.size_bytes))
    });
    on_progress(&tick(total, total, last_path, &group_bytes, false, true));
    WalkOutcome {
        rows,
        cancelled: false,
        group_bytes,
    }
}

pub fn index_tick(tick: &WalkTick<'_>) -> ReclaimProgress {
    ReclaimProgress {
        checked: tick.checked,
        total: tick.total,
        current_path: tick.current_path.to_string(),
        phase: ReclaimPhase::Index,
        groups: group_list(tick.group_bytes, 0, false, false),
        done: tick.cancelled,
        cancelled: tick.cancelled,
    }
}

pub fn cancelled_tick() -> ReclaimProgress {
    bin_tick(0, &[0; 6], 0, true, true)
}

pub fn bin_tick(
    total: u64,
    group_bytes: &[u64; 6],
    bin_bytes: u64,
    done: bool,
    cancelled: bool,
) -> ReclaimProgress {
    ReclaimProgress {
        checked: total,
        total,
        current_path: String::new(),
        phase: ReclaimPhase::Bin,
        groups: group_list(group_bytes, bin_bytes, true, done),
        done,
        cancelled,
    }
}

fn tick<'a>(
    checked: u64,
    total: u64,
    path: &'a str,
    group_bytes: &'a [u64; 6],
    cancelled: bool,
    index_done: bool,
) -> WalkTick<'a> {
    WalkTick {
        checked,
        total,
        current_path: path,
        group_bytes,
        cancelled,
        index_done,
    }
}

/// Returns false when the fact is skipped. Checked count still includes it.
fn push_fact(
    fact: &NodeFact,
    rows: &mut Vec<ReclaimRow>,
    thumbs: &mut HashMap<String, (u64, Vec<String>)>,
    group_bytes: &mut [u64; 6],
) -> bool {
    if guard::is_refused(&fact.path, GuardMode::Reclaim) {
        return false;
    }
    if fact.kind == NodeKind::Folder {
        if let Some(hit) = match_dir(&fact.path, &fact.name) {
            add(group_bytes, group_for_dir(hit.id, hit.tier), fact.size);
            rows.push(super::row(
                format!("{}:{}", hit.id, fact.path),
                hit.tier,
                hit.title,
                hit.sentence,
                &fact.path,
                fact.size,
                1,
                true,
                vec![fact.path.clone()],
            ));
        }
        return true;
    }
    if fact.kind != NodeKind::File {
        return true;
    }
    match match_file(&fact.path, &fact.name) {
        Some(FileHit::System { title, sentence }) => {
            add(group_bytes, 5, fact.size);
            rows.push(super::row(
                format!("system:{}", fact.path),
                ReclaimTier::System,
                title,
                sentence,
                &fact.path,
                fact.size,
                1,
                false,
                Vec::new(),
            ));
        }
        Some(FileHit::Thumb) => {
            add(group_bytes, 2, fact.size);
            let parent = ready_parent(&fact.path).unwrap_or("").to_string();
            let entry = thumbs.entry(parent).or_insert((0, Vec::new()));
            entry.0 = entry.0.saturating_add(fact.size);
            entry.1.push(fact.path.clone());
        }
        Some(FileHit::Download) => {
            if let Some(download) = super::download_row(&fact.path, &fact.name, fact.size) {
                add(group_bytes, 4, download.size_bytes);
                rows.push(download);
            }
        }
        Some(FileHit::Disk) => {
            add(group_bytes, 4, fact.size);
            rows.push(super::row(
                format!("virtual-disk:{}", fact.path),
                ReclaimTier::Review,
                &fact.name,
                "This virtual disk holds a Docker or WSL environment. Recycling it removes that environment.",
                &fact.path,
                fact.size,
                1,
                true,
                vec![fact.path.clone()],
            ));
        }
        None => {}
    }
    true
}

fn fold_thumbs(rows: &mut Vec<ReclaimRow>, thumbs: HashMap<String, (u64, Vec<String>)>) {
    for (parent, (size, paths)) in thumbs {
        let count = paths.len() as u64;
        rows.push(super::row(
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
}

fn group_for_dir(id: &str, tier: ReclaimTier) -> usize {
    match id {
        "user-temp" | "windows-temp" | "windows-update" | "delivery-optimization" => 0,
        "browser-chrome" | "browser-edge" | "browser-brave" | "browser-firefox" => 1,
        "npm-cache" | "pip-cache" | "cargo-registry" | "steam-shader" | "node-modules" => 3,
        "windows-old" => 4,
        _ => match tier {
            ReclaimTier::Safe => 0,
            ReclaimTier::Rebuild => 3,
            ReclaimTier::Review => 4,
            ReclaimTier::System => 5,
        },
    }
}

fn add(groups: &mut [u64; 6], index: usize, size: u64) {
    groups[index] = groups[index].saturating_add(size);
}

fn group_list(
    bytes: &[u64; 6],
    bin_bytes: u64,
    bin_phase: bool,
    finished: bool,
) -> Vec<ReclaimGroupTick> {
    let mut groups = Vec::with_capacity(GROUPS.len() + 1);
    for (index, (id, title)) in GROUPS.iter().enumerate() {
        groups.push(ReclaimGroupTick {
            id: (*id).to_string(),
            title: (*title).to_string(),
            size_bytes: bytes[index],
            status: if finished || bin_phase {
                ReclaimGroupStatus::Done
            } else {
                ReclaimGroupStatus::Scanning
            },
        });
    }
    groups.push(ReclaimGroupTick {
        id: "bin".to_string(),
        title: "Recycle Bin".to_string(),
        size_bytes: bin_bytes,
        status: if finished {
            ReclaimGroupStatus::Done
        } else if bin_phase {
            ReclaimGroupStatus::Scanning
        } else {
            ReclaimGroupStatus::Pending
        },
    });
    groups
}
