# Calqo Agent Drawing - Tauri Plan

**Status:** Implemented (v0.3.0) — phases 1–5 landed: TS contracts/executor
(`src/editor/mcp/`), embedded Rust server (`src-tauri/src/mcp/`), permission
gate + approval dialog + activity log, Agent drawing settings tab (EN/FR), and
`calqo_get_preview`. Still open: the `make_social_post` prompt, an E2E/MCP
Inspector smoke against a packaged build, and the §6 open questions.
**Last updated:** 2026-07-02
**Supersedes:** `docs/Old/calqo-mcp-live-drawing-implementation-plan.md`
**Related docs:** `docs/plan.md` (Milestone E), `docs/PRD-calqo-v0.5.md`

## 1. What changed since the old plan

The original plan proposed a browser-first MVP: a separate `calqo-mcp` Node
companion process, a WebSocket bridge into the browser tab, pairing tokens the
user shuttles between a terminal and the app, and only then a Tauri-native
server. That architecture works, but it is the wrong first investment:

- The setup ceremony (start a process, copy a token, keep two things alive)
  is exactly the opposite of "simple and a bit magical".
- Hosted-HTTPS-to-`ws://127.0.0.1` restrictions make the browser path fragile
  outside local dev.
- The people who will actually use this feature run coding agents on a desktop
  machine and can run the desktop app.

**Decision: build agent drawing for the Tauri app only, with the MCP server
embedded in the Rust backend.** No sidecar, no companion process, no extra
binary to sign. Browser users keep the existing static fallback: the
`calqo-project-maker` skill (`src/editor/ai/agentSkillFile.ts`) where an agent
writes a `.calqo` file and the user imports it.

## 2. Target user experience

Everything lives in **Settings → Agent drawing** (new tab in
`AppSettingsModal`, desktop only; in the browser the tab shows a short
explainer and a button to download the agent skill file instead).

First-time setup, in the order the panel presents it:

1. **Toggle "Enable agent drawing".** The Rust backend immediately starts a
   loopback MCP server and the panel shows a green status dot with the port.
2. **Copy one snippet.** The panel shows ready-to-paste setup for the hosts we
   target, each with a copy button, with the real port and token already
   substituted:
   - Claude Code: one `claude mcp add` command.
   - Codex CLI: a `config.toml` block.
   - Generic: the raw URL + header for any Streamable-HTTP-capable MCP host.
