# Calqo Browser Prototype — Detailed Implementation Plan

**Source PRD:** `PRD-calqo-v0.5.md`  
**Target artifact:** a working browser-based Calqo prototype with most v1 features, stopping before Tauri integration.  
**Primary stack:** React + TypeScript + Vite, Konva/react-konva, Zustand, Dexie, react-i18next, Tailwind, Zod.

---

## 0. Scope and guiding decisions

### 0.1 Prototype objective

Build Calqo as a fully usable browser app before adding Tauri. The prototype should allow a user to:

1. Create, open, rename, save, duplicate, and close projects in tabs.
2. Create and edit multiple artboards per project.
3. Add and manipulate text, images, shapes, groups, and SVG/icon-like objects.
4. Use a layers panel to select, rename, lock, hide, reorder, and group layers.
5. Use undo/redo per project.
6. Persist projects locally in IndexedDB via Dexie.
7. Export raster images and simple HTML wrappers.
8. Switch app UI between English and French.
9. Switch project content locale and store multilingual text variants.
10. Run basic translation and prompt-a-template flows through a provider abstraction, with a mock provider first and at least one real provider path prepared.
11. Deliver a coherent Liquid Glass-style UI in the browser with reduced-transparency fallback.
12. Defer all Tauri-specific filesystem, keychain, native-menu, vibrancy, and local-font work.

### 0.2 Explicitly out of scope for this implementation plan

These are intentionally deferred:

- Tauri shell, packaging, signing, native menus, keychain integration.
- Native macOS vibrancy APIs.
- Full editable HTML/CSS export.
- Phone editing interface.
- Animation/video.
- Marketplace/template gallery.
- Real-time collaboration.
- Print/CMYK/bleed.
- Advanced typography and OpenType controls.
- Complex vector/SVG parity for every Konva effect in the first prototype.

### 0.3 Browser-first architectural rule

Everything that will later need native support must be hidden behind an adapter boundary from day one.

Use these adapters even if the first implementation is browser-only:

- `StorageAdapter`
- `AssetStorageAdapter`
- `ExportAdapter`
- `FontAdapter`
- `AIProvider`
- `FileImportExportAdapter`
- `ClipboardAdapter`

Do not import browser APIs directly inside editor components except for narrowly scoped UI interactions such as drag/drop or file input.

### 0.4 Definition of “working prototype with most features”

A prototype is considered successful when the user can complete this scenario end-to-end:

> Create a new Instagram square visual, add background color, add text, add an image, add a shape, duplicate it into a story artboard, adjust layout, translate text into a second content locale, export PNG/WebP, save the project locally, reload the app, reopen the project, and export an HTML wrapper.

AI template generation may initially use a deterministic mock provider, but the schema, UI flow, validation, and insertion path must be real.

---

## 1. High-level delivery map

### Phase A — Browser foundation

> **Status: COMPLETE (2026-06-18).** Exit criteria met — projects can be
> created, renamed, duplicated, closed, saved, and reloaded from IndexedDB, and
> the glass app skeleton is in place. Verified in-browser (create -> persist ->
> reload -> reopen) and via unit tests. The canvas region currently shows a
> placeholder artboard frame; the live Konva stage arrives in Phase B.

Goal: get a clean, type-safe app shell with the data model, persistence, tabs, localization, and glass design primitives.

Deliverables:

- [x] Vite React TypeScript project.
- [x] Tailwind and design-token system.
- [~] React Router or internal route model. _(single-view shell; no router needed yet.)_
- [x] Zustand stores. _(uiStore, projectStore, workspaceStore; selection/history deferred to Phase B.)_
- [x] Zod-validated project schema.
- [x] Dexie persistence.
- [x] Multi-project tab workspace.
- [x] EN/FR app localization.
- [x] Browser-only adapter implementations. _(storage, asset, file, clipboard, font.)_
- [x] Mock project seed data. _(fixtureProject.)_

Exit criterion:

- [x] User can create, open, rename, duplicate, close, save, and reload projects from IndexedDB.
- [x] The UI has the intended app skeleton: tab bar, canvas region, toolbar, left layers area, right inspector area, bottom status/zoom area.

### Phase B — Canvas editor core

Goal: make the canvas useful.

Deliverables:

- Konva stage and artboard renderer.
- Selection model.
- Move/resize/rotate for core nodes.
- Text, rectangle, ellipse, line, image, and basic SVG/icon objects.
- Context toolbar and inspector controls.
- Undo/redo per project.
- Keyboard shortcuts.
- Snap-to-grid and simple alignment guides.
- In-canvas text editing through an HTML overlay.

Exit criterion:

- User can create a simple social visual and adjust its layout without using dev tools.

### Phase C — Layers, artboards, and project document polish

Goal: make the app behave like a lightweight design tool, not just a canvas demo.

Deliverables:

- Multi-artboard project support.
- Artboard presets.
- Duplicate-to-preset flow.
- Layer tree synchronized with canvas.
- Rename/reorder/show/hide/lock/group/ungroup.
- Selection across panel and canvas.
- Copy/paste and duplicate operations.
- Asset embedding strategy.

Exit criterion:

- User can manage a multi-artboard social project with meaningful layer operations.

### Phase D — Export and persistence completion

Goal: make the output useful outside the app.

Deliverables:

- PNG/JPG/WebP export with scale options.
- Transparent export.
- Export selection/single artboard/all artboards.
- HTML wrapper export.
- `.calqo` JSON import/export.
- Project autosave.
- Dirty-state tracking and unsaved-change guards.
- Copy-to-clipboard as image where browser support allows.

Exit criterion:

- User can produce files from the app and reload/import project data reliably.

### Phase E — Multilingual content and AI flows

Goal: implement Calqo’s differentiators at prototype quality.

Deliverables:

- Content locale manager.
- Per-locale text variants.
- Locale switching.
- Translation extraction/fill pipeline.
- Glossary/do-not-translate support.
- Text overflow detection and auto-fit flags.
- AI provider abstraction.
- Mock provider.
- Prompt-a-template flow generating validated project JSON.
- Translation flow generating validated text outputs.
- Optional local/Ollama or OpenAI-compatible adapter behind settings.

Exit criterion:

- User can generate a template from a prompt, edit it, add a second locale, translate text objects, inspect overflow warnings, and export both versions.

### Phase F — Prototype hardening

Goal: make the prototype stable enough to share.

Deliverables:

- Error boundaries.
- Migration-ready schema versioning.
- Performance pass for large artboards/images.
- Accessibility pass.
- Reduced-transparency mode.
- E2E tests for core flows.
- README and contributor setup.
- Known-limitations document.

Exit criterion:

- The browser app can be deployed as a static site and used without local dev knowledge.

---

## 2. Repository setup

### 2.1 Recommended repository structure

```txt
calqo/
  package.json
  pnpm-lock.yaml
  vite.config.ts
  tsconfig.json
  index.html
  README.md
  LICENSE
  docs/
    implementation-plan-browser-prototype.md
    architecture.md
    schema.md
    ai-providers.md
    known-limitations.md
  public/
    fonts/
    icons/
  src/
    app/
      App.tsx
      AppProviders.tsx
      routes.tsx
    assets/
    components/
      glass/
      common/
      dialogs/
      menus/
    editor/
      canvas/
        CalqoStage.tsx
        ArtboardView.tsx
        nodes/
          TextNode.tsx
          ShapeNode.tsx
          ImageNode.tsx
          SvgNode.tsx
          GroupNode.tsx
        overlays/
          TextEditOverlay.tsx
          SelectionOverlay.tsx
        interactions/
          pointerHandlers.ts
          keyboardShortcuts.ts
          snapping.ts
          transforms.ts
      panels/
        LayersPanel.tsx
        InspectorPanel.tsx
        ArtboardsPanel.tsx
        AssetsPanel.tsx
      toolbars/
        MainToolbar.tsx
        ContextToolbar.tsx
        ExportToolbar.tsx
      commands/
        commandTypes.ts
        projectCommands.ts
        layerCommands.ts
        artboardCommands.ts
        textCommands.ts
        imageCommands.ts
      export/
        rasterExport.ts
        htmlExport.ts
        svgExport.ts
      i18n-content/
        contentLocaleService.ts
        translationPipeline.ts
      ai/
        AIProvider.ts
        mockProvider.ts
        ollamaProvider.ts
        openAICompatibleProvider.ts
        promptTemplateService.ts
        translationService.ts
        validation.ts
    lib/
      adapters/
        storage/
          StorageAdapter.ts
          dexieStorageAdapter.ts
        assets/
          AssetStorageAdapter.ts
          dexieAssetStorageAdapter.ts
        clipboard/
          ClipboardAdapter.ts
          browserClipboardAdapter.ts
        fonts/
          FontAdapter.ts
          browserFontAdapter.ts
      db/
        dexie.ts
      schema/
        project.ts
        layer.ts
        artboard.ts
        migrations.ts
        defaults.ts
      state/
        workspaceStore.ts
        projectStore.ts
        selectionStore.ts
        uiStore.ts
        historyStore.ts
      utils/
        ids.ts
        geometry.ts
        colors.ts
        file.ts
        image.ts
        validation.ts
    locales/
      en/
        common.json
        editor.json
        errors.json
      fr/
        common.json
        editor.json
        errors.json
    styles/
      tokens.css
      glass.css
      globals.css
    tests/
      unit/
      e2e/
```

