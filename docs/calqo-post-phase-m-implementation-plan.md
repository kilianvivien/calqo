# Calqo Post-Phase-M Implementation Plan

**Source PRD:** `PRD-calqo-v0.5.md`  
**Builds on:** `calqo-browser-prototype-implementation-plan.md` and
`calqo-post-prototype-implementation-plan.md`  
**Planning date:** 2026-06-23
**Target artifact:** a public-alpha, local-first Calqo that continues hardening
the browser app and first Tauri desktop release while opening the PRD's post-v1
work without destabilizing the editor core.

---

## 0. Current Codebase Snapshot

This plan is grounded in the repository state as of 2026-06-23 after checking
the active plans, README, package metadata, source tree, schema, renderer,
desktop scaffold, mobile shell, unit tests, and E2E smoke files.

Observed status:

- Browser foundation through the prototype plan is implemented.
- Post-prototype Phases H, I, J, K, and L are implemented and have matching
  unit or readiness coverage.
- Phase L's requested work is implemented in code (`APP_VERSION`, repository
  URL, GitHub toolbar button, status-bar version, localized labels). Current
  package metadata reports `0.2.0`, while the README release notes still refer
  to the first public DMG release `v0.1.0`.
- Phase M is explicitly skipped/deferred in
  `calqo-post-prototype-implementation-plan.md` because it does not contain
  essential public-alpha features for Calqo at this stage.
- Phase N is implemented: README/public-alpha docs, deterministic test shims,
  the bundled sample project path, diagnostics, import recovery, and
  `e2e/phase-n-smoke.spec.ts` are present.
- Phase O is implemented: `src-tauri/`, Tauri scripts, runtime capability
  detection, native file/settings/dialog/clipboard/font adapters, native menus,
  macOS packaging metadata, and Phase O unit tests are present.
- Phase P is still not started. The current HTML export remains the simple
  raster-in-wrapper/snippet path, with editable HTML/CSS still deferred.
- Phase Q is implemented for the browser phone surface and has since grown past
  the original quick-edit list: `src/app/mobile/` now includes project browsing,
  phone stage, top bar, bottom sheets, mobile SVG insertion, fill controls,
  layers/arrange/export/import/settings/translate sheets, a crop/reframe
  overlay, and touch brush/freehand support. It is still hard-gated off in
  Tauri by `usePhoneLayout`.
- PWA install/update prompts exist (`PwaInstallPrompt`, `PwaUpdatePrompt`,
  `vite-plugin-pwa`, manifest assets), but no release phase currently treats
  PWA readiness as a gate.
- The project schema is still v1. It already includes project palette,
  glossary, locale-aware text/list content, image crop/focal point/mask/filter
  state, layer effects, blend modes, gradient/pattern/image fills, shape/text
  strokes, arrows, freehand strokes, list markers, and asset references.
- HTML export is still the PRD's v1 raster-in-wrapper export. Editable HTML/CSS
  remains post-v1.
- Storage, assets, files, clipboard, fonts, settings, and dialogs already sit
  behind adapters in `src/lib/adapters/`.
- Existing creative depth already includes image masks (rounded, circle,
  ellipse, triangle, star, hexagon), focal-point/crop/filter controls,
  gradient/pattern/image fills for shapes, text/list stroke controls, named
  solid/dashed/dotted shape strokes, freehand brush styles (smooth, marker,
  highlighter, dashed), arrows, polygons, and an SVG library. The next creative
  phase should extend this baseline rather than re-plan it.
- Recent verification commands were not re-run for this documentation edit; the
  plan reflects committed source/test presence, not a fresh green test run.

Phase M has been explicitly split/deferred before starting this plan:

- Brand kits have a schema/storage decision.
- Template gallery has a local, editable representation.
- Project QA exists as an editor-visible concept.
- Tauri/native work has an agreed adapter plan.
- Phone editing remains scoped to quick edits, light creation, and sharing, as
  in PRD 5.9. Full blank-canvas phone authoring remains out of scope.

---

## 1. Guiding Rules

