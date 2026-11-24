use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::error::AppError;
use crate::models::{DeleteResult, DeletionLogEntry, RestoreResult};
use crate::services::deletion;
use crate::services::deletion_log;
use crate::services::paths::normalize_path;
use crate::services::restore;
use crate::services::watcher::FolderWatcher;
use crate::state::AppState;

#[tauri::command]
pub fn trash_path<R: Runtime>(
    app: AppHandle<R>,
    app_state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<DeleteResult, AppError> {
    let log_dir = data_dir(&app);
    deletion::trash_indexed(&app_state, &path, log_dir.as_deref())
}

#[tauri::command]
pub fn permanent_delete<R: Runtime>(
    app: AppHandle<R>,
    app_state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<DeleteResult, AppError> {
    let log_dir = data_dir(&app);
    deletion::permanent_delete(&app_state, &path, log_dir.as_deref())
}

#[tauri::command]
pub fn recent_deletions<R: Runtime>(app: AppHandle<R>) -> Result<Vec<DeletionLogEntry>, AppError> {
    let Some(dir) = data_dir(&app) else {
        return Ok(Vec::new());
    };
    deletion_log::recent(&dir)
}

#[tauri::command]
pub fn restore_deleted(path: String) -> Result<RestoreResult, AppError> {
    restore::restore_path(&path)
}

#[tauri::command]
pub fn open_recycle_bin() -> Result<(), AppError> {
    restore::open_recycle_bin()
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

fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_data_dir().ok()
}
