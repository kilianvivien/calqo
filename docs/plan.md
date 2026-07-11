# Calqo Beta And 1.0 Roadmap

**Planning date:** 2026-06-27  
**Current app version observed:** `0.2.6` in `package.json` and Tauri metadata
**Planning inputs:** `docs/calqo-post-phase-m-implementation-plan.md`,
`docs/calqo-mcp-live-drawing-implementation-plan.md`,
`docs/PRD-calqo-v0.5.md`, README, package scripts, schema/export/adapter code,
and current test files.

This roadmap replaces the old phase-letter backlog as the practical plan for
getting Calqo out of alpha, through a first beta, and then to 1.0.

The bias is deliberate: **make the current editor trustworthy before adding
more editor surface area**. Calqo already has enough product to deserve polish:
desktop shell, browser editor, mobile quick edit, prompt-a-template,
translation, portable `.calqo` envelopes, raster/SVG/HTML-wrapper export,
creative frames/strokes, PWA prompts, and a public alpha DMG. The next release
should prove that those features are reliable, recoverable, documented, and
repeatable.

---

## 1. Current Snapshot

Implemented and worth protecting:

- Core browser editor: projects, tabs, artboards, layers, Konva canvas,
  selection, transform, grouping, undo/redo, alignment, snapping, arrange tools.
- Local-first storage and portability boundaries: Dexie-backed browser storage,
  Tauri file/settings/dialog/clipboard/font adapters, and a shared project
  schema.
- `.calqo` export/import already serializes a `calqo.project` envelope with
  inlined asset data URLs. Portability exists; it now needs compatibility,
  repair UX, and release testing.
- Export pipeline: PNG/JPG/WebP, SVG with documented caveats, HTML raster
  wrapper, batch export, export warnings.
- AI: mock mode, Gemini-specific path, OpenAI-compatible providers, local
  provider options, prompt-a-template, translation, provider diagnostics, secure
  desktop settings.
- Multilingual content: per-project locales, per-layer content variants,
  glossary support, translation pipeline.
- Tauri foundation: macOS desktop shell, native menus, native open/save,
  Stronghold-backed secure key handling, local fonts, native clipboard/image
  flows, Apple Silicon DMG packaging.
- Responsive phone browser surface: project browser, active-artboard editor,
  bottom sheets, text/image/color/layer/arrange/translate/export/share flows.
- Tablet-ready desktop editor (iPad PWA / touch screens): the full desktop
  shell drives with touch and Apple Pencil — stage touch handlers, two-finger
  pinch-zoom/pan (canvas and crop editor), long-press context menu,
  finger-sized transform/crop handles on coarse pointers, expanded tap targets
  on shell chrome, and viewport/overscroll locking in standalone mode. The
  macOS Tauri app inherits the same interactions for Sidecar + Pencil use.
- Creative tools: image frames, masks, filters, sticker outlines, stroke looks,
  editable raster background removal, freehand brush presets, SVG library,
  mobile styling parity.
- Tests: unit suites by phase plus one public-alpha Playwright smoke file.

Clear gaps observed:

- Release metadata should be checked before every package: README, package
  metadata, Tauri config, and Cargo package version all need to name the same
  release.
- No `.github` CI workflow is present.
- Desktop release is unsigned/not notarized and Apple Silicon only.
- PWA install/update exists, but is not yet a release gate.
- Existing E2E coverage is useful but narrow; it does not yet act as a full
  browser/desktop/mobile release confidence suite.
- ~~Missing assets are warned about, but the user still needs a repair/relink
  workflow.~~ Closed: see Milestone B.
- Portable `.calqo` envelopes exist, but compatibility, size, malformed asset,
  and old-file behavior should be tested and documented as first-class release
  promises.
- ~~Editable HTML/CSS export is not implemented.~~ Closed: see Milestone B
  ("HTML (editable)" mode).
- ~~Brand/template production workflows are not implemented.~~ Closed: see
  Milestone D (local starter gallery + Brand Lite).
- MCP live drawing is a compelling future differentiator, but it introduces a
  local-agent security surface. It should be a labs track, not a beta blocker.

---

## 2. Product Principles For The Next Releases

- **Beta means dependable, not bigger.** A beta user should trust save, reopen,
  import, export, translate, and recover flows.
