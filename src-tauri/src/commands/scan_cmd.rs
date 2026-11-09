use std::sync::Arc;

use tauri::State;
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::models::{ChildrenPage, DriveInfo, GraphView, ScanProgress};
use crate::services::{drives, scanner};
use crate::state::AppState;

#[tauri::command]
pub fn list_drives() -> Result<Vec<DriveInfo>, AppError> {
    drives::list_drives()
}

#[tauri::command]
pub async fn start_scan(
    app_state: State<'_, Arc<AppState>>,
    path: String,
    on_progress: Channel<ScanProgress>,
) -> Result<ScanProgress, AppError> {
    let state = Arc::clone(app_state.inner());
    let (generation, cancel) = state.begin_scan();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        let (index, progress) = scanner::scan_tree(&path, generation, &cancel, |update| {
            let _ = on_progress.send(update);
        })?;
        // Publish the terminal snapshot only after the index is stored.
        state.finish_scan(generation, index);
        let _ = on_progress.send(progress.clone());
        Ok(progress)
    })
    .await;

    match joined {
        Ok(result) => result,
        Err(err) => Err(AppError::Scan(format!("scan task stopped: {err}"))),
    }
}

#[tauri::command]
pub fn cancel_scan(app_state: State<'_, Arc<AppState>>) -> Result<(), AppError> {
    app_state.cancel_scan();
    Ok(())
}

#[tauri::command]
pub fn get_children(
    app_state: State<'_, Arc<AppState>>,
    path: String,
    offset: u32,
    limit: u32,
    query: Option<String>,
) -> Result<ChildrenPage, AppError> {
    app_state.with_index(|index| index.children_page(&path, offset, limit, query.as_deref()))
}

#[tauri::command]
pub fn get_graph_view(
    app_state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<GraphView, AppError> {
    app_state.with_index(|index| index.graph_view(&path))
}
