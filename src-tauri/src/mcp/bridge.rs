//! Request/response bridge between the embedded MCP server and the webview.
//!
//! The Rust side is a thin authenticated gateway: every tool or resource call
//! is forwarded to the React app as a `calqo-mcp-request` event and answered
//! by the frontend through the `mcp_bridge_respond` command. All validation,
//! permission prompts, and mutations happen in TypeScript so agent edits share
//! the exact command path (undo, autosave, selection) that user edits use.

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

/// MCP client identity (from the protocol `initialize` handshake), forwarded
/// so the approval dialog and activity log can name the connected agent.
#[derive(Clone, serde::Serialize)]
pub struct ClientInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(serde::Serialize, Clone)]
struct BridgeRequestPayload {
    id: String,
    method: &'static str,
    args: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    client: Option<ClientInfo>,
}

/// Webview answer to one bridge request.
#[derive(serde::Deserialize)]
pub struct BridgeResponse {
    pub ok: bool,
    #[serde(default)]
    pub result: Option<Value>,
    #[serde(default)]
    pub error: Option<Value>,
}

pub enum BridgeCallError {
    /// The event could not reach the webview.
    Emit(String),
    /// The webview did not answer in time (window closed, dialog unanswered…).
    Timeout,
    /// Structured `McpErrorPayload` produced by the frontend executor.
    Tool(Value),
}

pub struct McpBridge {
    app: AppHandle,
    pending: Mutex<HashMap<String, oneshot::Sender<BridgeResponse>>>,
    counter: AtomicU64,
}

impl McpBridge {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            pending: Mutex::new(HashMap::new()),
            counter: AtomicU64::new(0),
        }
    }

    /// Forward one MCP call to the webview and await its answer.
    pub async fn call(
        &self,
        method: &'static str,
        args: Value,
        client: Option<ClientInfo>,
        timeout: Duration,
    ) -> Result<Value, BridgeCallError> {
        let id = format!("mcp_{}", self.counter.fetch_add(1, Ordering::Relaxed));
        let (sender, receiver) = oneshot::channel();
        self.pending
            .lock()
            .expect("mcp bridge lock poisoned")
            .insert(id.clone(), sender);

        let payload = BridgeRequestPayload {
            id: id.clone(),
            method,
            args,
            client,
        };
        if let Err(err) = self.app.emit_to("main", "calqo-mcp-request", payload) {
            self.forget(&id);
            return Err(BridgeCallError::Emit(err.to_string()));
        }

        match tokio::time::timeout(timeout, receiver).await {
            Ok(Ok(response)) if response.ok => Ok(response.result.unwrap_or(Value::Null)),
            Ok(Ok(response)) => Err(BridgeCallError::Tool(
                response.error.unwrap_or_else(|| Value::String("unknown error".into())),
            )),
            // Sender dropped without an answer (should not happen).
            Ok(Err(_)) => {
                self.forget(&id);
                Err(BridgeCallError::Timeout)
            }
            Err(_) => {
                self.forget(&id);
                Err(BridgeCallError::Timeout)
            }
        }
    }

    /// Resolve a pending request from the `mcp_bridge_respond` command.
    pub fn resolve(&self, id: &str, response: BridgeResponse) {
        let sender = self
            .pending
            .lock()
            .expect("mcp bridge lock poisoned")
            .remove(id);
        if let Some(sender) = sender {
            let _ = sender.send(response);
        }
    }

    fn forget(&self, id: &str) {
        self.pending
            .lock()
            .expect("mcp bridge lock poisoned")
            .remove(id);
    }
}
