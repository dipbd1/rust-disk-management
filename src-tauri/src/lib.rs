mod commands;
mod error;
mod limits;
mod models;
mod services;
mod state;

use std::sync::Arc;

use tauri::Manager;

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_remote_ui::init())
        .manage(Arc::new(AppState::new()))
        .setup(open_main_window)
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
            commands::elevation_cmd::elevation_status,
            commands::elevation_cmd::relaunch_elevated,
            commands::insights_cmd::largest_files,
            commands::insights_cmd::search_index,
            commands::insights_cmd::extension_rollup,
            commands::insights_cmd::extension_files,
            commands::insights_cmd::reclaim_report,
            commands::insights_cmd::recycle_reclaim,
            commands::insights_cmd::empty_recycle_bin,
            commands::insights_cmd::growth_delta,
            commands::insights_cmd::pick_scan_folder,
            commands::insights_cmd::start_duplicate_review,
            commands::insights_cmd::start_duplicate_review_remote,
            commands::insights_cmd::cancel_duplicate_review,
            commands::insights_cmd::recycle_duplicate_copies,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn open_main_window(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let elevated = services::elevation::is_elevated();
    let window = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or_else(|| std::io::Error::other("the app config has no window"))?;
    let data_dir = app.path().app_local_data_dir()?.join(if elevated {
        "webview-admin"
    } else {
        "webview-user"
    });
    std::fs::create_dir_all(&data_dir)?;
    let mut builder =
        tauri::WebviewWindowBuilder::from_config(app.handle(), &window)?.data_directory(data_dir);
    if elevated {
        builder = builder.title("Liquid Storage Manager (administrator)");
    }
    builder.build()?;
    // Release builds do not open the unauthenticated command socket.
    #[cfg(debug_assertions)]
    start_browser_bridge(app.handle().clone());
    Ok(())
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
