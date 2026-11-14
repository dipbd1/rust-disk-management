use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_remote_ui::EmitterExt;

use crate::error::AppError;
use crate::models::{
    BinEmptyResult, DuplicateProgress, ExtensionRollup, GrowthDelta, InsightPage, LargestSort, ReclaimReport,
    RecycleBatch,
};
use crate::services::{deletion, duplicates, insights, reclaim, recycle_bin};
use crate::state::AppState;

const DUPLICATE_PROGRESS_EVENT: &str = "duplicate-progress";
const DUPLICATE_ERROR_EVENT: &str = "duplicate-error";

#[tauri::command]
pub fn largest_files(
    app_state: State<'_, Arc<AppState>>,
    offset: u32,
    limit: u32,
    sort: LargestSort,
    descending: bool,
) -> Result<InsightPage, AppError> {
    app_state.with_insight(|index, cache| insights::largest_files(index, cache, offset, limit, sort, descending))
}

#[tauri::command]
pub fn search_index(
    app_state: State<'_, Arc<AppState>>,
    query: String,
    offset: u32,
    limit: u32,
) -> Result<InsightPage, AppError> {
    app_state.with_insight(|index, cache| insights::search_index(index, cache, &query, offset, limit))
}

#[tauri::command]
pub fn extension_rollup(app_state: State<'_, Arc<AppState>>) -> Result<ExtensionRollup, AppError> {
    app_state.with_insight(|index, cache| insights::extension_rollup(index, cache))
}

#[tauri::command]
pub fn extension_files(
    app_state: State<'_, Arc<AppState>>,
    extension: String,
    other: bool,
    offset: u32,
    limit: u32,
) -> Result<InsightPage, AppError> {
    app_state.with_insight(|index, cache| insights::extension_files(index, cache, &extension, other, offset, limit))
}

#[tauri::command]
pub fn reclaim_report(app_state: State<'_, Arc<AppState>>) -> Result<ReclaimReport, AppError> {
    let bin = recycle_bin::query();
    app_state.with_index(|index| Ok(reclaim::report(index, bin)))
}

#[tauri::command]
pub fn recycle_reclaim(app_state: State<'_, Arc<AppState>>, ids: Vec<String>) -> Result<RecycleBatch, AppError> {
    let paths = app_state.with_index(|index| reclaim::recycle_paths(index, &ids))?;
    deletion::trash_many(&app_state, &paths)
}

#[tauri::command]
pub fn empty_recycle_bin() -> Result<BinEmptyResult, AppError> {
    recycle_bin::empty()
}

#[tauri::command]
pub fn growth_delta(app_state: State<'_, Arc<AppState>>) -> Result<GrowthDelta, AppError> {
    let root = app_state.with_index(|index| {
        index.root_path().ok_or_else(|| AppError::History("scan has no root".into()))
    })?;
    Ok(app_state.growth().unwrap_or(GrowthDelta {
        root,
        has_baseline: false,
        previous_total: 0,
        total_bytes: 0,
        entries: Vec::new(),
    }))
}

#[tauri::command]
pub async fn pick_scan_folder(app: AppHandle) -> Result<Option<String>, AppError> {
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().set_title("Scan a folder").blocking_pick_folder())
        .await
        .map_err(|err| AppError::Scan(format!("folder dialog stopped: {err}")))?;
    let Some(path) = picked else {
        return Ok(None);
    };
    Ok(Some(crate::services::paths::normalize_path(&path.to_string())))
}

#[tauri::command]
pub async fn start_duplicate_review(
    app: AppHandle,
    app_state: State<'_, Arc<AppState>>,
    on_progress: Channel<DuplicateProgress>,
) -> Result<DuplicateProgress, AppError> {
    run_duplicates(app, Arc::clone(app_state.inner()), Some(on_progress)).await
}

#[tauri::command]
pub async fn start_duplicate_review_remote(
    app: AppHandle,
    app_state: State<'_, Arc<AppState>>,
) -> Result<(), AppError> {
    let state = Arc::clone(app_state.inner());
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_duplicates(app.clone(), state, None).await {
            emit_text(&app, DUPLICATE_ERROR_EVENT, error.to_string()).await;
        }
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_duplicate_review(app_state: State<'_, Arc<AppState>>) -> Result<(), AppError> {
    app_state.cancel_duplicates();
    Ok(())
}

#[tauri::command]
pub fn recycle_duplicate_copies(
    app_state: State<'_, Arc<AppState>>,
    paths: Vec<String>,
) -> Result<RecycleBatch, AppError> {
    let paths = app_state.duplicate_copy_paths(&paths)?;
    deletion::trash_many(&app_state, &paths)
}

async fn run_duplicates(
    app: AppHandle,
    state: Arc<AppState>,
    on_progress: Option<Channel<DuplicateProgress>>,
) -> Result<DuplicateProgress, AppError> {
    let (generation, cancel) = state.begin_duplicates()?;
    let files = match state.with_index(|index| Ok(duplicates::candidate_files(index))) {
        Ok(files) => files,
        Err(error) => {
            state.finish_duplicates(generation, Vec::new());
            return Err(error);
        }
    };
    let emit_state = Arc::clone(&state);
    let emit_app = app.clone();
    let channel = on_progress.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        let mut last = Instant::now() - Duration::from_secs(1);
        duplicates::review_files(files, &cancel, |update| {
            if last.elapsed() < Duration::from_millis(100) {
                return;
            }
            last = Instant::now();
            publish_duplicate(&emit_state, &emit_app, generation, &channel, update.clone());
        })
    })
    .await;
    let progress = match joined {
        Ok(progress) => progress,
        Err(err) => {
            state.finish_duplicates(generation, Vec::new());
            return Err(AppError::Duplicates(format!("duplicate review stopped: {err}")));
        }
    };
    if state.finish_duplicates(generation, progress.groups.clone()) {
        publish_duplicate(&state, &app, generation, &on_progress, progress.clone());
    }
    Ok(progress)
}

fn publish_duplicate(
    state: &AppState,
    app: &AppHandle,
    generation: u64,
    channel: &Option<Channel<DuplicateProgress>>,
    update: DuplicateProgress,
) {
    if state.duplicate_generation() != generation {
        return;
    }
    if let Some(channel) = channel {
        let _ = channel.send(update.clone());
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        emit_duplicate(&app, update).await;
    });
}

async fn emit_duplicate(app: &AppHandle, update: DuplicateProgress) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.emit(DUPLICATE_PROGRESS_EVENT, update).await;
}

async fn emit_text(app: &AppHandle, event: &str, payload: String) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.emit(event, payload).await;
}
