# Calqo Post-Phase-M Implementation Plan

**Source PRD:** `PRD-calqo-v0.5.md`  
**Builds on:** `calqo-browser-prototype-implementation-plan.md` and
`calqo-post-prototype-implementation-plan.md`  
**Planning date:** 2026-06-20  
**Target artifact:** a public-ready, local-first Calqo that can ship as a
credible browser app first, then as a native-feeling Tauri desktop app, while
opening the PRD's post-v1 work without destabilizing the editor core.

---

## 0. Current Codebase Snapshot

This plan was written after reading the PRD, the prototype and post-prototype
plans, and the current repository shape.

Observed status:

- Browser foundation through the prototype plan is implemented.
- Post-prototype Phases H, I, J, and K are implemented and have matching unit
  tests.
- Phase L's requested work is implemented in code (`APP_VERSION`, repository
  URL, GitHub toolbar button, status-bar version, localized labels), and the
  source plan now marks Phase L complete.
- Phase M is explicitly skipped/deferred in
  `calqo-post-prototype-implementation-plan.md` because it does not contain
  essential public-alpha features for Calqo at this stage.
- `pnpm typecheck` passes.
- `pnpm test` passes: 13 files, 119 tests. The run is noisy because jsdom lacks
  real canvas and IndexedDB APIs in several tests.
- The README status is stale: it says the shareable browser prototype is
  complete through Phase H, while code and tests now cover later phases.
- There is a Playwright config, but no committed `e2e/` test suite yet.
- There is no Tauri scaffold yet.
- The project schema is still v1. It already includes project palette,
  glossary, locale-aware text/list content, image crop/focal point/mask/filter
  state, effects, and asset references.
- HTML export is still the PRD's v1 raster-in-wrapper export. Editable HTML/CSS
  remains post-v1.
- Storage, assets, files, clipboard, fonts, settings, and dialogs already sit
  behind adapters in `src/lib/adapters/`.

Phase M has been explicitly split/deferred before starting this plan:

- Brand kits have a schema/storage decision.
- Template gallery has a local, editable representation.
- Project QA exists as an editor-visible concept.
- Tauri/native work has an agreed adapter plan.
- Phone editing remains scoped to quick edits and sharing, as in PRD 5.9.

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
5. **Phase R - Brand And Template Production Workflows**
6. **Phase S - Sharing, Import, And Portability Polish**
7. **Phase T - v1 Release Packaging And Distribution**

The order is deliberate. Phase N stabilizes the browser app and testing story.
Phase O creates secure/native paths for key storage and files. Phase P and Q
then build post-v1 user-facing capabilities on a healthier base. Phases R-S turn
the pieces into repeatable workflows. Phase T packages and documents the release.

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

> **Status: NOT STARTED.**

Goal: introduce the Tauri shell promised by the PRD without contaminating the
browser-first app with native assumptions.

### Deliverables

- [ ] Scaffold Tauri v2.
  - Add `src-tauri/`.
  - Add Tauri config, icons, app metadata, and dev/build scripts.
  - Keep the existing Vite browser dev path unchanged.
- [ ] Add platform selection for adapters.
  - Keep browser adapter exports as the default web path.
  - Add a small runtime/platform resolver for Tauri adapter implementations.
  - Do not import Tauri APIs directly from editor components.
- [ ] Implement native settings/key storage.
  - Store AI provider secrets in OS keychain or the closest Tauri-supported
    secure storage path.
  - Keep non-sensitive settings in a normal config file or existing adapter.
  - Add migration/copy guidance for browser-stored keys without silently moving
    secrets.
- [ ] Implement native file flows.
  - Open `.calqo` from disk.
  - Save and Save As `.calqo`.
  - Track file-backed dirty state separately from IndexedDB autosave state.
  - Preserve browser import/export behavior.
- [ ] Implement native asset and clipboard flows where useful.
  - Drag images from Finder into the canvas.
  - Copy PNG to system clipboard from export.
  - Paste images from clipboard into the active artboard.
- [ ] Implement native font access.
  - List local fonts through the font adapter.
  - Handle missing fonts gracefully when opening projects on another machine.
  - Keep browser font behavior unchanged.
- [ ] Add native shell polish.
  - macOS vibrancy/material where available.
  - Native window controls and drag region.
  - Native menu items for new/open/save/export/undo/redo.
  - Keyboard shortcuts aligned with the web app.
- [ ] Add desktop packaging.
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

