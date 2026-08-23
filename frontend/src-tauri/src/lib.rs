use serde::Serialize;
use std::{
    env,
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    net::TcpListener,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, RwLock,
    },
    thread,
    time::Duration,
};
use tauri::{Manager, RunEvent};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use uuid::Uuid;

const MAX_NATIVE_SAVE_BYTES: u64 = 16 * 1024 * 1024 * 1024;
static QUITTING: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntime {
    base_url: String,
    session_token: String,
}

#[derive(Serialize)]
struct NativeSaveReceipt {
    saved: bool,
    filename: Option<String>,
}

#[derive(Default)]
struct DesktopState {
    runtime: RwLock<Option<DesktopRuntime>>,
    child: Mutex<Option<CommandChild>>,
}

fn reserve_loopback_port() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("Could not reserve a loopback port: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("Could not read the loopback port: {error}"))
}

fn valid_job_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn safe_suggested_name(value: &str) -> Option<String> {
    if value.is_empty() || value.len() > 240 || value.contains(['/', '\\', '\0']) {
        return None;
    }
    let path = Path::new(value);
    if path.file_name().and_then(|name| name.to_str()) != Some(value) {
        return None;
    }
    Some(value.to_owned())
}

#[cfg(windows)]
fn commit_partial(partial: &Path, destination: &Path) -> io::Result<()> {
    use std::{iter, os::windows::ffi::OsStrExt};
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source: Vec<u16> = partial
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    let target: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    let moved = unsafe {
        MoveFileExW(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn commit_partial(partial: &Path, destination: &Path) -> io::Result<()> {
    if destination.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "destination already exists",
        ));
    }
    fs::rename(partial, destination)
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn stop_sidecar(app: &tauri::AppHandle) {
    let state = app.state::<DesktopState>();
    if let Ok(mut child) = state.child.lock() {
        if let Some(process) = child.take() {
            let _ = process.kill();
        }
    };
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show = MenuItem::with_id(app, "show", "Открыть Eclipse Media", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::new()
        .icon(
            app.default_window_icon()
                .ok_or("default window icon is missing")?
                .clone(),
        )
        .tooltip("Eclipse Media")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => {
                QUITTING.store(true, Ordering::SeqCst);
                stop_sidecar(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn spawn_media_core(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let port = reserve_loopback_port()?;
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let data_dir = app
        .path()
        .app_local_data_dir()?
        .join("runtime")
        .join("downloads");
    fs::create_dir_all(&data_dir)?;

    let mut command = app
        .shell()
        .sidecar("eclipse-media-core")?
        .env_clear()
        .args(["--port", &port.to_string()])
        .env("ECLIPSE_MEDIA_SESSION_TOKEN", &token)
        .env("ECLIPSE_MEDIA_PARENT_PID", std::process::id().to_string())
        .env("ECLIPSE_MEDIA_DOWNLOAD_DIR", &data_dir);

    for key in [
        "PATH",
        "SystemRoot",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
    ] {
        if let Some(value) = env::var_os(key) {
            command = command.env(key, value);
        }
    }

    let (mut events, child) = command.spawn()?;
    let state = app.state::<DesktopState>();
    *state
        .runtime
        .write()
        .map_err(|_| "desktop runtime lock poisoned")? = Some(DesktopRuntime {
        base_url: format!("http://127.0.0.1:{port}/api"),
        session_token: token,
    });
    *state
        .child
        .lock()
        .map_err(|_| "desktop child lock poisoned")? = Some(child);

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Terminated(payload) => {
                    eprintln!("[media-core] stopped with code {:?}", payload.code);
                    break;
                }
                CommandEvent::Error(error) => eprintln!("[media-core] process error: {error}"),
                _ => {}
            }
        }
    });
    Ok(())
}

fn wait_for_core(runtime: &DesktopRuntime) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|error| format!("Could not initialize local client: {error}"))?;
    for _ in 0..40 {
        let response = client
            .get(format!("{}/health", runtime.base_url))
            .header("X-Eclipse-Media-Session", &runtime.session_token)
            .send();
        if response.is_ok_and(|value| value.status().is_success()) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err("Eclipse Media Core did not become ready".into())
}

#[tauri::command]
async fn desktop_runtime(state: tauri::State<'_, DesktopState>) -> Result<DesktopRuntime, String> {
    let runtime = state
        .runtime
        .read()
        .map_err(|_| "desktop runtime lock poisoned")?
        .clone()
        .ok_or("Eclipse Media Core is not initialized")?;
    let readiness = runtime.clone();
    tauri::async_runtime::spawn_blocking(move || wait_for_core(&readiness))
        .await
        .map_err(|error| format!("Core readiness task failed: {error}"))??;
    Ok(runtime)
}

