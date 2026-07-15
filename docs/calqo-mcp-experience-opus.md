# Calqo drawing MCP — a second agent's field notes

_Author: Claude (Opus 4.8), acting as an MCP client._
_Date: 2026-07-15._
_Task: draw an attractive Instagram post for the French national day (14 juillet)
using the Calqo MCP server, and record how the tool felt to use._

> These notes were written without reading the other agent's write-up in
> `calqo-mcp-drawing-experience.md`, on purpose, so the two accounts stay
> independent.

## What I built

A 1080×1080 Instagram-square post, "14 Juillet — Fête Nationale", on a navy
gradient with a gold firework medallion, a tricolore divider, a bold `14 JUILLET`
hero, `Fête Nationale` in gold italic, the `Liberté · Égalité · Fraternité`
motto, and a full-width blue/white/red footer band. 25 layers, all real and
editable, text authored bilingually (`fr` + `en`).

![Final 14 Juillet post](assets/calqo-mcp-14-juillet.png)

## How the session actually went

1. `calqo_get_status` — reported the active project, a blank artboard, the live
   `revision`, and `writeAccess: granted`. Good first call: it tells you both
   what to target and whether you're even allowed to write.
2. `calqo_get_guide` — a genuinely well-written spec: operation shapes, per-type
   layer schemas, coordinate model, design rules, and error codes, all in one
   payload. I read it once and never needed to guess the envelope again.
3. `calqo_create_project` with `preset: "ig-square"`, `locale: "fr"` — created
   the 1080×1080 board and, nicely, seeded a palette (navy / white / gold) that
   happened to suit the theme.
4. `calqo_validate_operations` (dry run) → `calqo_apply_operations` (commit) →
   `calqo_get_preview` (render) → patch → re-preview. This loop is the heart of
   the tool and it works well.

## What is genuinely good

- **The validate → apply → preview loop.** Being able to dry-run a whole batch,
  commit it atomically as one undo step, and then _look at a real PNG_ is the
  thing that makes an LLM effective here. I caught a clipped headline from the
  preview and fixed it with a single `updateLayer` patch — no guesswork.
- **Optimistic concurrency via `baseRevision`.** Every write echoes a new
  `revision`; you thread it into the next call. It's the right model for "a human
  and an agent share one live document," and it's cheap to comply with.
- **Atomic batches.** One `apply_operations` call = one undo step for the user.
  That respects the human on the other end of the canvas.
- **Self-describing surface.** The `initialize` response ships an `instructions`
  string, and `calqo_get_guide` plus the `calqo://presets/artboards` resource
  mean a cold agent can bootstrap entirely from the server. No out-of-band docs
  needed.
- **Editable-first output.** Text stays text, lists stay lists, shapes stay
  shapes. Per-locale text records (`{ "fr": …, "en": … }`) are a first-class
  field, which matches Calqo's multilingual bet.

## Friction, most useful first

1. **The guide and the validator disagree about `line` layers.** The guide's
   line example shows only a `stroke` (no `fill`). The validator _rejects_ that:
   a `line` shape must also carry a `fill`. My firework spokes (12 line layers)
   failed validation twice before I bisected it with probe variants and found
   that adding a dummy `fill` was the fix. Either the guide should show a `fill`
   on the line example, or the validator should stop requiring one for lines.
2. **Validation errors are position-only, not field-level.** Failures came back
   as `operations.2.layer: Invalid input`, once per bad op, with no indication of
   _which_ field or _why_. With 12 identical failures I couldn't tell the cause
   from the message; I had to send a hand-built batch of single-property line
   variants to binary-search the real constraint. Surfacing the failing JSON path
   (`…layer.fill: Required`) would have turned three round-trips into zero.
3. **Text has no auto-fit and no overflow warning.** My hero line was sized 196px
   in a 960px box; "14 JUILLET" silently wrapped and "JUILLET" was clipped out of
   the box — only "14" rendered. `validate_operations` returned `valid: true`
   with no warning, and `apply` returned an empty `warnings` array. The preview
   was the only thing that caught it. A "text overflows its box" warning (the
   guide already promises out-of-bounds _layer_ warnings) would close this gap
   for the most common mistake an agent will make.
4. **`line` points must live inside the layer box.** Points are box-relative and
   negatives/out-of-range values are rejected, so a "radiate from a center point"
   motif needs a bounding box big enough to hold every spoke with non-negative
   offsets. Reasonable once you know it; the guide's single `[0,0,400,0]` example
   doesn't hint at it.

## One environment caveat (not the server's fault)

`claude mcp add --transport http calqo …` writes the config and the server shows
`✔ Connected` in `claude mcp list`, but a _already-running_ client session does
not hot-load the new server's tools — they never entered the tool registry, so
they weren't callable as `calqo_*` in-session. I drove the exact same server
directly over its streamable-HTTP JSON-RPC endpoint (`initialize` → capture
`Mcp-Session-Id` → `notifications/initialized` → `tools/call`) with `curl`, which
exercised the identical tools and produced the real document. Anyone following
the same `mcp add` command mid-session should expect to restart the client (or
drive the endpoint directly) before the tools appear.

## Verdict

The Calqo MCP is one of the more thoughtfully designed "let an agent edit my live
app" servers I've used: the read → guide → validate → apply → preview shape is
right, concurrency and undo are handled honestly, and the output stays editable
for the human. The rough edges are all in the _feedback_ channel, not the model:
generic validation messages, a guide/validator mismatch on line fills, and no
overflow warning for text. Tighten those three and a first-try, zero-retry draw
becomes the common case rather than the lucky one. As it stands I still landed an
attractive, fully-editable post — I just needed the preview to catch what the
validator stayed quiet about.
