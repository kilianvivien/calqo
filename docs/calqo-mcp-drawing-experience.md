# Using the Calqo MCP Drawing Server — Experience Report

Date: 2025-07-15
Task: Draw an Instagram graphic for the French National Day (14 July / Bastille Day)
in the running Calqo app via the Calqo Streamable HTTP MCP server.

## Connection

The user supplied a server URL and bearer token. No predefined MCP resource was
registered in opencode: `list_mcp_resources` / `list_mcp_resource_templates`
returned empty. The MCP server was therefore driven manually over
JSON-RPC + SSE (Streamable HTTP transport) using a small Python client
(`/tmp/mcp.py`) that performs the full MCP handshake:

1. `initialize` request → capture `Mcp-Session-Id` from response headers.
2. `notifications/initialized` notification (no response body).
3. `tools/call` requests with `name` + `arguments`.

> ⚠️ Gotcha: the **first** `initialize` response is meaningful, but a single
> idle connection is fragile: the session **expired** after a few minutes of
> inactivity, and subsequent calls returned `HTTP 404 Not Found`. The fix was to
> make the client lazy-init a fresh session on demand and re-initialize once on
> a 404. Keeping the same `Mcp-Session-Id` is not safe for long sessions.

## Tools discovered

| Tool | Purpose |
| --- | --- |
| `calqo_get_status` | Active project/artboard, `revision`, write access. Call first. |
| `calqo_get_guide` | Operation shapes, layer schemas, design rules. Read before drawing. |
| `calqo_validate_operations` | Dry-run a batch without changing anything. |
| `calqo_apply_operations` | Apply a batch atomically (one undo step). Needs `baseRevision`. |
| `calqo_get_preview` | Render artboard → PNG (longest edge 1024px). |
| `calqo_create_project` | New project from a social preset. |
| `calqo_request_control` | Ask the user to approve agent writes. |

## Working state observed

- App: `Calqo 0.3.5`
- Active project: `proj_Yv6yAbr7u0UU` ("Untitled project")
- Active artboard: `ab_iyY8CrnlQ7s2`, **Story / Reel cover** (1080×1920, `story` preset)
- `writeAccess`: `requires-approval` (permission mode `session`)
- Initial layer count: 0 (blank artboard)

## Design produced

An Instagram **Story** (1080×1920) celebrating the French National Day, built
entirely from editable `text`, `shape`, and gradient-filled layers:

- Background: deep-navy → French-blue linear gradient.
- Top tricolore strip: blue / white / red `rect`s referencing the French flag.
- Five confetti dots scattered in the upper area.
- A rounded white "card" panel hosting the copy.
- Red kicker bar + eyebrow "LE 14 JUILLET" (red, letter-spaced).
- Headline "Joyeux / 14 Juillet" (navy, 108px, 800 weight).
- Subhead "Fête Nationale Française" (blue).
- Red divider + italic motto "Liberté, Égalité, Fraternité".
- A circular gradient badge with "1789" centered.
- Bottom caption "Bastille Day • 14 July 1789" over the navy.

All text uses per-locale records (`{ "en": …, "fr": … }`) matching the guide.
Two batches were applied (base layout, then a refinement: re-centered the badge
text and tightened the headline line-height). Both validated cleanly with
**zero warnings** and committed as a single undo step each.

## Workflow followed

1. `calqo_get_status` → captured `revision` and artboard dimensions.
2. `calqo_get_guide` → read full layer/operation schema and design rules.
3. Built a 19-layer batch, validated with `calqo_validate_operations` (✅).
4. `calqo_apply_operations` with `baseRevision` → applied, new revision returned.
5. `calqo_get_preview` → PNG rendered for inspection.
6. Refined 3 layers in a second validated+applied batch.
7. Final `calqo_get_preview`.

## Conclusions

- **The protocol works end-to-end**, producing fully editable Calqo layers
  (not flattened pixels) from outside the app. The `baseRevision` optimistic
  concurrency + atomic batching is a genuinely nice model: stale revisions are
  rejected, nothing is half-applied, and each batch is one undo step.
- **Validate-first is essential.** `calqo_validate_operations` caught no errors
  here but reported `warnings` (e.g. out-of-bounds layers) in probes — always dry
  run before `apply`.
- **Session durability is the main friction point.** Streamable HTTP sessions
  expire; a client must lazy-init and recover from 404. A built-in opencode
  transport that managed session lifecycle automatically would remove this.
- **Image inspection limitation.** This environment's model cannot read PNG
  previews, so visual refinement was driven by layout math + validation results
  rather than actually seeing the render. For pixel-perfect work, a human or a
  vision-capable model must review `calqo_get_preview` output. The preview PNGs
  were saved (`/tmp/preview.png`, `/tmp/preview2.png`).
- **Design guidance.** The built-in `calqo_get_guide` is excellent — it lists
  exact layer shapes, fill/stroke formats, limits (50 ops/batch, 100 layers),
  and error codes. Following it made the first apply succeed.
- **Approval flow.** First write required in-app user approval (`session` mode).
  If it fails, the error is recoverable via `calqo_request_control`.

## Practical recommendations

1. **Register the server in opencode config** (MCP HTTP transport with the
   bearer header) so it appears via `list_mcp_resources` and session lifecycle
   is handled automatically instead of manual curl/SSE parsing.
2. **Always read the guide** before the first `apply`; schemas are strict.
3. **Keep batches < 50 ops** and one conceptual unit each (base vs. refine).
4. **Re-read `calqo_get_status` before each apply** to refresh `baseRevision`.
5. **Pair with a vision-capable reviewer** for visual QA of previews.