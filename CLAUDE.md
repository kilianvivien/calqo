# CLAUDE.md

Guidance for working in the Calqo repo.

## What Calqo is

An open-source, local-first **social-visual maker** — the focused 20% of Canva
for static social posts (square, portrait, story, thumbnail, banner). Browser
React app first; a Tauri desktop shell comes later. Two AI differentiators:
**prompt-a-template** (an LLM emits the editor's own project JSON) and
**multilingual content + instant translation** (per-locale text variants).

Source of truth:

- `docs/PRD-calqo-v0.5.md` — the product spec.
- `docs/calqo-browser-prototype-implementation-plan.md` — the phased build plan
  (Phases A–F). **Keep its status banners up to date as work lands.**
- `docs/GeoCarto-design.md` — the Liquid Glass design system Calqo reuses.

## Commands

```bash
pnpm dev         # dev server (Vite, port 5173)
pnpm build       # tsc --noEmit && vite build
pnpm typecheck   # type-check only
pnpm test        # vitest run
pnpm lint        # eslint
pnpm format      # prettier --write
```

Always run `pnpm typecheck` and `pnpm test` before committing.

## Stack

React 19 · TypeScript · Vite · Tailwind v4 (`@tailwindcss/vite`) · Konva /
react-konva · Zustand (+ immer) · Dexie · Zod · react-i18next · lucide-react.
Package manager: **pnpm**.

## Architecture & conventions

- **Adapter boundary (important).** Anything that will later need native (Tauri)
  support sits behind an adapter in `src/lib/adapters/` (`storage`, `assets`,
  `file`, `clipboard`, `fonts`). App code imports the interface-typed singletons
  from `src/lib/adapters/index.ts` — **never import Dexie or browser storage
  APIs directly** in editor/UI components.
- **The project schema is the contract.** `src/lib/schema/` (Zod) is shared by
  the editor, Dexie persistence, `.calqo` import/export, and AI output. It is
  versioned (`CURRENT_SCHEMA_VERSION`) and migration-ready. Validate all
  imported/AI-generated documents with `safeImportProject`.
- **Mutations flow through commands.** Project changes go through
  `src/editor/commands/projectCommands.ts` (`editProject`, `createProject`,
  `renameProject`, `duplicateProject`, `closeProject`, `saveProject`, …), which
  apply an immer patch, mark dirty, and debounce-autosave. Don't mutate store
  state ad hoc from components.
- **State is split** (`src/lib/state/`): `uiStore` (theme/transparency),
  `projectStore` (normalized docs + save state), `workspaceStore` (tab order +
  active id, persisted to localStorage). Selection/history stores land in Phase B.
- **Design system.** Tokens are CSS variables prefixed `--calqo-*` in
  `src/styles/tokens.css`; the four-layer `.glass` recipe is in `glass.css`.
  Build UI from the primitives in `src/components/glass/`. Keep to: one accent
  (system blue), radii descending with nesting (14→10→8→6), spring easing on
  tactile feedback / ease-out elsewhere, and always support light + dark + a
  reduced-transparency fallback (`html[data-transparency="solid"]`).
- **i18n.** App UI strings live in `src/locales/{en,fr}/*.json` (namespaces:
  `common`, `editor`, `errors`). Every user-facing string must be translated in
  both. **App UI language is distinct from per-project content locales.**
- **Layout.** The shell is a rounded glass window with rows
  titlebar / tab bar / workspace / status bar; tool rail · left dock · canvas ·
  inspector. Components are under `src/app/shell/`.

## Status

**Phase A (browser foundation) is complete.** Next up is **Phase B**: the Konva
canvas editor (stage, layer renderers, selection/transform, tools, text overlay,
undo/redo). See the plan's Phase B section for the task breakdown.

## House rules

- Match the surrounding code's style; keep comments purposeful, not narration.
- Don't commit or push unless asked. Default branch is `main`.
- When a phase or step completes, tick its box / update its status banner in the
  implementation plan.