3. **Ask the agent to draw.** The user prompts their agent ("make me a
   1080x1080 launch card in Calqo"). The agent discovers the tools, reads the
   guide, and calls `calqo_apply_operations`.
4. **Approve once.** The first write triggers an in-app dialog: *"Claude Code
   wants to draw in Calqo. Allow for this session?"* After approval, writes
   flow until the app quits or the user revokes. Layers appear live on the
   canvas, fully editable, one undo step per agent batch.

Because the toggle, port, and token persist, every later session is zero-step:
launch Calqo, prompt the agent, approve once. That is the whole loop.

Ambient feedback that sells the magic:

- A small status-bar chip while an agent is connected, pulsing while a write
  batch is applying ("Claude Code is drawing…").
- Newly changed layers briefly highlighted on the canvas (reuse selection
  flash styling; keep it subtle).
- An **activity log** at the bottom of the settings tab: time, client name,
  tool, affected layers, ok/error. Session-scoped, newest first.

Permission model (default matches "approve once per session"):

| Mode | Behavior |
| --- | --- |
| Read only | Status/summary/preview tools work; writes return `PERMISSION_DENIED`. |
| Approve once per session *(default)* | First write prompts; approval covers the session until revoked or app quit. |
| Ask every batch | Each write tool call prompts. For cautious users. |

A "Revoke access now" button ends the current write session instantly.

## 3. Architecture

```text
MCP host (Claude Code / Codex)
        │  Streamable HTTP, 127.0.0.1:<port>/mcp, Bearer token
        ▼
Rust: embedded rmcp server (thin, authenticated gateway)
        │  Tauri event with correlation id ──► webview
        ▼
TS: src/editor/mcp bridge listener
        ├─ permission gate (session approval state)
        ├─ Zod operation validation (operationSchemas.ts)
        ├─ executor → editProject() in projectCommands.ts  ← single mutation path
        └─ context serializers / preview via existing export pipeline
        │
        └──► invoke("mcp_bridge_respond", { id, result }) ──► Rust resolves the
             pending MCP call
```

Principles:

- **Rust is a gateway, not an editor.** It owns transport, auth, lifecycle,
  and request/response correlation. All validation, permission checks, and
  mutations happen in TypeScript through the existing command path, so
  autosave, history, selection, and adapter boundaries are untouched.
- **One mutation door.** Every write goes through a single
  `applyMcpOperations` executor that wraps `editProject(projectId, recipe,
  { undoable: true })`. One agent batch = one undo step.
- **Command-level operations only.** No "write arbitrary project JSON" tool.
  Whole-project creation goes through the same validated path as
  prompt-a-template / `safeImportProject`.

### 3.1 Rust side (`src-tauri/src/mcp/`)

Dependencies: `rmcp` (official Rust MCP SDK, pinned latest stable) with the
`server` and `transport-streamable-http-server` features, served with
`axum`/`hyper` on Tauri's existing tokio runtime.

- `server.rs` — builds the `StreamableHttpService`, mounts it at `/mcp`,
  binds `127.0.0.1` only. Default port **22576** ("CALQO" on a phone keypad);
  on conflict, scan 22577–22586 and report the actual port to the UI.
  Configure `with_allowed_hosts(["127.0.0.1:<port>", "localhost:<port>"])` so
  DNS-rebinding requests are rejected at the transport layer.
- `auth.rs` — an axum middleware requiring `Authorization: Bearer <token>`.
  The token is generated on first enable (32 random bytes, base64url),
  persisted via `tauri-plugin-store` app settings, and shown in the settings
  panel with a "Regenerate" button. It is a local pairing secret, not a
  provider key — it never enters Stronghold, project files, or exports.
- `tools.rs` — `#[tool_router]` impl declaring the MCP tools with
  `schemars`-derived parameter schemas. Every handler does the same thing:
  serialize the request, emit a `calqo-mcp-request` Tauri event with a
  correlation id, await the webview's response (oneshot map), and translate
  it into the MCP tool result. Timeouts: 30 s default, 60 s for preview.
  If the webview has not registered its bridge yet, return `APP_NOT_READY`.
- `state.rs` — server handle, cancellation token, connected-client info
  (from MCP `initialize` clientInfo, forwarded to the UI for the approval
  dialog and activity log).
- Tauri commands: `mcp_start_server`, `mcp_stop_server`, `mcp_server_status`,
  `mcp_regenerate_token`, `mcp_bridge_respond`.

Lifecycle: if the persisted setting is enabled, start on app launch; stop via
cancellation token when the user disables the toggle or the app exits.
Disabling must leave no listening socket (assert in tests).

### 3.2 TypeScript side (`src/editor/mcp/`)

- `operationSchemas.ts` — Zod schemas for the operation envelope and each
  operation: `addLayer`, `updateLayer`, `deleteLayers`, `reorderLayer`,
  `groupLayers`, `ungroupLayer`, `addArtboard`, `setActiveArtboard`.
  Layer payloads reuse the layer schemas from `src/lib/schema/`.
- `bridge.ts` — Tauri-only module that `listen`s for `calqo-mcp-request`,
  dispatches to the executor, and answers via `invoke('mcp_bridge_respond')`.
  Reads may run concurrently; writes are serialized through a queue.
- `executor.ts` — resolves project/artboard, checks the permission state,
  checks `baseRevision` (in-memory per-project counter bumped on every
  mutation), validates all operations, simulates them against a cloned
  project, then commits the batch in one `editProject` recipe. Returns
  `{ revision, changedLayerIds, warnings }` or a structured error.
- `contextSerializers.ts` — status, active-project/artboard summary, artboard
  preset list. Never includes provider keys, settings secrets, or raw asset
  blobs.
- `preview.ts` — renders the active or requested artboard to a bounded PNG
  (long edge ≤ 1024 px) through the existing export pipeline and returns it
  as MCP image content.
- `mcpStore.ts` (in `src/lib/state/` alongside the other stores) — enabled
  flag, server status/port/token mirror, permission mode, session approval
  state, connected client, activity log entries.

### 3.3 MCP surface (MVP)

Tools (flat names — some hosts dislike dots in tool names):

| Tool | Purpose |
| --- | --- |
| `calqo_get_status` | Server + app state: active project/artboard, selection, revision, permission mode, capabilities. Response embeds a one-line pointer to `calqo_get_guide`. |
| `calqo_get_guide` | Returns the drawing guide: operation schema summary, layer rules, examples. Duplicated as a resource, but exposed as a tool because many hosts never read resources. |
| `calqo_request_control` | Proactively trigger the approval dialog instead of failing the first write. |
| `calqo_create_project` | New project from social preset + name + locale + palette (same defaults as the UI path). |
| `calqo_apply_operations` | The main tool: validated batch of command-level operations, atomic and undoable, with optional `baseRevision`. |
| `calqo_validate_operations` | Dry-run validation of a batch without mutating anything. |
| `calqo_get_preview` | PNG preview of an artboard for the look-and-refine loop. |

Resources: `calqo://app/status`, `calqo://schema/operations` (same content as
the guide tool), `calqo://project/active/summary`, `calqo://presets/artboards`.
Prompt: `make_social_post` (nice-to-have, last).

Structured errors reuse the old plan's codes (`NOT_PAIRED` becomes
`PERMISSION_DENIED`; keep `REVISION_MISMATCH`, `VALIDATION_FAILED`,
`PROJECT_NOT_FOUND`, `ARTBOARD_NOT_FOUND`, `LAYER_NOT_FOUND`,
`UNSUPPORTED_OPERATION`, `EXPORT_FAILED`, `APP_NOT_READY`, `INTERNAL_ERROR`),
always with `recoverable` and enough detail for the agent to self-correct.

