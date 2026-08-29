use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fmt;
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

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct BackendReady {
    port: u16,
    launch_token: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendRecovery {
    code: String,
    message: String,
    database_path: String,
    #[serde(default)]
    backup_path: Option<String>,
    #[serde(default)]
    diagnostic_path: Option<String>,
    #[serde(flatten)]
    details: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, PartialEq)]
enum BackendHandshake {
    Ready(BackendReady),
    Recovery(BackendRecovery),
}

#[derive(Clone, Debug, PartialEq)]
enum BackendHandshakeParseError {
    InvalidReadyJson(String),
    InvalidRecoveryJson(String),
}

impl fmt::Display for BackendHandshakeParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidReadyJson(message) => {
                write!(formatter, "Invalid backend ready handshake JSON: {message}")
            }
            Self::InvalidRecoveryJson(message) => {
                write!(
                    formatter,
                    "Invalid backend recovery handshake JSON: {message}"
                )
            }
        }
    }
}

impl std::error::Error for BackendHandshakeParseError {}

#[derive(Debug)]
enum BackendStartupError {
    Recovery(BackendRecovery),
    Handshake(BackendHandshakeParseError),
    Process(String),
    Exited(Option<i32>),
    Timeout,
}

impl fmt::Display for BackendStartupError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Recovery(recovery) => {
                let payload = serde_json::to_string(recovery).unwrap_or_else(|error| {
                    format!("unable to serialize recovery payload: {error}")
                });
                write!(
                    formatter,
                    "Desktop backend requires recovery: code={}; message={}; databasePath={}; backupPath={}; diagnosticPath={}; payload={payload}",
                    recovery.code,
                    recovery.message,
                    recovery.database_path,
                    recovery.backup_path.as_deref().unwrap_or("<none>"),
                    recovery.diagnostic_path.as_deref().unwrap_or("<none>"),
                )
            }
            Self::Handshake(error) => error.fmt(formatter),
            Self::Process(message) => write!(formatter, "Desktop backend process error: {message}"),
            Self::Exited(code) => {
                write!(
                    formatter,
                    "Desktop backend exited before startup (code {code:?})."
                )
            }
            Self::Timeout => write!(
                formatter,
                "Desktop backend did not provide a startup handshake within 15 seconds."
            ),
        }
    }
}

impl std::error::Error for BackendStartupError {}

impl From<BackendHandshakeParseError> for BackendStartupError {
    fn from(error: BackendHandshakeParseError) -> Self {
        Self::Handshake(error)
    }
}

