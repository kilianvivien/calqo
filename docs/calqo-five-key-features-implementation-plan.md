# Calqo — Five Key Features Implementation Plan

**Planning date:** 2026-07-06
**Status:** Implemented and acceptance-audited (2026-07-15) — all five features
and their browser acceptance paths are complete.
**Planning inputs:** `docs/PRD-calqo-v0.5.md`, `docs/plan.md` (Beta/1.0 roadmap),
current source tree (`src/editor/`, `src/lib/`, `src/app/`).

This plan selects five features that are not yet implemented, that address
gaps explicitly called out in the roadmap and PRD, and that most improve the
product's core promise: *create, edit, translate, export, save, move,
recover*. Each feature is scoped to land independently, in the order listed.

## Completion audit — 2026-07-15

- Missing-asset repair validates replacement kinds and is covered through
  relink, undo/redo, and warning-free export readiness.
- Asset-health thresholds persist as app settings; imports share one warning
  path and optimization previews actual encoded output before approval.
- Bundled starters ship validated thumbnails and display metadata; user starter
  saves refresh and round-trip without reopening the app.
- Brand Lite applies deterministic defaults and the offline provider emits the
  selected palette plus distinct heading/body fonts; logos export self-contained.
- Editable HTML uses structured localized fidelity warnings, preflight analysis,
  background-removal fallback, and a Chromium PNG-comparison harness.

| # | Feature | Gap it closes | Roadmap home |
|---|---------|---------------|--------------|
| 1 | Missing-asset repair & relink | "Missing assets are warned about, but the user still needs a repair/relink workflow" | Milestone B |
| 2 | Asset health & project slimming | "Package size and asset health warnings … user-approved downscale/compress" | Milestone B |
| 3 | Local starter gallery + save-as-starter | "Brand/template production workflows are not implemented" | Milestone D |
| 4 | Brand defaults (Brand Lite) | Same gap, palette/fonts/logo/glossary side | Milestone D |
| 5 | Editable HTML/CSS export | PRD differentiator; current HTML export is a raster wrapper | Post-1.0 (labs-style track) |

Shared rules for every feature (from `docs/plan.md` §5 and `CLAUDE.md`):

- Adapter boundaries preserved — no direct Dexie/browser-storage/Tauri imports
  in editor/UI code; go through `src/lib/adapters/index.ts`.
- Project mutations go through `src/editor/commands/projectCommands.ts`.
- All imported/AI-generated projects pass `safeImportProject`.
- Every user-facing string lands in `src/locales/en` **and** `src/locales/fr`.
- Liquid Glass UI from `src/components/glass/`, supporting light, dark, and
  `html[data-transparency="solid"]`.
- Schema bumps only for real document contract changes; migrations + fixture
  tests when bumped.
- `pnpm typecheck`, `pnpm test`, `pnpm lint` green; E2E smoke added or updated.

---

## Feature 1 — Missing-Asset Repair & Relink

### Why

Projects that reference missing image/SVG assets (older `.calqo` files, partial
imports, corrupted stores) currently only produce warnings. The user has no way
to fix the project short of deleting layers. This is the single biggest trust
gap in the "save, reopen, import, recover" promise and is a named Milestone B
deliverable.

### Scope

- Detect missing assets on project open, `.calqo` import, and in diagnostics.
- A **Repair Assets** modal listing each broken reference with the layers that
  use it, offering per-item actions: **Relink** (file picker), **Remove layer(s)**,
  or **Keep placeholder**.
- Relinking preserves layer geometry, frame, mask, filters, crop, and focal
  point — only the asset reference and blob change.
- Pre-export guard: unresolved missing assets surface in the export dialog
  before the user ships a broken render.

Out of scope: automatic asset re-discovery on disk, network fetching, and any
change to the `.calqo` envelope format.

### Design

- **Detection.** Add `findMissingAssets(project, assetIndex)` to
  `src/editor/diagnostics/projectDiagnostics.ts` returning
  `{ assetId, kind: 'image' | 'svg', layerRefs: LayerRef[] }[]`. Reuse it from
  three call sites: project open (workspace load path), `.calqo` import
  (`src/editor/export/calqoFile.ts` import path), and the diagnostics panel.
- **Placeholder rendering.** Canvas renderers draw a deterministic placeholder
  (checkerboard + icon) for unresolved refs instead of an empty node, so the
  layer stays selectable and its geometry visible.
