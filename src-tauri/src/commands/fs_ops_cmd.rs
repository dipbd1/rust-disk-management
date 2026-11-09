use std::sync::Arc;

use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::error::AppError;
use crate::models::DeleteResult;
use crate::services::paths::{is_drive_root, is_reparse_point, normalize_path};
use crate::services::watcher::FolderWatcher;
use crate::state::AppState;

#[tauri::command]
pub fn trash_path(
    app_state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<DeleteResult, AppError> {
    let path = deletable_path(&path)?;
    let fallback = existing_file_len(&path).map_err(|err| AppError::Trash(err.to_string()))?;
    trash::delete(&path).map_err(|err| AppError::Trash(err.to_string()))?;
    patch_index(&app_state, &path, fallback)
}

#[tauri::command]
pub fn permanent_delete(
    app_state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<DeleteResult, AppError> {
    let path = deletable_path(&path)?;
    let fallback = existing_file_len(&path).map_err(|err| AppError::Delete(err.to_string()))?;
    erase_path(&path)?;
    patch_index(&app_state, &path, fallback)
}

#[tauri::command]
pub fn reveal_in_explorer<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), AppError> {
    let path = normalize_path(&path);
    if path.is_empty() {
        return Err(AppError::Reveal("empty path".into()));
    }
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|err| AppError::Reveal(err.to_string()))
}

#[tauri::command]
pub fn copy_path(path: String) -> Result<(), AppError> {
    let path = normalize_path(&path);
    if path.is_empty() {
        return Err(AppError::Clipboard("empty path".into()));
    }
    let mut clipboard =
        arboard::Clipboard::new().map_err(|err| AppError::Clipboard(err.to_string()))?;
    clipboard
        .set_text(path)
        .map_err(|err| AppError::Clipboard(err.to_string()))
}

#[tauri::command]
pub fn watch_path<R: Runtime>(
    app: AppHandle<R>,
    app_state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<(), AppError> {
    let watcher = FolderWatcher::watch(app, &path)?;
    app_state.set_watcher(watcher);
    Ok(())
}

fn deletable_path(path: &str) -> Result<String, AppError> {
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