fn parse_backend_handshake(
    output: &str,
) -> Result<Option<BackendHandshake>, BackendHandshakeParseError> {
    const READY_PREFIX: &str = "CALENDAR_BACKEND_READY=";
    const RECOVERY_PREFIX: &str = "CALENDAR_BACKEND_RECOVERY=";

    let line = output.trim();
    if let Some(payload) = line.strip_prefix(READY_PREFIX) {
        return serde_json::from_str::<BackendReady>(payload.trim())
            .map(BackendHandshake::Ready)
            .map(Some)
            .map_err(|error| BackendHandshakeParseError::InvalidReadyJson(error.to_string()));
    }
    if let Some(payload) = line.strip_prefix(RECOVERY_PREFIX) {
        return serde_json::from_str::<BackendRecovery>(payload.trim())
            .map(BackendHandshake::Recovery)
            .map(Some)
            .map_err(|error| BackendHandshakeParseError::InvalidRecoveryJson(error.to_string()));
    }
    Ok(None)
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
            let (ready_tx, ready_rx) =
                mpsc::sync_channel::<Result<BackendReady, BackendStartupError>>(1);
            std::thread::spawn(move || {
                let mut sent = false;
                tauri::async_runtime::block_on(async move {
                    while let Some(event) = events.recv().await {
                        match event {
                            CommandEvent::Stdout(bytes) if !sent => {
                                let output = String::from_utf8_lossy(&bytes);
                                for line in output.lines() {
                                    match parse_backend_handshake(line) {
                                        Ok(Some(BackendHandshake::Ready(ready))) => {
                                            let _ = ready_tx.send(Ok(ready));
                                            sent = true;
                                            break;
                                        }
                                        Ok(Some(BackendHandshake::Recovery(recovery))) => {
                                            let _ = ready_tx
                                                .send(Err(BackendStartupError::Recovery(recovery)));
                                            sent = true;
                                            break;
                                        }
                                        Ok(None) => {}
                                        Err(error) => {
                                            let _ = ready_tx.send(Err(error.into()));
                                            sent = true;
                                            break;
                                        }
                                    }
                                }
                            }
                            CommandEvent::Error(error) if !sent => {
                                let _ = ready_tx.send(Err(BackendStartupError::Process(error)));
                                sent = true;
                            }
                            CommandEvent::Terminated(status) if !sent => {
                                let _ =
                                    ready_tx.send(Err(BackendStartupError::Exited(status.code)));
                                sent = true;
                            }
                            _ => {}
                        }
                    }
                });
            });
            let ready = ready_rx
                .recv_timeout(Duration::from_secs(15))
                .map_err(|_| BackendStartupError::Timeout)??;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ready_handshake() {
        let parsed = parse_backend_handshake(
            r#"CALENDAR_BACKEND_READY={"port":43123,"launchToken":"launch-token"}"#,
        )
        .expect("ready handshake should parse");

        assert_eq!(
            parsed,
            Some(BackendHandshake::Ready(BackendReady {
                port: 43123,
                launch_token: "launch-token".into(),
            }))
        );
    }

    #[test]
    fn parses_recovery_handshake_and_preserves_payload() {
        let parsed = parse_backend_handshake(
            r#"CALENDAR_BACKEND_RECOVERY={"code":"desktop_migration_failed","message":"Migration failed","databasePath":"C:\\data\\calendar.sqlite3","backupPath":"C:\\backup\\calendar.sqlite3","diagnosticPath":"C:\\logs\\recovery.json","attempt":2}"#,
        )
        .expect("recovery handshake should parse")
        .expect("recovery handshake should be recognized");
        let BackendHandshake::Recovery(recovery) = parsed else {
            panic!("expected recovery handshake");
        };

        assert_eq!(recovery.code, "desktop_migration_failed");
        assert_eq!(recovery.message, "Migration failed");
        assert_eq!(recovery.database_path, r"C:\data\calendar.sqlite3");
        assert_eq!(
            recovery.backup_path.as_deref(),
            Some(r"C:\backup\calendar.sqlite3")
        );
        assert_eq!(
            recovery.diagnostic_path.as_deref(),
            Some(r"C:\logs\recovery.json")
        );
        assert_eq!(recovery.details.get("attempt"), Some(&Value::from(2)));

        let message = BackendStartupError::Recovery(recovery).to_string();
        assert!(message.contains("code=desktop_migration_failed"));
        assert!(message.contains("databasePath=C:\\data\\calendar.sqlite3"));
        assert!(message.contains("backupPath=C:\\backup\\calendar.sqlite3"));
        assert!(message.contains("diagnosticPath=C:\\logs\\recovery.json"));
    }

    #[test]
    fn accepts_surrounding_whitespace_and_newlines() {
        let parsed = parse_backend_handshake(
            r#"
                CALENDAR_BACKEND_READY={"port":43123,"launchToken":"token"}
            "#,
        )
        .expect("whitespace should be ignored");

        assert!(matches!(
            parsed,
            Some(BackendHandshake::Ready(BackendReady { port: 43123, .. }))
        ));
    }

    #[test]
    fn ignores_unknown_output_lines() {
        assert_eq!(
            parse_backend_handshake("INFO backend is starting").expect("unknown line is valid"),
            None
        );
        assert_eq!(
            parse_backend_handshake("\r\n\t ").expect("blank line is valid"),
            None
        );
    }

    #[test]
    fn rejects_malformed_ready_json() {
        let error = parse_backend_handshake("CALENDAR_BACKEND_READY={not-json")
            .expect_err("malformed ready JSON must fail");

        assert!(matches!(
            error,
            BackendHandshakeParseError::InvalidReadyJson(_)
        ));
    }

    #[test]
    fn rejects_malformed_recovery_json() {
        let error = parse_backend_handshake("CALENDAR_BACKEND_RECOVERY={not-json")
            .expect_err("malformed recovery JSON must fail");

        assert!(matches!(
            error,
            BackendHandshakeParseError::InvalidRecoveryJson(_)
        ));
    }
}
