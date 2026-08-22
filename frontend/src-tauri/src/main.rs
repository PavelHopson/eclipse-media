#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(windows)]
struct InstanceGuard(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl InstanceGuard {
    fn acquire() -> Result<Self, bool> {
        use std::{iter, ptr};
        use windows_sys::Win32::{
            Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS},
            System::Threading::CreateMutexW,
        };

        let name: Vec<u16> = "Local\\EclipseForge.EclipseMedia.v1"
            .encode_utf16()
            .chain(iter::once(0))
            .collect();
        let handle = unsafe { CreateMutexW(ptr::null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(false);
        }
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            unsafe { CloseHandle(handle) };
            return Err(true);
        }
        Ok(Self(handle))
    }
}

#[cfg(windows)]
impl Drop for InstanceGuard {
    fn drop(&mut self) {
        unsafe { windows_sys::Win32::Foundation::CloseHandle(self.0) };
    }
}

fn main() {
    #[cfg(windows)]
    let _instance = match InstanceGuard::acquire() {
        Ok(guard) => guard,
        Err(true) => {
            rfd::MessageDialog::new()
                .set_title("Eclipse Media")
                .set_description(
                    "Eclipse Media уже запущен. Откройте приложение через значок в трее.",
                )
                .set_level(rfd::MessageLevel::Info)
                .show();
            return;
        }
        Err(false) => {
            rfd::MessageDialog::new()
                .set_title("Eclipse Media")
                .set_description("Не удалось проверить единственный экземпляр приложения.")
                .set_level(rfd::MessageLevel::Error)
                .show();
            return;
        }
    };

    eclipse_media_desktop_lib::run();
}
