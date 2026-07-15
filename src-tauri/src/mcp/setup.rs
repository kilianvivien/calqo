//! User-triggered, one-click MCP client configuration.
//!
//! Each installer only owns the `calqo` entry and preserves unrelated client
//! settings. The UI keeps copy/paste snippets as a fallback when a client uses
//! a custom config location or its CLI cannot be found.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::{json, Map, Value};
use toml_edit::{value, DocumentMut};

#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpSetupClient {
    Claude,
    Codex,
    Opencode,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSetupResult {
    client: &'static str,
    config_path: Option<String>,
    restart_required: bool,
}

fn validate_connection(url: &str, token: &str) -> Result<(), String> {
    let valid_url = url.starts_with("http://127.0.0.1:") && url.ends_with("/mcp");
    if !valid_url {
        return Err("refusing to install a non-loopback Calqo MCP address".into());
    }
    if token.len() < 16
        || !token.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err("refusing to install an invalid pairing token".into());
    }
    Ok(())
}

fn home_path(relative: &str) -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(relative))
        .ok_or_else(|| "could not locate your home folder".into())
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("invalid config path: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    let temporary = path.with_extension("calqo.tmp");
    fs::write(&temporary, contents)
        .map_err(|error| format!("could not write {}: {error}", temporary.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("could not secure {}: {error}", temporary.display()))?;
    }
    fs::rename(&temporary, path)
        .map_err(|error| format!("could not update {}: {error}", path.display()))
}

fn read_config(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(source) => Ok(source),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(format!("could not read {}: {error}", path.display())),
    }
}

fn codex_config(source: &str, url: &str, token: &str) -> Result<String, String> {
    let mut document = if source.trim().is_empty() {
        DocumentMut::new()
    } else {
        source
            .parse::<DocumentMut>()
            .map_err(|error| format!("Codex config is not valid TOML: {error}"))?
    };
    document["mcp_servers"]["calqo"]["url"] = value(url);
    document["mcp_servers"]["calqo"]["http_headers"]["Authorization"] =
        value(format!("Bearer {token}"));
    document["mcp_servers"]["calqo"]["tool_timeout_sec"] = value(180);
    Ok(document.to_string())
}

fn opencode_config(source: &str, url: &str, token: &str) -> Result<String, String> {
    let mut root = if source.trim().is_empty() {
        json!({ "$schema": "https://opencode.ai/config.json" })
    } else {
        serde_json::from_str::<Value>(source).map_err(|error| {
            format!(
                "OpenCode config is not plain JSON ({error}). Use the copy setup fallback for JSONC files."
            )
        })?
    };
    let object = root
        .as_object_mut()
        .ok_or_else(|| "OpenCode config must be a JSON object".to_string())?;
    let mcp = object
        .entry("mcp")
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| "OpenCode's mcp setting is not an object".to_string())?;
    mcp.insert(
        "calqo".into(),
        json!({
            "type": "remote",
            "url": url,
            "enabled": true,
            "oauth": false,
            "headers": { "Authorization": format!("Bearer {token}") }
        }),
    );
    serde_json::to_string_pretty(&root)
        .map(|serialized| format!("{serialized}\n"))
        .map_err(|error| format!("could not serialize OpenCode config: {error}"))
}

fn find_claude() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".local/bin/claude"));
        candidates.push(home.join(".npm-global/bin/claude"));
        candidates.push(home.join(".bun/bin/claude"));
    }
    candidates.push(PathBuf::from("/opt/homebrew/bin/claude"));
    candidates.push(PathBuf::from("/usr/local/bin/claude"));
    candidates.into_iter().find(|path| path.is_file())
}

fn setup_claude(url: &str, token: &str) -> Result<McpSetupResult, String> {
    let executable = find_claude().unwrap_or_else(|| PathBuf::from("claude"));
    let _ = Command::new(&executable)
        .args(["mcp", "remove", "--scope", "user", "calqo"])
        .output();
    let definition = json!({
        "type": "http",
        "url": url,
        "headers": { "Authorization": format!("Bearer {token}") }
    })
    .to_string();
    let output = Command::new(&executable)
        .args(["mcp", "add-json", "--scope", "user", "calqo", &definition])
        .output()
        .map_err(|error| {
            format!("Claude Code was not found ({error}). Use Copy connection setup instead.")
        })?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() {
            "Claude Code could not save the Calqo connection. Use Copy connection setup instead."
                .into()
        } else {
            format!("Claude Code could not save the connection: {message}")
        });
    }
    Ok(McpSetupResult {
        client: "Claude Code",
        config_path: None,
        restart_required: true,
    })
}

#[tauri::command]
pub fn mcp_setup_client(
    client: McpSetupClient,
    url: String,
    token: String,
) -> Result<McpSetupResult, String> {
    validate_connection(&url, &token)?;
    match client {
        McpSetupClient::Claude => setup_claude(&url, &token),
        McpSetupClient::Codex => {
            let path = home_path(".codex/config.toml")?;
            let source = read_config(&path)?;
            atomic_write(&path, &codex_config(&source, &url, &token)?)?;
            Ok(McpSetupResult {
                client: "Codex",
                config_path: Some(path.display().to_string()),
                restart_required: true,
            })
        }
        McpSetupClient::Opencode => {
            let path = home_path(".config/opencode/opencode.json")?;
            let jsonc_path = path.with_extension("jsonc");
            if !path.exists() && jsonc_path.exists() {
                return Err(format!(
                    "OpenCode uses {}. Automatic setup will not rewrite JSONC; use Copy connection setup instead.",
                    jsonc_path.display()
                ));
            }
            let source = read_config(&path)?;
            atomic_write(&path, &opencode_config(&source, &url, &token)?)?;
            Ok(McpSetupResult {
                client: "OpenCode",
                config_path: Some(path.display().to_string()),
                restart_required: true,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{codex_config, opencode_config, validate_connection};

    #[test]
    fn codex_merge_preserves_unrelated_settings() {
        let merged = codex_config(
            "model = \"gpt-test\"\n",
            "http://127.0.0.1:22576/mcp",
            "a_secure_token_123",
        )
        .expect("merge succeeds");
        assert!(merged.contains("model = \"gpt-test\""));
        let document = merged
            .parse::<toml_edit::DocumentMut>()
            .expect("valid TOML");
        assert_eq!(
            document["mcp_servers"]["calqo"]["url"].as_str(),
            Some("http://127.0.0.1:22576/mcp")
        );
        assert_eq!(
            document["mcp_servers"]["calqo"]["http_headers"]["Authorization"].as_str(),
            Some("Bearer a_secure_token_123")
        );
    }

    #[test]
    fn opencode_merge_preserves_unrelated_settings() {
        let merged = opencode_config(
            "{\"model\":\"glm\"}",
            "http://127.0.0.1:22576/mcp",
            "a_secure_token_123",
        )
        .expect("merge succeeds");
        let value: serde_json::Value = serde_json::from_str(&merged).expect("valid JSON");
        assert_eq!(value["model"], "glm");
        assert_eq!(value["mcp"]["calqo"]["type"], "remote");
    }

    #[test]
    fn installer_rejects_external_addresses_and_weak_tokens() {
        assert!(validate_connection("https://example.com/mcp", "a_secure_token_123").is_err());
        assert!(validate_connection("http://127.0.0.1:22576/mcp", "short").is_err());
    }
}
