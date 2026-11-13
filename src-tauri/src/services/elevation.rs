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

/// Starts an elevated process. `false` means the user cancelled UAC or Windows refused the launch.
/// Debug builds start `npm run tauri dev` so Cargo stays the parent. Release builds start this exe.
pub fn relaunch() -> Result<bool, AppError> {
    #[cfg(debug_assertions)]
    {
        relaunch_dev_session()
    }
    #[cfg(not(debug_assertions))]
    {
        relaunch_exe()
    }
}

#[cfg(debug_assertions)]
fn relaunch_dev_session() -> Result<bool, AppError> {
    let root = project_root()?;
    let script = root.join("scripts").join("dev-admin.ps1");
    if !script.exists() {
        return Err(AppError::Elevation(format!("missing {}", script.display())));
    }
    let node = npm_tool("npm_node_execpath")?;
    let npm = npm_tool("npm_execpath")?;
    let params = format!(
        "-NoProfile -ExecutionPolicy Bypass -File {} -Node {} -Npm {} -Project {} -Takeover",
        quote_arg(&script.to_string_lossy()),
        quote_arg(&node),
        quote_arg(&npm),
        quote_arg(&root.to_string_lossy()),
    );
    shell_execute("runas", "powershell.exe", &params)
}

#[cfg(not(debug_assertions))]
fn relaunch_exe() -> Result<bool, AppError> {
    let exe = std::env::current_exe().map_err(|err| AppError::Elevation(err.to_string()))?;
    let params = std::env::args().skip(1).map(|arg| quote_arg(&arg)).collect::<Vec<_>>().join(" ");
    shell_execute("runas", &exe.to_string_lossy(), &params)
}

fn shell_execute(verb: &str, file: &str, params: &str) -> Result<bool, AppError> {
    let verb = wide(verb);
    let file = wide(file);
    let arguments = wide(params);
    let code = unsafe {
        windows_sys::Win32::UI::Shell::ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            if params.is_empty() { std::ptr::null() } else { arguments.as_ptr() },
            std::ptr::null(),
            windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    Ok((code as isize) > 32)
}

#[cfg(debug_assertions)]
fn project_root() -> Result<std::path::PathBuf, AppError> {
    let exe = std::env::current_exe().map_err(|err| AppError::Elevation(err.to_string()))?;
    exe.parent()
        .and_then(|path| path.parent())
        .and_then(|path| path.parent())
        .and_then(|path| path.parent())
        .map(|path| path.to_path_buf())
        .ok_or_else(|| AppError::Elevation("could not find the project root from the debug exe".into()))
}

#[cfg(debug_assertions)]
fn npm_tool(name: &str) -> Result<String, AppError> {
    std::env::var(name).map_err(|_| {
        AppError::Elevation(format!("{name} is missing; start the dev session with npm run tauri dev"))
    })
}

pub(crate) fn is_elevated() -> bool {
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
