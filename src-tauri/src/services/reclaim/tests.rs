use super::{recycle_paths, report, RecycleBinStatus, ScanIndex};

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
