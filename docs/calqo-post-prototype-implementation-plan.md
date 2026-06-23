# Calqo Post-Prototype Implementation Plan

**Source PRD:** `PRD-calqo-v0.5.md`  
**Preceded by:** `calqo-browser-prototype-implementation-plan.md`  
**Target artifact:** a browser-first Calqo that is reliable enough to share publicly and deep enough to feel like a focused Canva alternative for static social visuals.

---

## 0. Context

The browser prototype plan is complete through Phase G. Calqo now has the
foundation promised by the PRD: a React/Konva editor, local-first projects,
multi-artboard workflows, import/export, multilingual content, and an initial AI
provider layer.

This next plan moves from "prototype complete" to "credible product". The two
highest-leverage gaps are:

1. **AI reliability**, especially Gemini. The current Gemini option uses a
   generic OpenAI-compatible chat-completions adapter. That keeps the interface
   simple, but it does not use provider-specific GenAI structured-output paths,
   diagnostics, or retry behavior.
2. **Creative editing depth.** Calqo has the core canvas pieces, but a stronger
   Canva alternative needs faster image editing, richer typography/effects, and
   more tactile inspector controls such as sliders.

Small product polish should land alongside these tracks: a GitHub repository
button in the top chrome and visible version metadata in the bottom-left status
area.

---

## 1. Guiding Rules

- Keep the adapter boundary intact. Provider-specific AI work still sits behind
  `AIProvider`; native/Tauri-sensitive behavior still sits behind
  `src/lib/adapters/`.
- The project schema remains the contract for editor state, `.calqo`
  import/export, and AI-generated templates.
- Every user-facing string must be localized in English and French.
- Prefer non-destructive editing so `.calqo` files stay editable after image,
  typography, and effects changes.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm lint` before marking any phase
  complete.

---

## Phase H — AI Reliability And GenAI Provider Upgrade

> **Status: COMPLETE.**

Goal: make prompt-a-template, translation, and AI SVG generation reliable enough
for real providers, starting with Gemini.

Deliverables:

- [x] Add provider-specific AI adapters while preserving the existing
      `AIProvider` interface.
- [x] Replace Gemini's current generic OpenAI-compatible path with an official
      Gemini/GenAI implementation.
- [x] Keep OpenAI-compatible, Ollama/local, Mistral, OpenRouter, custom, and mock
      providers available.
- [x] Add structured-output request shaping for template generation and
      translation where the selected provider supports it.
- [x] Add provider diagnostics: model id, provider id, timeout, parse failure,
      validation failure, retry count, and raw-output capture for user repair.
- [x] Add one repair retry for prompt-a-template before surfacing failure.
- [x] Add template quality checks after schema validation:
      - layer count at or below the requested cap;
      - every layer fully inside artboard bounds or intentionally warned;
      - usable artboard background;
      - readable text contrast warnings where color data is available;
      - no external asset references from AI output.
- [x] Improve settings copy so users understand browser key storage limits and
      which providers are official vs compatible.

Acceptance criteria:

- Gemini template generation can return a valid editable Calqo project through a
  provider-specific adapter.
- Invalid provider output produces actionable diagnostics without losing the raw
  response.
- Partial translation output never drops requested text layers; unchanged or
  missing layers are reported.

Test cases:

- Malformed JSON with prose or markdown fences.
- Gemini-style structured output and error payloads.
- Partial translation response with missing layer ids.
- Invalid layer geometry outside artboard bounds.
- AI SVG output containing disallowed markup.
- Settings normalization for each provider preset.

---

## Phase I — Canva-Class Editing Depth: Images And Typography

> **Status: COMPLETE.** Focal-point cropping, masks, filters, typography
> presets, slider controls, and a dedicated effects section shipped. The
> interactive drag-to-crop overlay is deferred to a follow-up; image crop state
> still round-trips through the schema and a crop/focus reset is exposed.

Goal: make the editor feel substantially more powerful without turning Calqo
into a full desktop-publishing suite.

Deliverables:

- [x] Add image crop controls with a reset action. (Focal-point + fit cropping
      and a crop/focus reset shipped; an interactive drag crop box is deferred.)
- [x] Add mask shapes for images: rounded rectangle, circle, ellipse, and
      common social cutouts (triangle, star, hexagon).
- [x] Add image focal point controls for `cover` fit.
- [x] Expose image filters from the schema through the inspector:
      brightness, contrast, saturation, and blur.
- [x] Polish replace-image behavior so replacement preserves layer size,
      fit, mask, focal point, and filters, and stays undoable.
- [x] Add typography presets for common social-post roles: headline, subhead,
      kicker, body, caption, badge, and CTA.
- [x] Add richer text controls: vertical alignment, type-role presets, text
      stroke controls, and fast size/spacing sliders.
- [x] Expose schema-backed layer effects, including blur, shadow, opacity, and
      blend mode, in a dedicated effects section.

Acceptance criteria:

- A user can crop and tune an image without leaving Calqo.
- Text styling can be explored quickly from the inspector and remains precise
  enough for exact edits.
- Export/import preserves image filters, crop state, masks, and typography
  settings.

Test cases:

- Image crop/filter state round-trips through `.calqo`.
- Text presets create valid text layers with localized variants intact.
- Effects render in live canvas and export paths with documented warnings for
  unsupported SVG/HTML fidelity.

---

## Phase J — Sidebar And Inspector Usability

> **Status: COMPLETE.** Paired slider + number controls now drive the
> high-frequency values, slider drags coalesce into a single undo step, the
> inspector is regrouped (Layout / Appearance / Text / Image / Effects / Export
> notes), the empty state gives clearer guidance, and multi-selection exposes
> bulk edits that only touch compatible layers.

Goal: make common edits faster and more tactile while preserving exact numeric
control.

Deliverables:

- [x] Introduce a reusable paired slider + number field component.
- [x] Replace numeric-only fields for high-frequency values:
      opacity, rotation, stroke width, corner radius, brush size, blur, shadow
      opacity, font size, line height, letter spacing, pattern scale, and image
      filters.
- [x] Keep plain number fields for exact geometry where typing is faster:
      X, Y, W, H.
- [x] Regroup inspector sections by intent:
      Layout, Appearance, Text, Image, Effects, and Export warnings.
- [x] Add better empty-state guidance when no layer is selected.
- [x] Add multi-selection bulk edits for shared properties:
      opacity, lock, visibility, fill, stroke, font basics, and alignment.

Acceptance criteria:

- Slider edits are undoable and do not produce noisy intermediate history
  entries.
- Keyboard users can still tab through fields and enter exact values.
- The inspector remains compact enough for the existing right sidebar width.

Test cases:

- Slider + number component clamps values and emits expected numeric output.
- Undo/redo treats a drag interaction as a sensible edit step.
- Multi-selection edits only affect compatible selected layers.

---

## Phase K — Layout Power And Production Polish

> **Status: COMPLETE.** Align/distribute/stack commands surface as an Arrange
> grid in the multi-selection inspector and only touch unlocked, visible layers.
> Smart guides gained an equal-spacing pass alongside the existing center/edge/
> artboard snapping (extracted to a pure `computeSnap`). Arrow keys nudge 1px,
> Shift+Arrow 10px. Duplicate-to-preset now shows a dismissible post-resize
> review banner when layers fall out of bounds. Batch export filenames dedupe on
> collision, and export readiness adds large-raster and large-batch warnings.
> SVG/HTML fidelity is documented in `docs/export-fidelity.md`.

Goal: improve the repetitive layout tasks that make social-post production fast.

Deliverables:

- [x] Add align and distribute commands for selected layers.
- [x] Add stronger smart guides for center, edge, spacing, and artboard bounds.
- [x] Add keyboard nudging with normal and large increments.
- [x] Add spacing tools for equal gaps and quick vertical/horizontal stacks.
- [x] Improve duplicate-to-preset with post-resize review warnings.
- [x] Improve batch export naming and export readiness warnings.
- [x] Document SVG/HTML fidelity limitations for filters, masks, blend modes,
      and advanced text effects.
- [x] Add performance checks for large raster assets, many artboards, and
      inactive stage mounting.

Acceptance criteria:

- A multi-layer social post can be aligned, spaced, resized to another preset,
  and exported without manual coordinate editing.
- Export warnings identify likely output differences before download.

Test cases:

- Align/distribute commands with locked and hidden layers.
- Smart-guide calculations at different zoom levels.
- Batch export filenames for duplicate artboard names.
- Large-image project remains responsive enough for core edits.

---

## Phase L — Top/Bottom Chrome Polish

> **Status: COMPLETE.** GitHub repository chrome, localized labels, and package
> version metadata are implemented and covered by the Phase N readiness checks.

Goal: add the small product polish requested after prototype completion.

Deliverables:

- [x] Add a GitHub repository icon button in the title bar next to the export
      cluster.
- [x] Point the button to `https://github.com/kilianvivien/calqo`.
- [x] Add bottom-left version metadata sourced from package metadata.
- [x] Source the version from package metadata.
- [x] Localize labels/tooltips in English and French.

