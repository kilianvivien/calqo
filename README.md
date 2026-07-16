<p align="center">
  <img src="public/calqo-icon.png" alt="Calqo app icon" width="128" height="128" />
</p>

<h1 align="center">Calqo</h1>

<p align="center">
  <strong>Make polished social graphics. Keep every layer editable.</strong>
</p>

<p align="center">
  The open-source, local-first visual maker for static social content —<br />
  the focused 20% of Canva, without the cloud-suite weight.
</p>

<p align="center">
  <a href="https://github.com/kilianvivien/calqo/releases/latest"><strong>Download for macOS</strong></a>
  ·
  <a href="#run-from-source">Run from source</a>
  ·
  <a href="#agent-drawing">Connect an AI agent</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/kilianvivien/calqo?display_name=tag&style=flat-square" alt="Latest release" />
  <img src="https://img.shields.io/badge/platform-macOS%20Apple%20Silicon-111827?style=flat-square" alt="macOS Apple Silicon" />
  <img src="https://img.shields.io/github/license/kilianvivien/calqo?style=flat-square" alt="MIT license" />
</p>

<p align="center">
  <img src="public/screen.png" alt="Calqo editor with a social graphic open" width="1392" height="952" />
</p>

## Design fast. Own the result.

Calqo is built for the graphics people make every week: Instagram posts and
stories, YouTube thumbnails, LinkedIn banners, event cards, announcements,
quote cards, campaign variants, and multilingual public information.

- **A real canvas, not a form.** Arrange text, images, shapes, SVGs, lists, and
  freehand marks with layers, snapping, transforms, grouping, and undo/redo.
- **Editable all the way down.** AI templates and agent-made designs remain
  normal Calqo layers. Text stays text. Images stay replaceable. Nothing is
  flattened unless you export it that way.
- **Local by default.** Projects live on your device. The `.calqo` format is
  open JSON, validated by a versioned schema, and easy to back up or move.
- **One design, many outputs.** Keep multiple artboards and content languages
  in one project, then export individual files or organized ZIP bundles.
- **Focused on static social work.** No animation timeline, publishing
  calendar, or enterprise suite to navigate around.

## What Calqo can do

| Area                 | Capabilities                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Canvas**           | Multi-select, resize, rotate, snap, align, distribute, stack, group, lock, hide, reorder, crop, and undo/redo                   |
| **Content**          | Text, images, rectangles, ellipses, lines, arrows, polygons, pressure-sensitive brushes, lists, emoji, and reusable SVGs        |
| **Styling**          | Gradients, patterns, masks, filters, image frames, typography presets, shadows, blend modes, stroke looks, and sticker outlines |
| **Formats**          | Square and portrait posts, stories, thumbnails, banners, custom sizes, and multi-artboard projects                              |
| **Starters & brand** | 42 categorized starter models, saved personal models, palettes, fonts, logos, and glossary-aware brand profiles                 |
| **Languages**        | Per-locale text variants inside one design, in-place AI translation, and locale-grouped exports                                 |
| **Export**           | PNG, JPEG, WebP, SVG, editable HTML, raster fallback, clipboard/share paths, batch export, and ZIP bundles                      |
| **Asset safety**     | Missing-asset detection and repair, oversized-image notices, one-step downscale/relink, project backup and restore              |
| **AI templates**     | Prompt-to-template generation that produces validated, editable Calqo project JSON instead of a flat picture                    |
| **Agent drawing**    | A local MCP server lets Codex, Claude Code, Antigravity, OpenCode, and other agents draw directly in the live desktop app       |
| **Touch & stylus**   | Responsive phone quick-edit UI, tablet gestures, coarse-pointer controls, long-press menus, and pressure-aware brush strokes    |
| **Desktop**          | Native macOS menus, `.calqo` open/save, image drop and clipboard support, local font discovery, and secure AI-key storage       |

## Calqo 0.4.5

This release makes the desktop agent workflow much more practical:

- Generated images can be inserted with a short local `filePath`; large binary
  payloads no longer have to pass through an LLM's context as base64.
- PNG, JPEG, and WebP inputs are size-bounded and signature-checked before
  Calqo stores them as editable image assets.
