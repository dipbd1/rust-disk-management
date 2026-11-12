use std::path::Path;

/// Strip `\\?\`, use backslashes, and keep a trailing slash only for drive roots.
/// A bare `C:` becomes `C:\`.
pub fn normalize_path(input: &str) -> String {
    if input.is_empty() {
        return String::new();
    }
    let slashed = input.replace('/', "\\");
    let stripped = if let Some(rest) = slashed.strip_prefix("\\\\?\\UNC\\") {
        format!("\\\\{rest}")
    } else if let Some(rest) = slashed.strip_prefix("\\\\?\\") {
        rest.to_string()
    } else {
        slashed
    };

    let is_unc = stripped.starts_with("\\\\");
    let mut parts: Vec<String> = stripped
        .split('\\')
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect();
    if parts.is_empty() {
        return String::new();
    }
    if let Some(first) = parts.first_mut() {
        if is_drive_spec(first) {
            first.make_ascii_uppercase();
        }
    }

    if parts.len() == 1 {
        let only = &parts[0];
        if is_drive_spec(only) {
            return format!("{only}\\");
        }
        if is_unc {
            return format!("\\\\{only}");
        }
        return only.clone();
    }

    if is_unc {
        format!("\\\\{}", parts.join("\\"))
    } else if is_drive_spec(&parts[0]) {
        format!("{}\\{}", parts[0], parts[1..].join("\\"))
    } else {
        parts.join("\\")
    }
}

pub fn is_drive_root(path: &str) -> bool {
    let normalized = normalize_path(path);
    let bytes = normalized.as_bytes();
    bytes.len() == 3 && is_drive_spec(&normalized[..2]) && bytes[2] == b'\\'
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn parent_path(path: &str) -> Option<String> {
    let path = normalize_path(path);
    if path.is_empty() || is_drive_root(&path) {
        return None;
    }
    if let Some(rest) = path.strip_prefix("\\\\") {
        let idx = rest.rfind('\\')?;
        let parent = &rest[..idx];
        if !parent.contains('\\') {
            return None;
        }
        return Some(format!("\\\\{parent}"));
    }
    let idx = path.rfind('\\')?;
    let parent = &path[..idx];
    if is_drive_spec(parent) {
        Some(format!("{parent}\\"))
    } else if parent.is_empty() {
        None
    } else {
        Some(parent.to_string())
    }
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn file_name(path: &str) -> String {
    ready_file_name(&normalize_path(path)).to_string()
}

/// File name of a path that `normalize_path` already produced.
pub fn ready_file_name(path: &str) -> &str {
    if is_ready_drive_root(path) {
        return &path[..2];
    }
    match path.rfind('\\') {
        Some(idx) => &path[idx + 1..],
        None => path,
    }
}

/// Parent of a path that `normalize_path` already produced.
/// `C:\Windows` yields `C:\`, which is a subslice of the same string.
pub fn ready_parent(path: &str) -> Option<&str> {
    if is_ready_drive_root(path) {
        return None;
    }
    let idx = path.rfind('\\')?;
    if idx == 2 && path.as_bytes().get(1) == Some(&b':') {
        return Some(&path[..=idx]);
    }
    if idx == 0 {
        return None;
    }
    Some(&path[..idx])
}

/// `C:\` becomes `\\.\C:`, the path `Volume::new` opens. No trailing slash.
pub fn ntfs_device_path(root: &str) -> Option<String> {
    let root = normalize_path(root);
    if !is_drive_root(&root) {
        return None;
    }
    Some(format!("\\\\.\\{}", &root[..2]))
}

fn is_ready_drive_root(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() == 3 && is_drive_spec(&path[..2]) && bytes[2] == b'\\'
}

pub fn is_reparse_point(meta: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return meta.file_attributes() & 0x400 != 0;
    }
    #[cfg(not(windows))]
    {
        let _ = meta;
        false
    }
}

fn is_drive_spec(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

pub fn as_path(path: &str) -> &Path {
    Path::new(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_windows_paths() {
        assert_eq!(normalize_path("C:"), "C:\\");
        assert_eq!(normalize_path("c:"), "C:\\");
        assert_eq!(normalize_path("C:\\"), "C:\\");
        assert_eq!(normalize_path("C:/Users/foo/"), "C:\\Users\\foo");
        assert_eq!(normalize_path("\\\\?\\C:\\Users\\foo"), "C:\\Users\\foo");
        assert_eq!(
            normalize_path("\\\\?\\UNC\\server\\share\\a"),
            "\\\\server\\share\\a"
        );
        assert_eq!(normalize_path("C:\\foo\\\\bar"), "C:\\foo\\bar");
        assert_eq!(parent_path("C:\\foo"), Some("C:\\".to_string()));
        assert_eq!(parent_path("C:\\foo\\bar"), Some("C:\\foo".to_string()));
        assert_eq!(parent_path("C:\\"), None);
        assert_eq!(parent_path("C:"), None);
        assert!(is_drive_root("C:"));
        assert!(is_drive_root("c:/"));
        assert!(!is_drive_root("C:\\Users"));
        assert_eq!(file_name("C:\\"), "C:");
        assert_eq!(file_name("C:\\Users\\clip.mp4"), "clip.mp4");
        assert_eq!(ready_file_name("C:\\"), "C:");
        assert_eq!(ready_file_name("C:\\Users\\clip.mp4"), "clip.mp4");
        assert_eq!(ready_parent("C:\\Windows"), Some("C:\\"));
        assert_eq!(ready_parent("C:\\Windows\\System32"), Some("C:\\Windows"));
        assert_eq!(ready_parent("C:\\"), None);
        assert_eq!(ntfs_device_path("c:/"), Some("\\\\.\\C:".to_string()));
        assert_eq!(ntfs_device_path("C:\\Users"), None);
    }
}
