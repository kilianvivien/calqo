//! Lifecycle of the embedded loopback MCP server.
//!
//! Binds `127.0.0.1` only (default port 22576, scanning up on conflict) and
//! requires the pairing token as a Bearer header on every request. The rmcp
//! transport layer additionally enforces loopback `Host` values, which blocks
//! DNS-rebinding attempts at the protocol door.

use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::Next;
use axum::response::Response;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::tower::{
    StreamableHttpServerConfig, StreamableHttpService,
};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use super::bridge::McpBridge;
use super::tools::CalqoMcpServer;

/// How many ports above the preferred one to try before giving up.
const PORT_SCAN_RANGE: u16 = 10;
/// Image generation and troubleshooting can legitimately leave a client idle
/// for more than rmcp's five-minute default. Keep local sessions for the app's
/// working day while still eventually collecting abandoned clients.
const SESSION_KEEP_ALIVE: Duration = Duration::from_secs(24 * 60 * 60);

pub struct ServerHandle {
    pub port: u16,
    cancel: CancellationToken,
}

impl ServerHandle {
    pub fn shutdown(&self) {
        self.cancel.cancel();
    }
}

async fn require_bearer(
    State(expected): State<Arc<String>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let authorized = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|token| token == expected.as_str());
    if authorized {
        Ok(next.run(request).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

fn emit_status(app: &AppHandle, running: bool, port: Option<u16>, error: Option<String>) {
    let _ = app.emit_to(
        "main",
        "calqo-mcp-status",
        serde_json::json!({ "running": running, "port": port, "error": error }),
    );
}

/// Bind the loopback listener and spawn the HTTP server task. Returns the
/// handle used to stop it; the task also reports lifecycle transitions to the
/// webview through `calqo-mcp-status` events.
pub async fn start_server(
    app: AppHandle,
    bridge: Arc<McpBridge>,
    token: String,
    preferred_port: u16,
) -> Result<ServerHandle, String> {
    let mut bound = None;
    for port in preferred_port..=preferred_port.saturating_add(PORT_SCAN_RANGE) {
        match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => {
                bound = Some((listener, port));
                break;
            }
            Err(_) => continue,
        }
    }
    let (listener, port) = bound.ok_or_else(|| {
        format!(
            "no free loopback port between {preferred_port} and {}",
            preferred_port.saturating_add(PORT_SCAN_RANGE)
        )
    })?;

    let cancel = CancellationToken::new();
    let config = StreamableHttpServerConfig::default().with_cancellation_token(cancel.clone());
    let mut session_manager = LocalSessionManager::default();
    session_manager.session_config.keep_alive = Some(SESSION_KEEP_ALIVE);
    let service = StreamableHttpService::new(
        move || Ok(CalqoMcpServer::new(bridge.clone())),
        Arc::new(session_manager),
        config,
    );
    let router = axum::Router::new()
        .nest_service("/mcp", service)
        .layer(axum::middleware::from_fn_with_state(
            Arc::new(token),
            require_bearer,
        ));

    let shutdown = cancel.clone();
    let task_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let served = axum::serve(listener, router)
            .with_graceful_shutdown(async move { shutdown.cancelled().await })
            .await;
        emit_status(&task_app, false, None, served.err().map(|err| err.to_string()));
    });

    emit_status(&app, true, Some(port), None);
    Ok(ServerHandle { port, cancel })
}
