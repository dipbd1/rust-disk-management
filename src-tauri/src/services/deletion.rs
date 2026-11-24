use crate::error::AppError;
use crate::models::{DeleteResult, RecycleBatch};
use crate::services::guard::{self, GuardMode};
use crate::services::paths::{is_drive_root, is_reparse_point, normalize_path};
use crate::state::AppState;

pub fn trash_indexed(state: &AppState, path: &str) -> Result<DeleteResult, AppError> {
    trash_indexed_with(state, path, GuardMode::Delete)
}

pub fn trash_many(
    state: &AppState,
    paths: &[String],
    mode: GuardMode,
) -> Result<RecycleBatch, AppError> {
    let mut results = Vec::new();
    let mut freed_bytes = 0u64;
    for path in paths {
        let result = trash_indexed_with(state, path, mode)?;
        freed_bytes = freed_bytes.saturating_add(result.freed_bytes);
        results.push(result);
    }
    Ok(RecycleBatch {
        freed_bytes,
        results,
    })
}

pub fn permanent_delete(state: &AppState, path: &str) -> Result<DeleteResult, AppError> {
    let path = deletable_path(path, GuardMode::Delete)?;
    let fallback = existing_file_len(&path).map_err(|err| AppError::Delete(err.to_string()))?;
    erase_path(&path)?;
    patch_index(state, &path, fallback)
}

fn trash_indexed_with(
    state: &AppState,
    path: &str,
    mode: GuardMode,
) -> Result<DeleteResult, AppError> {
    let path = deletable_path(path, mode)?;
    let fallback = existing_file_len(&path).map_err(|err| AppError::Trash(err.to_string()))?;
    trash::delete(&path).map_err(|err| AppError::Trash(err.to_string()))?;
    patch_index(state, &path, fallback)
}

/// Backend path policy for any delete, independent of UI confirms.
pub fn deletable_path(path: &str, mode: GuardMode) -> Result<String, AppError> {
    let path = normalize_path(path);
    if path.is_empty() {
        return Err(AppError::Delete("empty path".into()));
    }
    if is_drive_root(&path) {
        return Err(AppError::DriveRoot(path));
    }
    if guard::is_refused(&path, mode) {
        return Err(AppError::Protected(path));
    }
    Ok(path)
}

fn existing_file_len(path: &str) -> Result<u64, std::io::Error> {
    let meta = std::fs::symlink_metadata(path)?;
    if meta.file_type().is_file() {
        Ok(meta.len())
    } else {
        Ok(0)
    }
}

/// The only place that erases bytes. Reparse points are unlinked, not followed.
fn erase_path(path: &str) -> Result<(), AppError> {
    let meta = std::fs::symlink_metadata(path).map_err(|err| AppError::Delete(err.to_string()))?;
    let reparse = meta.file_type().is_symlink() || is_reparse_point(&meta);
    let removed = if reparse {
        if meta.is_dir() {
            std::fs::remove_dir(path)
        } else {
            std::fs::remove_file(path)
        }
    } else if meta.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
    removed.map_err(|err| AppError::Delete(err.to_string()))
}

fn patch_index(state: &AppState, path: &str, fallback: u64) -> Result<DeleteResult, AppError> {
    match state.with_index_mut(|index| index.remove_path(path)) {
        Ok(result) => Ok(result),
        Err(AppError::NotFound(_)) => Ok(DeleteResult {
            freed_bytes: fallback,
            removed_path: path.to_string(),
            ancestors: Vec::new(),
        }),
        Err(err) => Err(err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_drive_roots() {
        let err = deletable_path("C:\\", GuardMode::Delete).unwrap_err();
        assert!(matches!(err, AppError::DriveRoot(_)));
        let err = deletable_path("c:/", GuardMode::Delete).unwrap_err();
        assert!(matches!(err, AppError::DriveRoot(_)));
    }

    #[test]
    fn delete_mode_refuses_windows_and_program_files() {
        assert!(matches!(
            deletable_path("C:\\Windows\\System32\\notepad.exe", GuardMode::Delete),
            Err(AppError::Protected(_))
        ));
        assert!(matches!(
            deletable_path("C:\\Windows\\Temp\\a.tmp", GuardMode::Delete),
            Err(AppError::Protected(_))
        ));
        assert!(matches!(
            deletable_path("C:\\Program Files\\App\\file.txt", GuardMode::Delete),
            Err(AppError::Protected(_))
        ));
        assert!(matches!(
            deletable_path("C:\\Program Files (x86)\\App\\file.txt", GuardMode::Delete),
            Err(AppError::Protected(_))
        ));
    }

    #[test]
    fn delete_mode_allows_user_paths() {
        assert_eq!(
            deletable_path("C:\\Users\\me\\Downloads\\big.iso", GuardMode::Delete).unwrap(),
            "C:\\Users\\me\\Downloads\\big.iso"
        );
    }

    #[test]
    fn reclaim_mode_allows_named_windows_caches() {
        assert_eq!(
            deletable_path("C:\\Windows\\Temp\\a.tmp", GuardMode::Reclaim).unwrap(),
            "C:\\Windows\\Temp\\a.tmp"
        );
        assert!(matches!(
            deletable_path("C:\\Windows\\System32\\notepad.exe", GuardMode::Reclaim),
            Err(AppError::Protected(_))
        ));
    }

    #[test]
    fn refuses_empty_path() {
        assert!(matches!(
            deletable_path("", GuardMode::Delete),
            Err(AppError::Delete(_))
        ));
    }
}
