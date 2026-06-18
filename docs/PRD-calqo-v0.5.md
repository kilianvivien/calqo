# PRD — Calqo
### An open-source, simple, glass-native social visual maker

**Status:** Draft v0.5 · **Author:** Kilian · **Last updated:** 2026-06-18

> Changes since v0.4: added a **post-v1 responsive phone-editing interface** scoped to essential edits + sharing (§5.9, Phase 3); phone editing reframed from a non-goal to a planned post-v1 goal.

---

## 1. Summary

Calqo (from *calque*, the French word for a design "layer") is a lightweight, open-source design tool for quickly producing **static social-media visuals** (posts, stories, thumbnails, banners). It ships as a **web React app** and a **Tauri desktop app** from a single codebase, sharing build philosophy with the GeoCarto project (Konva-based, tabbed multi-project workspace).

The pitch: *the 20% of Canva that people actually use for social posts, done well, free, with a native-feeling macOS "Liquid Glass" interface, plus two AI superpowers Canva makes awkward — prompt-a-template and one-click multilingual text.*

It is deliberately **not** a full DTP / print suite, not a presentation tool, and (for v1) not an animation tool — though it is architected so animation can be bolted on later via Remotion or Rive.

---

## 2. Goals & non-goals

### Goals
- Produce export-ready social visuals in **under 2 minutes** from a blank artboard.
- Full but *simple* canvas editing: text, images, shapes, layers, alignment, basic effects.
- Work on **multiple projects at once** via tabs; one project → **multiple sized artboards**.
- **Prompt-a-template**: describe a design in natural language, get an editable layout.
- **Multilingual projects**: hold text content in several languages and LLM-translate in place.
- A fully **EN/FR-localized app interface**.
- Export to common raster formats, SVG, and **HTML/CSS**.
- Feel native on macOS via a Liquid Glass UI; work fully in the browser too.
- Be genuinely open source (MIT) and local-first.

### Non-goals (v1)
- Real-time multiplayer collaboration.
- Video / animation rendering (architected for later, not built).
- Print/CMYK, bleed, advanced OpenType typography.
- A hosted asset marketplace or paid template store.
- Full design *authoring* on phones (v1 desktop/tablet only; a responsive phone interface for essential edits + sharing is a planned post-v1 goal — see §5.9).

---

## 3. Target users & use cases

- **Comms / social media managers** in small orgs who need on-brand posts fast (an embassy comms card in FR + TR + EN is a canonical case).
- **Indie devs / makers** wanting an open, scriptable, local-first Canva alternative.
- **Designers** wanting a fast scratchpad with clean export.

**Representative jobs-to-be-done**
1. "Make a 1080×1080 announcement, then give me the story version automatically."
2. "Translate this whole card into Turkish and English without re-laying it out."
3. "Don't start me from blank — describe what I want and give me a starting template."
4. "Export this as a transparent PNG *and* as embeddable HTML for the website."

---

## 4. Differentiators vs Canva

| | Canva | Calqo |
|---|---|---|
| Cost / openness | Freemium, closed | Free, open source (MIT), local-first |
| Surface area | Huge, overwhelming | Focused on social stills |
| AI templates | Add-on, opaque | First-class "prompt a template", BYO model |
| Multilingual | Manual | Built-in content language variants + instant translate |
| Desktop | Web/Electron | Native-feeling Tauri, small binary |
| Look & feel | Generic web UI | macOS Liquid Glass aesthetic |
| Export | Raster-centric | Raster + SVG + **HTML/CSS** |

---

## 5. Features

> Sections 5.1–5.8 are the **v1 MVP**. Section 5.9 is a planned **post-v1** addition.

### 5.1 Multi-project workspace (tabs)
- Several projects open simultaneously as **tabs** (GeoCarto-style); switch, reorder, close with unsaved-changes guard.
- Each tab holds an independent project document; the active tab drives the canvas, layers panel, and inspectors.

### 5.2 Canvas editor
- Object types: **text**, **image** (raster), **shape** (rect, ellipse, line, polygon), **group**, **icon/SVG**.
- Manipulation: move, resize, rotate, multi-select, snap-to-grid, smart alignment guides, distribute, lock, opacity, z-order.
- Text: font family/size/weight, color, alignment, line height, letter spacing, basic shadow/stroke; web-font loading + local font access (Tauri). In-canvas editing via positioned HTML-overlay textarea (Konva pattern).
- Fills: solid, linear/radial gradient, image fill; effects: shadow, blur, corner radius.
- Full undo/redo (per project/tab).
- Multiple **artboards** per project, each with its own size/preset; copy objects across artboards.

### 5.3 Layer system
- Dockable layers panel with tree (groups expand/collapse), rename, reorder (drag), show/hide, lock.
- Maps directly onto the Konva node/group hierarchy; canvas selection ↔ panel kept in sync.

### 5.4 Artboard / social presets