### 2.2 Package choices

Use `pnpm` unless there is a strong reason not to.

Core dependencies:

```bash
pnpm add @vitejs/plugin-react react react-dom typescript
pnpm add zustand immer zod nanoid
pnpm add konva react-konva
pnpm add dexie
pnpm add i18next react-i18next
pnpm add tailwindcss postcss autoprefixer clsx class-variance-authority
pnpm add lucide-react
pnpm add date-fns
```

Dev and quality dependencies:

```bash
pnpm add -D vite vitest @testing-library/react @testing-library/user-event jsdom
pnpm add -D playwright eslint prettier eslint-config-prettier
pnpm add -D @types/react @types/react-dom
```

Optional but useful:

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
pnpm add comlink
```

Use `@dnd-kit` for tabs/layers/artboards drag-reorder. Do not use it for Konva canvas manipulation.

### 2.3 Initial scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "lint": "eslint .",
    "format": "prettier --write .",
    "typecheck": "tsc -b"
  }
}
```

---

## 3. Data model and schema

### 3.1 Core schema principles

The project schema is the contract shared by:

- editor rendering;
- Dexie persistence;
- `.calqo` import/export;
- prompt-a-template AI output;
- future Tauri disk opening;
- future phone interface;
- future editable HTML/CSS export.

Therefore:

- schema must be versioned;
- every layer must have a stable id;
- geometry must be explicit;
- text content must support locale variants from the start;
- image assets must be referenced through asset ids, not raw data everywhere;
- unknown future fields should be ignored safely during import;
- all imported/AI-generated documents must pass Zod validation.

### 3.2 Proposed schema versioning

```ts
export const CURRENT_SCHEMA_VERSION = 1;

export interface CalqoProject {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  contentLocales: LocaleCode[];
  activeContentLocale: LocaleCode;
  palette: string[];
  artboards: CalqoArtboard[];
  assets: CalqoAssetRef[];
  metadata?: ProjectMetadata;
}
```

### 3.3 Artboard model

```ts
export interface CalqoArtboard {
  id: string;
  name: string;
  preset: ArtboardPresetId | "custom";
  width: number;
  height: number;
  background: BackgroundFill;
  layers: CalqoLayer[];
  guides?: Guide[];
  grid?: GridSettings;
}
```

### 3.4 Layer model

Use a discriminated union.

```ts
export type CalqoLayer =
  | TextLayer
  | ImageLayer
  | ShapeLayer
  | SvgLayer
  | GroupLayer;

export interface BaseLayer {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blendMode?: "normal" | "multiply" | "screen" | "overlay";
  effects?: LayerEffects;
}
```

### 3.5 Text layer

```ts
export interface TextLayer extends BaseLayer {
  type: "text";
  text: Record<LocaleCode, string>;
  style: TextStyle;
  overflow?: TextOverflowState;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  color: string;
  align: "left" | "center" | "right" | "justify";
  verticalAlign?: "top" | "middle" | "bottom";
  lineHeight: number;
  letterSpacing: number;
  stroke?: {
    color: string;
    width: number;
  };
  shadow?: ShadowStyle;
}
```

### 3.6 Shape layer

```ts
export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shape: "rect" | "ellipse" | "line" | "polygon";
  fill: Fill;
  stroke?: StrokeStyle;
  cornerRadius?: number;
  points?: number[];
}
```

### 3.7 Image layer

```ts
export interface ImageLayer extends BaseLayer {
  type: "image";
  assetId: string;
  fit: "cover" | "contain" | "stretch";
  crop?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  filters?: {
    blur?: number;
    brightness?: number;
    contrast?: number;
    saturation?: number;
  };
}
```

### 3.8 Group layer

```ts
export interface GroupLayer extends BaseLayer {
  type: "group";
  children: CalqoLayer[];
  expanded?: boolean;
}
```

### 3.9 Asset model

Do not embed every image directly in every layer. Store assets once.

```ts
export interface CalqoAssetRef {
  id: string;
  kind: "raster" | "svg";
  name: string;
  mimeType: string;
  width?: number;
  height?: number;
  storageKey: string;
  createdAt: string;
}
```

Browser prototype storage can store image blobs in Dexie and reference them from the project document.

### 3.10 Zod validation

Create one Zod schema per model:

```txt
src/lib/schema/
  project.ts
  artboard.ts
  layer.ts
  asset.ts
  fill.ts
  text.ts
  migrations.ts
```

Validation modes:

1. `strictProjectSchema` for internal saves.
2. `importProjectSchema` with migration and defaults.
3. `aiProjectSchema` with constrained defaults and repair-friendly errors.

### 3.11 Migrations

Even prototype data should be migration-ready.

```ts
type Migration = (unknownProject: unknown) => unknown;

const migrations: Record<number, Migration> = {
  1: migrateV1ToV2
};
```

For v0 prototype, implement:

- `detectSchemaVersion(raw)`;
- `migrateToCurrent(raw)`;
- `validateProject(raw)`;
- `safeImportProject(raw)`.

---

## 4. State architecture

### 4.1 Store split

Avoid one giant store.

Recommended split:

| Store | Responsibility |
|---|---|
| `workspaceStore` | open tabs, active project id, dirty state, tab order |
| `projectStore` | normalized project documents by id |
| `selectionStore` | selected artboard id, selected layer ids, hover state |
| `historyStore` | undo/redo stacks per project |
| `uiStore` | tool mode, zoom, panels, modals, theme, transparency |
| `settingsStore` | app language, AI provider settings, grid preferences |

### 4.2 Command-based mutation

All project mutations should flow through command functions.

Examples:

```ts
addTextLayer(projectId, artboardId, payload)
updateLayer(projectId, artboardId, layerId, patch)
deleteLayers(projectId, artboardId, layerIds)
reorderLayer(projectId, artboardId, layerId, targetIndex)
duplicateArtboard(projectId, artboardId, targetPreset)
setActiveContentLocale(projectId, locale)
updateTextForLocale(projectId, layerId, locale, value)
```

Each command should:

1. validate inputs;
2. produce an immutable update;
3. push undo history unless marked transient;
4. mark the project dirty;
5. schedule autosave.

### 4.3 Undo/redo model

Use patch-based history or snapshot diffs.

For prototype simplicity:

- store project-level snapshots for each committed action;
- debounce/merge pointer-drag actions into one history entry;
- cap history per project, e.g. 100 entries;
- exclude UI-only state from history;
- include artboard/layer operations and text edits.

Recommended structure:

```ts
interface ProjectHistory {
  past: CalqoProject[];
  present: CalqoProject;
  future: CalqoProject[];
}
```

For drag/resize:

- on transform start: capture baseline;
- while transforming: mutate transiently;
- on transform end: commit a single history entry.

Later optimization can switch to Immer patches.

### 4.4 Selection state

Selection should not be stored inside the project document.

```ts
interface SelectionState {
  activeProjectId: string | null;
  activeArtboardId: string | null;
  selectedLayerIds: string[];
  hoveredLayerId: string | null;
  editingTextLayerId: string | null;
}
```

Selection rules:

- clicking empty canvas clears selection;
- clicking layer selects it;
- shift-click toggles selection;
- locked layers cannot be selected by direct canvas click unless selected through the layer panel;
- hidden layers cannot be selected;
- group selection first selects the group, double-click enters group later if desired.

---

## 5. Persistence and local storage

### 5.1 Dexie tables

