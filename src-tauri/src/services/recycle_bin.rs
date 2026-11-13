use crate::error::AppError;
use crate::models::{BinEmptyResult, RecycleBinStatus};

const SHERB_NOCONFIRMATION: u32 = 0x0000_0001;
const SHERB_NOPROGRESSUI: u32 = 0x0000_0002;
const SHERB_NOSOUND: u32 = 0x0000_0004;

/// Size comes from the shell, because the scanner does not descend `$Recycle.Bin`.
pub fn query() -> RecycleBinStatus {
    match query_info() {
        Ok(status) => status,
        Err(_) => RecycleBinStatus {
            size_bytes: 0,
            item_count: 0,
            available: false,
        },
    }
}

pub fn empty() -> Result<BinEmptyResult, AppError> {
    let before = query_info().map_err(|err| AppError::Reclaim(err))?;
    let hr = unsafe {
        windows_sys::Win32::UI::Shell::SHEmptyRecycleBinW(
            std::ptr::null_mut(),
            std::ptr::null(),
            SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND,
        )
    };
    if hr < 0 {
        return Err(AppError::Reclaim(format!("empty recycle bin failed ({hr})")));
    }
    Ok(BinEmptyResult {
        freed_bytes: before.size_bytes,
    })
}

fn query_info() -> Result<RecycleBinStatus, String> {
    let mut info = windows_sys::Win32::UI::Shell::SHQUERYRBINFO {
        cbSize: std::mem::size_of::<windows_sys::Win32::UI::Shell::SHQUERYRBINFO>() as u32,
        i64Size: 0,
        i64NumItems: 0,
    };
    let hr = unsafe { windows_sys::Win32::UI::Shell::SHQueryRecycleBinW(std::ptr::null(), &mut info) };
    if hr < 0 {
        return Err(format!("recycle bin query failed ({hr})"));
    }
    Ok(RecycleBinStatus {
        size_bytes: u64::try_from(info.i64Size).unwrap_or(0),
        item_count: u64::try_from(info.i64NumItems).unwrap_or(0),
        available: true,
    })
}