- **Repair command.** New `relinkAsset(projectId, oldAssetId, newBlob)` in
  `projectCommands.ts`: stores the new blob via the assets adapter, assigns a
  fresh asset id, rewrites every layer reference (reuse the reference-walking
  logic behind `remapProjectAssetIds` in `src/editor/assets/assetRemap.ts`),
  and commits as **one undoable step**. `removeLayersForAsset` is a thin
  wrapper over existing layer deletion.
- **UI.** `src/app/shell/RepairAssetsModal.tsx`, structured like
  `ImportRecoveryModal.tsx` (focus trap via `useFocusTrap`, glass surfaces).
  Entry points: an automatic prompt when detection fires on open/import
  (dismissable — never blocks editing), a StatusBar badge while unresolved
  items remain, and a row in the export dialog's warning area.
- **Export guard.** Extend `src/editor/export/exportReadiness.ts` with a
  `missing-assets` readiness item that links to the repair modal.

### Steps

1. Detection helper + unit tests (fixtures: missing image, missing SVG, asset
   referenced by multiple layers, project with zero assets).
2. Placeholder rendering in the image/SVG canvas renderers.
3. `relinkAsset` / `removeLayersForAsset` commands + tests asserting geometry,
   frame, mask, filter, crop, and focal-point preservation and single-step undo.
4. Repair modal UI + EN/FR strings; wire the three entry points.
5. Export readiness integration.
6. E2E: import a fixture `.calqo` with a broken asset ref, relink through the
   modal, export succeeds without the warning.

### Acceptance criteria

- Opening or importing a project with missing assets shows a repair path;
  nothing silently disappears.
- Relinking is one undo step and preserves all layer styling and geometry.
- The export dialog blocks nothing but clearly flags unresolved assets.

---

## Feature 2 — Asset Health & Project Slimming

### Why

`.calqo` envelopes inline assets as data URLs, so a few phone photos can balloon
a project past what browsers comfortably re-import. The roadmap calls for size
warnings early and a user-approved downscale path. This keeps the portability
promise ("export, move, import on a fresh profile") honest.

### Scope

- Size thresholds: warn on individual raster assets above a soft limit
  (default 8 MB decoded / 4096 px on the long edge) at **import time**, and on
  total `.calqo` payload above a soft limit (default 50 MB) at **export time**.
- An **Optimize assets** flow: per-asset, show current dimensions/size, the
  proposed downscaled result (max needed display size across all uses × export
  pixel ratio, so no visible quality loss), and let the user approve per asset.
- Optimization replaces the asset blob via the same relink machinery as
  Feature 1 (fresh id, references rewritten, one undo step). The original is
  never modified in place without approval.

Out of scope: automatic/background compression, lossy format conversion
without consent, and video/animated assets.

### Design

- **Measurement.** `src/editor/assets/assetHealth.ts`: given the asset store
  index and project layers, compute per-asset decoded size, pixel dimensions,
  max rendered size across artboards (layer `w/h` × artboard export scale), and
  a `recommendedMaxEdge`. Pure function, unit-testable without a canvas.
- **Downscale.** `downscaleImageBlob(blob, maxEdge, mimeType)` using
  `createImageBitmap` + `OffscreenCanvas` where available, falling back to a
  detached `<canvas>`. Keep PNG for images with alpha; keep original format
  otherwise. Lives beside `assetHealth.ts`; no adapter change needed since it
  operates on blobs before storage.
- **Warnings.** Import path (assets adapter callers) raises a non-blocking
  toast + diagnostics entry for oversized imports. Export path: extend
  `exportWarnings.ts` / the `.calqo` export in `calqoFile.ts` to estimate
  envelope size before serialization and surface a warning row with an
  "Optimize assets…" action.
- **UI.** `OptimizeAssetsModal.tsx` in `src/app/shell/`: table of oversized
  assets with before/after size and a per-row checkbox; "Apply" runs approved
  downscales through `relinkAsset`. Also reachable from the diagnostics panel.
- **Settings.** Thresholds live in app settings (uiStore-backed defaults) so
  power users can raise them; no schema change.

### Steps

1. `assetHealth.ts` measurement + tests (multi-artboard usage, SVG excluded,
   alpha detection).