```ts
class CalqoDatabase extends Dexie {
  projects!: Table<ProjectRecord, string>;
  assets!: Table<AssetRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super("calqo");
    this.version(1).stores({
      projects: "id, name, updatedAt, createdAt",
      assets: "id, projectId, kind, createdAt",
      settings: "key"
    });
  }
}
```

### 5.2 Project records

```ts
interface ProjectRecord {
  id: string;
  name: string;
  schemaVersion: number;
  updatedAt: string;
  createdAt: string;
  project: CalqoProject;
}
```

### 5.3 Asset records

```ts
interface AssetRecord {
  id: string;
  projectId: string;
  kind: "raster" | "svg";
  mimeType: string;
  name: string;
  blob: Blob;
  width?: number;
  height?: number;
  createdAt: string;
}
```

### 5.4 Autosave strategy

Use a debounced autosave.

Rules:

- save 500-1000 ms after last committed change;
- save immediately before closing a tab if dirty;
- save immediately after import;
- do not autosave transient drag frames;
- show a small status indicator: `Saved`, `Saving…`, `Unsaved`, `Save failed`.

### 5.5 `.calqo` import/export

The `.calqo` file can be JSON for prototype stage.

Recommended v0 format:

```json
{
  "kind": "calqo.project",
  "formatVersion": 1,
  "project": {},
  "assets": [
    {
      "id": "asset_1",
      "name": "photo.jpg",
      "mimeType": "image/jpeg",
      "dataUrl": "data:image/jpeg;base64,..."
    }
  ]
}
```

Keep the format simple now. Later, consider ZIP-based packaging for large assets.

### 5.6 Browser storage warnings

Add a settings/help notice:

- browser storage can be cleared by the browser;
- `.calqo` export is the portable backup;
- large projects may consume local storage quota.

---

## 6. App shell and Liquid Glass UI

### 6.1 Layout

Desktop/tablet layout for prototype:

```txt
┌──────────────────────────────────────────────────────────────┐
│ Top glass app bar: logo, tabs, project actions, export, AI    │
├──────────────┬─────────────────────────────┬─────────────────┤
│ Left panel   │ Canvas workspace            │ Right inspector │
│ Layers       │ Pan/zoom neutral background │ Properties      │
│ Artboards    │ Active artboard(s)          │ Text/Image/etc. │
├──────────────┴─────────────────────────────┴─────────────────┤
│ Bottom status bar: zoom, size, selection, save state           │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Glass component primitives

Create a small component layer rather than scattering Tailwind classes.

Core components:

- `GlassPanel`
- `GlassButton`
- `GlassIconButton`
- `GlassToolbar`
- `GlassDialog`
- `GlassTabs`
- `GlassInput`
- `GlassSelect`
- `GlassSlider`
- `GlassColorPicker`
- `GlassSegmentedControl`
- `GlassPopover`
- `GlassBottomSheet` for future responsive/mobile preparation

### 6.3 Design tokens

Define tokens in CSS variables:

```css
:root {
  --calqo-radius-sm: 8px;
  --calqo-radius-md: 12px;
  --calqo-radius-lg: 18px;
  --calqo-glass-bg: rgb(255 255 255 / 0.58);
  --calqo-glass-border: rgb(255 255 255 / 0.5);
  --calqo-glass-shadow: 0 16px 50px rgb(0 0 0 / 0.12);
  --calqo-blur-md: 18px;
}
```

Support:

- light mode;
- dark mode;
- reduced transparency;
- high-contrast fallback.

### 6.4 Reduced-transparency mode

Use:

```css
@media (prefers-reduced-transparency: reduce) {
  .glass {
    backdrop-filter: none;
    background: var(--calqo-solid-surface);
  }
}
```

Also expose an app setting:

- `Auto`;
- `Glass`;
- `Solid`.

### 6.5 Accessibility requirements

Minimum bar:

- all icon buttons need labels/tooltips;
- keyboard focus visible;
- no text over glass without contrast floor;
- inspector fields are labeled;
- dialogs trap focus;
- common shortcuts documented;
- destructive operations confirm or can be undone.

---

## 7. Localization

### 7.1 App UI localization

Use `react-i18next`.

Catalogs:

```txt
src/locales/en/common.json
src/locales/en/editor.json
src/locales/en/errors.json
src/locales/fr/common.json
src/locales/fr/editor.json
src/locales/fr/errors.json
```

### 7.2 Required strings for prototype

Translate at least:

- menus;
- tool names;
- layer names/defaults;
- dialogs;
- export labels;
- errors;
- save-state messages;
- AI template dialog;
- translation dialog;
- content locale controls.

### 7.3 Language detection

Order:

1. user setting from Dexie;
2. browser language;
3. fallback to English.

### 7.4 Content locale is separate

Do not mix app UI language with project content language.

Example:

- app UI = French;
- project content active locale = Turkish.

The store should represent them separately.

---

## 8. Canvas implementation

### 8.1 Coordinate model

Use project/artboard units as CSS-independent logical pixels.

- An Instagram square artboard is `1080 x 1080` logical pixels.
- The viewport zoom controls screen display only.
- Export uses logical dimensions multiplied by pixel ratio.

### 8.2 Stage layout

Option A for prototype:

- one Konva `Stage`;
- workspace layer;
- render active artboard centered;
- optionally render inactive artboards as static previews later.

Option B for multi-artboard editing:

- same `Stage`;
- render all project artboards in a scrollable/pannable workspace;
- active artboard gets highlighted border.

Recommended path:

1. Start with one active artboard rendered.
2. Add artboard switcher/panel.
3. Add multi-artboard canvas layout only after core editor stabilizes.

### 8.3 Canvas layers

Konva layer structure:

```txt
Stage
  Layer workspaceBackground
  Layer artboardBackground
  Layer artboardContent
    Group artboardClip
      Node layers...
  Layer guides
  Layer selection
```

Use clipping on the artboard content group so objects do not visually spill outside the artboard unless a debug setting is enabled.

### 8.4 Render pipeline

Pseudo-code:

```tsx
<Stage width={viewportWidth} height={viewportHeight} scale={{ x: zoom, y: zoom }}>
  <Layer>
    <WorkspaceBackground />
    <ArtboardFrame artboard={artboard} />
    <Group clipX={0} clipY={0} clipWidth={artboard.width} clipHeight={artboard.height}>
      {artboard.layers.map(layer => <LayerRenderer key={layer.id} layer={layer} />)}
    </Group>
    <Guides />
    <SelectionTransformer />
  </Layer>
</Stage>
```

### 8.5 Layer renderer mapping

| Calqo layer | Konva node |
|---|---|
| text | `Konva.Text` |
| image | `Konva.Image` |
| rect | `Konva.Rect` |
| ellipse | `Konva.Ellipse` |
| line | `Konva.Line` |
| polygon | `Konva.Line` with `closed` |
| group | `Konva.Group` |
| SVG/icon | initially render as image from SVG data URL, later parse to paths |

### 8.6 Selection and transformer

Use one `Transformer` bound to selected node refs.

Rules:

- single selection: full transform handles;
- multi-selection: group transformer bounding box;
- locked layers: no transform handles;
- hidden layers: no selection;
- maintain aspect ratio with Shift or configured defaults;
- rotation snapping at 0/45/90 degrees.

### 8.7 Move/resize/rotate

Implementation details:

- attach `draggable={!locked}`;
- on `dragmove`, update transient position for live feedback;
- on `dragend`, commit command;
- on `transformend`, normalize scale into width/height and reset node scale to 1;
- apply minimum sizes to avoid invalid geometry;
- store rotation in degrees.

### 8.8 Text editing overlay

Konva text editing pattern:

1. User double-clicks text node or presses Enter with text selected.
2. Hide Konva text node temporarily.
3. Position an HTML `textarea` over the canvas using absolute coordinates.
4. Match font, size, line-height, color, width, rotation if feasible.
5. On blur/Escape/Cmd+Enter, commit text to active content locale.
6. Re-show Konva text.

First prototype can ignore rotated text overlay precision; display a warning/normal editor for rotated text if needed.

### 8.9 Image import

User flows:

- drag/drop image onto canvas;
- toolbar button opens file picker;
- paste image from clipboard if available.

Pipeline:

1. read image file;
2. create object URL to measure dimensions;
3. store blob in Dexie assets table;
4. insert `ImageLayer` referencing `assetId`;
5. render through cached image loader hook.

### 8.10 SVG/icon import

Prototype approach:

- accept `.svg`;
- sanitize basic SVG text;
- store as asset;
- render as image via data URL.

Later:

- parse simple paths to editable vector objects.

### 8.11 Snapping and guides

Minimum prototype snapping:

- snap to artboard edges;
- snap to artboard center horizontal/vertical;
- snap to other selected layer edges/centers;
- snap to optional grid.

Implementation:

```ts
getSnapCandidates(activeLayer, artboard, visibleLayers)
calculateNearestSnap(dragBounds, candidates, threshold = 6 / zoom)
return { dx, dy, guides }
```

Do not overbuild. Smart guides can start as simple guide lines.

### 8.12 Keyboard shortcuts

Minimum:

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+C` | Copy selected layer(s) |
| `Cmd/Ctrl+V` | Paste |
| `Cmd/Ctrl+D` | Duplicate |
| `Delete/Backspace` | Delete selected |
| `Cmd/Ctrl+A` | Select all layers in active artboard |
| `[` / `]` | Send backward / forward |
| `Cmd/Ctrl+[` / `Cmd/Ctrl+]` | Send to back / front |
| `T` | Text tool |
| `R` | Rectangle tool |
| `E` | Ellipse tool |
| `V` | Select tool |
| `Space + drag` | Pan |
| `+` / `-` | Zoom |
| `0` | Fit artboard |