- Base64 remains available as a compatibility fallback and now tolerates line
  wrapping introduced by text-oriented agent tools.
- Local MCP sessions stay alive through long image-generation and debugging
  pauses instead of expiring after five idle minutes.
- Tablet editing is smoother, with touch-visible controls, long-press menus,
  more reliable brush sessions, and clearer pressure-sensitive brush styles.

See the complete history on the
[Releases page](https://github.com/kilianvivien/calqo/releases).

## Download

Download **Calqo 0.4.5 for macOS on Apple Silicon** from the
[latest GitHub release](https://github.com/kilianvivien/calqo/releases/latest).

The current desktop build is ad-hoc signed, not Developer ID signed or
notarized. On first launch, macOS Gatekeeper may require you to approve Calqo
manually in System Settings.

Calqo is a public alpha. The editor is useful today, but project compatibility,
packaging, and experimental features may still change before 1.0.

## Agent drawing

Calqo's desktop app can expose an opt-in MCP server on loopback so a coding
agent can work on the document you have open.

An agent can:

- inspect the active project, artboard, layers, palette, selection, and revision;
- add, update, delete, reorder, group, and ungroup editable layers;
- manage content locales and create multi-language variants;
- apply a batch as one undo step and receive a fresh preview immediately;
- generate or download a raster image, save it locally, and insert it with
  `calqo_insert_image` using its absolute file path.

Enable it under **Settings → Agent drawing**. Calqo includes one-click setup for
Codex, Claude Code, Antigravity, and OpenCode, plus connection details for any
Streamable HTTP MCP client.

The server is off by default, bound to `127.0.0.1`, protected by a pairing
token, and gated by in-app write approval. The token grants access to local
processes that possess it, so treat it as a local secret and regenerate it if
it is ever exposed.

## AI without lock-in

Calqo separates two useful AI jobs:

1. **Prompt to editable template:** the provider returns Calqo project JSON,
   which is validated before it reaches the editor.
2. **Translate content in place:** text variants change while the design,
   geometry, and source language remain intact.

AI is off until you configure a provider. Gemini has a provider-specific GenAI
path; OpenAI-compatible endpoints, Ollama/local models, Mistral, OpenRouter,
and custom endpoints are supported through the provider layer.

Browser keys are persisted only after explicit opt-in. The Tauri app stores
provider keys separately in Stronghold-backed secure storage. Keys are never
written into `.calqo` projects or app backups.

## Run from source

Calqo uses Node.js, Rust, and `pnpm`.

```bash
pnpm install
pnpm dev         # browser app at http://localhost:5173
pnpm tauri:dev   # macOS desktop shell
```

Useful checks and builds:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm e2e
pnpm tauri:build # produces the macOS .app and .dmg
```

## Architecture

Calqo is a React 19 + TypeScript editor rendered with Konva and packaged with
Tauri. Zustand + Immer manage editor state, Dexie stores browser projects and
blobs, Zod defines the project contract, Tailwind v4 provides the UI system,
and react-i18next keeps the app chrome localized in English and French.

The important boundaries are deliberate:

- `src/lib/schema/` is the project contract for persistence, imports, and AI.
- `src/editor/commands/` owns project mutations, history, and autosave behavior.
- `src/lib/adapters/` separates browser storage and APIs from native Tauri
  implementations.
- `src/editor/mcp/` validates and executes agent operations through the same
  command path as manual edits.
- `src/editor/export/` owns raster, SVG, HTML, ZIP, and multi-locale export.

## Current scope

Calqo deliberately focuses on static RGB social graphics. It does not currently
offer animation/video editing, print/CMYK production, realtime multiplayer, a
hosted publishing calendar, or a template marketplace.

The packaged release is currently Apple Silicon only. SVG and editable HTML
exports report fidelity limits for effects that cannot be represented exactly;
use raster export when pixel-perfect rendering matters.

## Contributing

Issues and pull requests are welcome. Before committing, run:

```bash
pnpm typecheck
pnpm test
```

Product direction and implementation status live under [`docs/`](docs/).

## License

[MIT](LICENSE) © Kilian Vivien
