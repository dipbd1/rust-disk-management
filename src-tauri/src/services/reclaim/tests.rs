use std::sync::atomic::{AtomicBool, Ordering};

use crate::models::{ReclaimGroupStatus, ReclaimPhase};

use super::{index_tick, recycle_paths, report, snapshot, walk, RecycleBinStatus, ScanIndex};

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
    let rows = report(
        &sample(),
        RecycleBinStatus {
            size_bytes: 0,
            item_count: 0,
            available: false,
        },
    )
    .rows;
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

#[test]
fn walk_reports_group_bytes_and_stops_when_cancelled() {
    let facts = snapshot(&sample());
    let quiet = walk(&facts, &AtomicBool::new(false), |_| {});
    assert!(!quiet.cancelled);
    assert_eq!(quiet.group_bytes[0], 110);
    assert_eq!(quiet.group_bytes[3], 20);
    assert_eq!(quiet.group_bytes[5], 100);
    let cancel = AtomicBool::new(true);
    let stopped = walk(&facts, &cancel, |_| {});
    assert!(stopped.cancelled);
    assert!(cancel.load(Ordering::Relaxed));
    assert!(stopped.rows.is_empty());
}

#[test]
fn index_tick_leaves_the_recycle_bin_pending() {
    let facts = snapshot(&sample());
    let mut pending = false;
    walk(&facts, &AtomicBool::new(false), |step| {
        if step.checked != 1 {
            return;
        }
        let progress = index_tick(step);
        pending = progress.phase == ReclaimPhase::Index
            && !progress.done
            && progress.groups[6].id == "bin"
            && progress.groups[6].status == ReclaimGroupStatus::Pending
            && progress.groups.iter().take(6).all(|group| group.status == ReclaimGroupStatus::Scanning);
    });
    assert!(pending);
}
