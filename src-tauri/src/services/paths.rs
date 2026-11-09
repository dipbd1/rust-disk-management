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

pub fn file_name(path: &str) -> String {
    let path = normalize_path(path);
    if is_drive_root(&path) {
        return path[..2].to_string();
    }
    match path.rsplit('\\').next() {
        Some(name) => name.to_string(),
        None => path,
    }
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
    }
}