- Keep the adapter boundary intact. Browser, Tauri, file, keychain, font, share,
  clipboard, and storage details must stay outside editor/UI feature code.
- The project schema remains the contract for editor state, import/export, AI
  generated projects, templates, and migrations.
- Treat schema changes as product events: bump the schema version, add forward
  migrations, test old v1 imports, and document compatibility.
- User-facing strings ship in English and French.
- Prefer non-destructive editing. Brand, template, export, and mobile features
  should reuse editable layers rather than flattening state unless the user is
  explicitly exporting.
- Keep Calqo focused: static social visuals, fast editing, multilingual content,
  prompt-a-template, local-first ownership.
- Use public-source-safe defaults: no hidden telemetry, no hosted marketplace
  dependency, no server requirement for non-AI flows.
- Every phase updates its status banner in the relevant plan and updates README
  status when user expectations change.
- Each phase must pass `pnpm typecheck`, `pnpm test`, and `pnpm lint` before it
  is marked complete.

---

## 2. Post-M Roadmap

Recommended order:

1. **Phase N - Public Alpha Readiness**
2. **Phase O - Native Desktop Foundation**
3. **Phase P - Editable HTML/CSS Export**
4. **Phase Q - Responsive Phone Quick-Edit Interface**
5. **Phase R - Creative Tooling: Frames, Strokes, And Looks**
6. **Phase S - Brand And Template Production Workflows**
7. **Phase T - Sharing, Import, And Portability Polish**
8. **Phase U - v1 Release Packaging And Distribution**

The order is deliberate. Phase N stabilizes the browser app and testing story.
Phase O creates secure/native paths for key storage and files. Phase P and Q
then build post-v1 user-facing capabilities on a healthier base. Phase R deepens
the creative primitives that templates and branded workflows will reuse. Phases
S-T turn the pieces into repeatable, portable workflows. Phase U packages and
documents the release.

---

## Phase N - Public Alpha Readiness

> **Status: COMPLETE.** Public alpha documentation, E2E smoke coverage, visual
> checkpoints, deterministic unit-test shims, sample project entry, diagnostics,
> and import recovery are implemented.

Goal: make the current browser app trustworthy enough for public testers before
adding larger platform surfaces.

### Deliverables

- [x] Reconcile documentation status.
  - Updated README status to public alpha readiness and actual implemented
    phases.
  - Updated Phase L status after coverage confirmation.
  - Marked Phase M skipped/deferred and split its relevant work forward.
- [x] Add a browser E2E smoke suite under `e2e/`.
  - Launches the app.
  - Creates a project from a preset.
  - Adds text, a shape, and an image placeholder.
  - Renames a layer.
  - Switches locale and runs mock translation.
  - Runs mock prompt-a-template.
  - Exports a PNG and reloads the project list.
- [x] Add deterministic test environment shims.
  - Provides canvas and IndexedDB-safe shims for Vitest/jsdom.
  - Keeps Playwright coverage for browser-only behaviors.
- [x] Add visual smoke checkpoints.
  - Captures the empty workspace.
  - Captures a sample project with selected layers.
  - Captures light, dark, and reduced-transparency modes.
  - Captures EN and FR chrome for the translation dialog.
- [x] Add first-run sample project handling.
  - Created one bundled editable sample project that demonstrates text, images,
    multilingual variants, and export warnings.
  - Offered it from the empty state without forcing it into every user's storage.
- [x] Add project health diagnostics.
  - Added a read-only project diagnostics inspector tab and exportable JSON.
  - Includes schema version, layer counts, artboard sizes, asset counts, warning
    counts, and provider diagnostics.
- [x] Harden error boundaries and recovery.
  - Import failures now surface a user-facing recovery modal.
  - Offers "export raw project JSON" when a document cannot fully open.
  - Failed imports do not block the rest of the workspace.

### Acceptance Criteria

- A new tester can run the app, understand the current feature set, and complete
  a create-edit-translate-export-reload path without reading source code.
- Unit tests no longer emit expected canvas/IndexedDB warning noise.
- At least one Playwright smoke path runs locally with `pnpm e2e`.
- README, implementation plans, and known limitations agree on the product
  status.