Acceptance criteria:

- The GitHub button opens the public repository in a new tab.
- The status bar shows the current package version at the bottom left.
- The additions follow the existing Liquid Glass toolbar/status styling.

Test cases:

- App smoke render still passes.
- Locale JSON remains valid.
- Typecheck verifies the package metadata import.

---

## Phase M — Other Improvement Avenues

> **Status: SKIPPED / DEFERRED.** Phase N intentionally moves ahead of this
> grab-bag phase because these items are not essential for the app at the public
> alpha stage. Relevant pieces were split forward: project QA/diagnostics lands
> in Phase N, Tauri/keychain planning moves to Phase O, and brand/template
> production workflows are deferred to Phase R.

Goal: keep a clear queue of product directions that are valuable but secondary
to AI reliability and core editing depth.

Deliverables:

- [ ] Add brand kits: reusable palettes, fonts, logos, and provider prompt
      context.
- [ ] Add a small editable template gallery for common social layouts.
- [ ] Add project QA: text overflow, contrast, missing assets, and export
      readiness.
- [ ] Plan Tauri/keychain work for secure AI key storage and native file flows.
- [ ] Keep phone editing post-v1 unless the PRD priority changes.

Acceptance criteria:

- Brand/template work improves speed without adding a marketplace dependency.
- Project QA warnings help users export cleaner visuals.
- Tauri planning does not leak native assumptions into browser editor code.

---

## Overall Test Plan

- Run `pnpm typecheck`, `pnpm test`, and `pnpm lint` for every phase.
- Add unit tests for provider adapters, AI validation/repair, settings
  normalization, and schema migration safety.
- Add component tests for slider/number paired controls and toolbar/status
  chrome.
- Add export regression tests for image filters, masks, text effects, and
  SVG/HTML warnings.
- Add one browser E2E path: generate a template with the mock provider, edit
  with sliders, translate text, export PNG, and reload the project.

---

## Release Notes Discipline

When a phase lands:

- Update the phase status banner in this document.
- Add or update tests for the behavior that changed.
- Update README status if the capability changes user expectations.
- Keep known limitations current, especially for AI provider reliability and
  export fidelity.
