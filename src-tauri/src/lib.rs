use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::process::Command as SystemCommand;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent, State};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const RELEASE_PAGE_URL: &str = "https://github.com/Freeman97376/calendar-app/releases/latest";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    app_version: String,
    base_url: String,
    distribution: String,
    launch_token: String,
    warning: Option<String>,
}

struct BackendState {
    child: Mutex<Option<CommandChild>>,
    runtime: RuntimeInfo,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackendReady {
    port: u16,
    launch_token: String,
}

#[cfg(target_os = "windows")]
fn terminate_sidecar(process: CommandChild) {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let status = SystemCommand::new("taskkill")
        .args(["/PID", &process.pid().to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    if !status.is_ok_and(|value| value.success()) {
        let _ = process.kill();
    }
}

#[cfg(not(target_os = "windows"))]
fn terminate_sidecar(process: CommandChild) {
    let _ = process.kill();
}

#[tauri::command]
fn desktop_runtime(state: State<'_, BackendState>) -> RuntimeInfo {
    state.runtime.clone()
}

#[tauri::command]
fn open_release_page(app: AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(RELEASE_PAGE_URL, None::<&str>)
        .map_err(|error| error.to_string())
}

fn writable(path: &Path) -> bool {
    if fs::create_dir_all(path).is_err() {
        return false;
    }
    let probe = path.join(".calendar-write-test");
    match OpenOptions::new().write(true).create_new(true).open(&probe) {
        Ok(_) => {
            let _ = fs::remove_file(probe);
            true
        }
        Err(_) => false,
    }
}

fn data_directory(app: &tauri::AppHandle) -> Result<(PathBuf, Option<String>, String), String> {
    let fallback = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or(
            app.path()
                .app_local_data_dir()
                .map_err(|error| error.to_string())?,
        )
        .join("CalendarApp");
    let exe_dir = std::env::current_exe()
        .map_err(|error| error.to_string())?
        .parent()
        .ok_or_else(|| "Desktop executable has no parent directory.".to_string())?
        .to_path_buf();
    if exe_dir.join("portable.mode").is_file() {
        let portable = exe_dir.join("data");
        if writable(&portable) {
            return Ok((portable, None, "portable".into()));
        }
        if !writable(&fallback) {
            return Err("Neither the portable data folder nor LOCALAPPDATA is writable.".into());
        }
        return Ok((
            fallback,
            Some("便携目录不可写，数据已回退到 %LOCALAPPDATA%\\CalendarApp。".into()),
            "portable".into(),
        ));
    }
    if !writable(&fallback) {
        return Err("The Calendar App data directory is not writable.".into());
    }
    Ok((fallback, None, "installed".into()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let (data_dir, warning, distribution) = data_directory(app.handle())?;
            let resource_dir = app
                .path()
                .resource_dir()
                .map_err(|error| error.to_string())?;
            let tesseract_dir = resource_dir.join("tesseract");
            let command = app
                .shell()
                .sidecar("calendar-backend")
                .map_err(|error| error.to_string())?
                .args([
                    "--mode",
                    "desktop",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "0",
                    "--sidecar",
                    "--parent-pid",
                    &std::process::id().to_string(),
                    "--data-dir",
                    &data_dir.to_string_lossy(),
                    "--tesseract-dir",
                    &tesseract_dir.to_string_lossy(),
                ]);
            let (mut events, child) = command.spawn().map_err(|error| error.to_string())?;
            let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<BackendReady, String>>(1);
            std::thread::spawn(move || {
                let mut sent = false;
                tauri::async_runtime::block_on(async move {
                    while let Some(event) = events.recv().await {
                        match event {
                            CommandEvent::Stdout(bytes) => {
                                let line = String::from_utf8_lossy(&bytes);
                                if let Some(payload) = line.strip_prefix("CALENDAR_BACKEND_READY=")
                                {
                                    if !sent {
                                        let parsed = serde_json::from_str::<BackendReady>(payload)
                                            .map_err(|error| {
                                                format!("Invalid backend handshake: {error}")
                                            });
                                        let _ = ready_tx.send(parsed);
                                        sent = true;
                                    }
                                }
                            }
                            CommandEvent::Error(error) if !sent => {
                                let _ = ready_tx.send(Err(error));
                                sent = true;
                            }
                            CommandEvent::Terminated(status) if !sent => {
                                let _ = ready_tx.send(Err(format!(
                                    "Desktop backend exited before startup (code {:?}).",
                                    status.code
                                )));
                                sent = true;
                            }
                            _ => {}
                        }
                    }
                });
            });
            let ready = ready_rx
                .recv_timeout(Duration::from_secs(15))
                .map_err(|_| {
                    "Desktop backend did not provide a startup handshake within 15 seconds."
                        .to_string()
                })??;
            app.manage(BackendState {
                child: Mutex::new(Some(child)),
                runtime: RuntimeInfo {
                    app_version: app.package_info().version.to_string(),
                    base_url: format!("http://127.0.0.1:{}", ready.port),
                    distribution,
                    launch_token: ready.launch_token,
                    warning,
                },
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![desktop_runtime, open_release_page]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("failed to build Calendar App");
    app.run(|handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            if let Ok(mut child) = handle.state::<BackendState>().child.lock() {
                if let Some(process) = child.take() {
                    terminate_sidecar(process);
                }
            }
        }
    });
}
