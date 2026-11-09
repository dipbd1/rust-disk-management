use std::collections::HashSet;

use sysinfo::Disks;

use crate::error::AppError;
use crate::models::DriveInfo;
use crate::services::paths::normalize_path;

const FIXED_FILESYSTEMS: &[&str] = &["NTFS", "EXFAT", "FAT32", "REFS"];

pub fn list_drives() -> Result<Vec<DriveInfo>, AppError> {
    let disks =
        Disks::new_with_refreshed_list().map_err(|err| AppError::Drives(err.to_string()))?;
    let mut drives = Vec::new();
    let mut seen = HashSet::new();
    for disk in &disks {
        let file_system = disk.file_system().to_string_lossy().trim().to_string();
        let removable = disk.is_removable();
        let known = FIXED_FILESYSTEMS
            .iter()
            .any(|name| file_system.eq_ignore_ascii_case(name));
        if !removable && !known {
            continue;
        }
        let mount = normalize_path(&disk.mount_point().to_string_lossy());
        if mount.is_empty() || !seen.insert(mount.clone()) {
            continue;
        }
        let mut label = disk.name().to_string_lossy().trim().to_string();
        if label.is_empty() {
            label = mount.trim_end_matches('\\').to_string();
        }
        drives.push(DriveInfo {
            mount,
            label,
            file_system,
            total_bytes: disk.total_space(),
            available_bytes: disk.available_space(),
            is_removable: removable,
        });
    }
    drives.sort_by(|a, b| a.mount.cmp(&b.mount));
    Ok(drives)
}
