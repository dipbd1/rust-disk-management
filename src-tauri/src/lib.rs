mod commands;
mod error;
mod limits;
mod models;
mod services;
mod state;

use std::sync::Arc;

use state::AppState;

#[cfg(debug_assertions)]
use tauri_remote_ui::{RemoteUiConfig, RemoteUiExt};

/// Fixed port so `vite.config.ts` can proxy the browser at the dev server.
#[cfg(debug_assertions)]
const REMOTE_UI_PORT: u16 = 9090;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_remote_ui::init())
        .manage(Arc::new(AppState::new()))
        .setup(|app| {
            // Release builds do not open the unauthenticated command socket.
            #[cfg(debug_assertions)]
            start_browser_bridge(app.handle().clone());
            #[cfg(not(debug_assertions))]
            drop(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_cmd::list_drives,
            commands::scan_cmd::start_scan,
            commands::scan_cmd::start_scan_remote,
            commands::scan_cmd::cancel_scan,
            commands::scan_cmd::get_children,
            commands::scan_cmd::get_graph_view,
            commands::fs_ops_cmd::trash_path,
            commands::fs_ops_cmd::permanent_delete,
            commands::fs_ops_cmd::reveal_in_explorer,
            commands::fs_ops_cmd::copy_path,
            commands::fs_ops_cmd::watch_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(debug_assertions)]
fn start_browser_bridge(handle: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let config = RemoteUiConfig::default()
            .set_port(Some(REMOTE_UI_PORT))
            .enable_application_ui();
        if let Err(error) = handle.start_remote_ui(config).await {
            eprintln!("remote ui server failed: {error}");
        }
    });
}
