use tauri::AppHandle;

use crate::error::AppError;
use crate::models::ElevationStatus;
use crate::services::elevation;

#[tauri::command]
pub fn elevation_status() -> Result<ElevationStatus, AppError> {
    elevation::status()
}

/// `true` when Windows accepted the elevated launch and this process is exiting.
#[tauri::command]
pub fn relaunch_elevated(app: AppHandle) -> Result<bool, AppError> {
    let started = elevation::relaunch()?;
    if started {
        app.exit(0);
    }
    Ok(started)
}