- **1.0 means clear promise.** The app should make the PRD's core static social
  visual workflow feel complete without pretending to be Canva.
- **No hidden platform magic.** Browser, PWA, and Tauri capabilities should be
  shown honestly, with graceful fallback paths.
- **Keep the project schema boring.** Bump schema only for real document
  contract changes. Prefer local library records for templates/brand defaults
  unless the project needs a portable snapshot.
- **Adapters stay sacred.** No direct Dexie, browser storage, filesystem,
  clipboard, or Tauri imports inside editor/UI feature code.
- **AI remains optional.** Core create/edit/export must work offline. Provider
  keys must never leak into project files, diagnostics, logs, or MCP resources.
- **Every user-facing change ships EN/FR.**
- **Known limitations are product UI, not shame.** If SVG, HTML, clipboard,
  PWA, desktop signing, or provider behavior has limits, surface them clearly.

---

## 3. Roadmap Overview

Recommended order:

1. **Milestone A - Beta Reliability Freeze**
2. **Milestone B - Portability, Export, And Recovery Polish**
3. **Milestone C - Desktop, PWA, And Release Operations**
4. **Milestone D - 1.0 Product Completion**
5. **Milestone E - MCP Live Drawing Labs**
6. **Milestone F - 1.0 Release Candidate**

Milestones A-C are the alpha-exit path. Milestones D and F form the 1.0 path.
Milestone E can run after beta foundations are stable, but it should not block
1.0 unless it is already safe, documented, and easy to disable.

---

## Milestone A - Beta Reliability Freeze

**Target:** first beta, leaving alpha.  
**Theme:** stop product drift, make quality repeatable, and harden core flows.

### Deliverables

- [ ] Reconcile release metadata.
  - Update README status/download copy to match `package.json` and actual
    release tags.
  - Add a short changelog or release notes file.
  - Document which platforms are official beta targets.
