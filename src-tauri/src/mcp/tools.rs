//! The MCP server surface: tools and resources exposed to local coding agents.
//!
//! Every handler is a thin forward into the webview executor (see `bridge.rs`);
//! nothing here mutates editor state directly. Tool errors come back as
//! client-visible `CallToolResult::error` payloads carrying the structured
//! `{ code, message, recoverable, details }` shape agents can branch on.

use std::fs;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{
    CallToolResult, ContentBlock, InitializeResult, ListResourcesResult, PaginatedRequestParams,
    ReadResourceRequestParams, ReadResourceResult, Resource, ResourceContents, ServerCapabilities,
};
use rmcp::service::{RequestContext, RoleServer};
use rmcp::{tool, tool_handler, tool_router, ErrorData, ServerHandler};
use serde_json::{json, Value};

use super::bridge::{BridgeCallError, ClientInfo, McpBridge};
use super::contracts::{ImageFit, McpOperationParam};

/// Plain reads answered from live app state.
const READ_TIMEOUT: Duration = Duration::from_secs(30);
/// Preview renders an offscreen Konva stage; give it headroom.
const PREVIEW_TIMEOUT: Duration = Duration::from_secs(90);
/// Writes may block on the in-app approval dialog, so wait generously.
const WRITE_TIMEOUT: Duration = Duration::from_secs(180);
/// Keep this in sync with `MAX_AGENT_IMAGE_BYTES` in operationSchemas.ts.
const MAX_AGENT_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

const RESOURCES: &[(&str, &str, &str)] = &[
    (
        "calqo://app/status",
        "app-status",
        "Live Calqo state: active project, artboards, selection, revision, write access.",
    ),
    (
        "calqo://schema/operations",
        "operations-guide",
        "How to draw in Calqo: operation shapes, layer schemas, design rules.",
    ),
    (
        "calqo://project/active/summary",
        "active-project-summary",
        "Compact summary of the active project: artboards, layers, text, palette.",
    ),
    (
        "calqo://presets/artboards",
        "artboard-presets",
        "Available social artboard presets with pixel dimensions.",
    ),
];

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOperationsParams {
    /// Target project id; defaults to the active project.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// Target artboard id; defaults to the active artboard.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artboard_id: Option<String>,
    /// The `revision` from calqo_get_status; stale values are rejected so the
    /// agent never overwrites the user's concurrent edits.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_revision: Option<String>,
    /// Command operations (layers, groups, artboards, and content locales).
    /// Call calqo_get_guide only for advanced fields and design advice.
    #[schemars(with = "Vec<McpOperationParam>")]
    pub operations: Vec<Value>,
}

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectParams {
    /// Project name shown in the Calqo tab bar.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Artboard preset id (see calqo://presets/artboards); defaults to ig-square.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset: Option<String>,
    /// Initial content locale, e.g. "en" or "fr".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetPreviewParams {
    /// Project id; defaults to the active project.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// Artboard id; defaults to the active artboard.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artboard_id: Option<String>,
}

#[derive(Default, serde::Deserialize, serde::Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InsertImageParams {
    /// Preferred same-machine handoff: absolute path to a PNG, JPEG, or WebP
    /// already written by the agent. This avoids sending binary through the
    /// model context. Provide exactly one of filePath or dataUrl.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    /// Compatibility fallback: base64 PNG, JPEG, or WebP data URL. ASCII
    /// whitespace is tolerated. Provide exactly one of dataUrl or filePath.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
    /// Asset/layer name; defaults to agent-image with the matching extension.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Target project id; defaults to the active project.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// Target artboard id; defaults to the active artboard.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artboard_id: Option<String>,
    /// Revision from calqo_get_status; stale values are rejected.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_revision: Option<String>,
    /// Placement in artboard pixels. Omit geometry to fill the artboard.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub w: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub h: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fit: Option<ImageFit>,
}

#[derive(Clone)]
pub struct CalqoMcpServer {
    bridge: Arc<McpBridge>,
}

