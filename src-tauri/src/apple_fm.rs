//! Apple Foundation Models through the `fm` command shipped with macOS 27.
//! The module owns process lifecycle and a loopback-only chat proxy; model
//! output remains validated by Calqo's existing TypeScript provider layer.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};
use tokio::sync::{oneshot, Mutex};

const FM_PATH: &str = "/usr/bin/fm";
const COMMAND_TIMEOUT: Duration = Duration::from_secs(8);
const START_TIMEOUT: Duration = Duration::from_secs(30);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);
const LOG_ROTATE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_TOKEN_COUNT_CHARS: usize = 100_000;
const CHAT_PATH_SUFFIX: &str = "/chat/completions";
const CHAT_CANCELLED: &str = "APPLE_FM_CANCELLED";
const CHAT_TIMEOUT: &str = "APPLE_FM_TIMEOUT";
const CHAT_UNREACHABLE: &str = "APPLE_FM_UNREACHABLE";

#[derive(Default)]
struct AppleFmInner {
    child: Option<Child>,
    port: Option<u16>,
    managed: bool,
}

#[derive(Default)]
pub struct AppleFmState {
    inner: Mutex<AppleFmInner>,
    pending: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AppleFmModelState {
    Available,
    NotEligible,
    IntelligenceOff,
    NotReady,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleFmPreflight {
    installed: bool,
    os_ok: bool,
    licensed: bool,
    model: AppleFmModelState,
    detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleFmStatus {
    running: bool,
    port: Option<u16>,
    managed: bool,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleFmChatResponse {
    status: u16,
    body: String,
    retry_after: Option<String>,
}

struct CommandResult {
    success: bool,
    stdout: String,
    stderr: String,
}

fn run_fm(args: Vec<String>, stdin_text: Option<String>) -> Result<CommandResult, String> {
    let mut command = Command::new(FM_PATH);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(if stdin_text.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        });
    let mut child = command
        .spawn()
        .map_err(|error| format!("could not run fm: {error}"))?;
    if let Some(text) = stdin_text {
        child
            .stdin
            .take()
            .ok_or_else(|| "fm stdin was unavailable".to_string())?
            .write_all(text.as_bytes())
            .map_err(|error| error.to_string())?;
    }

    let started = Instant::now();
    loop {
        match child.try_wait().map_err(|error| error.to_string())? {
            Some(status) => {
                let mut stdout = String::new();
                let mut stderr = String::new();
                if let Some(mut pipe) = child.stdout.take() {
                    let _ = pipe.read_to_string(&mut stdout);
                }
                if let Some(mut pipe) = child.stderr.take() {
                    let _ = pipe.read_to_string(&mut stderr);
                }
                return Ok(CommandResult {
                    success: status.success(),
                    stdout,
                    stderr,
                });
            }
            None if started.elapsed() >= COMMAND_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("fm command timed out".into());
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    }
}

async fn run_fm_blocking(
    args: Vec<String>,
    stdin_text: Option<String>,
) -> Result<CommandResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_fm(args, stdin_text))
        .await
        .map_err(|error| error.to_string())?
}

fn first_line(result: &CommandResult) -> Option<String> {
    result
        .stdout
        .lines()
        .chain(result.stderr.lines())
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn parse_model_state(success: bool, detail: &str) -> AppleFmModelState {
    if success {
        return AppleFmModelState::Available;
    }
    let normalized = detail.to_ascii_lowercase();
    if normalized.contains("not eligible") || normalized.contains("unsupported device") {
        AppleFmModelState::NotEligible
    } else if normalized.contains("apple intelligence")
        && (normalized.contains("disabled") || normalized.contains("turned off"))
    {
        AppleFmModelState::IntelligenceOff
    } else if normalized.contains("downloading")
        || normalized.contains("not ready")
        || normalized.contains("preparing")
    {
        AppleFmModelState::NotReady
    } else {
        AppleFmModelState::Unknown
    }
}

#[tauri::command]
pub async fn apple_fm_preflight() -> Result<AppleFmPreflight, String> {
    if !cfg!(target_os = "macos") || !Path::new(FM_PATH).is_file() {
        return Ok(AppleFmPreflight {
            installed: false,
            os_ok: false,
            licensed: false,
            model: AppleFmModelState::Unknown,
            detail: None,
        });
    }
    let license = run_fm_blocking(vec!["license".into(), "--status".into()], None).await?;
    if !license.success {
        return Ok(AppleFmPreflight {
            installed: true,
            os_ok: true,
            licensed: false,
            model: AppleFmModelState::Unknown,
            detail: first_line(&license),
        });
    }
    let available = run_fm_blocking(
        vec!["available".into(), "--model".into(), "system".into()],
        None,
    )
    .await?;
    let detail = first_line(&available);
    Ok(AppleFmPreflight {
        installed: true,
        os_ok: true,
        licensed: true,
        model: parse_model_state(available.success, detail.as_deref().unwrap_or("")),
        detail,
    })
}

fn pick_port(preferred: Option<u16>) -> Result<u16, String> {
    if let Some(port) = preferred {
        if port == 0 {
            return Err("the Apple model port must be non-zero".into());
        }
        return Ok(port);
    }
    let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0))
        .map_err(|error| error.to_string())?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| error.to_string())
}

