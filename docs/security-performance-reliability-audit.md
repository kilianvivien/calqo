# Calqo Security, Performance, And Reliability Audit

**Audit date:** 2026-06-28  
**App version audited:** `0.2.5`  
**Scope:** browser React app, Tauri shell configuration, local-first storage,
project import/export, AI provider paths, SVG/image handling, autosave/history,
tests, and release operations.

## Executive Summary

Calqo has a healthy architecture for a local-first editor: project documents are
validated through a shared schema, editor mutations mostly route through
commands, assets are isolated behind adapters, backups scrub AI keys, and npm
dependency advisories are clean as of this audit.

The main pre-beta risk is not one single exploit. It is the combination of a
powerful desktop shell, user/AI-supplied project files, SVG/image rendering, and
large canvas exports without hard containment. The Tauri app currently has no
CSP, broad home-directory filesystem permissions, a hard-coded Stronghold
password, and a fallback path that can store desktop secrets in IndexedDB. On
the performance and reliability side, imported projects can specify unbounded
geometry and arrays, undo history snapshots whole projects, autosave relies on
best-effort `beforeunload`, and release confidence depends on local discipline
because CI is missing.

Beta should freeze feature expansion until the 10 actions below are complete or
explicitly accepted as known release risks.

## Audit Evidence

- `pnpm audit --prod`: no known vulnerabilities found.
- `pnpm audit`: no known vulnerabilities found.
- `cargo audit --version`: not installed, so Rust/Tauri advisory scanning was
  not completed.
- `cargo tree -q`: Tauri dependency graph is large and includes desktop,
  WebKit, filesystem, image, clipboard, and Stronghold-related crates.
- No `.github/workflows` directory was present; the roadmap also records that
  no CI workflow exists.
- Reviewed source paths:
  - `src-tauri/tauri.conf.json`
  - `src-tauri/capabilities/default.json`
  - `src/lib/schema/schema.ts`
  - `src/lib/schema/migrations.ts`
  - `src/editor/export/calqoFile.ts`
  - `src/editor/export/rasterExport.ts`
  - `src/editor/commands/projectCommands.ts`
  - `src/lib/state/historyStore.ts`
  - `src/lib/adapters/settings/tauriSettingsAdapter.ts`
  - `src/app/shell/SvgLibraryDialog.tsx`
  - `src/editor/backup/appBackup.ts`
  - `src/app/App.tsx`

## 10 Main Actions

### 1. Enforce A Tauri CSP Before Beta

**Priority:** P0 security  
**Evidence:** `src-tauri/tauri.conf.json` sets `app.security.csp` to `null`.
The app also renders SVG markup with `dangerouslySetInnerHTML` in the SVG
library and AI SVG preview surfaces.

**Risk:** Any future XSS bug in project import, saved SVGs, provider output, or
UI rendering gets the widest possible webview execution environment. The risk is
amplified in desktop because Tauri commands can bridge into local capabilities.

**Recommended fix:** Add a strict CSP for packaged builds. Start with
`default-src 'self'`, disallow remote scripts, restrict images to `self`,
`blob:`, and `data:`, restrict connections to explicit AI provider endpoints
when configured, and keep development relaxations separate from production.

**Acceptance test:** Packaged Tauri app boots, SVG previews still render, export
still works, and a test fixture with inline script/event-handler SVG cannot
execute.

### 2. Reduce Desktop Filesystem Permissions To User-Selected Scopes

**Priority:** P0 security  
**Evidence:** `src-tauri/capabilities/default.json` grants `fs:default`,
recursive home read/write, recursive temp read/write, and `$HOME/**` in the
scope. File dialogs already use scoped access in the Tauri adapter.

**Risk:** If renderer code is compromised, the permission set is far broader
than Calqo needs for opening images/projects and saving exports.

**Recommended fix:** Remove recursive `$HOME` grants. Prefer dialog-scoped file
access, app data, temp, and explicit user-selected paths. Split capabilities by
window or feature if needed.

**Acceptance test:** Native open/save, drag-drop, export, backup restore, and
font discovery work without unrestricted home read/write permission.

### 3. Harden AI Key Storage And Remove The Static Stronghold Password

**Priority:** P0 security  
**Evidence:** `tauriSettingsAdapter` uses
`STRONGHOLD_PASSWORD = 'calqo-local-secret-store-v1'` and falls back to Dexie
for secrets when Stronghold operations fail. Backup code correctly strips AI
keys before export.