| Preset | Size |
|---|---|
| Instagram square | 1080×1080 |
| Instagram portrait | 1080×1350 |
| Story / Reel cover | 1080×1920 |
| X / Twitter post | 1600×900 |
| LinkedIn post | 1200×627 |
| Facebook link | 1200×630 |
| YouTube thumbnail | 1280×720 |
| Pinterest pin | 1000×1500 |
| Custom | user-defined |

"Resize / duplicate to preset" creates a new artboard and best-effort re-fits content.

### 5.5 Export
- **Raster**: PNG (incl. transparency), JPG, WebP — scale via Konva `pixelRatio` (1×/2×/3×).
- **Vector**: SVG (custom scene-graph → SVG serializer; see §10 risk).
- **HTML/CSS**: **raster-in-wrapper in v1**, editable HTML/CSS layout in a later iteration (Konva node geometry maps cleanly to absolutely-positioned CSS).
- Export single artboard, selection, or batch all artboards; copy-to-clipboard as image.

### 5.6 App localization (EN / FR)
- The **application interface** ships fully localized in **English and French** (menus, panels, dialogs, errors), switchable in settings and auto-detected on first run.
- Implemented via `react-i18next` with per-locale message catalogs.
- **Distinct from per-project content locales** (§5.8): app language = the tool's chrome; content locales = the languages a *design* is authored in.

### 5.7 Prompt-a-template (LLM)
- User describes intent ("a minimalist navy event invite with a date block and QR placeholder").
- LLM returns a **structured project document** (the same JSON schema the editor uses), not an image, so the result is fully editable.
- Constrained/validated output; on parse failure, retry with stricter prompt.
- Optional seeding with active artboard size + brand palette.

### 5.8 Multilingual content & instant translation (LLM)
- A project holds a set of **content locales** (e.g. `fr`, `tr`, `en`); one is active.
- Each text object stores a **value per locale**; switching the active content locale re-renders all text.
- "Translate to…" extracts all text objects, sends them to the LLM with target locale + context, fills the variants; layout preserved with text auto-fit / overflow flags.
- Glossary / do-not-translate list (names, institutions).

### 5.9 Phone editing interface (post-v1)
A **responsive, touch-first** interface for the web app on phones, scoped to *quick edits and sharing of existing designs* rather than full authoring (composing complex layouts from a blank canvas stays a desktop/tablet job). The same project documents and storage are reused; only the UI adapts.

**Essential feature set (minimum bar):**
- Open and browse existing projects/artboards (read sync with desktop via the same `.calqo`/Dexie store).
- **Edit text content** in place — the highest-value mobile task.
- **Switch content locale** and **run instant translation** (the "fix the FR/TR/EN card and post it" flow).
- **Replace / swap images** (from camera roll or camera).
- Recolor elements and background; adjust the project palette.
- **Move / resize / nudge** existing elements with touch-friendly handles (no precision layout tooling required).
- Basic layer actions: show/hide, reorder.
- **Export & share**: save to camera roll and invoke the native share sheet.

**Explicitly out of scope for the phone interface:** prompt-a-template authoring, multi-element grouping, fine alignment/distribution tools, SVG/HTML export. These remain desktop/tablet features.

**Design notes:** collapse the floating glass panels into bottom sheets / a contextual toolbar; honor `prefers-reduced-transparency`; lazily mount only the active artboard's Konva stage to keep memory low on device.

---

## 6. Design & UX — Liquid Glass

Target the macOS "Liquid Glass" material language: translucent, layered, light-refracting surfaces that adapt to light/dark.

- **Web approximation**: layered `backdrop-filter: blur() saturate()`, subtle inner highlights and 1px translucent borders, soft elevation shadows, a tinted-glass panel system; respects `prefers-color-scheme` and `prefers-reduced-transparency`.
- **Chrome**: floating glass toolbars/inspectors and the project tab bar over the canvas; the canvas sits on a neutral workspace.
- **Tauri**: real window vibrancy/material on macOS where available; CSS approximation fallback on web/Windows/Linux.
- **Accessibility**: contrast floors on glass; a "reduce transparency" mode swapping to solid surfaces.

A small design-token system (color, blur, radius, elevation, motion) drives both web and desktop for consistency.

---

## 7. Technical architecture

### 7.1 Stack
- **React + TypeScript + Vite**.
- **Tauri v2** desktop shell (small binary, native menus/vibrancy, local font + filesystem access).
- **Canvas**: **Konva + react-konva** — shared philosophy/patterns with GeoCarto; native layer/node model maps onto the layer system; strong raster export.
- **State**: Zustand — a `projects` store holding the array of open project documents + active tab id; per-project undo/redo stacks.
- **i18n**: `react-i18next` for app-UI localization (EN/FR).
- **Persistence**: Dexie.js / IndexedDB on web; each project exportable/importable as a single `.calqo` JSON (openable from disk in Tauri).
- **Styling**: Tailwind + a custom Liquid Glass component layer driven by design tokens.