- [ ] Add CI for every pull request.
  - Install with pnpm.
  - Run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`.
  - Run Playwright Chromium smoke at minimum.
  - Cache pnpm and Playwright browsers appropriately.
- [ ] Define a local release gate script or checklist.
  - Browser clean install.
  - Browser build.
  - Unit tests.
  - E2E smoke.
  - Tauri dev smoke.
  - Tauri build smoke on the release machine.
- [ ] Expand E2E into beta-critical flows.
  - Fresh browser create/edit/export/reload.
  - Import a `.calqo` envelope with assets.
  - Import malformed/bare project JSON and show recovery.
  - Translate with mock provider and verify layout warnings.
  - Prompt-a-template mock path and validated adoption.
  - Mobile viewport open/edit/export path.
- [ ] Add focused regression coverage for save/reopen trust.
  - Browser autosave coalescing and reload restore.
  - Native save/save-as dirty-state transitions.
  - Failed save/import messages.
  - Close/reopen behavior with unsaved native files.
- [ ] Run a stabilization bug bash.
  - One pass each on Chrome, Safari, installed PWA if available, and Tauri.
  - Track failures as release blockers or documented limitations.

### Acceptance Criteria

- A clean checkout can prove the beta gate without manual source inspection.
- README, app version, known limitations, and release artifacts agree.
- A tester can create, save, reopen, import, translate, export, and reload
  without losing work or needing to understand implementation details.
- CI is green before a beta tag is cut.

### Out Of Scope

- Editable HTML/CSS export.
- Brand kits, campaign sets, hosted galleries.
- MCP live drawing.
- Multi-platform desktop expansion beyond explicitly supported beta targets.

---

## Milestone B - Portability, Export, And Recovery Polish

**Target:** beta hardening, then 1.0 carryover.  
**Theme:** projects should move between machines and exports should be
predictable.

### Deliverables

- [ ] Make `.calqo` portability a tested contract.
  - Keep the current JSON envelope format with inlined assets.
  - Add fixture files for current envelope, bare project JSON, missing asset
    references, malformed asset payloads, and older schema inputs.
  - Assert assets restore under the expected refs and layer geometry survives.
- [x] Add missing asset repair UX.
  - Detect missing image/SVG assets on open/import and in diagnostics
    (`src/editor/assets/missingAssets.ts`, watched via
    `useMissingAssetsWatcher`).
  - Let users relink, remove, or keep placeholders (`RepairAssetsModal.tsx`).
  - Preserve layer geometry, frame, mask, filters, crop, and focal point when
    relinking (`relinkAsset` in `projectCommands.ts`, one undo step).
  - Surface unresolved missing assets before export (export dialog warning +
    status-bar badge).
- [x] Add package size and asset health warnings.
  - Warn before exporting huge `.calqo` files (`estimateEnvelopeBytes`, export
    dialog).
  - Flag oversized raster assets earlier in import and export flows
    (`assetHealth.ts`, import-time toast).
  - Offer user-approved downscale via `OptimizeAssetsModal.tsx` /
    `downscaleImageBlob`, applied through the same `relinkAsset` machinery
    (undoable, no hidden quality loss below rendered size × export ratio).
- [x] Polish export mode language.
  - Renamed the raster HTML mode to "HTML (image wrapper)"; added a new
    "HTML (editable)" mode producing real text/CSS/SVG
    (`htmlLayoutExport.ts`), with per-layer fidelity tiers and rasterized
    fallback for unsupported layers.
  - Make PNG the recommended pixel-faithful path for frames, effects, masks,
    blend modes, and creative strokes.
- [ ] Improve SVG/export warning specificity.
  - Group warnings by artboard and affected layer where practical.
  - Keep the inspector's export notes and export dialog warnings in sync.
- [ ] Add browser capability fallbacks.
  - Clipboard unsupported path.
  - Web Share unsupported path.
  - Download fallback for mobile/PWA.

### Acceptance Criteria

- A `.calqo` file with local assets can be exported, moved, imported, and
  edited on a fresh browser profile.
- Missing assets do not silently disappear; the user sees a repair path.
- HTML export does not imply editability until editable HTML/CSS is actually
  implemented.
- Export warnings are specific enough that users know whether to switch to PNG,
  relink assets, reduce asset size, or fix text overflow.

---

## Milestone C - Desktop, PWA, And Release Operations

**Target:** beta quality bar for distributed builds.  
**Theme:** make installation/update paths boring.

### Deliverables

- [ ] Decide beta desktop support matrix.
  - Apple Silicon macOS only is acceptable for first beta if stated clearly.
  - Intel macOS, Windows, and Linux can remain 1.0 or later if they are not
    being built and tested.
- [ ] Sign and notarize macOS beta builds, or explicitly hold desktop at alpha.
  - Unsigned desktop builds are acceptable for developer/tester alphas, but a
    public beta should ideally avoid manual Gatekeeper workarounds.
  - Document certificate/notarization steps if credentials are available.
- [ ] Harden Tauri release flow.
  - Verify `pnpm tauri:build` from a clean checkout.
  - Verify native `.calqo` open/save round-trips.
  - Verify secure settings do not export API keys.
  - Verify native clipboard/image drop/local font smoke paths.
- [ ] Treat PWA as a real distribution path or mark it experimental.
  - Test install prompt.
  - Test update prompt.
  - Test offline/cache behavior expectations.
  - Document browser-specific limits.
- [ ] Add release artifact checks.
  - SHA-256 generation.
  - App version visible in UI.
  - Release notes.
  - Third-party notices if needed.
  - License included.

### Acceptance Criteria

- A beta user can install or run Calqo through the supported path without
  guessing which build is current.
- Desktop security/key-storage behavior is verified and documented.
- PWA behavior is either release-gated or clearly experimental.
- Release artifacts can be reproduced by the maintainer from a clean checkout.

---

## Milestone D - 1.0 Product Completion

**Target:** 1.0 feature-complete candidate.  
**Theme:** finish the essential workflow gaps without broadening the product.

### Deliverables

- [x] Add a small local starter gallery.
  - 8 license-clean `.calqo` samples under `public/starters/` (self-made
    text/shape content, no binary assets) covering IG square, story cover, X
    quote, LinkedIn list, YouTube thumbnail, an EN/FR/TR multilingual card, a
    sticker sheet, and a 3-artboard campaign kit; credited in
    `public/starters/CREDITS.md` and schema-validated in CI
    (`src/tests/unit/starters.test.ts`).
  - Bundled and user starters both live in the *Starters* tab of
    `NewProjectModal.tsx`; instantiation clones fresh asset ids via
    `starterService.ts`/`remapProjectAssetIds`.
- [x] Add "save as starter" or "duplicate from starter" if it stays simple.
  - "Save as starter" in the project manager (`ProjectManagerModal.tsx`)
    snapshots the current `.calqo` envelope plus a rendered thumbnail into a
    local `starters` Dexie table (`starterLibrary` adapter); starters remain
    normal Calqo projects, no new schema or marketplace.
- [x] Add lightweight brand defaults.
  - Named Brand Lite profiles (palette, heading/body font, optional logo,
    glossary defaults) live in a `brandProfiles` Dexie table as app data, never
    in the project document (`brandService.ts`, Settings ▸ Brand).
  - New-project and prompt-a-template both offer a profile selector
    (`applyBrandProfile` sets palette/glossary in one undo step; fonts flow
    through workspace defaults; logo insertion copies the blob into the
    project's own asset store).
  - No governance/enforcement — profiles only seed defaults, always
    overridable, and are excluded from `.calqo` exports (app-backup round-trip
    only, no keys).
- [ ] Improve AI reliability for current flows.
  - Better preflight: selected provider, key status, network expectations,
    provider-specific caveats.
  - Clear validation failures with repair guidance.
  - Ensure diagnostics and logs redact secrets.
  - Keep mock mode deterministic for tests and demos.
- [ ] Polish mobile quick edit.
  - Finish touch target and reduced-transparency audit.
  - Ensure bottom sheets trap focus correctly and do not expose desktop-only
    dead ends.
  - Keep phone scoped to quick edits, image replacement, color, layers,
    translation, export/share.
- [ ] Update user documentation.
  - Getting started.
  - Browser vs desktop differences.
  - `.calqo` portability.
  - AI provider setup and privacy.
  - Translation workflow.
  - Export fidelity and recommended formats.
  - Troubleshooting and recovery.

### Acceptance Criteria

- A new user can start from a local example, adapt it, translate it, export it,
  and save a portable file without needing a tutorial video.
- The app has enough starter material to demonstrate its strengths without
  pretending to be a template marketplace.
- Brand defaults speed up creation but never block manual overrides.
- AI and translation failures are recoverable, explainable, and testable.

### Explicitly Deferred Beyond 1.0

- Full brand kit governance.
- Template slot constraints and campaign-set generation.
- Hosted template/gallery infrastructure.
- Full blank-canvas phone authoring.
- Animation/video.
- Real-time collaboration.

---

## Milestone E - MCP Live Drawing Labs

**Target:** opt-in labs track after beta foundations are stable.  
**Theme:** let local coding agents safely create editable Calqo graphics without
making the main app less stable.

This milestone is now specified by `docs/calqo-tauri-agent-drawing-plan.md`,
which supersedes the older browser-companion plan: agent drawing is
**Tauri-only**, served by an MCP server embedded in the Rust backend, with no
companion process or sidecar. Browser users keep the static agent-skill
`.calqo` fallback. It is not a beta blocker and should not block 1.0 unless it
is complete, disabled by default, and well tested.

### MVP Scope

- [x] Add shared MCP operation contracts.
  - `src/editor/mcp/operationSchemas.ts`
  - command-level operations, not arbitrary project patches.
  - Zod validation for add/update/delete/reorder/group/artboard operations.
  - `baseRevision` support to avoid stale writes.
- [x] Add an in-app operation executor.
  - Resolve project/artboard.
  - Validate all operations before mutation.
  - Apply one batch through `editProject` as one undoable step.
  - Return changed ids and structured warnings.
  - Keep autosave, history, and selection behavior in the normal command path.
- [x] Add read-only context serializers.
  - App status.
  - Active project/artboard summary.
  - Current schema/operation guidance.
  - Social preset list.
  - No raw secrets, no default asset blobs.
- [x] Add "Agent drawing" UI.
  - Disabled by default.
  - Pairing status.
  - Session token.
  - Permission mode: off, read only, ask, session write.
  - Audit log of tool calls and changed layer ids.
- [x] Implement the embedded Tauri Rust MCP server.
  - `rmcp` Streamable HTTP server on `127.0.0.1`, bearer-token auth.
  - Auto-start with the app when the settings toggle is enabled.
  - Tools: `calqo_get_status`, `calqo_get_guide`, `calqo_request_control`,
    `calqo_create_project`, `calqo_apply_operations`,
    `calqo_validate_operations`, `calqo_get_preview`.
  - Copy-paste host setup snippets (Claude Code, Codex CLI, generic) in the
    Agent drawing settings tab.
- [x] Keep the browser app out of scope for live drawing.
  - Browser users get the static agent-skill `.calqo` fallback instead.
  - No companion process, WebSocket bridge, or sidecar.

### Safety Requirements

- Off by default.
- Loopback only.
- Random pairing token.
- User approval before writes.
- Strict operation validation.
- Whole-project imports still go through `safeImportProject`.
- SVG imports use existing sanitization.
- No provider keys exposed through resources, logs, diagnostics, or tool output.
- No arbitrary filesystem write tool.
- Rate limits and layer-count caps.
- Audit log visible in Calqo.

### Acceptance Criteria

- A local MCP Inspector or fake client can read status/resources.
- After explicit user approval, a local agent can add/edit editable layers in
  the desktop app.
- Undo treats one agent batch as one user-visible step.
- Invalid, malicious, stale, or oversized operation payloads fail cleanly.
- Disabling Agent drawing leaves no active bridge connection.

### Not In The MVP

- Remote MCP mode.
- Multi-agent lock management.
- Agent asset library browsing.
- Tauri embedded server.
- Rich visual diff UI.
- Automatic provider calls unless the user invokes an AI tool.

---

## Milestone F - 1.0 Release Candidate

**Target:** final 1.0 gate.  
**Theme:** prove the promise, freeze scope, and ship honestly.

### Deliverables

- [ ] Declare 1.0 supported surfaces.
  - Browser.
  - PWA, if release-gated.
  - macOS desktop, if signed/notarized and tested.
  - Other desktop platforms only if built and smoke-tested.
- [ ] Freeze the schema compatibility promise.
  - Current schema fixtures.
  - Old fixture imports.
  - Corrupt/missing asset behavior.
  - Document migration expectations.
- [ ] Run the 1.0 smoke matrix.
  - Chrome and Safari browser core path.
  - Mobile viewport path.
  - PWA path if supported.
  - Tauri path if supported.
  - Import/export path with assets.
  - AI mock path.
  - Real-provider smoke only when keys are available, with no requirement for
    contributors to possess keys.
- [ ] Complete release docs.
  - README status.
  - Changelog.
  - Known limitations.
  - Privacy/local-first note.
  - Security note for API keys and optional MCP.
  - Troubleshooting.
- [ ] Cut release artifacts.
  - Version bump.
  - Git tag.
  - GitHub release.
  - Checksums.
  - Desktop artifacts if supported.
  - Static web deployment if used.

### Acceptance Criteria

- A user can complete the core PRD jobs-to-be-done:
  - make a static social post,
  - adapt it across artboards,
  - translate it,
  - generate an editable AI starting point,
  - export it,
  - save/reopen/move it.
- The release has no hidden "works only on my machine" steps.
- Known limitations are current and visible.
- Optional labs work, including MCP, cannot compromise the stable core.

---

## 4. Cut Line

For beta, ship only when Milestones A-C are complete or explicitly narrowed.

For 1.0, ship only when Milestones A-D and F are complete. Milestone E is
allowed in 1.0 only if it remains opt-in and meets its safety requirements;
otherwise it should remain behind a labs flag or move to 1.1.

The strongest 1.0 is not the one with editable HTML or a large template system.
It is the one where Calqo's existing promise feels calm: create, edit,
translate, export, save, move, recover.

---

## 5. Definition Of Done For Roadmap Items

- Status is reflected in this file and any older implementation plan whose
  status banner would otherwise mislead contributors.
- User-facing behavior has EN/FR strings.
- Adapter boundaries are preserved.
- Schema changes include migration and fixture tests.
- Import/export compatibility is considered.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm lint` passes.
- Relevant E2E smoke is added or updated.
- README/docs/known limitations change with product behavior.
- No API keys, local paths, or private asset data leak into diagnostics, logs,
  project exports, or MCP resources.
