use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::models::RestoreResult;
use crate::services::paths::{normalize_path, parent_path};

/// Parse a Windows Recycle Bin `$I*` info file. Returns (original size, original path).
pub fn parse_info_file(bytes: &[u8]) -> Option<(u64, String)> {
    if bytes.len() < 28 {
        return None;
    }
    let version = u64::from_le_bytes(bytes[0..8].try_into().ok()?);
    let size = u64::from_le_bytes(bytes[8..16].try_into().ok()?);
    if version >= 2 {
        let char_count = u32::from_le_bytes(bytes[24..28].try_into().ok()?) as usize;
        if char_count == 0 || char_count > 32_768 {
            return None;
        }
        let end = 28usize.checked_add(char_count.checked_mul(2)?)?;
        let path = decode_utf16le(bytes.get(28..end)?)?;
        return Some((size, normalize_path(&path)));
    }
    let path = decode_utf16le_z(&bytes[24..])?;
    Some((size, normalize_path(&path)))
}

/// Best-effort restore from the Recycle Bin by matching the original path in `$I*` files.
pub fn restore_path(original: &str) -> Result<RestoreResult, AppError> {
    let original = normalize_path(original);
    if original.is_empty() {
        return Err(AppError::Restore("empty path".into()));
    }
    let Some((info_path, content_path)) = find_recycled(&original) else {
        return Ok(RestoreResult {
            restored: false,
            path: original,
            message:
                "Could not find this item in the Recycle Bin. Open the bin to restore it there."
                    .into(),
        });
    };
    if let Some(parent) = parent_path(&original) {
        std::fs::create_dir_all(&parent).map_err(|err| AppError::Restore(err.to_string()))?;
    }
    if Path::new(&original).exists() {
        return Err(AppError::Restore(format!(
            "something already exists at {original}"
        )));
    }
    std::fs::rename(&content_path, &original).map_err(|err| AppError::Restore(err.to_string()))?;
    let _ = std::fs::remove_file(&info_path);
    Ok(RestoreResult {
        restored: true,
        path: original,
        message: "Restored from the Recycle Bin.".into(),
    })
}

/// Opens the Windows Recycle Bin folder.
pub fn open_recycle_bin() -> Result<(), AppError> {
    let verb = wide("open");
    let target = wide("shell:RecycleBinFolder");
    let result = unsafe {
        windows_sys::Win32::UI::Shell::ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    if (result as usize) <= 32 {
        return Err(AppError::Reveal(format!(
            "open recycle bin failed ({result:?})"
        )));
    }
    Ok(())
}

fn find_recycled(original: &str) -> Option<(PathBuf, PathBuf)> {
    let drive = drive_root(original)?;
    let bin = PathBuf::from(format!("{drive}$Recycle.Bin"));
    let entries = std::fs::read_dir(&bin).ok()?;
    for sid in entries.flatten() {
        let sid_path = sid.path();
        if !sid_path.is_dir() {
            continue;
        }
        let Ok(files) = std::fs::read_dir(&sid_path) else {
            continue;
        };
        for file in files.flatten() {
            let info_path = file.path();
            let name = file.file_name();
            let name = name.to_string_lossy();
            if !name.starts_with("$I") && !name.starts_with("$i") {
                continue;
            }
            let Ok(bytes) = std::fs::read(&info_path) else {
                continue;
            };
            let Some((_, path)) = parse_info_file(&bytes) else {
                continue;
            };
            if !paths_equal(&path, original) {
                continue;
            }
            let mut content_name = name.into_owned();
            if content_name.starts_with("$I") {
                content_name.replace_range(0..2, "$R");
            } else if content_name.starts_with("$i") {
                content_name.replace_range(0..2, "$r");
            }
            let content_path = sid_path.join(content_name);
            if content_path.exists() {
                return Some((info_path, content_path));
            }
        }
    }
    None
}

fn drive_root(path: &str) -> Option<String> {
    let path = normalize_path(path);
    let bytes = path.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' {
        let letter = (bytes[0] as char).to_ascii_uppercase();
        return Some(format!("{letter}:\\"));
    }
    None
}

fn paths_equal(a: &str, b: &str) -> bool {
    normalize_path(a).eq_ignore_ascii_case(&normalize_path(b))
}

fn decode_utf16le(bytes: &[u8]) -> Option<String> {
    if bytes.len() % 2 != 0 {
        return None;
    }
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .filter(|unit| *unit != 0)
        .collect();
    String::from_utf16(&units).ok()
}

fn decode_utf16le_z(bytes: &[u8]) -> Option<String> {
    if bytes.len() % 2 != 0 {
        return None;
    }
    let mut units = Vec::new();
    for chunk in bytes.chunks_exact(2) {
        let unit = u16::from_le_bytes([chunk[0], chunk[1]]);
        if unit == 0 {
            break;
        }
        units.push(unit);
    }
    if units.is_empty() {
        return None;
    }
    String::from_utf16(&units).ok()
}

fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utf16_bytes(text: &str) -> Vec<u8> {
        text.encode_utf16()
            .flat_map(|unit| unit.to_le_bytes())
            .collect()
    }

    #[test]
    fn parses_windows10_info_file() {
        let path = "C:\\Users\\me\\Downloads\\photo.jpg";
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&2u64.to_le_bytes());
        bytes.extend_from_slice(&1234u64.to_le_bytes());
        bytes.extend_from_slice(&0u64.to_le_bytes());
        let encoded = utf16_bytes(path);
        let chars = (encoded.len() / 2) as u32;
        bytes.extend_from_slice(&chars.to_le_bytes());
        bytes.extend_from_slice(&encoded);
        let (size, parsed) = parse_info_file(&bytes).expect("parse");
        assert_eq!(size, 1234);
        assert_eq!(parsed, "C:\\Users\\me\\Downloads\\photo.jpg");
    }

    #[test]
    fn parses_legacy_info_file() {
        let path = "C:\\Users\\me\\old.txt";
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&1u64.to_le_bytes());
        bytes.extend_from_slice(&9u64.to_le_bytes());
        bytes.extend_from_slice(&0u64.to_le_bytes());
        bytes.extend_from_slice(&utf16_bytes(path));
        bytes.extend_from_slice(&0u16.to_le_bytes());
        let (size, parsed) = parse_info_file(&bytes).expect("parse");
        assert_eq!(size, 9);
        assert_eq!(parsed, "C:\\Users\\me\\old.txt");
    }

    #[test]
    fn rejects_short_buffer() {
        assert!(parse_info_file(&[0; 10]).is_none());
    }

    #[test]
    fn drive_root_from_path() {
        assert_eq!(drive_root("c:/Users/me/a.txt").as_deref(), Some("C:\\"));
        assert_eq!(drive_root("\\\\server\\share\\a").as_deref(), None);
    }
}
