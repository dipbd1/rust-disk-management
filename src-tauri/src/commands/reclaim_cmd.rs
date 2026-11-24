use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_remote_ui::EmitterExt;

use crate::error::AppError;
use crate::limits::PROGRESS_INTERVAL_MS;
use crate::models::{ReclaimProgress, ReclaimReport, ReclaimScanResult, RecycleBatch};
use crate::services::guard::GuardMode;
use crate::services::{deletion, reclaim, recycle_bin};
use crate::state::AppState;

const RECLAIM_EVENT: &str = "reclaim-report";
const RECLAIM_PROGRESS_EVENT: &str = "reclaim-progress";
const RECLAIM_ERROR_EVENT: &str = "reclaim-error";

#[tauri::command]
pub async fn reclaim_report(
    app: AppHandle,
    app_state: State<'_, Arc<AppState>>,
    on_progress: Channel<ReclaimProgress>,
) -> Result<ReclaimScanResult, AppError> {
    run_reclaim(app, Arc::clone(app_state.inner()), Some(on_progress)).await
}

#[tauri::command]
pub async fn reclaim_report_remote(
    app: AppHandle,
    app_state: State<'_, Arc<AppState>>,
) -> Result<(), AppError> {
    let state = Arc::clone(app_state.inner());
    tauri::async_runtime::spawn(async move {
        if let Err(error) = run_reclaim(app.clone(), state, None).await {
            emit_text(&app, RECLAIM_ERROR_EVENT, error.to_string()).await;
        }
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_reclaim(app_state: State<'_, Arc<AppState>>) -> Result<(), AppError> {
    app_state.cancel_reclaim();
    Ok(())
}

#[tauri::command]
pub async fn recycle_reclaim(
    app_state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<RecycleBatch, AppError> {
    let state = Arc::clone(app_state.inner());
    let worker = Arc::clone(&state);
    let paths = match tauri::async_runtime::spawn_blocking(move || {
        let facts = worker.with_index(|index| Ok(reclaim::snapshot(index)))?;
        reclaim::recycle_paths_from(&facts, &ids)
    })
    .await
    {
        Ok(result) => result?,
        Err(err) => return Err(AppError::Reclaim(format!("reclaim scan stopped: {err}"))),
    };
    deletion::trash_many(&state, &paths, GuardMode::Reclaim)
}

async fn run_reclaim(
    app: AppHandle,
    state: Arc<AppState>,
    on_progress: Option<Channel<ReclaimProgress>>,
) -> Result<ReclaimScanResult, AppError> {
    let (generation, cancel) = state.begin_reclaim();
    let cancel_gate = Arc::clone(&cancel);
    let facts = state.with_index(|index| Ok(reclaim::snapshot(index)))?;
    let emit_state = Arc::clone(&state);
    let emit_app = app.clone();
    let channel = on_progress.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        let total = facts.len() as u64;
        let mut last = Instant::now() - Duration::from_millis(PROGRESS_INTERVAL_MS);
        let outcome = reclaim::walk(&facts, &cancel_gate, |step| {
            let force = step.cancelled || step.index_done;
            if !force && last.elapsed() < Duration::from_millis(PROGRESS_INTERVAL_MS) {
                return;
            }
            last = Instant::now();
            publish(
                &emit_state,
                &emit_app,
                generation,
                &channel,
                reclaim::index_tick(step),
            );
        });
        if outcome.cancelled || cancel_gate.load(Ordering::Relaxed) {
            return None;
        }
        publish(
            &emit_state,
            &emit_app,
            generation,
            &channel,
            reclaim::bin_tick(total, &outcome.group_bytes, 0, false, false),
        );
        let bin = recycle_bin::query();
        if cancel_gate.load(Ordering::Relaxed) || emit_state.reclaim_generation() != generation {
            publish(
                &emit_state,
                &emit_app,
                generation,
                &channel,
                reclaim::bin_tick(total, &outcome.group_bytes, 0, true, true),
            );
            return None;
        }
        let report = ReclaimReport {
            rows: outcome.rows,
            recycle_bin: bin,
        };
        publish(
            &emit_state,
            &emit_app,
            generation,
            &channel,
            reclaim::bin_tick(
                total,
                &outcome.group_bytes,
                report.recycle_bin.size_bytes,
                true,
                false,
            ),
        );
        Some(report)
    })
    .await;
    let report = match joined {
        Ok(report) => report,
        Err(err) => return Err(AppError::Reclaim(format!("reclaim scan stopped: {err}"))),
    };
    let Some(report) = report else {
        // A newer pass replaces the generation before this walk can publish, so the browser
        // listener still needs one terminal tick or `reclaim_report_remote` never settles.
        if state.reclaim_generation() != generation {
            emit_progress(&app, reclaim::cancelled_tick()).await;
        }
        return Ok(ReclaimScanResult {
            cancelled: true,
            report: None,
        });
    };
    if state.reclaim_generation() != generation || cancel.load(Ordering::Relaxed) {
        return Ok(ReclaimScanResult {
            cancelled: true,
            report: None,
        });
    }
    emit_report(&app, &report).await;
    Ok(ReclaimScanResult {
        cancelled: false,
        report: Some(report),
    })
}

fn publish(
    state: &AppState,
    app: &AppHandle,
    generation: u64,
    channel: &Option<Channel<ReclaimProgress>>,
    update: ReclaimProgress,
) {
    if state.reclaim_generation() != generation {
        return;
    }
    if let Some(channel) = channel {
        let _ = channel.send(update.clone());
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        emit_progress(&app, update).await;
    });
}

async fn emit_progress(app: &AppHandle, update: ReclaimProgress) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.emit(RECLAIM_PROGRESS_EVENT, update).await;
}

async fn emit_report(app: &AppHandle, report: &ReclaimReport) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.emit(RECLAIM_EVENT, report).await;
}

async fn emit_text(app: &AppHandle, event: &str, payload: String) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.emit(event, payload).await;
}
