use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::Duration;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Manager, Runtime};
use tauri_remote_ui::EmitterExt;

use crate::error::AppError;
use crate::services::paths::{as_path, normalize_path};

const DEBOUNCE: Duration = Duration::from_millis(300);
pub const FS_STALE_EVENT: &str = "fs-stale";

/// Non-recursive watcher. Dropping it stops the debounce thread.
pub struct FolderWatcher {
    _watcher: RecommendedWatcher,
}

impl FolderWatcher {
    pub fn watch<R>(app: AppHandle<R>, path: &str) -> Result<Self, AppError>
    where
        R: Runtime,
    {
        let watched = normalize_path(path);
        if watched.is_empty() {
            return Err(AppError::Watch("empty path".into()));
        }
        let (tx, rx) = mpsc::channel();
        let mut watcher =
            notify::recommended_watcher(move |result: Result<Event, notify::Error>| {
                if result.is_ok() {
                    let _ = tx.send(());
                }
            })
            .map_err(|err| AppError::Watch(err.to_string()))?;
        watcher
            .watch(as_path(&watched), RecursiveMode::NonRecursive)
            .map_err(|err| AppError::Watch(err.to_string()))?;
        std::thread::Builder::new()
            .name("fs-stale".into())
            .spawn(move || debounce_loop(rx, app, watched))
            .map_err(|err| AppError::Watch(err.to_string()))?;
        Ok(Self { _watcher: watcher })
    }
}

fn publish_stale<R: Runtime>(app: &AppHandle<R>, path: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        let _ = window.emit(FS_STALE_EVENT, path).await;
    });
}

fn debounce_loop<R: Runtime>(rx: mpsc::Receiver<()>, app: AppHandle<R>, path: String) {
    let mut dirty = false;
    loop {
        match rx.recv_timeout(DEBOUNCE) {
            Ok(()) => dirty = true,
            Err(RecvTimeoutError::Timeout) if dirty => {
                publish_stale(&app, path.clone());
                dirty = false;
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                if dirty {
                    publish_stale(&app, path);
                }
                break;
            }
        }
    }
}
