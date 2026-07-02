//! Agent drawing: an embedded MCP server on loopback plus the Tauri commands
//! the webview uses to control it and to answer forwarded requests.

pub mod bridge;
pub mod server;
pub mod tools;

use std::sync::Arc;

use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use bridge::{BridgeResponse, McpBridge};
use server::ServerHandle;

pub struct McpShared {
    bridge: Arc<McpBridge>,
    server: Mutex<Option<ServerHandle>>,
}

/// Register the shared MCP state; called once from the Tauri setup hook.
pub fn init(app: &AppHandle) {
    app.manage(McpShared {
        bridge: Arc::new(McpBridge::new(app.clone())),
        server: Mutex::new(None),
    });
}

/// Start (or restart with fresh settings) the embedded MCP server. Returns
/// the actual bound port, which may differ from the preferred one.
#[tauri::command]
pub async fn mcp_start_server(
    app: AppHandle,
    state: State<'_, McpShared>,
    token: String,
    preferred_port: u16,
) -> Result<u16, String> {
    if token.trim().len() < 16 {
        return Err("refusing to start with a weak pairing token".into());
    }
    let mut guard = state.server.lock().await;
    if let Some(existing) = guard.take() {
        existing.shutdown();
    }
    let handle = server::start_server(app, state.bridge.clone(), token, preferred_port).await?;
    let port = handle.port;
    *guard = Some(handle);
    Ok(port)
}

#[tauri::command]
pub async fn mcp_stop_server(state: State<'_, McpShared>) -> Result<(), String> {
    let mut guard = state.server.lock().await;
    if let Some(existing) = guard.take() {
        existing.shutdown();
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct McpServerStatus {
    running: bool,
    port: Option<u16>,
}

#[tauri::command]
pub async fn mcp_server_status(state: State<'_, McpShared>) -> Result<McpServerStatus, String> {
    let guard = state.server.lock().await;
    Ok(McpServerStatus {
        running: guard.is_some(),
        port: guard.as_ref().map(|handle| handle.port),
    })
}

/// Webview answer to a forwarded `calqo-mcp-request` event.
#[tauri::command]
pub fn mcp_bridge_respond(
    state: State<'_, McpShared>,
    id: String,
    response: BridgeResponse,
) -> Result<(), String> {
    state.bridge.resolve(&id, response);
    Ok(())
}