2. `downscaleImageBlob` + tests (dimension math; format preservation is
   asserted via mime type).
3. Import-time warning + diagnostics entry, EN/FR strings.
4. Export-time envelope estimate + warning with action link.
5. Optimize modal + apply path through `relinkAsset` (depends on Feature 1's
   command; if built first, extract the reference-rewrite helper now).
6. E2E: import an oversized fixture image, see the warning, optimize, export
   without the size warning.

### Acceptance criteria

- Oversized assets are flagged at import and export, never silently.
- Downscaling only happens per-asset with explicit approval, is undoable, and
  never reduces below the largest size the asset is actually rendered at.
- Envelope-size warning names the estimated size and the biggest contributors.

---

## Feature 3 — Local Starter Gallery + Save As Starter

### Why

New users currently start from a blank artboard or a prompt. The PRD's
jobs-to-be-done ("don't start me from blank") and Milestone D both call for a
small, license-clean, local starter gallery — the highest-leverage onboarding
feature that doesn't require hosting or a new schema.

### Scope

- 6–10 bundled starter projects as `.calqo` files under `public/starters/`,
  covering: IG square announcement, story/reel cover, X post, LinkedIn post,
  YouTube thumbnail, a multilingual (EN/FR/TR) card, a transparent-export
  sticker sheet, and a multi-artboard "campaign-like" project. All assets
  license-clean (self-made or CC0), documented in a `starters/CREDITS.md`.
- A **Starters** tab in `NewProjectModal.tsx` showing thumbnail cards; picking
  one clones it into a fresh project (new ids, cloned blobs).
- **Save as starter**: any open project can be saved into a local user-starter
  library; user starters appear alongside bundled ones and can be renamed and
  deleted.

Out of scope: hosted galleries, template slot constraints, template-specific
schema, sharing starters between devices (a user starter is exportable as a
normal `.calqo` file — that *is* the sharing story).

### Design

- **Bundled starters.** Plain `.calqo` envelopes fetched on demand from
  `public/starters/index.json` (id, name, preset tags, thumbnail path).
  Imported through `safeImportProject` like any other file — starters are
  ordinary projects, no new schema.
- **Instantiation.** `createProjectFromStarter(envelope)` in a new
  `src/editor/starters/starterService.ts`: run `safeImportProject`, then clone
  asset blobs, assign fresh ids, and rewrite references with
  `remapProjectAssetIds` (the same contract project copies already follow),
  assign a new project id/name, and open it in a tab via the existing
  new-project command path.
- **User starter library.** New `starters` store behind the storage adapter
  (Dexie table on web, same adapter surface for Tauri), exposed as
  `starterLibrary` from `src/lib/adapters/index.ts`. Records hold the full
  envelope plus a pre-rendered thumbnail (reuse `ProjectThumbnail` rendering to
  a data URL at save time). "Save as starter" snapshots the current project via
  the existing `.calqo` serialization in `calqoFile.ts`.
- **UI.** Extend `NewProjectModal.tsx` with a tab switcher: *Blank* /
  *Starters* / *Prompt* (if prompt entry lives here). Starter grid uses glass
  cards with thumbnail, name, size tags, and a "Bundled"/"Mine" badge; user
  starters get rename/delete via a context menu. EN/FR throughout.

### Steps

1. `starterService.ts` (instantiation + user-library CRUD through adapters) +
   unit tests: fresh ids, blob cloning, reference rewrite, validation rejects a
   malformed bundled file gracefully.
2. Storage adapter additions + Dexie table (versioned upgrade in `src/lib/db`).
3. NewProjectModal Starters tab + thumbnails + EN/FR strings.
4. Author the bundled starter files + thumbnails + `CREDITS.md`; add a unit
   test that walks `public/starters/index.json` and validates every envelope
   against the current schema (protects starters from schema drift).
5. "Save as starter" action in the project/tab menu.
6. E2E: open the gallery, instantiate a starter, edit it, and confirm the
   original starter is unchanged; save-as-starter round-trip.

### Acceptance criteria

- A new user can go from launch to editing a real design in two clicks.
- Starters are normal projects — editable, translatable, exportable — and
  instantiating one never shares asset ids or blobs with the source.
- Bundled starters are schema-validated in CI so they can't rot.

---

## Feature 4 — Brand Defaults (Brand Lite)

### Why