**Risk:** A static password weakens the value of Stronghold at rest. The Dexie
fallback avoids data loss but silently downgrades desktop secret storage into a
weaker local database, which conflicts with the "secure desktop settings" claim.

**Recommended fix:** Derive or store the Stronghold credential through an OS
secret/keychain flow where available. If Stronghold fails, require explicit user
confirmation before storing keys insecurely, surface the degraded state
prominently, and include tests proving keys never enter backups, diagnostics,
project files, or logs.

**Acceptance test:** Fresh desktop launch can persist and read a provider key;
backup/diagnostics/project export do not contain it; forced Stronghold failure
shows a user-visible degraded-storage state.

### 4. Replace String-Level SVG Trust With A Shared Sanitized SVG Pipeline

**Priority:** P0 security/reliability  
**Evidence:** SVG previews use `dangerouslySetInnerHTML`; comments state bundled
SVGs are trusted and saved AI marks were sanitized before persisting. The
sanitizer is string-based and conservative, but not a full parser.

**Risk:** SVG is an active-content format. Future upload paths, provider output,
or saved library records can regress sanitization. String-level regex hardening
is brittle against namespace, encoded, CSS, malformed markup, and parser
differential cases.

**Recommended fix:** Centralize all SVG ingestion through one parser-backed
sanitize/validate function. Reject active markup before storage, store only the
sanitized canonical SVG, render previews from the same safe record, and add
malicious SVG fixtures.

**Acceptance test:** Uploaded, AI-generated, saved, exported, and restored SVGs
all pass the same sanitizer. Fixtures with script, event handlers,
`foreignObject`, external `href`, CSS URL tricks, and malformed SVG are rejected
or neutered.

### 5. Add Hard Import Budgets To The Project Schema And `.calqo` Envelope

**Priority:** P0 reliability/performance/security  
**Evidence:** The schema validates shape but leaves most sizes unbounded:
artboard width/height, layer geometry, text length, gradient stops, point
arrays, group depth, artboard count, asset count, and imported asset data URL
size. `.calqo` import restores data URLs directly.

**Risk:** A malicious or accidental project can force memory exhaustion, slow
Zod parsing, huge Konva stages, enormous raster exports, or persistent IndexedDB
bloat. AI output and disk imports share this boundary.

**Recommended fix:** Define explicit budgets, for example max artboards, max
layers per artboard, max group depth, max canvas dimension, max text length, max
point count, max asset count, max asset bytes, and max total `.calqo` bytes.
Reject or repair with a clear recovery dialog.

**Acceptance test:** Unit tests cover oversized dimensions, deep groups, huge
freehand point arrays, massive data URLs, too many artboards, too many layers,
and old valid fixtures.

### 6. Make Autosave Durable Across Unload, Backgrounding, And Save Races

**Priority:** P1 reliability  
**Evidence:** Edits schedule a 700 ms autosave; `beforeunload` calls
`flushPendingSaves()` without awaiting durability. `saveProject` writes the
current in-memory project and sets `saved` after storage resolves.

**Risk:** Browsers may terminate async IndexedDB work during unload. Concurrent
saves can also complete out of order if a slow older write resolves after a
newer one. This is a local-first trust issue.

**Recommended fix:** Add monotonically versioned save jobs per project, ignore
stale save completions, flush on `visibilitychange` and `pagehide`, and keep a
small pending-write journal or last-good snapshot for crash recovery.

**Acceptance test:** Automated tests simulate rapid edits, forced save failures,
tab close/background events, reload during pending saves, and out-of-order save
resolution without losing the latest edit.

### 7. Replace Whole-Project Undo Snapshots With Bounded Diffs Or Checkpoints

**Priority:** P1 performance/reliability  
**Evidence:** The history store keeps up to 80 structured clones of entire
projects. Undo/redo clones current and prior project snapshots.

**Risk:** Whole-document cloning is easy to reason about, but memory and latency
grow quickly with artboard count, nested layers, text variants, and asset
metadata. Large projects can make ordinary edits feel slow or cause mobile/PWA
memory pressure.

**Recommended fix:** Move toward command diffs or Immer patches with periodic
checkpoints. Track approximate history memory per project and shrink history
automatically for large documents.

**Acceptance test:** Stress test a project with many artboards/layers and
verify edit latency, memory growth, undo correctness, and history truncation.