fn save_file(
    app: tauri::AppHandle,
    runtime: DesktopRuntime,
    job_id: String,
    suggested_name: String,
) -> Result<NativeSaveReceipt, String> {
    if !valid_job_id(&job_id) {
        return Err("Некорректный идентификатор задачи".into());
    }
    let suggested_name = safe_suggested_name(&suggested_name).ok_or("Некорректное имя файла")?;
    let destination = rfd::FileDialog::new()
        .set_title("Сохранить медиафайл")
        .set_file_name(&suggested_name)
        .save_file();
    let Some(destination) = destination else {
        return Ok(NativeSaveReceipt {
            saved: false,
            filename: None,
        });
    };

    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| format!("Не удалось подготовить сохранение: {error}"))?;
    let mut response = client
        .get(format!("{}/file/{job_id}", runtime.base_url))
        .header("X-Eclipse-Media-Session", &runtime.session_token)
        .send()
        .map_err(|error| format!("Не удалось получить готовый файл: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Media Core вернул статус {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_NATIVE_SAVE_BYTES)
    {
        return Err("Файл превышает desktop-лимит 16 ГБ".into());
    }

    let parent = destination
        .parent()
        .ok_or("Не удалось определить папку сохранения")?;
    let partial = parent.join(format!(
        ".eclipse-media-{}.partial",
        Uuid::new_v4().simple()
    ));
    let result = (|| -> Result<u64, String> {
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&partial)
            .map_err(|error| format!("Не удалось создать временный файл: {error}"))?;
        let mut bounded = (&mut response).take(MAX_NATIVE_SAVE_BYTES + 1);
        let copied = io::copy(&mut bounded, &mut output)
            .map_err(|error| format!("Ошибка записи файла: {error}"))?;
        if copied > MAX_NATIVE_SAVE_BYTES {
            return Err("Файл превышает desktop-лимит 16 ГБ".into());
        }
        output
            .flush()
            .map_err(|error| format!("Ошибка записи файла: {error}"))?;
        output
            .sync_all()
            .map_err(|error| format!("Ошибка синхронизации файла: {error}"))?;
        Ok(copied)
    })();

    if let Err(error) = result {
        let _ = fs::remove_file(&partial);
        return Err(error);
    }
    if let Err(error) = commit_partial(&partial, &destination) {
        let _ = fs::remove_file(&partial);
        return Err(format!("Не удалось завершить сохранение: {error}"));
    }

    let filename = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(&suggested_name)
        .to_owned();
    let _ = app
        .notification()
        .builder()
        .title("Eclipse Media")
        .body(format!("Файл «{filename}» сохранён"))
        .show();
    Ok(NativeSaveReceipt {
        saved: true,
        filename: Some(filename),
    })
}

#[tauri::command]
async fn save_completed_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, DesktopState>,
    job_id: String,
    suggested_name: String,
) -> Result<NativeSaveReceipt, String> {
    let runtime = state
        .runtime
        .read()
        .map_err(|_| "desktop runtime lock poisoned")?
        .clone()
        .ok_or("Eclipse Media Core is not initialized")?;
    tauri::async_runtime::spawn_blocking(move || save_file(app, runtime, job_id, suggested_name))
        .await
        .map_err(|error| format!("Native save task failed: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(DesktopState::default())
        .invoke_handler(tauri::generate_handler![
            desktop_runtime,
            save_completed_file
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !QUITTING.load(Ordering::SeqCst) {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .setup(|app| {
            setup_tray(app)?;
            spawn_media_core(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Eclipse Media desktop");

    app.run(|handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            stop_sidecar(handle);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{commit_partial, safe_suggested_name, valid_job_id};
    use std::{env, fs};
    use uuid::Uuid;

    #[test]
    fn validates_desktop_job_ids() {
        assert!(valid_job_id("0123456789abcdef0123456789abcdef"));
        assert!(!valid_job_id("../downloads/file"));
        assert!(!valid_job_id("g123456789abcdef0123456789abcdef"));
    }

    #[test]
    fn rejects_paths_as_suggested_names() {
        assert_eq!(safe_suggested_name("demo.mp4").as_deref(), Some("demo.mp4"));
        assert!(safe_suggested_name("../demo.mp4").is_none());
        assert!(safe_suggested_name("C:\\demo.mp4").is_none());
    }

    #[cfg(windows)]
    #[test]
    fn replaces_existing_destination_without_deleting_it_first() {
        let directory = env::temp_dir().join(format!(
            "eclipse-media-native-save-{}",
            Uuid::new_v4().simple()
        ));
        fs::create_dir(&directory).expect("create isolated test directory");
        let partial = directory.join("download.partial");
        let destination = directory.join("download.mp4");
        fs::write(&partial, b"new media").expect("write partial");
        fs::write(&destination, b"old media").expect("write existing destination");

        commit_partial(&partial, &destination).expect("replace destination atomically");

        assert_eq!(
            fs::read(&destination).expect("read destination"),
            b"new media"
        );
        assert!(!partial.exists());
        fs::remove_dir_all(&directory).expect("remove isolated test directory");
    }
}
