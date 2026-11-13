use crate::services::paths::{is_drive_root, normalize_path};

/// Reclaim may recycle the named Windows caches. Duplicate review may not.
#[derive(Clone, Copy)]
pub enum GuardMode {
    Reclaim,
    Duplicates,
}

pub fn is_refused(path: &str, mode: GuardMode) -> bool {
    let path = normalize_path(path);
    if path.is_empty() || is_drive_root(&path) {
        return true;
    }
    let segs = segments(&path);
    if segs.iter().any(|seg| seg == "program files" || seg == "program files (x86)") {
        return true;
    }
    if !os_windows(&segs) {
        return false;
    }
    match mode {
        GuardMode::Duplicates => true,
        GuardMode::Reclaim => !safe_windows_cache(&segs),
    }
}

pub(crate) fn segments(path: &str) -> Vec<String> {
    normalize_path(path)
        .split('\\')
        .filter(|part| !part.is_empty())
        .map(|part| part.to_ascii_lowercase())
        .collect()
}

fn os_windows(segs: &[String]) -> bool {
    segs.len() >= 2 && is_drive_letter(&segs[0]) && segs[1] == "windows"
}

fn is_drive_letter(seg: &str) -> bool {
    let bytes = seg.as_bytes();
    bytes.len() == 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

/// `segs` includes the drive. The tail is the folder chain under that drive.
fn inside(segs: &[String], tail: &[&str]) -> bool {
    if segs.len() < 1 + tail.len() {
        return false;
    }
    segs[1..].iter().zip(tail).all(|(seg, expected)| seg == expected)
}

fn safe_windows_cache(segs: &[String]) -> bool {
    const SAFE: &[&[&str]] = &[
        &["windows", "temp"],
        &["windows", "softwaredistribution", "download"],
        &["windows", "softwaredistribution", "deliveryoptimization"],
        &[
            "windows",
            "serviceprofiles",
            "networkservice",
            "appdata",
            "local",
            "microsoft",
            "windows",
            "deliveryoptimization",
        ],
    ];
    SAFE.iter().any(|tail| inside(segs, tail))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reclaim_allows_named_windows_caches_and_refuses_system32() {
        assert!(is_refused("C:\\Windows\\System32\\notepad.exe", GuardMode::Reclaim));
        assert!(is_refused("C:\\Program Files\\App\\node_modules", GuardMode::Reclaim));
        assert!(is_refused("C:\\Program Files (x86)\\Steam", GuardMode::Reclaim));
        assert!(is_refused("C:\\", GuardMode::Reclaim));
        assert!(!is_refused("C:\\Windows\\Temp\\a.tmp", GuardMode::Reclaim));
        assert!(!is_refused(
            "C:\\Windows\\SoftwareDistribution\\Download\\pkg",
            GuardMode::Reclaim
        ));
        assert!(!is_refused("C:\\Users\\me\\AppData\\Local\\Temp\\a", GuardMode::Reclaim));
        assert!(is_refused("C:\\Windows\\Temp\\a.tmp", GuardMode::Duplicates));
        assert!(is_refused("C:\\Windows\\System32\\a.dll", GuardMode::Duplicates));
    }
}