Block shortcuts while text input is focused.

---

## 9. Tools and inspector

### 9.1 Tool modes

```ts
type ToolMode =
  | "select"
  | "pan"
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "image"
  | "svg";
```

### 9.2 Toolbar actions

Top/main toolbar:

- new project;
- import `.calqo`;
- save/export `.calqo`;
- undo/redo;
- add text;
- add shape;
- add image;
- prompt-a-template;
- translate;
- export.

### 9.3 Context toolbar

Based on selection:

No selection:

- artboard size;
- background fill;
- zoom;
- grid toggle.

Text layer:

- font family;
- size;
- weight;
- color;
- align;
- line height;
- letter spacing;
- shadow/stroke quick controls.

Image layer:

- replace image;
- fit mode;
- opacity;
- basic filters.

Shape layer:

- fill;
- stroke;
- corner radius;
- opacity.

Multi-selection:

- align;
- distribute;
- group;
- lock;
- hide;
- duplicate.

### 9.4 Right inspector

Build sections as collapsible groups:

- Position and size;
- Appearance;
- Text;
- Image;
- Effects;
- Content locale text;
- Export metadata later.

### 9.5 Numeric inputs

Important for design tools:

- allow typing precise values;
- support arrow increment/decrement;
- Shift for larger step;
- show units where appropriate;
- validate but do not fight user during partial input.

---

## 10. Layers panel

### 10.1 Layer tree behavior

Minimum operations:

- select layer;
- multi-select;
- rename;
- show/hide;
- lock/unlock;
- drag reorder;
- expand/collapse groups;
- create group from selected;
- ungroup;
- delete;
- duplicate.

### 10.2 Synchronization rules

- Canvas selection updates layers panel.
- Layers panel selection updates canvas.
- Hovering a layer in the panel may highlight the canvas node.
- Hidden layers render hidden and cannot be directly selected.
- Locked layers render but cannot be transformed.
- Reordering in the panel updates the array order in the artboard document.

### 10.3 Grouping

Prototype group operation:

1. collect selected layers;
2. compute bounding box;
3. create group layer at bounding box origin;
4. rewrite selected child coordinates relative to group origin;
5. remove selected layers from parent array;
6. insert group at highest selected index or top.

Ungroup operation:

1. compute group transform;
2. convert children back to parent coordinates;
3. remove group;
4. insert children at group index.

Start with no nested-group editing UI beyond expand/collapse and ungroup.

---

## 11. Artboards and presets

### 11.1 Presets

Implement the PRD presets:

| Preset id | Name | Size |
|---|---:|---:|
| `ig-square` | Instagram square | 1080×1080 |
| `ig-portrait` | Instagram portrait | 1080×1350 |
| `story` | Story / Reel cover | 1080×1920 |
| `x-post` | X / Twitter post | 1600×900 |
| `linkedin-post` | LinkedIn post | 1200×627 |
| `facebook-link` | Facebook link | 1200×630 |
| `youtube-thumbnail` | YouTube thumbnail | 1280×720 |
| `pinterest-pin` | Pinterest pin | 1000×1500 |
| `custom` | Custom | user-defined |

### 11.2 Artboard panel

Operations:

- create artboard from preset;
- rename;
- duplicate;
- delete;
- reorder;
- set active;
- duplicate to another preset.

### 11.3 Duplicate to preset

Initial algorithm:

1. duplicate source artboard;
2. set new width/height;
3. compute scale ratio based on `min(newW / oldW, newH / oldH)`;
4. scale all top-level layers around old center;
5. center result in new artboard;
6. mark layers with possible overflow if outside bounds.

This is enough for prototype and avoids complex content-aware layout.

### 11.4 Fit and overflow warnings

Add per-artboard warnings:

- layer outside artboard;
- text overflow;
- missing asset;
- unsupported export feature.

Display in status bar and export dialog.

---

## 12. Export implementation

### 12.1 Raster export

Implement first.

API:

```ts
export async function exportArtboardRaster(options: {
  project: CalqoProject;
  artboardId: string;
  format: "png" | "jpeg" | "webp";
  pixelRatio: 1 | 2 | 3;
  transparent: boolean;
  quality?: number;
}): Promise<Blob>
```

Recommended approach:

- render/export from a hidden offscreen Konva stage or temporarily isolate the artboard;
- ensure background is omitted when transparent export is requested;
- use `stage.toBlob` when available;
- fallback to `toDataURL` + fetch data URL.

### 12.2 Export dialog

Options:

- artboard: active / all;
- format: PNG / JPG / WebP;
- scale: 1x / 2x / 3x;
- background: normal / transparent where supported;
- quality for JPG/WebP;
- filename preview.

### 12.3 Batch export

In browser:

- simplest: download files one by one;
- better: add JSZip later if needed.

For prototype, one-by-one downloads are acceptable.

### 12.4 HTML wrapper export

v1 prototype HTML export should be intentionally simple.

Output:

```html
<div class="calqo-embed" style="width:1080px;height:1080px">
  <img
    alt="Calqo export"
    src="data:image/png;base64,..."
    width="1080"
    height="1080"
    style="display:block;width:100%;height:100%;object-fit:contain"
  />
</div>
```

Include a complete standalone HTML option:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Calqo Export</title>
  </head>
  <body>...</body>
</html>
```

### 12.5 SVG export

SVG is a risk area. Do not block the prototype on full SVG fidelity.

Implement a limited serializer after raster export is stable.

Minimum supported:

- rectangles;
- ellipses;
- lines/polygons;
- text with basic style;
- solid fills;
- simple strokes;
- opacity;
- rotation;
- groups;
- embedded raster images as base64.

Defer or approximate:

- gradients;
- blur;
- complex shadows;
- image filters;
- advanced text metrics.

Export dialog should show unsupported-feature warnings before SVG export.

### 12.6 Clipboard export

Use:

```ts
navigator.clipboard.write([
  new ClipboardItem({ "image/png": blob })
])
```

Fallback:

- download PNG;
- display "copy not supported by this browser".

---

## 13. Multilingual project content

### 13.1 Locale management

Project-level fields:

```ts
contentLocales: ["fr"];
activeContentLocale: "fr";
```

UI operations:

- add content locale;
- remove content locale;
- switch active content locale;
- duplicate text content from source locale;
- translate from source locale to target locale;
- set default locale.

### 13.2 Text rendering

For any text layer:

```ts
const value =
  layer.text[project.activeContentLocale] ??
  layer.text[project.contentLocales[0]] ??
  "";