async fn healthy(port: u16) -> bool {
    let client = match reqwest::Client::builder().timeout(HEALTH_TIMEOUT).build() {
        Ok(client) => client,
        Err(_) => return false,
    };
    #[derive(Deserialize)]
    struct HealthResponse {
        models: Vec<HealthModel>,
    }
    #[derive(Deserialize)]
    struct HealthModel {
        name: String,
        available: bool,
    }

    match client
        .get(format!("http://127.0.0.1:{port}/health"))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            response.json::<HealthResponse>().await.is_ok_and(|health| {
                health
                    .models
                    .iter()
                    .any(|model| model.name == "system" && model.available)
            })
        }
        _ => false,
    }
}

fn prepare_log_file(app: &AppHandle) -> Result<File, String> {
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let current = directory.join("apple-fm.log");
    let previous = directory.join("apple-fm.log.1");
    if current
        .metadata()
        .is_ok_and(|metadata| metadata.len() >= LOG_ROTATE_BYTES)
    {
        let _ = fs::remove_file(&previous);
        fs::rename(&current, previous).map_err(|error| error.to_string())?;
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(current)
        .map_err(|error| error.to_string())
}

fn spawn_server(app: &AppHandle, port: u16) -> Result<Child, String> {
    let log = prepare_log_file(app)?;
    let stderr = log.try_clone().map_err(|error| error.to_string())?;
    Command::new(FM_PATH)
        .args(["serve", "--port", &port.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|error| format!("could not start fm serve: {error}"))
}

#[tauri::command]
pub async fn apple_fm_start(
    app: AppHandle,
    state: State<'_, AppleFmState>,
    port: Option<u16>,
) -> Result<u16, String> {
    let preflight = apple_fm_preflight().await?;
    if !preflight.installed || !preflight.os_ok {
        return Err("notInstalled".into());
    }
    if !preflight.licensed {
        return Err("notLicensed".into());
    }
    if preflight.model != AppleFmModelState::Available {
        return Err(match preflight.model {
            AppleFmModelState::NotEligible => "notEligible",
            AppleFmModelState::IntelligenceOff => "intelligenceOff",
            AppleFmModelState::NotReady => "notReady",
            _ => "unavailable",
        }
        .into());
    }

    let port = pick_port(port)?;
    let mut inner = state.inner.lock().await;
    if inner.port == Some(port) && healthy(port).await {
        return Ok(port);
    }
    if healthy(port).await {
        inner.child = None;
        inner.port = Some(port);
        inner.managed = false;
        return Ok(port);
    }
    if let Some(mut child) = inner.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    let mut child = spawn_server(&app, port)?;
    let started = Instant::now();
    while started.elapsed() < START_TIMEOUT {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            return Err(format!("fm serve exited before it became ready ({status})"));
        }
        if healthy(port).await {
            inner.child = Some(child);
            inner.port = Some(port);
            inner.managed = true;
            return Ok(port);
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    let _ = child.kill();
    let _ = child.wait();
    Err("fm serve did not become ready within 30 seconds; see apple-fm.log".into())
}

#[tauri::command]
pub async fn apple_fm_stop(state: State<'_, AppleFmState>) -> Result<(), String> {
    let mut inner = state.inner.lock().await;
    if inner.managed {
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    *inner = AppleFmInner::default();
    Ok(())
}

#[tauri::command]
pub async fn apple_fm_status(state: State<'_, AppleFmState>) -> Result<AppleFmStatus, String> {
    let mut inner = state.inner.lock().await;
    if let Some(child) = inner.child.as_mut() {
        if child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_some()
        {
            *inner = AppleFmInner::default();
        }
    }
    let running = match inner.port {
        Some(port) => healthy(port).await,
        None => false,
    };
    Ok(AppleFmStatus {
        running,
        port: inner.port,
        managed: inner.managed,
        error: (!running && inner.port.is_some()).then(|| "fm serve is not answering".into()),
    })
}

fn chat_endpoint(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "invalid Apple model URL".to_string())?;
    if parsed.scheme() != "http"
        || !matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "::1"))
        || !parsed.path().ends_with(CHAT_PATH_SUFFIX)
    {
        return Err("Apple model proxy only allows loopback chat completions".into());
    }
    Ok(parsed)
}

#[tauri::command]
pub async fn apple_fm_chat(
    state: State<'_, AppleFmState>,
    request_id: String,
    url: String,
    payload: serde_json::Value,
    timeout_ms: Option<u64>,
) -> Result<AppleFmChatResponse, String> {
    let endpoint = chat_endpoint(&url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(
            timeout_ms.unwrap_or(120_000).clamp(1_000, 600_000),
        ))
        .build()
        .map_err(|error| error.to_string())?;
    let body = serde_json::to_vec(&payload).map_err(|error| error.to_string())?;
    let request = client
        .post(endpoint)
        .header("content-type", "application/json")
        .body(body);
    let (cancel_tx, mut cancel_rx) = oneshot::channel();
    state
        .pending
        .lock()
        .await
        .insert(request_id.clone(), cancel_tx);

    let result = async {
        let response = tokio::select! {
            _ = &mut cancel_rx => return Err(CHAT_CANCELLED.to_string()),
            sent = request.send() => sent.map_err(|error| {
                if error.is_timeout() { CHAT_TIMEOUT.to_string() }
                else if error.is_connect() || error.is_request() { CHAT_UNREACHABLE.to_string() }
                else { error.to_string() }
            })?,
        };
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get("retry-after")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let body = tokio::select! {
            _ = &mut cancel_rx => return Err(CHAT_CANCELLED.to_string()),
            text = response.text() => text.map_err(|error| {
                if error.is_timeout() { CHAT_TIMEOUT.to_string() } else { error.to_string() }
            })?,
        };
        Ok(AppleFmChatResponse {
            status,
            body,
            retry_after,
        })
    }
    .await;
    state.pending.lock().await.remove(&request_id);
    result
}

#[tauri::command]
pub async fn apple_fm_cancel_chat(
    state: State<'_, AppleFmState>,
    request_id: String,
) -> Result<(), String> {
    if let Some(sender) = state.pending.lock().await.remove(&request_id) {
        let _ = sender.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn apple_fm_count_tokens(text: String) -> Result<u32, String> {
    if text.chars().count() > MAX_TOKEN_COUNT_CHARS {
        return Err(format!(
            "token counting is limited to {MAX_TOKEN_COUNT_CHARS} characters"
        ));
    }
    let result = run_fm_blocking(vec!["count-tokens".into(), "-q".into()], Some(text)).await?;
    if !result.success {
        return Err(first_line(&result).unwrap_or_else(|| "fm token count failed".into()));
    }
    result
        .stdout
        .split_whitespace()
        .find_map(|part| part.parse::<u32>().ok())
        .ok_or_else(|| "fm returned no token count".into())
}

pub fn shutdown(app: &AppHandle) {
    let state = app.state::<AppleFmState>();
    tauri::async_runtime::block_on(async {
        let mut inner = state.inner.lock().await;
        if inner.managed {
            if let Some(mut child) = inner.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        *inner = AppleFmInner::default();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proxy_only_accepts_loopback_chat_completions() {
        assert!(chat_endpoint("http://127.0.0.1:1976/v1/chat/completions").is_ok());
        assert!(chat_endpoint("http://localhost:1976/v1/chat/completions").is_ok());
        assert!(chat_endpoint("https://example.com/v1/chat/completions").is_err());
        assert!(chat_endpoint("http://127.0.0.1:1976/v1/models").is_err());
    }

    #[test]
    fn maps_preflight_states() {
        assert_eq!(
            parse_model_state(true, "available"),
            AppleFmModelState::Available
        );
        assert_eq!(
            parse_model_state(false, "device not eligible"),
            AppleFmModelState::NotEligible
        );
        assert_eq!(
            parse_model_state(false, "Apple Intelligence is disabled"),
            AppleFmModelState::IntelligenceOff
        );
        assert_eq!(
            parse_model_state(false, "model downloading"),
            AppleFmModelState::NotReady
        );
    }
}
