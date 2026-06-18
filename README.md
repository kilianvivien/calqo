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

**Phase A (browser foundation) complete.** Next: the Konva canvas editor (Phase B).

- [x] Vite + React + TypeScript project
- [x] Tailwind v4 + Liquid Glass design tokens & primitives
- [x] EN/FR app localization (`react-i18next`)
- [x] Theme (light/dark) + reduced-transparency modes
- [x] App shell skeleton (title bar, tab bar, tool rail, layers/artboards, canvas, inspector, status bar)
- [x] Zod project schema (versioned, migration-ready) + Dexie persistence
- [x] Browser adapter layer (storage, assets, file, clipboard, fonts)
- [x] Multi-project tab workspace with autosave + reload restore
- [ ] Konva canvas editor (Phase B)
- [ ] Layers, artboards, export (Phases C–D)
- [ ] Multilingual content + AI flows (Phase E)

## Tech stack

React 19 · TypeScript · Vite · Tailwind v4 · Konva / react-konva · Zustand ·
Dexie · Zod · react-i18next · lucide-react.

## Getting started

```bash
pnpm install
pnpm dev        # start the dev server
pnpm build      # type-check and build
pnpm test       # run unit tests
pnpm lint       # lint
```

## Design language

Calqo targets the macOS "Liquid Glass" material: translucent, layered,
light-refracting surfaces over a soft wallpaper. A small CSS-variable token
system (`src/styles/tokens.css`) drives color, blur, radius, and motion across
light/dark themes, with a reduced-transparency fallback for accessibility. See
[`docs/GeoCarto-design.md`](docs/GeoCarto-design.md) for the full design system.

## License

[MIT](LICENSE) © Kilian Vivien