```

If fallback is used, show a subtle indicator in inspector.

### 13.3 Translation extraction

Collect text layers across:

- active artboard only;
- all artboards.

Data sent to translator:

```ts
interface TranslationJob {
  sourceLocale: string;
  targetLocale: string;
  glossary: GlossaryEntry[];
  items: {
    layerId: string;
    artboardId: string;
    sourceText: string;
    context?: string;
    maxCharsHint?: number;
  }[];
}
```

### 13.4 Translation result

```ts
interface TranslationResult {
  targetLocale: string;
  items: {
    layerId: string;
    artboardId: string;
    translatedText: string;
    confidence?: number;
    notes?: string;
  }[];
}
```

Validate:

- every returned item maps to a known text layer;
- no unexpected layer ids are accepted;
- empty translation results require confirmation;
- glossary constraints are checked heuristically.

### 13.5 Glossary/do-not-translate list

Project settings:

```ts
interface GlossaryEntry {
  source: string;
  target?: string;
  mode: "do-not-translate" | "preferred-translation";
  notes?: string;
}
```

Prototype UI:

- simple table in translation dialog;
- add/remove entries;
- examples: names, institutions, acronyms.

### 13.6 Text overflow detection

After rendering a text node, detect:

- text height > layer box height;
- text width > layer box width for non-wrapped text;
- unusually small auto-fit font.

Store:

```ts
overflow: {
  hasOverflow: boolean;
  measuredAtLocale: string;
  suggestedAction: "increase-box" | "reduce-font" | "manual-check";
}
```

Prototype can compute overflow after locale switch and translation completion.

### 13.7 Auto-fit

Basic strategy:

- optional toggle per text layer: `autoFit: true`;
- minimum font size threshold;
- reduce font size until text fits;
- set overflow warning if below threshold.

Do not make auto-fit destructive by default. Prefer a warning and a "Fit text" button.

---

## 14. AI provider architecture

### 14.1 Provider interface

```ts
export interface AIProvider {
  id: string;
  label: string;
  capabilities: {
    structuredJson: boolean;
    translation: boolean;
  };
  generateTemplate(input: TemplatePromptInput): Promise<TemplatePromptResult>;
  translate(input: TranslationJob): Promise<TranslationResult>;
}
```

### 14.2 Provider implementations

Implement in this order:

1. `MockProvider`
2. `OllamaProvider` or OpenAI-compatible local endpoint
3. `OpenAICompatibleProvider` with configurable base URL and model

### 14.3 Why mock provider first

The mock provider makes AI flows testable without API availability. It should return:

- valid project document for prompt-a-template;
- predictable translation output, e.g. prefix or dictionary-based sample;
- occasional validation-failure fixture for repair testing.

### 14.4 Browser API key handling

Browser-only direct provider calls have tradeoffs:

- keys are visible to the browser runtime;
- some providers may not support CORS;
- local storage is not a secure keychain;
- Tauri will later use OS keychain.

Therefore, for prototype:

- store provider settings in Dexie only after explicit user opt-in;
- show a warning for browser key storage;
- support a "no key / mock mode";
- support local endpoint mode;
- keep the `AIProvider` abstraction independent of storage.

### 14.5 Prompt-a-template flow

UI:

1. Open dialog.
2. User selects target preset/artboard size.
3. User enters natural-language prompt.
4. Optional palette and locale options.
5. Provider returns candidate project JSON.
6. Zod validates it.
7. If valid, insert as new project or new artboard.
8. If invalid, run one repair attempt.
9. If still invalid, show structured error and allow copying raw output.

### 14.6 Template prompt constraints

Provider should be asked for:

- JSON only;
- no markdown;
- exact schema version;
- allowed layer types only;
- no external image URLs except placeholders;
- text values keyed by locale;
- all coordinates within artboard bounds where possible;
- max number of layers for prototype, e.g. 20.

### 14.7 Template insertion policy

Two options:

- create a new project from AI output;
- insert artboard into active project.

Prototype should support both eventually, but start with new project.

### 14.8 Translation flow

UI:

1. Open translation dialog.
2. Choose source locale.
3. Choose target locale.
4. Choose active artboard or all artboards.
5. Edit glossary.
6. Run translation.
7. Preview result in a table.
8. Apply.
9. Run overflow detection.
10. Show warnings.

### 14.9 JSON repair

Implement one repair function:

```ts
repairJsonLikeResponse(raw: string): unknown
```

It can:

- strip markdown fences;
- find first `{` and last `}`;
- parse JSON;
- return parse diagnostics.

Do not attempt complex repair in the first prototype. Instead, ask provider for a corrected response once if real provider is used.

---

## 15. Browser adapter layer

### 15.1 Storage adapter

```ts
export interface StorageAdapter {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<CalqoProject | null>;
  saveProject(project: CalqoProject): Promise<void>;
  deleteProject(id: string): Promise<void>;
}
```

Browser implementation: Dexie.

Future Tauri implementation: filesystem plus recent-doc index.

### 15.2 Asset storage adapter

```ts
export interface AssetStorageAdapter {
  saveAsset(projectId: string, file: File | Blob, meta: AssetMeta): Promise<CalqoAssetRef>;
  getAssetBlob(assetId: string): Promise<Blob | null>;
  deleteAsset(assetId: string): Promise<void>;
}
```

Browser implementation: Dexie blobs.

Future Tauri implementation: local project bundle or filesystem.

### 15.3 File import/export adapter

```ts
export interface FileImportExportAdapter {
  importProjectFromFile(file: File): Promise<CalqoProject>;
  exportProjectToFile(projectId: string): Promise<void>;
  downloadBlob(blob: Blob, filename: string): Promise<void>;
}
```

Browser implementation:

- file input;
- `URL.createObjectURL`;
- anchor download.

### 15.4 Font adapter

Prototype browser implementation:

- bundled fonts;
- CSS font-family list;
- maybe Google-font-like local CSS only if licensing permits.

Avoid local font enumeration in browser prototype. That belongs to Tauri or browser Local Font Access API as progressive enhancement.

### 15.5 Clipboard adapter

Browser implementation:

- read image from paste event;
- write PNG if supported;
- fallback to manual download.

---

## 16. Testing plan

### 16.1 Unit tests

Test:

- schema validation;
- migrations;
- layer geometry helpers;
- reorder operations;
- group/ungroup coordinate transforms;
- duplicate-to-preset scaling;
- translation mapping;
- mock provider outputs;
- export filename generation.

### 16.2 Component tests

Test:

- creating a project;
- switching tabs;
- selecting a layer from panel;
- inspector patch updates;
- content locale switch;
- export dialog state.

### 16.3 E2E tests

Use Playwright.

Critical flows:

1. New project → add text → edit text → save → reload → text persists.
2. Add image → export PNG.
3. Add two layers → reorder in layers panel → canvas order changes.
4. Duplicate artboard to story preset.
5. Add locale → mock translate → switch locale.
6. Prompt-a-template mock → generated project opens.
7. Import/export `.calqo`.
8. Undo/redo layer creation and transform.

### 16.4 Manual test script

Before sharing prototype, manually verify:

- app loads in Chrome, Safari, Firefox if possible;
- large 1080×1920 artboard remains usable;
- image import works with PNG/JPG/WebP;
- transparent PNG export works;
- keyboard shortcuts do not trigger while text editing;
- reduced transparency works;
- FR UI strings are not missing.

---

## 17. Performance plan

### 17.1 First constraints

Prototype performance targets:

- web first interactive < 3s on mid hardware;
- smooth manipulation for 50 layers on one artboard;
- no catastrophic memory growth after tab switching;
- image assets scaled down for preview when very large.

### 17.2 Practical measures

Implement:

- lazy load project assets only when project opens;
- cache loaded images by asset id;
- unload object URLs on project close;
- mount only active project stage;
- avoid rendering inactive tabs’ canvases;
- debounce autosave;
- throttle guide calculations during drag;
- cap history snapshots;
- compress/resize massive images on import with user confirmation.

### 17.3 Image import resizing

If image dimensions exceed a threshold, e.g. 4096 px on either side:

- warn user;
- offer "Optimize for canvas";
- downscale a copy for the project;
- keep original only if needed later.

### 17.4 Memory warnings

Add a diagnostic panel later, but for prototype:

- show warning when project assets exceed rough size threshold;
- document browser storage limitations.

---

## 18. Error handling

### 18.1 Error boundaries

Add:

- root error boundary;
- editor canvas boundary;
- AI dialog boundary;
- export boundary.

### 18.2 User-facing error style

Errors should be:

- localized;
- short;
- actionable;
- copyable for bug reports.

Example:

> Export failed because one image asset is missing. Reinsert the image or remove the layer, then try again.

### 18.3 Recovery paths

Implement:

- project validation failure on open → show repair/import dialog;
- missing asset → show placeholder node;
- AI parse failure → show raw output and validation issue;
- storage failure → prompt user to export `.calqo` backup;
- export failure → fallback to PNG if WebP/JPG fails.

---

## 19. Implementation phases in detail

## Phase A — Browser foundation

> **Status: COMPLETE (A1–A7), 2026-06-18.** Deviations from the planned tree:
> shell components live under `src/app/shell/`, commands under
> `src/editor/commands/`, and the schema is consolidated into
> `src/lib/schema/{schema,defaults,presets,migrations,fixture}.ts` rather than
> one file per model. Clipboard/font adapters are skeletons; a dedicated
> `settingsStore` was folded into `uiStore` + i18n persistence.

### A1. Scaffold the project — DONE

Tasks:

- Create Vite React TypeScript app.
- Add ESLint, Prettier, Vitest, Playwright.
- Add Tailwind.
- Add base folder structure.
- Add app-level providers.
- Add placeholder workspace layout.
- Add MIT license.
- Add initial README.

Acceptance criteria:

- `pnpm dev` opens the app.
- `pnpm build` passes.
- `pnpm test` passes with at least one smoke test.
- App renders a placeholder Calqo workspace.

### A2. Add design tokens and glass components — DONE

Tasks:

- Create `tokens.css`.
- Create light/dark CSS variables.
- Create glass utility classes.
- Implement `GlassPanel`, `GlassButton`, `GlassDialog`, `GlassTabs`.
- Add reduced-transparency fallback.
- Add app theme setting in UI store.

Acceptance criteria:

- Main workspace uses glass panels.
- Solid fallback is visibly different and usable.
- Components have focus states.

### A3. Add i18n foundation — DONE

Tasks:

- Install/configure `react-i18next`.
- Add EN/FR catalog files.
- Add language setting.
- Detect browser language.
- Add language switcher in settings.

Acceptance criteria:

- User can switch app UI between EN and FR.
- Missing keys are visible in development.
- Language setting persists.

### A4. Define project schema — DONE

Tasks:

- Create Zod schemas for project, artboard, layer, fill, asset.
- Add defaults for new project and artboard presets.
- Add schema validation helper.
- Add fixture project.

Acceptance criteria:

- New default project validates.
- Fixture project validates.
- Invalid AI-like project produces useful validation errors.

### A5. Add Dexie storage — DONE

Tasks:

- Create Dexie database.
- Implement `StorageAdapter`.
- Implement `AssetStorageAdapter` skeleton.
- Add save/list/load/delete project methods.
- Add settings persistence.

Acceptance criteria:

- Project saves to IndexedDB.
- Reloading app lists saved projects.
- Deleting project removes it from IndexedDB.

### A6. Workspace tabs — DONE

Tasks:

- Implement tab store.
- Add open/close/reorder/rename.
- Add dirty-state indicator.
- Add unsaved-changes guard.
- Add seed project creation.

Acceptance criteria:

- Multiple projects can be open.
- Active tab drives workspace.
- Dirty indicator updates after edits.
- Closing dirty tab prompts or autosaves according to chosen policy.

### A7. Browser adapters — DONE

Tasks:

- Add `downloadBlob`.
- Add basic import/export JSON helpers.
- Add clipboard adapter skeleton.
- Add font adapter with bundled/default fonts.

Acceptance criteria:

- Browser-specific code is isolated.
- Editor components do not directly depend on Dexie.

---

## Phase B — Canvas editor core

### B1. Konva stage shell

Tasks:

- Add `CalqoStage`.
- Render workspace background.
- Render active artboard frame.
- Render artboard background.
- Add zoom and pan.
- Add fit-to-artboard.

Acceptance criteria:

- Active artboard appears at correct aspect ratio.
- Zoom and fit work.
- Coordinates remain logical artboard pixels.

### B2. Render basic layers

Tasks:

- Implement layer renderer switch.
- Render text layers.
- Render rectangle/ellipse/line/polygon.
- Render image placeholder if missing asset.
- Render groups recursively.

Acceptance criteria:

- Fixture project renders correctly.
- Hidden layers do not render.
- Opacity and rotation apply.

### B3. Add layer creation tools

Tasks:

- Add select/text/rect/ellipse/line/image tools.
- Add toolbar buttons and shortcuts.
- Add default styles.
- Add click-to-place and drag-to-create behavior.

Acceptance criteria:

- User can add text, rect, ellipse, line.
- New layer becomes selected.
- Undo removes created layer.

### B4. Selection and transformation

Tasks:

- Implement node refs registry.
- Implement single selection.
- Implement multi-selection.
- Implement Konva transformer.
- Implement drag, resize, rotate.
- Normalize transform data into schema.
- Respect locked/hidden states.

Acceptance criteria:

- User can move, resize, rotate layers.
- Locked layer cannot be transformed.
- Drag/transform creates one undo entry.

### B5. Inspector editing

Tasks:

- Add position/size fields.
- Add fill/stroke controls.
- Add opacity slider.
- Add text controls.
- Add image fit controls.
- Add background controls.

Acceptance criteria:

- Inspector changes update canvas immediately.
- Numeric edits are undoable.
- Invalid dimensions are rejected gracefully.

### B6. Text editing overlay

Tasks:

- Add double-click text editing.
- Add Enter-to-edit shortcut.
- Position textarea overlay.
- Commit on blur/Cmd+Enter.
- Cancel on Escape.
- Update active content locale value.

Acceptance criteria:

- User can edit text in place.
- Editing does not trigger global shortcuts.
- Text persists after save/reload.

### B7. Image import

Tasks:

- Add file picker.
- Add drag/drop.
- Add image measurement.
- Save blob to Dexie.
- Insert image layer.
- Render image asset.
- Add replace image action.

Acceptance criteria:

- User can import PNG/JPG/WebP.
- Image persists after reload.
- Missing image shows placeholder rather than crashing.

### B8. Undo/redo

Tasks:

- Implement history store.
- Wrap commands.
- Add keyboard shortcuts.
- Add toolbar buttons.
- Merge drag/transform into single entries.
- Cap history length.

Acceptance criteria:

- Undo/redo works for create, delete, move, resize, style, text.
- Undo is per project/tab.
- Switching tabs does not mix histories.

### B9. Snapping and guides

Tasks:

- Implement artboard edge/center candidates.
- Implement layer edge/center candidates.
- Draw temporary guide lines.
- Add snap toggle.

Acceptance criteria:

- Dragging near center/edges snaps.
- Guides disappear after drag.
- Snap can be disabled.

---

## Phase C — Layers and artboards

### C1. Layers panel basic tree

Tasks:

- Display layers in z-order.
- Select on click.
- Rename inline.
- Toggle visibility.
- Toggle lock.
- Delete/duplicate.
- Show layer type icons.

Acceptance criteria:

- Panel and canvas selection stay synchronized.
- Hidden/locked behavior matches canvas.

### C2. Drag reorder

Tasks:

- Add `@dnd-kit` sortable tree/list.
- Support top-level reorder first.
- Add nested reorder later if stable.
- Update artboard layer array.

Acceptance criteria:

- Dragging in layers panel changes visual stacking order.
- Operation is undoable.

### C3. Group/ungroup

Tasks:

- Add group command.
- Add ungroup command.
- Add group rendering.
- Add expand/collapse in panel.
- Add group selection.

Acceptance criteria:

- Selected layers can be grouped.
- Group can be moved/scaled.
- Ungroup restores visual placement.
- Operation is undoable.

### C4. Artboard panel

Tasks:

- Display artboards.
- Add preset dropdown.
- Add create/rename/duplicate/delete/reorder.
- Add active artboard selection.

Acceptance criteria:

- Project can hold multiple artboards.
- Active artboard changes canvas and layers panel.
- Artboard operations persist.

### C5. Duplicate to preset

Tasks:

- Implement size conversion algorithm.
- Add UI action.
- Add overflow warnings.
- Preserve background and layers.

Acceptance criteria:

- User can duplicate IG square into Story.
- Content is centered and scaled.
- Result is editable.

### C6. Copy/paste/duplicate

Tasks:

- Serialize selected layers internally.
- Paste with offset.
- Duplicate selected.
- Copy across artboards within same project.
- Copy across open project tabs if feasible.

Acceptance criteria:

- User can duplicate and paste layers.
- New ids are generated.
- Asset references remain valid.

---

## Phase D — Export and import

### D1. Raster export

Tasks:

- Build hidden/offscreen export renderer.
- Export active artboard to PNG.
- Add JPG/WebP support.
- Add pixel ratio.
- Add transparent background option.
- Add quality option for JPG/WebP.

Acceptance criteria:

- Exported image has correct dimensions.
- 2x/3x exports scale correctly.
- Transparent PNG has transparent background when requested.

### D2. Export dialog

Tasks:

- Add export modal.
- Add format/scale/background controls.
- Add active/all artboard choice.
- Add filename builder.
- Add warnings area.

Acceptance criteria:

- User can export without knowing technical details.
- Missing/unsupported features are flagged.

### D3. Batch export

Tasks:

- Iterate artboards.
- Generate filenames.
- Trigger downloads.
- Add progress state.

Acceptance criteria:

- User can export all artboards.
- Browser does not freeze for typical projects.

### D4. HTML wrapper export

Tasks:

- Generate PNG data URL.
- Wrap in sized HTML/CSS.
- Offer copy HTML and download `.html`.
- Include standalone and snippet modes.

Acceptance criteria:

- Downloaded HTML opens in browser and displays visual.
- Snippet embeds correctly in a simple page.

### D5. `.calqo` export/import

Tasks:

- Serialize project and assets.
- Convert assets to data URLs.
- Download JSON `.calqo`.
- Import and validate.
- Restore assets to Dexie.
- Resolve id collisions.

Acceptance criteria:

- Exported project can be reimported.
- Reimported project renders identically enough for prototype.
- Invalid file shows useful error.

### D6. Limited SVG export

Tasks:

- Add serializer for supported layer types.
- Embed raster images.
- Add transform handling.
- Warn on unsupported effects.

Acceptance criteria:

- Simple shape/text designs export as SVG.
- Unsupported features do not silently disappear without warning.

---

## Phase E — Content locales and AI

### E1. Content locale UI

Tasks:

- Add content locale selector.
- Add add/remove locale dialog.
- Add duplicate source content to new locale.
- Add active locale indicator.

Acceptance criteria:

- Switching active content locale changes rendered text.
- Text edits apply only to active content locale.
- Missing locale text falls back visibly.

### E2. Translation data pipeline

Tasks:

- Implement text extraction.
- Implement glossary model.
- Implement translation job/result schemas.
- Implement apply translation command.
- Add overflow detection after apply.

Acceptance criteria:

- Mock translation fills target locale.
- Existing source text remains unchanged.
- Overflow warnings appear where relevant.

### E3. Translation dialog

Tasks:

- Select source/target locales.
- Select active artboard/all artboards.
- Manage glossary entries.
- Preview translation results.
- Apply/cancel.

Acceptance criteria:

- User can translate all text in active artboard through mock provider.
- User can inspect result before applying.

### E4. AI provider settings

Tasks:

- Add provider settings modal.
- Add mock provider default.
- Add local/OpenAI-compatible endpoint fields.
- Store settings in Dexie.
- Add browser key warning.

Acceptance criteria:

- Mock provider works with no setup.
- Settings persist.
- No AI code is hardwired into UI components.

### E5. Prompt-a-template service

Tasks:

- Define prompt input schema.
- Define AI output schema.
- Implement mock template generator.
- Implement validation.
- Add repair attempt helper.
- Insert result as new project.

Acceptance criteria:

- User can create a project from a prompt using mock provider.
- Generated project is fully editable.
- Invalid output path is handled.

### E6. Real provider path

Tasks:

- Implement OpenAI-compatible adapter with configurable base URL/model.
- Implement Ollama/local endpoint adapter if feasible.
- Add timeout/abort.
- Add structured JSON instructions.
- Add validation/repair retry.

Acceptance criteria:

- A developer can point the app to a local compatible endpoint and generate a valid template.
- Failure does not break editor state.
- The mock provider remains available.

### E7. AI prompt hardening

Tasks:

- Add maximum layer count.
- Add allowed colors/palette guidance.
- Add allowed font list.
- Add preset-specific canvas dimensions.
- Add schema summary in prompt.
- Add validation diagnostics.

Acceptance criteria:

- At least 80% of mock/controlled provider outputs validate.
- Invalid provider output is understandable to the user/developer.

---

## Phase F — Hardening and shareable prototype

### F1. Save/load reliability pass

Tasks:

- Add autosave stress tests.
- Test tab closing.
- Test reload while dirty.
- Test import id collisions.
- Test storage quota failure path.

Acceptance criteria:

- User does not lose work during normal prototype usage.
- Save errors are visible.

### F2. Performance pass

Tasks:

- Profile canvas with 50 layers.
- Profile image-heavy project.
- Add memoization where useful.
- Lazy mount only active stage.
- Clear object URLs.

Acceptance criteria:

- Editing remains responsive on typical laptop hardware.
- Memory does not grow indefinitely after image import/delete loops.

### F3. Accessibility and keyboard pass

Tasks:

- Audit focus handling.
- Add aria labels.
- Add shortcut cheat sheet.
- Add dialog focus trap.
- Ensure contrast in glass UI.
- Validate reduced-transparency mode.

Acceptance criteria:

- App is usable by keyboard for major UI operations outside canvas manipulation.
- No unlabeled core buttons.

### F4. Browser compatibility pass

Tasks:

- Test Chrome.
- Test Safari.
- Test Firefox.
- Document unsupported features per browser.
- Add fallbacks for clipboard/export differences.

Acceptance criteria:

- Core edit/save/export path works in at least Chrome and Safari.
- Firefox limitations are documented if any.

### F5. Documentation

Tasks:

- Write README.
- Write contributor setup.
- Write architecture note.
- Write schema note.
- Write AI providers note.
- Write known limitations.
- Add screenshots/GIF later.

Acceptance criteria:

- A new developer can run the app.
- A tester knows what is expected to work.
- Tauri-deferred items are explicit.

---

## 20. Suggested milestone schedule

This is a build-order estimate, not a public release plan.

### Milestone 1 — App foundation

Includes Phase A.

Output:

- usable shell;
- local project persistence;
- tabs;
- i18n;
- default project fixture.

### Milestone 2 — First editable canvas

Includes B1-B6.

Output:

- text and shapes editable on canvas;
- inspector;
- undo/redo;
- text editing overlay.

### Milestone 3 — Images, layers, and artboards

Includes B7, C1-C5.

Output:

- image import;
- layers panel;
- multi-artboard support;
- duplicate-to-preset.

### Milestone 4 — Exportable prototype

Includes D1-D5.

Output:

- raster export;
- HTML wrapper export;
- `.calqo` import/export;
- reliable save/reload.

This is the first major "usable prototype" checkpoint.

### Milestone 5 — Differentiated prototype

Includes E1-E7.

Output:

- content locales;
- translation flow;
- prompt-a-template flow;
- mock/local AI provider architecture.

This is the target "working prototype with most features" checkpoint.

### Milestone 6 — Shareable browser prototype

Includes Phase F.

Output:

- deployable browser app;
- documented limitations;
- basic tests;
- performance and accessibility pass.

---

## 21. Acceptance checklist for the target prototype

### Project/workspace

- [ ] Create project from preset.
- [ ] Open multiple projects as tabs.
- [ ] Rename project.
- [ ] Duplicate project.
- [ ] Close tab.
- [ ] Dirty-state indicator works.
- [ ] Autosave works.
- [ ] Reload restores project list.
- [ ] Export/import `.calqo` works.

### Canvas

- [ ] Render active artboard.
- [ ] Pan and zoom.
- [ ] Fit to artboard.
- [ ] Add text.
- [ ] Edit text in place.
- [ ] Add rectangle.
- [ ] Add ellipse.
- [ ] Add line/polygon.
- [ ] Add image.
- [ ] Add SVG/icon as image-backed layer.
- [ ] Move/resize/rotate.
- [ ] Multi-select.
- [ ] Snap to artboard center/edges.
- [ ] Basic smart guides.
- [ ] Undo/redo.

### Layers

- [ ] Select from layers panel.
- [ ] Rename layer.
- [ ] Reorder layer.
- [ ] Hide/show.
- [ ] Lock/unlock.
- [ ] Duplicate/delete.
- [ ] Group/ungroup.
- [ ] Panel stays synchronized with canvas.

### Artboards

- [ ] Create artboard from each preset.
- [ ] Rename/delete/reorder.
- [ ] Duplicate artboard.
- [ ] Duplicate to preset with best-effort scaling.
- [ ] Overflow warnings.

### Styling/inspector

- [ ] Position and size controls.
- [ ] Fill color.
- [ ] Stroke.
- [ ] Opacity.
- [ ] Corner radius.
- [ ] Text font/size/weight/color/alignment.
- [ ] Line height/letter spacing.
- [ ] Basic shadow/stroke for text if feasible.
- [ ] Image fit mode.

### Localization

- [ ] EN UI.
- [ ] FR UI.
- [ ] Language persists.
- [ ] Missing keys visible in dev.

### Multilingual content

- [ ] Add content locale.
- [ ] Switch active content locale.
- [ ] Text variants stored per locale.
- [ ] Missing text fallback.
- [ ] Translation dialog.
- [ ] Glossary/do-not-translate entries.
- [ ] Mock translation.
- [ ] Overflow detection.

### AI

- [ ] Provider abstraction.
- [ ] Mock provider.
- [ ] Provider settings.
- [ ] Prompt-a-template dialog.
- [ ] Generated project validates.
- [ ] Generated project opens and is editable.
- [ ] Error path for invalid AI output.
- [ ] Optional local/OpenAI-compatible endpoint path.

### Export

- [ ] PNG export.
- [ ] JPG export.
- [ ] WebP export.
- [ ] 1x/2x/3x scale.
- [ ] Transparent PNG.
- [ ] Export all artboards.
- [ ] Copy PNG to clipboard where supported.
- [ ] HTML wrapper export.
- [ ] Limited SVG export with warnings.

### Hardening

- [ ] Root error boundary.
- [ ] Canvas error boundary.
- [ ] Storage failure handling.
- [ ] Missing asset placeholder.
- [ ] Reduced-transparency mode.
- [ ] Keyboard shortcut cheat sheet.
- [ ] Chrome/Safari smoke test.
- [ ] README and known limitations.

---

## 22. Prototype cut lines

When schedule or complexity pressure appears, cut in this order:

1. Full SVG export fidelity. Keep limited SVG or defer to post-prototype.
2. Advanced shadows/blur/filter parity.
3. Nested group editing beyond group/ungroup.
4. Batch export ZIP packaging.
5. Firefox clipboard support.
6. Real provider support. Keep mock/local endpoint flow if needed.
7. Complex smart guides/distribution UI.
8. SVG/icon editability. Keep image-backed SVG.
9. Advanced text overlay support for rotated text.
10. Multi-artboard simultaneous canvas view.

Do not cut:

- schema validation;
- undo/redo;
- local persistence;
- raster export;
- text editing;
- content locale model;
- adapter boundaries;
- basic i18n;
- project import/export.

These are foundational and expensive to retrofit later.

---

## 23. Risks and mitigations

### 23.1 Konva export discrepancies

Risk:

- canvas rendering and exported image differ.

Mitigation:

- use the same render code for live stage and export stage where possible;
- create export snapshots from project schema, not DOM state;
- add visual/manual test fixtures.

### 23.2 Text metrics across browsers

Risk:

- text wraps differently in Chrome/Safari/Firefox.

Mitigation:

- ship a bundled default font;
- use consistent CSS/font loading before canvas render;
- flag overflow rather than promising perfect auto-layout.

### 23.3 IndexedDB asset size

Risk:

- large images overwhelm browser storage.

Mitigation:

- asset size warnings;
- optional image downscaling;
- `.calqo` backup export;
- avoid embedding duplicate images in project JSON.

### 23.4 AI output reliability

Risk:

- provider returns invalid JSON or unusable coordinates.

Mitigation:

- Zod validation;
- strict prompt;
- max layer count;
- mock tests;
- repair retry;
- safe fallback templates.

### 23.5 Browser key storage

Risk:

- browser is not a secure keychain.

Mitigation:

- mock mode by default;
- local endpoint mode preferred;
- explicit warning before storing provider keys;
- later Tauri keychain adapter.

### 23.6 MVP sprawl

Risk:

- too many design-tool features slow the prototype.

Mitigation:

- build through acceptance scenarios;
- keep advanced SVG, phone UI, and editable HTML out;
- prefer simple commands that can be improved later.

---

## 24. Developer task order

A practical ordered list for an AI coding agent or human developer:

1. Scaffold Vite React TypeScript app.
2. Add formatting, linting, testing, Tailwind.
3. Add folder structure.
4. Add i18n provider with EN/FR.
5. Add design tokens and glass components.
6. Add Zod schema and default project fixture.
7. Add Dexie database and storage adapter.
8. Add workspace store and tabs.
9. Render placeholder project shell.
10. Add Konva stage with active artboard.
11. Render text and shape layers from fixture.
12. Add layer creation commands.
13. Add selection and transformer.
14. Add inspector for geometry and style.
15. Add text editing overlay.
16. Add undo/redo history.
17. Add image asset storage and rendering.
18. Add layers panel selection/rename/hide/lock.
19. Add layer reorder.
20. Add group/ungroup.
21. Add artboard panel and presets.
22. Add duplicate-to-preset.
23. Add snapping/guides.
24. Add raster export.
25. Add export dialog.
26. Add `.calqo` import/export.
27. Add HTML wrapper export.
28. Add limited SVG export.
29. Add content locale model and UI.
30. Add translation extraction/apply pipeline.
31. Add mock AI provider.
32. Add translation dialog.
33. Add prompt-a-template dialog.
34. Add local/OpenAI-compatible provider adapter if feasible.
35. Add overflow detection.
36. Add error boundaries.
37. Add autosave/dirty-state hardening.
38. Add Playwright E2E tests.
39. Add README and known limitations.
40. Deploy static browser prototype.

---

## 25. First prototype UI map

### Main screen

```txt
Top bar
  - Calqo logo/name
  - Project tabs
  - New/open/import
  - Undo/redo
  - AI template
  - Translate
  - Export
  - Settings

