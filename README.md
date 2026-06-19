# Calqo

> An open-source, simple, glass-native social visual maker.

Calqo (from _calque_, the French word for a design "layer") is a lightweight,
local-first design tool for quickly producing static social-media visuals —
posts, stories, thumbnails, banners. It ships as a web React app today, with a
Tauri desktop shell planned. It shares its build philosophy and macOS "Liquid
Glass" design language with the [GeoCarto](https://github.com/kilianvivien) project.

The pitch: _the 20% of Canva people actually use for social posts, done well,
free, with a native-feeling macOS interface — plus two AI superpowers Canva makes
awkward: prompt-a-template and one-click multilingual text._

See [`docs/PRD-calqo-v0.5.md`](docs/PRD-calqo-v0.5.md) for the product spec and
[`docs/calqo-browser-prototype-implementation-plan.md`](docs/calqo-browser-prototype-implementation-plan.md)
for the detailed build plan.

## Status

**Shareable browser prototype complete through post-prototype Phase H.** The app
is still browser-first, but the core edit/save/export/multilingual/AI flows are
now implemented behind the adapter boundary with provider-specific Gemini
support.

- [x] Vite + React + TypeScript project
- [x] Tailwind v4 + Liquid Glass design tokens & primitives
- [x] EN/FR app localization (`react-i18next`)
- [x] Theme (light/dark) + reduced-transparency modes
- [x] App shell skeleton (title bar, tab bar, tool rail, layers/artboards, canvas, inspector, status bar)
- [x] Zod project schema (versioned, migration-ready) + Dexie persistence
- [x] Browser adapter layer (storage, assets, file, clipboard, fonts)
- [x] Multi-project tab workspace with autosave + reload restore
- [x] Konva canvas editor (Phase B)
- [x] Layers, artboards, export (Phases C–D)
- [x] Multilingual content + AI flows (Phase E)
- [x] Prototype hardening pass (Phase F)
- [x] Gemini/GenAI provider reliability pass (Phase H)

## Tech stack

React 19 · TypeScript · Vite · Tailwind v4 · Konva / react-konva · Zustand ·
Dexie · Zod · react-i18next · lucide-react.

## Getting started

```bash
pnpm install
pnpm dev         # Vite dev server on http://localhost:5173
pnpm typecheck   # TypeScript only
pnpm test        # Vitest unit tests
pnpm lint        # ESLint
pnpm build       # type-check and production build
```

Before committing, run `pnpm typecheck` and `pnpm test`.

## Architecture notes

App/editor code stays behind adapters in `src/lib/adapters/` for storage,
assets, files, clipboard, fonts, and app settings. That keeps browser-only
IndexedDB, Blob, and Clipboard API behavior out of editor components and leaves
room for Tauri implementations later.

Project JSON is the product contract. The Zod schema in `src/lib/schema/`
validates persisted documents, `.calqo` imports, and AI-generated templates via
`safeImportProject`. Imported projects always receive a fresh project id so they
do not overwrite open tabs.

Mutations flow through `src/editor/commands/projectCommands.ts`, which marks
projects dirty, schedules autosave, and coordinates selection/history cleanup.
Phase F adds tests around autosave coalescing, close/reload flushing, import id
collisions, and save-error surfacing.

## AI providers

Mock mode is the default and works offline. Gemini uses a provider-specific
GenAI adapter with structured JSON requests for templates and translations.
Local Ollama, Mistral, OpenRouter, and custom endpoints continue through the
OpenAI-compatible adapter. Browser API keys are only persisted after explicit
opt-in and are stored in IndexedDB for this site; prefer a local endpoint for
real keys until the Tauri keychain adapter exists.

## Browser compatibility

The core path is intended for current Chrome and Safari: create/edit, local
save/reload, `.calqo` import/export, raster export, HTML wrapper export, and mock
AI flows. Firefox should handle core editing, but image clipboard writes and
some export/clipboard permissions can be limited by browser support; Calqo now
reports unsupported copy operations instead of throwing.

## Known limitations

- Tauri shell, native menus, keychain, packaging, and macOS vibrancy are deferred.
- The first prototype focuses on static social visuals, not animation/video.
- SVG export is intentionally limited and warns for unsupported fidelity.
- Clipboard behavior depends on browser permissions and feature support.
- Advanced typography, complex vector editing, and phone-first editing remain
  post-prototype work.

## Design language

Calqo targets the macOS "Liquid Glass" material: translucent, layered,
light-refracting surfaces over a soft wallpaper. A small CSS-variable token
system (`src/styles/tokens.css`) drives color, blur, radius, and motion across
light/dark themes, with a reduced-transparency fallback for accessibility. See
[`docs/GeoCarto-design.md`](docs/GeoCarto-design.md) for the full design system.

## License

[MIT](LICENSE) © Kilian Vivien