fn client_of(ctx: &RequestContext<RoleServer>) -> Option<ClientInfo> {
    ctx.peer.peer_info().map(|info| ClientInfo {
        name: info.client_info.name.clone(),
        version: Some(info.client_info.version.clone()),
    })
}

fn timeout_error() -> Value {
    json!({
        "code": "APP_NOT_READY",
        "message": "Calqo did not answer in time. Make sure the Calqo window is open and any approval dialog has been answered.",
        "recoverable": true
    })
}

/// Bridge outcome → client-visible tool result.
fn to_tool_result(outcome: Result<Value, BridgeCallError>) -> Result<CallToolResult, ErrorData> {
    match outcome {
        Ok(value) => Ok(CallToolResult::success(vec![ContentBlock::text(
            value.to_string(),
        )])),
        Err(BridgeCallError::Tool(payload)) => Ok(CallToolResult::error(vec![ContentBlock::text(
            json!({ "error": payload }).to_string(),
        )])),
        Err(BridgeCallError::Timeout) => Ok(CallToolResult::error(vec![ContentBlock::text(
            json!({ "error": timeout_error() }).to_string(),
        )])),
        Err(BridgeCallError::Emit(message)) => Err(ErrorData::internal_error(
            format!("Calqo bridge failure: {message}"),
            None,
        )),
    }
}

fn to_args<T: serde::Serialize>(params: &T) -> Result<Value, ErrorData> {
    serde_json::to_value(params)
        .map_err(|err| ErrorData::internal_error(format!("argument encoding failed: {err}"), None))
}

fn validation_error(message: impl Into<String>) -> Value {
    json!({
        "code": "VALIDATION_FAILED",
        "message": message.into(),
        "recoverable": true
    })
}

fn detect_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

/// Turn a same-machine file reference into the existing webview data URL
/// contract. Binary bytes travel only inside Calqo (Rust -> webview), never
/// through the agent's model context.
fn materialize_insert_image_params(
    mut params: InsertImageParams,
) -> Result<InsertImageParams, Value> {
    let file_path = match (params.file_path.take(), params.data_url.as_ref()) {
        (Some(_), Some(_)) => {
            return Err(validation_error(
                "Provide exactly one image source: filePath (preferred) or dataUrl.",
            ));
        }
        (None, None) => {
            return Err(validation_error(
                "Missing image source. Provide filePath (preferred) or dataUrl.",
            ));
        }
        (None, Some(_)) => return Ok(params),
        (Some(file_path), None) => file_path,
    };

    let path = Path::new(&file_path);
    if !path.is_absolute() {
        return Err(validation_error(
            "filePath must be an absolute path on the machine running Calqo.",
        ));
    }
    let metadata = fs::metadata(path).map_err(|error| {
        validation_error(format!("Could not read image file {file_path:?}: {error}"))
    })?;
    if !metadata.is_file() {
        return Err(validation_error(format!(
            "filePath is not a regular file: {file_path:?}."
        )));
    }
    if metadata.len() > MAX_AGENT_IMAGE_BYTES {
        return Err(validation_error(format!(
            "Image is {} bytes; the cap is {MAX_AGENT_IMAGE_BYTES} bytes. Resize or recompress it and retry.",
            metadata.len()
        )));
    }
    let bytes = fs::read(path).map_err(|error| {
        validation_error(format!("Could not read image file {file_path:?}: {error}"))
    })?;
    if bytes.len() as u64 > MAX_AGENT_IMAGE_BYTES {
        return Err(validation_error(format!(
            "Image is {} bytes; the cap is {MAX_AGENT_IMAGE_BYTES} bytes. Resize or recompress it and retry.",
            bytes.len()
        )));
    }
    let mime = detect_image_mime(&bytes).ok_or_else(|| {
        validation_error(
            "filePath must contain a PNG, JPEG, or WebP image with a valid file signature.",
        )
    })?;
    if params.name.is_none() {
        params.name = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned());
    }
    params.data_url = Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ));
    Ok(params)
}