The canonical Calqo user (a comms manager) re-enters the same palette, fonts,
logo, and do-not-translate glossary in every project. Milestone D scopes a
deliberately small version: local defaults that seed new projects and
prompt-a-template — no governance, no campaign systems.

### Scope

- One or more named **brand profiles**, each holding: palette (ordered color
  list), preferred heading/body font families, an optional logo asset, and
  glossary defaults (do-not-translate terms).
- New projects (blank or starter) can apply a selected profile: palette becomes
  the project palette, fonts become the default text-tool fonts, glossary terms
  pre-fill the project glossary. Logo is offered as an insertable asset, never
  auto-placed.
- Prompt-a-template optionally seeds the prompt context with the active
  profile's palette and fonts (extending the existing artboard-size seeding).
- Defaults never lock anything: everything remains manually overridable
  per-project.

Out of scope: brand kit governance, enforcement/constraints, multi-brand
switching inside an existing project, shared/hosted brand kits.

### Design

- **Storage.** Brand profiles are **app data, not project data** — no schema
  bump. New `brandProfiles` store behind the storage adapter (mirroring the
  Feature 3 starter-library pattern): `{ id, name, palette: string[],
  headingFont?, bodyFont?, logoAssetId?, glossary: GlossaryEntry[] }`. Logo
  blobs live in a small app-level asset store (adapter-backed), and are
  **copied into the project's asset store on insertion** so exported `.calqo`
  files stay self-contained.
- **Application.** `applyBrandProfile(projectId, profile)` in
  `projectCommands.ts` sets palette + glossary on the project document (one
  undoable step). Font preferences flow through workspace defaults
  (`workspaceStore`) that the text tool reads when creating layers.
- **Prompt seeding.** Extend `src/editor/ai/promptTemplateService.ts` /
  `prompts.ts` context with `{ palette, headingFont, bodyFont }` when the user
  has a profile selected in the prompt dialog. No key material or asset blobs
  ever enter the prompt.
- **Translation glossary.** Project glossary already exists; profile glossary
  entries merge into the project glossary at apply time (deduplicated), so
  `translationService.ts` needs no change.