### 7.2 Project document schema (sketch)
```jsonc
{
  "id": "uuid",
  "name": "Spring campaign",
  "contentLocales": ["fr", "tr", "en"],
  "activeContentLocale": "fr",
  "palette": ["#0A2540", "#FFFFFF", "#E8B339"],
  "artboards": [
    {
      "id": "ab1",
      "preset": "ig-square",
      "width": 1080, "height": 1080,
      "background": { "type": "solid", "color": "#0A2540" },
      "layers": [
        {
          "id": "t1",
          "type": "text",
          "x": 80, "y": 120, "w": 920, "rotation": 0,
          "style": { "font": "Inter", "size": 64, "weight": 700, "color": "#fff" },
          "text": { "fr": "Bonjour", "tr": "Merhaba", "en": "Hello" }
        }
      ]
    }
  ]
}
```
The same schema is what **prompt-a-template** emits and what the editor reads — one contract, reused. Each open tab = one such document.

### 7.3 LLM integration — bring-your-own key, local
- **Provider abstraction** layer: one interface with adapters for Anthropic, OpenAI, and a local option (Ollama). Swappable in settings.
- **BYO key** stored locally — Dexie on web; OS keychain via Tauri on desktop. Keys never leave the device except to the chosen provider.
- Two serverless call paths: *template generation* (structured JSON out) and *translation* (batched text in/out).
- Graceful offline: editor and export work with zero LLM access; AI features disabled when no key is set.

### 7.4 Export pipeline
- Raster via Konva `stage.toDataURL({ pixelRatio })` / `toCanvas`; transparency honored.
- SVG via a **custom scene-graph → SVG serializer** that walks the Konva node tree and emits SVG primitives (Konva has no native SVG export).
- HTML/CSS: v1 emits a raster `<img>` in a sized wrapper; later iteration maps Konva node geometry (x/y/w/h/rotation/styles) → absolutely-positioned styled DOM.

### 7.5 Open-source & distribution
- Public repo, **MIT** license.
- Reproducible builds; Tauri release artifacts for macOS/Win/Linux; web app deployable as static site.

---

## 8. Phasing / build order

> **v1.0 ships Phases 0–2 together.** The phases are an internal build sequence to keep a large MVP manageable, not separate public releases.

- **Phase 0 — Foundation:** repo scaffold, Tauri shell, design tokens + Liquid Glass primitives, project schema + Dexie persistence, multi-project tab store, app i18n (EN/FR), LLM provider abstraction + key storage.
- **Phase 1 — Editor core:** Konva canvas (text/image/shape/group), layers panel, artboard presets + resize, undo/redo, raster export (PNG/JPG/WebP), save/load.
- **Phase 2 — AI · content i18n · richer export:** prompt-a-template, multilingual content variants + instant translation, SVG export, HTML export (raster wrapper).
- *(→ release v1.0)*
- **Phase 3 — post-v1:** responsive phone-editing interface (§5.9), editable HTML/CSS export, template gallery, brand kits/palettes, sharing/import polish.
- **Future:** animation hooks (Remotion/Rive), plugins, collaboration.

---

## 9. Success metrics
- Time-to-first-export from blank < 2 min.
- ≥ 80% of prompt-a-template outputs render without manual JSON repair.
- Translation preserves layout (no manual re-layout) on ≥ 90% of typical cards.
- Tauri cold start < 1.5s; web first-interactive < 3s on mid hardware.

---

## 10. Risks
- **Large MVP** — all AI, content i18n, and HTML export are in v1; scope discipline and the Phase 0–2 ordering matter.
- **Konva SVG export** — no native SVG output; the custom serializer must cover text, gradients, shadows, and image fills faithfully, or SVG fidelity slips.
- **Liquid Glass on web** — `backdrop-filter` cost and cross-browser/perf; need a solid fallback.
- **Multi-tab memory** — many large open projects (with embedded images) can grow memory; consider lazy stage mounting for inactive tabs.
- **LLM JSON reliability** — mitigate with schema validation + repair retries.
- **Text auto-fit across languages** — translated strings change length; need overflow handling.
- **Font licensing** for bundled fonts.

---

## 11. Decisions log & open questions

### Resolved
- **Name:** Calqo (coined from *calque* = "layer"); npm + GitHub handle verified free at time of writing.
- **Canvas library:** Konva + react-konva (shared philosophy with GeoCarto).
- **LLM access:** bring-your-own key, stored locally (no proxy in v1).
- **License:** MIT.
- **HTML export:** raster-in-wrapper for v1; editable HTML/CSS layout post-v1.
- **App localization:** EN + FR app UI, distinct from per-project content locales.
- **Multi-project:** tabbed workspace (GeoCarto-style); each project may hold multiple artboards.
- **v1 scope:** core editor + raster export + prompt-a-template + multilingual content/translate + (raster) HTML/CSS export + SVG export.

### Still open
1. **Doc language** — keep this PRD in English for contributors, or also produce a French version?

---