#[tool_router]
impl CalqoMcpServer {
    pub fn new(bridge: Arc<McpBridge>) -> Self {
        Self { bridge }
    }

    #[tool(
        name = "calqo_get_status",
        description = "Get live Calqo state: active project and artboard, selection, current revision, and whether writes are allowed. Call this first."
    )]
    pub async fn get_status(
        &self,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        to_tool_result(
            self.bridge
                .call("get_status", Value::Null, client_of(&ctx), READ_TIMEOUT)
                .await,
        )
    }

    #[tool(
        name = "calqo_get_guide",
        description = "Get the Calqo drawing guide: operation shapes, layer schemas, examples, and design rules. Read this before your first calqo_apply_operations call."
    )]
    pub async fn get_guide(
        &self,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        to_tool_result(
            self.bridge
                .call("get_guide", Value::Null, client_of(&ctx), READ_TIMEOUT)
                .await,
        )
    }

    #[tool(
        name = "calqo_request_control",
        description = "Ask the Calqo user to approve agent writes for this session. Optional: the first write triggers the same approval dialog."
    )]
    pub async fn request_control(
        &self,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        to_tool_result(
            self.bridge
                .call(
                    "request_control",
                    Value::Null,
                    client_of(&ctx),
                    WRITE_TIMEOUT,
                )
                .await,
        )
    }

    #[tool(
        name = "calqo_create_project",
        description = "Create a new Calqo project from a social preset and open it in the editor. Requires user approval like any write."
    )]
    pub async fn create_project(
        &self,
        Parameters(params): Parameters<CreateProjectParams>,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let args = to_args(&params)?;
        to_tool_result(
            self.bridge
                .call("create_project", args, client_of(&ctx), WRITE_TIMEOUT)
                .await,
        )
    }

    #[tool(
        name = "calqo_apply_operations",
        description = "Apply a batch of drawing operations to a Calqo artboard. The batch validates fully before anything is applied, commits atomically as ONE undo step, and returns changed layer ids plus warnings."
    )]
    pub async fn apply_operations(
        &self,
        Parameters(params): Parameters<ApplyOperationsParams>,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let args = to_args(&params)?;
        to_tool_result(
            self.bridge
                .call("apply_operations", args, client_of(&ctx), WRITE_TIMEOUT)
                .await,
        )
    }

    #[tool(
        name = "calqo_apply_and_preview",
        description = "Preferred drawing loop: validate and apply one atomic operation batch, then return the updated revision, warnings, and a PNG preview in the SAME call. Inspect the image and call again with small updateLayer refinements."
    )]
    pub async fn apply_and_preview(
        &self,
        Parameters(params): Parameters<ApplyOperationsParams>,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let args = to_args(&params)?;
        let outcome = self
            .bridge
            .call("apply_and_preview", args, client_of(&ctx), WRITE_TIMEOUT)
            .await;
        match outcome {
            Ok(value) => {
                let apply = value.get("apply").cloned().unwrap_or(Value::Null);
                let preview = value.get("preview").cloned().unwrap_or(Value::Null);
                let data = preview
                    .get("data")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let mime = preview
                    .get("mimeType")
                    .and_then(Value::as_str)
                    .unwrap_or("image/png");
                let result = json!({
                    "apply": apply,
                    "preview": {
                        "artboardId": preview.get("artboardId"),
                        "width": preview.get("width"),
                        "height": preview.get("height"),
                    },
                    "previewError": value.get("previewError"),
                });
                let mut content = Vec::new();
                if !data.is_empty() {
                    content.push(ContentBlock::image(data, mime));
                }
                content.push(ContentBlock::text(result.to_string()));
                Ok(CallToolResult::success(content))
            }
            other => to_tool_result(other),
        }
    }

    #[tool(
        name = "calqo_insert_image",
        description = "Import a PNG/JPEG/WebP produced by your image-generation capability or fetched from the web, place it as an editable Calqo image layer, and return a preview. Prefer filePath after saving the image locally; it is fast and keeps binary out of the model context. dataUrl remains a fallback. Calqo never fetches URLs. Use image generation only when the user asks for it."
    )]
    pub async fn insert_image(
        &self,
        Parameters(params): Parameters<InsertImageParams>,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let params = match materialize_insert_image_params(params) {
            Ok(params) => params,
            Err(payload) => {
                return Ok(CallToolResult::error(vec![ContentBlock::text(
                    json!({ "error": payload }).to_string(),
                )]));
            }
        };
        let args = to_args(&params)?;
        let outcome = self
            .bridge
            .call("insert_image", args, client_of(&ctx), WRITE_TIMEOUT)
            .await;
        match outcome {
            Ok(value) => {
                let insert = value.get("insert").cloned().unwrap_or(Value::Null);
                let preview = value.get("preview").cloned().unwrap_or(Value::Null);
                let data = preview
                    .get("data")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let mime = preview
                    .get("mimeType")
                    .and_then(Value::as_str)
                    .unwrap_or("image/png");
                let result = json!({
                    "insert": insert,
                    "preview": {
                        "artboardId": preview.get("artboardId"),
                        "width": preview.get("width"),
                        "height": preview.get("height"),
                    },
                    "previewError": value.get("previewError"),
                });
                let mut content = Vec::new();
                if !data.is_empty() {
                    content.push(ContentBlock::image(data, mime));
                }
                content.push(ContentBlock::text(result.to_string()));
                Ok(CallToolResult::success(content))
            }
            other => to_tool_result(other),
        }
    }

    #[tool(
        name = "calqo_validate_operations",
        description = "Dry-run a calqo_apply_operations batch: validates and simulates without changing anything. Returns validity, warnings, and structured errors."
    )]
    pub async fn validate_operations(
        &self,
        Parameters(params): Parameters<ApplyOperationsParams>,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let args = to_args(&params)?;
        to_tool_result(
            self.bridge
                .call("validate_operations", args, client_of(&ctx), READ_TIMEOUT)
                .await,
        )
    }

    #[tool(
        name = "calqo_get_preview",
        description = "Render an artboard to a PNG preview (longest edge 1024px) so you can look at the current design and refine it."
    )]
    pub async fn get_preview(
        &self,
        Parameters(params): Parameters<GetPreviewParams>,
        ctx: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        let args = to_args(&params)?;
        let outcome = self
            .bridge
            .call("get_preview", args, client_of(&ctx), PREVIEW_TIMEOUT)
            .await;
        match outcome {
            Ok(value) => {
                let data = value
                    .get("data")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let mime = value
                    .get("mimeType")
                    .and_then(Value::as_str)
                    .unwrap_or("image/png");
                let meta = json!({
                    "artboardId": value.get("artboardId"),
                    "width": value.get("width"),
                    "height": value.get("height"),
                });
                Ok(CallToolResult::success(vec![
                    ContentBlock::image(data, mime),
                    ContentBlock::text(meta.to_string()),
                ]))
            }
            other => to_tool_result(other),
        }
    }
}