### Test Cases

- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm e2e`
- Manual Chrome smoke: create, edit, export, reload.
- Manual Safari smoke: import, edit, export, copy/share where supported.

---

## Phase O - Native Desktop Foundation

> **Status: COMPLETE.** Tauri v2 scaffolding, runtime platform selection,
> native adapters, localized native menus, secure desktop AI key storage,
> file-backed open/save, native asset/clipboard/font flows, macOS material
> polish, and macOS `.app`/`.dmg` packaging are implemented.

Goal: introduce the Tauri shell promised by the PRD without contaminating the
browser-first app with native assumptions.

### Deliverables

- [x] Scaffold Tauri v2.
  - Add `src-tauri/`.
  - Add Tauri config, icons, app metadata, and dev/build scripts.
  - Keep the existing Vite browser dev path unchanged.
- [x] Add platform selection for adapters.
  - Keep browser adapter exports as the default web path.
  - Add a small runtime/platform resolver for Tauri adapter implementations.
  - Do not import Tauri APIs directly from editor components.
- [x] Implement native settings/key storage.
  - Store AI provider secrets in OS keychain or the closest Tauri-supported
    secure storage path.
  - Keep non-sensitive settings in a normal config file or existing adapter.
  - Add migration/copy guidance for browser-stored keys without silently moving
    secrets.
- [x] Implement native file flows.
  - Open `.calqo` from disk.
  - Save and Save As `.calqo`.
  - Track file-backed dirty state separately from IndexedDB autosave state.
  - Preserve browser import/export behavior.
- [x] Implement native asset and clipboard flows where useful.
  - Drag images from Finder into the canvas.
  - Copy PNG to system clipboard from export.
  - Paste images from clipboard into the active artboard.
- [x] Implement native font access.
  - List local fonts through the font adapter.
  - Handle missing fonts gracefully when opening projects on another machine.
  - Keep browser font behavior unchanged.
- [x] Add native shell polish.
  - macOS vibrancy/material where available.
  - Native window controls and drag region.
  - Native menu items for the existing key app features across Calqo, File,
    Edit, Insert, Object, View, AI, Window, and Help, localized in EN/FR.
  - Keyboard shortcuts aligned with the web app.
- [x] Add desktop packaging.
  - Build artifacts for macOS first.
  - Document Windows/Linux expectations if not fully supported yet.
  - Keep release signing/notarization as explicit follow-up if credentials are
    not available.

### Acceptance Criteria

- `pnpm dev` still starts the browser app.
- Tauri dev starts the same editor through the native shell.
- AI keys are no longer stored in browser IndexedDB in the native app.
- `.calqo` open/save round-trips through native file dialogs.
- Native work does not introduce direct Dexie, browser storage, or Tauri imports
  inside editor/UI components outside adapter wiring.

### Test Cases

- Browser unit suite remains green.
- Tauri dev smoke: launch, create project, save to disk, reopen from disk.
- Key storage smoke: set provider key, restart app, confirm key presence without
  leaking it into exported project JSON.
- Native clipboard smoke: copy exported PNG and paste into another app.
- Native font smoke: select a local font, save, reopen.

---

## Phase P - Editable HTML/CSS Export

> **Status: NOT STARTED.**

Goal: add the PRD's post-v1 editable HTML/CSS export while keeping the existing
raster wrapper export as the reliable fallback.

### Deliverables

- [ ] Define export modes.
  - Keep "HTML raster wrapper" as the fidelity-first mode.
  - Add "HTML editable layout" as an opt-in mode.
  - Show mode-specific fidelity warnings before download.
- [ ] Build a scene-graph to DOM model.
  - Convert artboard geometry into a positioned root element.
  - Convert text and list layers into editable semantic HTML.
  - Convert shape layers into CSS boxes or inline SVG where CSS cannot express
    the shape safely.
  - Convert image and SVG layers into local asset references or data URLs based
    on export option.
  - Preserve z-order, opacity, rotation, blend mode where browser CSS supports
    it.
- [ ] Add asset packaging choices.
  - Self-contained single HTML file with data URLs.
  - Folder export with `index.html`, `styles.css`, and `assets/`.
  - Tauri-only zipped package if folder download is awkward in browsers.
- [ ] Add CSS generation.
  - Stable class names derived from layer ids.
  - CSS custom properties for palette values.
  - Responsive scale wrapper for embed contexts.
  - Font-family fallbacks and warnings for unavailable fonts.
- [ ] Add HTML preview.
  - Preview generated HTML in a sandboxed iframe.
  - Surface warnings for unsupported effects, masks, filters, and text features.
  - Allow quick copy of snippet or full document.
- [ ] Add fidelity documentation.
  - Update `docs/export-fidelity.md`.
  - Explain when to use raster wrapper, SVG, and editable HTML.

### Acceptance Criteria

- A simple post made of text, shapes, images, and icons exports to readable,
  editable HTML/CSS.
- Unsupported features do not fail silently; they either degrade visibly with a
  warning or force the raster wrapper fallback.
- Existing raster, SVG, and `.calqo` exports keep their behavior.

### Test Cases

- Unit tests for DOM serialization of text, list, shape, image, SVG, and group
  layers.
- Unit tests for CSS escaping and class-name stability.
- Snapshot tests for representative HTML output.
- Browser preview smoke for a generated export.
- Fidelity tests for rotation, opacity, z-order, and responsive scaling.

---

## Phase Q - Responsive Phone Quick-Edit Interface

> **Status: COMPLETE (browser).** A phone-only responsive shell (auto below
> 640px, hard-gated off in Tauri via `usePhoneLayout`) swaps the desktop
> titlebar/docks/inspector for a project browser and a touch-first editor:
> a single-artboard Konva stage with finger-sized handles, new bottom-sheet
> primitives, and quick-edit flows for text, locale/translation, image
> replacement, recolour/palette, layer actions, arrange/nudge, and
> export/share. EN/FR strings, focused tests, and a phone-viewport visual check
> all land. Phase P (editable HTML/CSS export) remains deferred.

### Scope

In scope:

- Browse existing projects and artboards.
- Edit text content.
- Switch content locale and run translation.
- Replace images from camera roll or camera where supported.
- Recolor elements and backgrounds.
- Move, resize, and nudge existing elements.
- Basic layer show/hide and reorder.
- Export and share through mobile browser capabilities.

Out of scope:

- Prompt-a-template authoring.
- Complex blank-canvas composition.
- Multi-element grouping and advanced arrange tools.
- Fine alignment/distribution tooling.
- SVG and editable HTML export.

### Deliverables

- [x] Add responsive shell breakpoint.
  - Replaced desktop titlebar/docks/inspector with a compact top bar, canvas
    viewport, contextual toolbar, and bottom sheets (`src/app/mobile/`).
  - Preserves desktop/tablet layout above the 640px breakpoint
    (`usePhoneLayout`), and is hard-gated off in Tauri.
  - Reuses the `.glass` recipe so reduced-transparency mode is respected.
- [x] Add phone project browser.
  - Lists local projects via the storage adapter (`MobileProjectBrowser`).
  - Opens a project and the active artboard; offers the bundled sample.
  - (Recent export/share state surface deferred — not tracked yet.)
- [x] Add mobile canvas interaction mode.
  - Renders only the active artboard stage (`MobileStage`), reusing the desktop
    `LayerRenderer`.
  - Finger-sized transform handles; tap-select, drag-move, resize, rotate.
  - No hover-only affordances; nudge lives in the Arrange sheet.
- [x] Add text quick-edit flow.
  - Select a text/list layer; edit the active-locale text in a bottom sheet.
  - Shows overflow warnings; preserves per-locale variants with locale chips.
- [x] Add locale and translation flow.
  - Switches content locale; adds target locales from the common list.
  - Runs translation with the configured provider; surfaces missing counts.
- [x] Add image replacement flow.
  - Picks from camera roll / camera (`accept="image/*"`).
  - Reuses `replaceLayerAsset`, preserving box, fit, mask, focal point, filters.
- [x] Add color and palette quick controls.
  - Recolours selected text/list/shape/SVG and the artboard background.
  - Applies project palette swatches (`ColorSheet`).
- [x] Add basic layer actions.
  - Show/hide, reorder forward/backward, select, and delete (`LayersSheet`).
- [x] Add mobile export/share.
  - Exports PNG to download; uses the Web Share API where supported with a
    localized download fallback (`ExportSheet`, reusing `share.ts`).
- [x] Add mobile performance guardrails.
  - Lazily mounts only the active artboard; heavy desktop panels are never
    mounted (shell-level swap, not hidden offscreen).
  - (Dedicated large-raster warning still relies on the existing export
    warnings rather than a phone-specific check.)

### Acceptance Criteria

- On a phone viewport, a user can open an existing social post, edit text,
  translate it, replace an image, recolor a layer, export, and share.
- The desktop editor remains unchanged in layout and capability.
- Phone UI never exposes desktop-only features in a broken or cramped state.
- The same project document opens interchangeably on desktop and phone.

### Test Cases

- Playwright mobile viewport: open project, select layer, edit text, export PNG.
- Locale switch and mock translation on mobile viewport.
- Image replacement preserves existing image layer settings.
- Touch target audit for main controls.
- Reduced-transparency mobile visual smoke.

---

## Phase R - Creative Tooling: Frames, Strokes, And Looks

> **Status: MVP CORE COMPLETE.** Non-destructive image frames (classic kinds:
> inset, centered, outside, rounded, circle, double-line, polaroid), expressive
> single-node stroke looks (plain, dashed, dotted, neon, glow, double, offset,
> outline, marker), three new brush presets (felt-tip, marker-underline,
> glow-pen), and a schema-backed sticker outline for text/shape/image/svg are
> implemented end-to-end: schema (no version bump — additive optional fields),
> patch plumbing, live `LayerRenderer`, raster-export parity (which also closed
> the prior stroke-style and image-mask raster gaps), SVG export with
> approximation warnings, desktop inspector controls, mobile parity (frame +
> sticker chips, brush presets in the draw flow), AI prompt guidance + validation
> warnings, EN/FR strings, export-fidelity docs, and focused unit tests
> (`src/tests/unit/phaseR.test.ts`). Deferred to a follow-up: the eight creative
> frames (torn paper, tape, scalloped, …), roughened stroke looks (hand-drawn,
> rough, scribble, sketch, inner), and the reusable "looks" library.

Goal: make Calqo's existing creative primitives feel richer and faster for
social visuals, especially image framing and expressive strokes, while keeping
all results editable, schema-backed, and export-aware.

### Current Baseline

Already implemented and should be preserved:

- Image layers support fit, focal point, crop, masks, filters, shadow/effects,
  blend modes, and asset replacement that preserves layer settings.
- Shape layers support rect, ellipse, line, polygon, arrow, and freehand forms.
- Shape fills support solid, linear gradient, radial gradient, generated
  patterns, and image fills.
- Shape strokes support color, width, solid/dashed/dotted styles, explicit dash
  arrays, and caps in the schema/renderer.
- Text and list layers support color, stroke width/color, shadow, typography
  presets, locale variants, and overflow diagnostics.
- Mobile already has touch brush/freehand, SVG insertion, fill controls, and
  crop/reframe UI; desktop has deeper inspector controls.

### Deliverables

- [~] Add non-destructive image frames. **(MVP: classic frames done; creative deferred.)**
  - Store frame style in schema as image-layer decoration or a reusable effect
    that can migrate cleanly from v1.
  - [x] Support classic border frames: inset, centered, outside, rounded, circle,
    double-line, and polaroid/card-like frames.
  - [ ] Support creative frames: torn paper, tape corners, photo booth strips,
    scalloped edges, postage stamp perforations, soft mat, thick poster border,
    and shadowed cutout. **(Deferred.)**
  - [x] Allow frame color, width, radius, padding, shadow, and optional caption
    strip where relevant.
  - [x] Preserve image crop/focal point/mask/filter state when applying, removing,
    or changing a frame.
- [x] Add frame presets and quick actions.
  - Add inspector presets for common social looks.
  - Add one-click "Frame image" and "Remove frame" actions from desktop and
    phone surfaces.
  - Let brand/template workflows later mark a frame as a template slot style.
  - Keep generated frames editable as normal Calqo layers or schema-backed
    decorations, not flattened pixels.
- [~] Add richer stroke styles for shapes, text, and freehand marks. **(MVP: single-node looks done; roughened looks deferred.)**
  - [x] Single-node looks: marker, neon, glow, double, offset, outline (plus
    existing solid/dashed/dotted). Roughened looks (hand-drawn, rough, scribble,
    sketch, inner) deferred.
  - [x] Add editable dash/gap controls (`dashLen`/`gap`) for custom dashed lines.
  - [x] Add line join / cap controls where Konva/export paths support them.
  - [x] Brush presets: felt-tip, marker-underline, glow pen (plus existing
    smooth/marker/highlighter/dashed). Chalk/crayon deferred (need raster texture).
- [x] Add sticker/outline treatments.
  - [x] One-click sticker outline for images/SVGs/text/shapes.
  - [x] Offset shadow/outline combinations for thumbnail-style text.
  - [x] Duplicate-node expansion when the effect can't be a single node.
- [x] Add creative stroke and frame rendering support.
  - [x] Live canvas rendering in `LayerRenderer` (via shared builder helpers).
  - [x] Raster export parity (also closed the prior stroke-style/mask raster gaps).
  - [x] SVG export with warnings for raster-only looks.
  - [x] HTML wrapper keeps the raster fidelity path.
- [ ] Add reusable looks. **(Deferred to follow-up.)**
- [x] Add AI/template compatibility.
  - [x] Prompt-a-template guidance lists supported stroke-look names.
  - [x] Unsupported-but-valid looks become warnings, not failures.
- [x] Add mobile parity for quick creative edits.
  - [x] Frame preset application/removal in the fill sheet (image layers).
  - [x] Brush/stroke-look preset selection in the draw/fill flow.
  - [x] Advanced numeric tuning kept on desktop.
- [x] Add docs and limitations.
  - [x] Updated export-fidelity docs for frame/stroke behavior.
  - [ ] Add examples to a release sample gallery once it exists.

### Acceptance Criteria

- A user can add an editable frame around an image, change the image crop, and
  export a faithful PNG without flattening the project.
- A user can create visibly distinct stroke looks for lines, shapes, freehand
  marks, and text without leaving Calqo.
- Unsupported SVG/HTML export cases surface explicit warnings.
- Frame/stroke presets survive save, import/export, duplicate-to-preset, and
  mobile/desktop round-trips.

### Test Cases

- Schema migration/import tests for frame/stroke look additions.
- Unit tests for frame preset application and removal preserving image settings.
- Renderer/export tests for frame geometry, stroke presets, and fallback
  warnings.
- Mobile quick-edit test for applying a frame preset and brush preset.
- AI validation test for supported and unsupported frame/stroke preset names.

---

## Phase S - Brand And Template Production Workflows

> **Status: NOT STARTED.**

Goal: turn Phase M's brand kits and template gallery into fast production
workflows for real social posts.

### Deliverables

- [ ] Add brand-aware project creation.
  - Create from template plus selected brand kit.
  - Apply palette, preferred fonts, logo asset, and glossary defaults.
  - Seed prompt-a-template with selected brand context.
- [ ] Add template slots.
  - Mark text/image layers as editable slots.
  - Allow image slots to specify allowed frame presets and default frame style.
  - Allow text/shape slots to specify allowed stroke/look presets.
  - Store slot names and recommended content lengths.
  - Validate required slots before export.
- [ ] Add template variants.
  - Square, portrait, story, thumbnail, and banner variants can live in one
    template family.
  - Duplicate-to-preset can reuse slot metadata, frame/stroke looks, and brand
    constraints.
- [ ] Add "make campaign set" workflow.
  - Start from one prompt/template.
  - Generate multiple artboards/presets.
  - Apply shared copy and brand palette.
  - Run QA across the set.
- [ ] Add AI brand feedback loop.
  - Let users send active brand kit, glossary, and template slot constraints to
    prompt-a-template.
  - Validate AI output against slot and brand constraints.
  - Warn when AI uses colors/fonts/frame presets/stroke looks outside the
    selected brand kit or template constraints.
- [ ] Add template authoring affordances.
  - Save current project/artboard as a template.
  - Choose thumbnail, category, and tags.
  - Keep templates local and editable.

### Acceptance Criteria

- A user can create a branded post from a template in under a minute.
- Templates remain normal editable Calqo documents or document fragments, not a
  separate incompatible format.
- Brand constraints improve speed without blocking deliberate overrides.
- AI-generated templates can be guided by local brand data without leaking it to
  providers unless the user runs an AI action.

### Test Cases

- Brand kit applied to template project.
- Slot metadata survives save/import/export.
- Frame and stroke look metadata survives template save/import/export.
- Campaign set generates multiple valid artboards.
- QA flags missing required slots and out-of-brand colors.
- Prompt-a-template request includes brand context only when requested.

---

## Phase T - Sharing, Import, And Portability Polish

> **Status: NOT STARTED.**

Goal: make Calqo projects easy to move, repair, share, and reuse across browser,
desktop, and future phone surfaces.

### Deliverables

- [ ] Add portable project packages.
  - Keep `.calqo` JSON import/export.
  - Add an optional package format that includes project JSON plus assets.
  - Decide whether this is `.calqo` as a zip container or a separate extension.
  - Keep backward compatibility with JSON `.calqo` files.
- [ ] Add missing asset repair.
  - Detect missing asset refs on open/import.
  - Let users relink or remove missing assets.
  - Preserve layer geometry when relinking.
- [ ] Improve import conflict handling.
  - Show what will be renamed or regenerated.
  - Avoid silent project/name collisions.
  - Keep asset id regeneration deterministic enough for tests.
- [ ] Add share targets.
  - Browser: Web Share API for exported PNG where supported.
  - Tauri: native share/open-in flows where available.
  - Fallback: download/export with clear copy.
- [ ] Add export presets.
  - Remember last export format/scale per project.
  - Offer common social export bundles.
  - Keep transparent PNG easy to find.
  - Include export warnings for frame/stroke looks that degrade outside raster
    formats.
- [ ] Add project cleanup tools.
  - Remove unused assets.
  - Compress oversized raster assets with explicit user consent.
  - Show storage usage per project.
- [ ] Add privacy and portability docs.
  - Explain where projects, assets, settings, and keys live in browser and
    desktop builds.
  - Explain what leaves the device during AI actions.

### Acceptance Criteria

- A project with local assets can be moved to another machine without broken
  images.
- Missing assets produce a repair path instead of mysterious blank layers.
- Export/share flows choose the best available platform capability and explain
  fallback behavior.
- Local-first privacy expectations are documented and true.

### Test Cases

- Import packaged project with multiple assets.
- Import old JSON `.calqo` file.
- Relink missing asset and verify layer state is preserved.
- Remove unused assets and confirm used assets remain.
- Browser Web Share unsupported fallback.
- Tauri share flow smoke where supported.

---

## Phase U - v1 Release Packaging And Distribution

> **Status: NOT STARTED.**

Goal: turn the public alpha into a repeatable v1 release process with verified
builds, documented limitations, and clear distribution paths.

### Deliverables

- [ ] Define release gates.
  - Browser app build passes.
  - Tauri build passes for supported platforms.
  - PWA install/update path is either verified or explicitly documented as
    experimental.
  - Core E2E smoke passes.
  - Import/export compatibility tests pass.
  - Known limitations are current.
- [ ] Add CI.
  - Install with pnpm.
  - Run typecheck, test, lint, and build.
  - Run Playwright smoke on at least Chromium.
  - Upload build artifacts where appropriate.
- [ ] Add release metadata.
  - Changelog.
  - Version bump process.
  - License and third-party notices.
  - Security/private-key handling note.
- [ ] Add public docs.
  - Getting started.
  - Browser vs desktop differences.
  - AI provider setup.
  - Creative frames, stroke looks, and export fidelity.
  - Brand kits/templates.
  - Translation workflow.
  - Export formats and fidelity.
  - Troubleshooting.
- [ ] Add sample gallery.
  - Include a small set of local sample `.calqo` files.
  - Cover social presets, multilingual content, creative frame/stroke examples,
    and brand/template examples.
  - Keep samples license-clean.
- [ ] Add distribution targets.
  - Static web deployment.
  - PWA manifest/install/update behavior for browser distribution.
  - Desktop build artifacts.
  - GitHub releases.
  - Optional homebrew/cask/app distribution later.

### Acceptance Criteria

- A contributor can reproduce a release from a clean checkout.
- A user can download or open Calqo and complete the primary PRD jobs-to-be-done.
- Release notes honestly describe supported and unsupported behavior.
- Browser and desktop builds share the same editor behavior where platform
  capabilities overlap.

### Test Cases

- Clean install and build.
- CI green on pull request.
- Import sample projects and export PNG/SVG/HTML.
- Desktop app opens bundled sample project and saves a copy.
- Docs links and commands verified from a clean checkout.

---

## 3. Cross-Phase Technical Notes

### Schema And Storage

Likely schema changes after Phase M:

- Image frame/decorations or reusable visual-effect records.
- Expanded stroke/look metadata for shapes, text/list layers, and freehand
  marks.
- Local reusable looks that can be applied across compatible layers.
- Brand kit references or embedded brand kit snapshots.
- Template slot metadata.
- Template family/variant metadata.
- Export preferences.
- Package/export provenance metadata.

Rules:

- Bump `CURRENT_SCHEMA_VERSION` for project document changes.
- Add migrations in `src/lib/schema/migrations.ts`.
- Add tests for old v1 documents.
- Keep local library records, such as reusable looks, brand kits, or templates,
  outside project JSON unless the project needs a snapshot for portability.

### Adapter Boundary

Expected new or expanded adapters:

- `keychain` or secure settings behavior under the existing settings adapter.
- `share` for browser Web Share and native share sheets.
- `package` or file adapter methods for folder/zip exports.
- `platform` capability detection for browser vs Tauri.

App/editor code should depend on typed capabilities, not platform names, unless
it is rendering platform-specific copy.

### AI And Privacy

- Brand kits, glossaries, and template slots are local data.
- Reusable creative looks, frame presets, and brand-constrained stroke presets
  are local data.
- Include them in AI requests only when the user triggers an AI action.
- Show which context will be sent before provider calls where practical.
- Keep raw diagnostics useful but avoid displaying or storing secrets.
- In Tauri, use secure storage for provider keys before encouraging real keys.

### Accessibility

Every new UI surface must cover:

- Keyboard path for desktop.
- Touch target sizing for phone.
- Reduced-transparency fallback.
- Light and dark themes.
- EN/FR strings.
- Focus trap for modal/bottom-sheet flows.
- Meaningful labels for icon-only controls.

### Performance

Watch these risk areas:

- Large raster assets in browser canvas.
- Decorative image frames and multi-pass creative stroke effects.
- Many artboards in a campaign set.
- Mobile memory from Konva stages.
- HTML preview iframes with large data URLs.
- Tauri startup time and native font enumeration.

Use lazy mounting, explicit warnings, and cancellable async work before adding
heavier abstractions.

---

## 4. Recommended Backlog After Phase U

These are intentionally outside the post-M release path:

- Animation hooks through Remotion or Rive.
- Plugin system.
- Real-time collaboration.
- Hosted marketplace.
- Editable vector drawing beyond Calqo's simple social-shape needs.
- Full phone authoring from a blank canvas.
- Advanced print/CMYK workflows.

---

## 5. Definition Of Done For Any Phase

- Status banner updated in the active plan.
- User-facing docs updated when behavior changes.
- EN/FR locale keys complete.
- No direct browser/native storage imports leak into editor/UI code.
- Import/export compatibility considered.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm lint` passes.
- New risky behavior has focused tests.
- Known limitations are updated instead of hidden.