> **Status: NOT STARTED.**

Goal: deliver PRD 5.9: a touch-first phone interface for quick edits and
sharing of existing designs, not full authoring.

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

- [ ] Add responsive shell breakpoint.
  - Replace desktop titlebar/docks/inspector with a compact top bar, canvas
    viewport, contextual toolbar, and bottom sheets.
  - Preserve desktop/tablet layout above the breakpoint.
  - Respect reduced-transparency mode.
- [ ] Add phone project browser.
  - List local projects.
  - Open project and choose artboard.
  - Show recent export/share state if available.
- [ ] Add mobile canvas interaction mode.
  - Render only the active artboard stage.
  - Use touch handles sized for fingers.
  - Support select, move, resize, rotate if stable enough, and nudge controls.
  - Avoid hover-only affordances.
- [ ] Add text quick-edit flow.
  - Select a text/list layer.
  - Edit active locale text in a bottom sheet.
  - Show overflow warnings and quick actions.
  - Preserve per-locale variants.
- [ ] Add locale and translation flow.
  - Switch content locale.
  - Add target locale.
  - Run translation with the configured provider.
  - Surface missing/partial translation diagnostics.
- [ ] Add image replacement flow.
  - Pick from camera roll.
  - Capture from camera where browser support allows.
  - Preserve layer size, fit, crop, mask, focal point, and filters.
- [ ] Add color and palette quick controls.
  - Recolor selected shape/text/SVG.
  - Change artboard background.
  - Apply project/brand palette swatches.
- [ ] Add basic layer actions.
  - Show/hide.
  - Lock/unlock view if needed.
  - Move forward/backward or reorder in a simple list.
- [ ] Add mobile export/share.
  - Export PNG to download.
  - Use Web Share API where supported.
  - Fall back to download with clear localized messaging.
- [ ] Add mobile performance guardrails.
  - Lazy mount only active artboard.
  - Warn or degrade for very large raster assets.
  - Avoid mounting heavy desktop panels offscreen.

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

## Phase R - Brand And Template Production Workflows

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
  - Store slot names and recommended content lengths.
  - Validate required slots before export.
- [ ] Add template variants.
  - Square, portrait, story, thumbnail, and banner variants can live in one
    template family.
  - Duplicate-to-preset can reuse slot metadata and brand constraints.
- [ ] Add "make campaign set" workflow.
  - Start from one prompt/template.
  - Generate multiple artboards/presets.
  - Apply shared copy and brand palette.
  - Run QA across the set.
- [ ] Add AI brand feedback loop.
  - Let users send active brand kit, glossary, and template slot constraints to
    prompt-a-template.
  - Validate AI output against slot and brand constraints.
  - Warn when AI uses colors/fonts outside the selected brand kit.
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
- Campaign set generates multiple valid artboards.
- QA flags missing required slots and out-of-brand colors.
- Prompt-a-template request includes brand context only when requested.

---

## Phase S - Sharing, Import, And Portability Polish

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

## Phase T - v1 Release Packaging And Distribution

> **Status: NOT STARTED.**

Goal: turn the product into a releaseable open-source project with repeatable
builds, documented limitations, and clear distribution paths.

### Deliverables

- [ ] Define release gates.
  - Browser app build passes.
  - Tauri build passes for supported platforms.
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
  - Brand kits/templates.
  - Translation workflow.
  - Export formats and fidelity.
  - Troubleshooting.
- [ ] Add sample gallery.
  - Include a small set of local sample `.calqo` files.
  - Cover social presets, multilingual content, and brand/template examples.
  - Keep samples license-clean.
- [ ] Add distribution targets.
  - Static web deployment.
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

- Brand kit references or embedded brand kit snapshots.
- Template slot metadata.
- Template family/variant metadata.
- Export preferences.
- Package/export provenance metadata.

Rules:

- Bump `CURRENT_SCHEMA_VERSION` for project document changes.
- Add migrations in `src/lib/schema/migrations.ts`.
- Add tests for old v1 documents.
- Keep local library records, such as reusable brand kits or templates, outside
  project JSON unless the project needs a snapshot for portability.

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
- Many artboards in a campaign set.
- Mobile memory from Konva stages.
- HTML preview iframes with large data URLs.
- Tauri startup time and native font enumeration.

Use lazy mounting, explicit warnings, and cancellable async work before adding
heavier abstractions.

---

## 4. Recommended Backlog After Phase T

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
