mod commands;
mod error;
mod limits;
mod models;
mod services;
mod state;

use std::sync::Arc;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(AppState::new()))
        .invoke_handler(tauri::generate_handler![
            commands::scan_cmd::list_drives,
            commands::scan_cmd::start_scan,
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