Explicitly **not** in the MVP: export-to-disk tools, asset/SVG insertion,
translation tools, transactions/preview-before-commit, multi-client locking,
remote mode, browser live bridge.

### 3.4 Host setup snippets

Rendered in the settings panel with live port/token substitution:

Claude Code:

```bash
claude mcp add --transport http calqo http://127.0.0.1:22576/mcp \
  --header "Authorization: Bearer <token>"
```

Codex CLI (`~/.codex/config.toml`; recent Codex versions support
Streamable HTTP servers — verify the exact key names against the Codex
docs when implementing, and fall back to the generic bridge below if the
installed version is stdio-only):

```toml
[mcp_servers.calqo]
url = "http://127.0.0.1:22576/mcp"
bearer_token_env_var = "CALQO_MCP_TOKEN"
```

Generic / stdio-only hosts:

```text
URL:    http://127.0.0.1:22576/mcp
Header: Authorization: Bearer <token>
Bridge: npx mcp-remote http://127.0.0.1:22576/mcp \
          --header "Authorization: Bearer <token>"
```

## 4. Security requirements

Unchanged in spirit from the old plan; restated as the release checklist:

- Off by default; enabling is an explicit settings action.
- `127.0.0.1` bind only, no opt-out in v1. Host allowlist against DNS
  rebinding. Bearer token required on every request.
- Writes gated by in-app session approval; default mode prompts once per
  session; revocation is immediate.
- Strict Zod validation, simulate-then-commit atomicity, layer-count cap
  (mirror the template generation cap), per-session rate limit on write
  batches, payload size cap.
- No filesystem write tools. No provider keys, settings secrets, or raw asset
  blobs in any tool result, resource, log, or error.
- Activity log visible in settings; connected client always identified.
- Disabling the feature (or quitting) tears the server down completely.

## 5. Implementation phases

### Phase 1 - Contracts and executor (TS only)

Operation schemas, executor, revision counter, context serializers,
`mcpStore`, and a vitest harness that drives the executor directly.

*Exit:* valid batches mutate a test project as one undo step; invalid, stale,
oversized, and disallowed payloads fail with the right structured errors.
`pnpm typecheck && pnpm test` green.

### Phase 2 - Embedded Rust server and bridge

`rmcp` dependency, server/auth/lifecycle modules, Tauri commands, event
bridge with correlation + timeouts, `calqo_get_status` and `calqo_get_guide`
end to end.

*Exit:* MCP Inspector connects to the running desktop app with the token,
lists tools, and `calqo_get_status` returns live app state. Wrong/missing
token is rejected. Disabling the toggle closes the socket.

### Phase 3 - Write path and permissions

Remaining tools wired through the bridge, permission gate, approval dialog,
activity log state, status-bar chip, changed-layer highlight.

*Exit:* a real coding agent (Claude Code) creates a project and draws editable
layers after one approval; undo reverts a whole batch; revoke blocks the next
write; autosave persists agent edits through the normal adapter path.

### Phase 4 - Settings UX and i18n

Agent drawing settings tab: toggle, status, port, token + regenerate, copy
snippets, permission mode selector, activity log, browser-mode explainer with
skill-file download. All strings in `src/locales/en` and `src/locales/fr`.

*Exit:* a first-time user can go from toggle to agent-drawn layers using only
what the panel shows them, in EN and FR, in light/dark/solid transparency.

### Phase 5 - Preview loop and hardening

`calqo_get_preview`, guidance resources/prompt, fuzz tests for malformed
bridge payloads, auth-failure and rate-limit tests, port-conflict recovery,
docs (README known-limitations note, user doc page, threat model paragraph).

*Exit:* agent can draw → look → refine → stop; the full security checklist in
§4 is covered by tests or a documented manual check; feature ships disabled by
default behind the settings toggle.

## 6. Open questions (deferred, not blockers)

- Should agent-provided layer ids be honored (deterministic references) or
  should Calqo mint ids and return a mapping? MVP: honor agent ids when they
  are valid and unused, otherwise mint and return the map.
- Batch preview-before-commit (transactions) — revisit after real usage shows
  whether per-batch undo is enough review.
- Windows/Linux behavior is expected to be identical (loopback HTTP, no
  signing implications), but verify when those builds become official targets.
