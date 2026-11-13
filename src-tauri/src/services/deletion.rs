use crate::error::AppError;
use crate::models::{DeleteResult, RecycleBatch};
use crate::services::paths::{is_drive_root, is_reparse_point, normalize_path};
use crate::state::AppState;

pub fn trash_indexed(state: &AppState, path: &str) -> Result<DeleteResult, AppError> {
    let path = deletable_path(path)?;
    let fallback = existing_file_len(&path).map_err(|err| AppError::Trash(err.to_string()))?;
    trash::delete(&path).map_err(|err| AppError::Trash(err.to_string()))?;
    patch_index(state, &path, fallback)
}

pub fn trash_many(state: &AppState, paths: &[String]) -> Result<RecycleBatch, AppError> {
    let mut results = Vec::new();
    let mut freed_bytes = 0u64;
    for path in paths {
        let result = trash_indexed(state, path)?;
        freed_bytes = freed_bytes.saturating_add(result.freed_bytes);
        results.push(result);
    }
    Ok(RecycleBatch { freed_bytes, results })
}

pub fn permanent_delete(state: &AppState, path: &str) -> Result<DeleteResult, AppError> {
    let path = deletable_path(path)?;
    let fallback = existing_file_len(&path).map_err(|err| AppError::Delete(err.to_string()))?;
    erase_path(&path)?;
    patch_index(state, &path, fallback)
}

pub fn deletable_path(path: &str) -> Result<String, AppError> {
    let path = normalize_path(path);
    if path.is_empty() {
        return Err(AppError::Delete("empty path".into()));
    }
    if is_drive_root(&path) {
        return Err(AppError::DriveRoot(path));
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