Left sidebar
  - Artboards section
  - Layers section

Center
  - Canvas workspace
  - Active artboard
  - Guides and selection

Right sidebar
  - Inspector
  - Position/size
  - Appearance
  - Text/image/shape controls
  - Content locale text controls

Bottom
  - Zoom
  - Active artboard size
  - Selection summary
  - Save state
```

### Dialogs

Must-have dialogs:

- New project;
- Import project;
- Export;
- Settings;
- AI provider settings;
- Prompt-a-template;
- Translate;
- Add content locale;
- Unsaved changes;
- Error details.

---

## 26. Recommended internal conventions

### 26.1 IDs

Use `nanoid` with prefixes:

```ts
project_...
artboard_...
layer_...
asset_...
```

### 26.2 Layer naming defaults

Localized display names are UI-only. Stored names can be stable:

- `Text 1`
- `Rectangle 1`
- `Image 1`

Later, app can localize generated names at creation time.

### 26.3 Units

Store all sizes as numbers in artboard logical pixels. Do not store CSS units in schema.

### 26.4 Colors

Store colors as hex or rgba strings. Normalize simple colors to hex when possible.

### 26.5 Dates

Use ISO strings.

### 26.6 Commands

Every editor action that changes the project document should be implemented as a command, not as ad hoc component state mutation.

### 26.7 Validation

Validate at boundaries:

- import;
- AI output;
- save in development;
- before export.

Do not run full Zod validation on every pointer move.

---

## 27. Minimal data fixtures

Create fixtures for testing and demos:

1. `blank-ig-square`
2. `announcement-fr-tr-en`
3. `image-heavy-story`
4. `many-layers-stress`
5. `unsupported-svg-export-features`
6. `ai-template-valid`
7. `ai-template-invalid`

These fixtures will accelerate testing and make regressions obvious.

---

## 28. Final browser-prototype release criteria

The prototype can be called ready when all are true:

- It builds as a static browser app.
- It has a clear visual identity consistent with Liquid Glass direction.
- It works without Tauri.
- It uses the final-ish project schema.
- It persists projects in IndexedDB.
- It imports/exports `.calqo`.
- It edits text/images/shapes with layers and artboards.
- It exports PNG/JPG/WebP and HTML wrapper.
- It has EN/FR app UI.
- It supports multilingual text variants and mock translation.
- It supports prompt-a-template through a validated mock or local provider.
- It documents what is deferred to Tauri.
- It has enough tests to protect core flows.

---

## 29. Tauri handoff notes for later

Do not implement these now, but prepare for them:

- replace browser `StorageAdapter` with filesystem/project-bundle adapter;
- replace browser key storage with OS keychain;
- add native file open/save dialogs;
- add local font enumeration;
- add macOS vibrancy/window controls;
- add native share/export integration;
- add app updater/signing/distribution;
- add OS-level menus and shortcuts.

The browser prototype should require minimal editor changes when these adapters arrive.