### 8. Add Export And Image Processing Budgets With User-Facing Failure Modes

**Priority:** P1 performance/reliability  
**Evidence:** Raster export builds an offscreen Konva stage at artboard
dimensions and selected pixel ratio. The schema does not cap artboard size, and
export uses all visible layers and loaded images.

**Risk:** Large imported artboards or high pixel ratios can allocate massive
canvases and crash the tab/webview. Missing assets are skipped in some render
paths, which can produce an export that succeeds but is visually incomplete.

**Recommended fix:** Preflight export memory estimates from width * height *
pixel ratio, image dimensions, and layer count. Block unsafe exports with a
clear message and suggest lower scale or downsampled assets. Treat unresolved
missing assets as blocking for final export unless the user confirms.

**Acceptance test:** Export dialog warns or blocks oversized 1x/2x/3x exports,
missing asset exports, and very large image imports; normal social presets still
export quickly.

### 9. Build CI And Release Gates For Browser, PWA, Desktop, And Dependencies

**Priority:** P1 reliability/security  
**Evidence:** The roadmap records no CI workflow and narrow E2E coverage. npm
advisory checks are clean, but Rust advisory checks are not installed locally.

**Risk:** Security and reliability work can regress silently without repeatable
checks. Tauri and PWA bugs often appear only in packaged or browser-specific
flows.

**Recommended fix:** Add CI that runs `pnpm typecheck`, `pnpm test`,
`pnpm lint`, `pnpm build`, Playwright Chromium smoke, `pnpm audit`, and Rust
format/check/advisory scanning via `cargo audit` or `cargo deny`. Add a local
release gate script that also runs a Tauri dev/build smoke on the release
machine.

**Acceptance test:** A clean checkout can run the full gate and produce an
auditable pass/fail result before tagging beta.

### 10. Reconcile Local-First Privacy With Browser Analytics

**Priority:** P2 security/privacy/product trust  
**Evidence:** `src/app/App.tsx` loads Vercel Analytics in browser builds but
not in Tauri. The product positioning is open-source and local-first.

**Risk:** Even privacy-preserving analytics can surprise users of a local-first
creative tool, especially when AI/provider settings and project names exist in
the same app context. The risk is mostly trust and disclosure, not a direct code
vulnerability.

**Recommended fix:** Make browser analytics opt-in or clearly disclosed in the
README/app settings. Ensure no project content, provider keys, file names, or
prompt text are ever sent as analytics metadata.

**Acceptance test:** New users see a clear privacy state, settings can disable
analytics, and tests or code review confirm analytics calls never include
project/user content.

## Supporting Findings

### Strengths To Preserve

- Project imports use `safeImportProject`, which strips unknown keys and reports
  readable validation issues.
- Editor mutations are centralized through `editProject`, with autosave and
  history hooks in one place.
- Backup export intentionally strips API keys and only persists selected local
  UI preferences.
- `.calqo` imports open under a fresh project id, reducing accidental clobbering.
- AI template generation has a prompt-level layer cap and validates model output
  before adoption.
- `pnpm audit` currently reports no known npm vulnerabilities.

### Notable Gaps

- Rust/Tauri advisories were not checked because `cargo audit` is absent.
- No CI workflow is present.
- Desktop app signing is ad-hoc (`signingIdentity: "-"`), so distribution
  trust/notarization remains a release-operations risk.
- Schema validation is structural, not budget-aware.
- SVG handling has good intent but should not rely on comments and regex alone.
- Autosave can report `saved` without proving the latest edit is the one that
  reached durable storage.

## Suggested Beta Gate

Before a public beta, Calqo should require:

1. P0 actions 1-5 complete.
2. `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, and Playwright
   smoke passing in CI.
3. `pnpm audit` and Rust advisory scan passing or explicitly waived.
4. Import/export fixtures for valid, old, malformed, oversized, missing-asset,
   and malicious-SVG `.calqo` files.
5. Manual smoke on Chrome, Safari, installed PWA, and packaged Tauri.

## Risk Posture

Current posture is suitable for alpha/local testing. For public beta, security
posture is **medium-high risk** until Tauri permissions, CSP, SVG ingestion,
secret storage, and import budgets are hardened. Performance posture is
**medium risk** because normal social-post projects should be fine, but hostile
or simply large documents can exceed browser/WebView memory. Reliability posture
is **medium risk** because the architecture is sound, but autosave durability,
CI, and release-gate coverage need to become routine.
