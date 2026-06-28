# CLAUDE.md

Concise guidance for working in Calqo.

## Product

Calqo is an open-source, local-first social visual maker: the focused 20% of
Canva for static social posts. Browser React app first; Tauri shell later.

Core AI bets:

- Prompt-to-template: LLM output must be valid Calqo project JSON.
- Multilingual content: project text can have per-locale variants.

Source of truth:

- `docs/PRD-calqo-v0.5.md` - product spec.
- `docs/calqo-browser-prototype-implementation-plan.md` - phased plan; keep
  status banners current.
- `docs/GeoCarto-design.md` - Liquid Glass design system.

## Commands

```bash
pnpm dev        # Vite dev server, port 5173
pnpm build      # typecheck + production build
pnpm typecheck  # TypeScript only
pnpm test       # Vitest
pnpm lint       # ESLint
pnpm format     # Prettier write
```

Run `pnpm typecheck` and `pnpm test` before committing.

## Stack

React 19, TypeScript, Vite, Tailwind v4, Konva/react-konva, Zustand + immer,
Dexie, Zod, react-i18next, lucide-react. Package manager: pnpm.

## Conventions

- Keep native-ready APIs behind `src/lib/adapters/`; app/editor UI imports
  singletons from `src/lib/adapters/index.ts`, not Dexie or browser storage.
- Treat `src/lib/schema/` as the contract. Validate imported or AI-generated
  projects with `safeImportProject`.
- Route project mutations through `src/editor/commands/projectCommands.ts`; do
  not mutate project store state directly from components.
- Respect split state in `src/lib/state/`: `uiStore`, `projectStore`,
  `workspaceStore`.
- Build Liquid Glass UI from `src/components/glass/` and tokens in
  `src/styles/tokens.css`. Support light, dark, and
  `html[data-transparency="solid"]`.
- Put every user-facing UI string in both `src/locales/en` and
  `src/locales/fr`. App UI language is separate from project content locales.
- Shell layout lives under `src/app/shell/`: titlebar, tab bar, workspace,
  status bar; tool rail, left dock, canvas, inspector.
- Export lives in `src/editor/export/`; multi-file exports zip outputs and
  multi-locale exports group files by locale.
- Project copies and backup restores must clone asset blobs, assign fresh ids,
  and rewrite references with `remapProjectAssetIds`.
- Backups must not include secrets or API keys.

## Status

Phase A is complete. Phase B is next: Konva canvas editor, layer renderers,
selection/transform, tools, text overlay, undo/redo. Update the implementation
plan when steps land.

## House Rules

- Match surrounding style; keep comments purposeful.
- Do not commit or push unless asked. Default branch: `main`.
- Keep changes scoped and update the phased plan when work changes status.
