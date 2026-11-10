use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_remote_ui::EmitterExt;

use crate::error::AppError;
use crate::models::{ChildrenPage, DriveInfo, GraphView, ScanProgress};
use crate::services::paths::normalize_path;
use crate::services::{drives, scanner};
use crate::state::{AppState, RemoteScan};

pub const SCAN_PROGRESS_EVENT: &str = "scan-progress";
pub const SCAN_ERROR_EVENT: &str = "scan-error";

#[tauri::command]
pub fn list_drives() -> Result<Vec<DriveInfo>, AppError> {
    drives::list_drives()
}

#[tauri::command]
pub async fn start_scan(
    app: AppHandle,
    app_state: State<'_, Arc<AppState>>,
    path: String,
    on_progress: Channel<ScanProgress>,
) -> Result<ScanProgress, AppError> {
    run_scan(app, Arc::clone(app_state.inner()), path, Some(on_progress)).await
}

/// Browser entry. Returns as soon as the scan is attached or spawned.
/// Progress and the terminal snapshot arrive on `scan-progress`. The remote-ui
/// socket times out an `invoke` that waits for the whole walk.
#[tauri::command]
pub async fn start_scan_remote(
    app: AppHandle,
    app_state: State<'_, Arc<AppState>>,
    path: String,
    force: bool,
) -> Result<(), AppError> {
    let path = normalize_path(&path);
    let join = if force {
        RemoteScan::Start
    } else {
        app_state.remote_scan(&path)
    };
    match join {
        RemoteScan::Attach | RemoteScan::Replay => {
            schedule_emit(Arc::clone(app_state.inner()), app);
            Ok(())
        }
        RemoteScan::Start => {
            let app_for_scan = app.clone();
            let state = Arc::clone(app_state.inner());
            let scan_path = path.clone();
            tauri::async_runtime::spawn(async move {
                let _ = run_scan(app_for_scan, state, scan_path, None).await;
            });
            Ok(())
        }
    }
}

async fn run_scan(
    app: AppHandle,
    state: Arc<AppState>,
    path: String,
    on_progress: Option<Channel<ScanProgress>>,
) -> Result<ScanProgress, AppError> {
    let path = normalize_path(&path);
    let (generation, cancel) = state.begin_scan(&path);
    let emit_app = app.clone();
    let walk_state = Arc::clone(&state);
    let joined = tauri::async_runtime::spawn_blocking(move || {
        let (index, progress) = scanner::scan_tree(&path, generation, &cancel, |update| {
            publish_progress(&walk_state, &app, generation, &on_progress, update);
        })?;
        // A replaced scan must not tell the browser this walk is the finished one.
        let stored = walk_state.finish_scan(generation, index);
        if stored {
            publish_progress(&walk_state, &app, generation, &on_progress, progress.clone());
        }
        Ok(progress)
    })
    .await;

    let outcome = match joined {
        Ok(result) => result,
        Err(err) => Err(AppError::Scan(format!("scan task stopped: {err}"))),
    };
    if let Err(error) = &outcome {
        state.fail_scan(generation);
        emit_event(&emit_app, SCAN_ERROR_EVENT, error.to_string()).await;
    }
    outcome
}

fn publish_progress(
    state: &Arc<AppState>,
    app: &AppHandle,
    generation: u64,
    channel: &Option<Channel<ScanProgress>>,
    update: ScanProgress,
) {
    if let Some(channel) = channel {
        let _ = channel.send(update.clone());
    }
    if state.note_progress(generation, update) {
        schedule_emit(Arc::clone(state), app.clone());
    }
}

fn schedule_emit(state: Arc<AppState>, app: AppHandle) {
    if state.claim_emit() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut seen = 0u64;
        loop {
            let seq = state.progress_seq();
            if seq == seen {
                state.release_emit();
                if state.progress_seq() == seen || state.claim_emit() {
                    break;
                }
                continue;
            }
            seen = seq;
            if let Some(update) = state.latest_progress() {
                emit_event(&app, SCAN_PROGRESS_EVENT, update).await;
            }
        }
    });
}

async fn emit_event<T: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.emit(event, payload).await;
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
