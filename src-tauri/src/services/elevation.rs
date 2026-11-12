use crate::error::AppError;
use crate::models::ElevationStatus;
use crate::services::drives;

/// `TokenElevation` is the split-token check. `IsUserAnAdmin` is the wrong question.
pub fn status() -> Result<ElevationStatus, AppError> {
    let drives = drives::list_drives()?;
    let ntfs_present = drives.iter().any(|drive| {
        !drive.is_removable && drive.file_system.eq_ignore_ascii_case("NTFS")
    });
    Ok(ElevationStatus {
        elevated: is_elevated(),
        ntfs_present,
    })
}

/// Starts this executable again with the `runas` verb.
/// `false` means the user cancelled UAC or Windows refused the launch.
pub fn relaunch() -> Result<bool, AppError> {
    let exe = std::env::current_exe().map_err(|err| AppError::Elevation(err.to_string()))?;
    let exe = exe.to_string_lossy();
    let params = std::env::args().skip(1).map(|arg| quote_arg(&arg)).collect::<Vec<_>>().join(" ");
    let verb = wide("runas");
    let file = wide(&exe);
    let arguments = wide(&params);
    let code = unsafe {
        windows_sys::Win32::UI::Shell::ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            if params.is_empty() {
                std::ptr::null()
            } else {
                arguments.as_ptr()
            },
            std::ptr::null(),
            windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    Ok((code as isize) > 32)
}

fn is_elevated() -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

    unsafe {
        let mut token = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION { TokenIsElevated: 0 };
        let mut returned = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut TOKEN_ELEVATION as *mut _,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut returned,
        );
        let _ = CloseHandle(token);
        ok != 0 && elevation.TokenIsElevated != 0
    }
}

fn quote_arg(arg: &str) -> String {
    if arg.contains(' ') || arg.contains('"') {
        format!("\"{}\"", arg.replace('"', "\\\""))
    } else {
        arg.to_string()
    }
}

pub(crate) fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}