#[tool_handler]
impl ServerHandler for CalqoMcpServer {
    fn get_info(&self) -> InitializeResult {
        let mut info = InitializeResult::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
        );
        info.server_info.name = "calqo".into();
        info.server_info.title = Some("Calqo".into());
        info.server_info.version = env!("CARGO_PKG_VERSION").into();
        info.instructions = Some(
            "Draw editable social graphics in the live Calqo app. First call calqo_get_status. \
             Prefer calqo_apply_and_preview: it validates, applies one atomic undo step, and \
             returns the PNG plus the new revision in one call. Inspect the image, then refine \
             with small updateLayer batches using that revision. Tool input schemas describe \
             operations and layers; call calqo_get_guide only for advanced fields/design advice. \
             If the user asks for generated imagery, or wants an image found on the web, use your \
             own image/search capability, save the result locally, and pass its absolute filePath \
             to calqo_insert_image. Use dataUrl only when no local file is available. \
             Never erase existing work unless asked. Writes require one in-app approval per session."
                .into(),
        );
        info
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, ErrorData> {
        let resources = RESOURCES
            .iter()
            .map(|(uri, name, description)| {
                Resource::new(*uri, *name)
                    .with_description(*description)
                    .with_mime_type(if *uri == "calqo://schema/operations" {
                        "text/markdown"
                    } else {
                        "application/json"
                    })
            })
            .collect();
        Ok(ListResourcesResult::with_all_items(resources))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResult, ErrorData> {
        let uri = request.uri.as_str();
        let method = match uri {
            "calqo://app/status" => "get_status",
            "calqo://schema/operations" => "get_guide",
            "calqo://project/active/summary" => "get_project_summary",
            "calqo://presets/artboards" => "get_presets",
            _ => {
                return Err(ErrorData::resource_not_found(
                    format!("unknown resource: {uri}"),
                    None,
                ));
            }
        };
        let outcome = self
            .bridge
            .call(method, Value::Null, client_of(&context), READ_TIMEOUT)
            .await;
        match outcome {
            Ok(value) => {
                // The guide is markdown wrapped as { guide }; unwrap it for readers.
                let text = if method == "get_guide" {
                    value
                        .get("guide")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                        .unwrap_or_else(|| value.to_string())
                } else {
                    value.to_string()
                };
                Ok(ReadResourceResult::new(vec![ResourceContents::text(
                    text, uri,
                )]))
            }
            Err(BridgeCallError::Tool(payload)) => Err(ErrorData::internal_error(
                format!("Calqo rejected the read: {payload}"),
                Some(payload),
            )),
            Err(BridgeCallError::Timeout) => Err(ErrorData::internal_error(
                "Calqo did not answer in time; is the app window open?",
                None,
            )),
            Err(BridgeCallError::Emit(message)) => Err(ErrorData::internal_error(
                format!("Calqo bridge failure: {message}"),
                None,
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{materialize_insert_image_params, ApplyOperationsParams, InsertImageParams};

    #[test]
    fn operation_tool_schema_is_typed() {
        let schema = schemars::schema_for!(ApplyOperationsParams);
        let json = serde_json::to_string(&schema).expect("schema serializes");
        assert!(json.contains("addLayer"));
        assert!(json.contains("updateLayer"));
        assert!(json.contains("layerId"));
        assert!(json.contains("fontSize"));
        assert!(json.contains("assetId"));
        assert!(!json.contains("\"items\":true"));
    }

    #[test]
    fn image_tool_schema_exposes_preferred_file_path_and_data_url_fallback() {
        let schema = schemars::schema_for!(InsertImageParams);
        let json = serde_json::to_string(&schema).expect("schema serializes");
        assert!(json.contains("filePath"));
        assert!(json.contains("dataUrl"));
        assert!(json.contains("baseRevision"));
        assert!(json.contains("fit"));
    }

    #[test]
    fn image_file_is_materialized_without_exposing_the_path_to_the_webview() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock after epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "calqo-mcp-image-{}-{nonce}.png",
            std::process::id()
        ));
        fs::write(&path, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).expect("writes fixture");

        let params = materialize_insert_image_params(InsertImageParams {
            file_path: Some(path.to_string_lossy().into_owned()),
            ..InsertImageParams::default()
        })
        .expect("materializes image");

        fs::remove_file(&path).expect("removes fixture");
        assert!(params.file_path.is_none());
        assert_eq!(
            params.name.as_deref(),
            path.file_name().and_then(|name| name.to_str())
        );
        assert!(params
            .data_url
            .as_deref()
            .is_some_and(|url| url.starts_with("data:image/png;base64,")));
    }

    #[test]
    fn image_source_must_be_unambiguous() {
        let error = match materialize_insert_image_params(InsertImageParams {
            file_path: Some("/tmp/image.png".into()),
            data_url: Some("data:image/png;base64,AAAA".into()),
            ..InsertImageParams::default()
        }) {
            Ok(_) => panic!("accepted two image sources"),
            Err(error) => error,
        };
        assert_eq!(error["code"], "VALIDATION_FAILED");
    }
}