- **UI.** A **Brand** section in `AppSettingsModal.tsx` for profile CRUD
  (palette editor reusing existing color inputs, font pickers reusing the font
  adapter's family list, logo upload, glossary rows). A profile selector in
  `NewProjectModal.tsx` and `PromptTemplateDialog.tsx`. EN/FR throughout.
- **Safety.** Brand profiles are app data and must be excluded from project
  exports; app backups (`src/editor/backup/appBackup.ts`) may include them but
  must continue to exclude API keys.

### Steps

1. Adapter-backed `brandProfiles` store + Dexie upgrade + unit tests.
2. `applyBrandProfile` command + tests (palette set, glossary merge/dedupe,
   single undo step, no layer mutation).
3. Settings UI for profile CRUD + EN/FR strings.
4. New-project and prompt-dialog selectors; prompt context seeding + a
   mock-provider test asserting palette/fonts appear in the generation context
   and secrets do not.
5. Logo insert action (copies blob into project assets with a fresh id).
6. App backup round-trip test including a brand profile with a logo.

### Acceptance criteria

- Creating a project with a profile applied yields the right palette, fonts,
  and glossary with zero re-entry, and everything is still editable.
- Prompt-a-template with a profile produces layouts using the brand palette in
  mock mode (deterministic assertion).
- Exported projects are self-contained; brand data never leaks keys and never
  creates cross-project asset references.

---

## Feature 5 — Editable HTML/CSS Export

### Why

The PRD lists raster + SVG + **HTML/CSS** export as a core differentiator vs
Canva, and the current HTML export is a raster-in-wrapper. The roadmap defers
this beyond 1.0 — this plan keeps that sequencing (build after Features 1–4)
but specifies it now because it shapes how renderers should stay portable. The
PRD's own note stands: Konva node geometry maps cleanly to absolutely
positioned CSS.

### Scope

- A new export mode **"HTML (editable)"** alongside the existing raster
  wrapper, producing a single self-contained `.html` file per artboard:
  absolutely positioned `<div>`/`<p>`/`<img>`/inline-SVG nodes, inlined CSS,
  assets as data URIs, fonts referenced by family with a documented caveat.
- Fidelity tiers, surfaced per layer through the existing export-warning
  system:
  - **Faithful:** text (family/size/weight/color/alignment/line-height/letter
    spacing/shadow), images (position/size/rotation/opacity/corner radius),
    solid and linear/radial gradient fills, rect/ellipse/line shapes, groups.
  - **Approximated (warn):** blend modes (`mix-blend-mode` where CSS supports
    the same keyword; warn otherwise), blur/shadow effects via CSS `filter`.
  - **Rasterized fallback (warn):** masks, image frames/filters, freehand
    brush strokes, background-removal layers — these render as an embedded PNG
    of just that layer, keeping the rest of the document editable.
- Multi-artboard and multi-locale batch export follow the existing zip/locale
  grouping rules in `src/editor/export/`.

Out of scope: responsive/fluid layout, external asset files, CSS class
de-duplication across artboards, and any promise that round-trips HTML back
into Calqo.

### Design

- **Serializer.** `src/editor/export/htmlLayoutExport.ts`: walk the **project
  document** (not the live Konva tree — same source-of-truth choice as the SVG
  serializer in `svgExport.ts`), emitting a node per layer with
  `position:absolute; transform: rotate(...)` geometry. Share
  geometry/gradient/text-style conversion helpers with `svgExport.ts` by
  extracting them into `src/editor/export/styleConversions.ts` rather than
  duplicating.
- **Text.** Emit real text nodes with per-locale content: the active locale's
  text in the document flow. Multi-locale batch export emits one file per
  locale, consistent with existing locale grouping.
- **Rasterized-fallback layers.** Reuse the raster pipeline
  (`rasterExport.ts`) scoped to a single layer to produce the embedded PNG.
  Every rasterized layer adds an export warning naming the layer and the
  reason, in the same grouped format Milestone B specifies for SVG warnings.
- **Warnings and naming.** Extend `exportWarnings.ts` with the HTML fidelity
  tiers. Rename the existing mode to **"HTML (image wrapper)"** in the export
  dialog — this also completes the Milestone B "polish export mode language"
  item — and mark "HTML (editable)" clearly, with PNG remaining the
  recommended pixel-faithful path.
- **Validation harness.** A Playwright-based fidelity check: export a fixture
  artboard to editable HTML, screenshot it in Chromium, and compare against
  the PNG export within a tolerance. Run it for the "faithful" tier fixtures
  only; approximated tiers are covered by warning assertions instead.

### Steps

1. Extract shared style conversions from `svgExport.ts` (pure refactor, tests
   stay green).
2. Serializer for the faithful tier + unit snapshot tests on fixture projects.
3. Per-layer raster fallback + warning wiring.
4. Export dialog: new mode, renamed old mode, EN/FR strings, batch/zip and
   locale grouping.
5. Playwright fidelity comparison for faithful-tier fixtures.
6. Docs: update `docs/export-fidelity.md` with the tier table.

### Acceptance criteria

- A text-and-image social card exports to an HTML file whose text is
  selectable and editable in a code editor, and which visually matches the PNG
  export within tolerance in Chromium.
- Every approximated or rasterized layer produces a specific, grouped warning;
  no silent fidelity loss.
- The old mode can no longer be mistaken for editable output.

---

## Sequencing & Dependencies

```
Feature 1 (repair/relink)  ──► Feature 2 (slimming reuses relinkAsset)
Feature 3 (starters)       ──► Feature 4 (brand profiles reuse the adapter-backed
                                app-library pattern; profiles seed starters)
Feature 5 (editable HTML)  — independent; build last, after the export-warning
                              grouping work it depends on exists (Milestone B)
```

Recommended order: **1 → 2 → 3 → 4 → 5.** Features 1–2 harden the beta trust
story (Milestone B), 3–4 complete the 1.0 product story (Milestone D), and 5
delivers the deferred PRD differentiator without blocking 1.0.

## Definition of done (applies to each feature)

- Roadmap (`docs/plan.md`) and this file's status updated when work lands.
- EN/FR strings for all user-facing text.
- Adapter and command boundaries preserved; no schema bump unless stated
  (none of the five features requires one).
- Unit tests plus at least one E2E smoke per feature.
- `pnpm typecheck`, `pnpm test`, `pnpm lint` pass.
- No API keys, local paths, or private asset data in exports, diagnostics,
  logs, or MCP resources.
