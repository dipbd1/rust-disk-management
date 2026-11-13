use std::sync::Arc;

use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::error::AppError;
use crate::models::DeleteResult;
use crate::services::deletion;
use crate::services::paths::normalize_path;
use crate::services::watcher::FolderWatcher;
use crate::state::AppState;

#[tauri::command]
pub fn trash_path(app_state: State<'_, Arc<AppState>>, path: String) -> Result<DeleteResult, AppError> {
    deletion::trash_indexed(&app_state, &path)
}

#[tauri::command]
pub fn permanent_delete(app_state: State<'_, Arc<AppState>>, path: String) -> Result<DeleteResult, AppError> {
    deletion::permanent_delete(&app_state, &path)
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
    let mut clipboard = arboard::Clipboard::new().map_err(|err| AppError::Clipboard(err.to_string()))?;
    clipboard.set_text(path).map_err(|err| AppError::Clipboard(err.to_string()))
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
