# Reliability refinements (unreleased, 0.7.0 working tree)

The shell, tool placement, inspector tabs, typography, colors, and Liquid Glass
tokens are unchanged. UI additions address specific workflow gaps: starter
search/format filtering and preview, links to existing artboard settings and
problem layers, visible mode labels where space permits, keyboard navigation,
localized mobile navigation, and explicit AI readiness. Recovery controls appear
only after a failed save.

## Changes

- Browser saves serialize by project and drain edits made during a pending write.
  Failed saves keep the document, tab and undo history. Retry and portable-copy
  actions remain available. Backgrounding flushes pending writes; browser unload
  requests confirmation while local edits are not saved.
- Native writes serialize too. A disk write cannot mark newer edits as saved,
  and a failed linked-file save prevents closing its project tab.
- Export preflight identifies clipping separately from text overflow, measures
  selected content locales after fonts load, offers navigation by layer ID, and
  reports likely SVG simplifications. Raster exports show actual pixel dimensions
  and reject unsupported allocations before rendering.
- AI demo output requires an explicit **Offline demo** selection. Incomplete real
  provider setup is disabled with specific guidance. Provider/destination context
  and persistence failures are visible. The template brief survives reopening.
- Import bounds: 128 MiB file/envelope, 32 MiB per new asset, 512 assets, 100
  artboards, 5,000 layers, depth 64, and 250,000 visited document values. Canvas
  output is limited to 16,384 pixels per edge and 32 million pixels. Normal social
  formats remain supported; large documents may require a lower export scale.
- Portable imports reject remote asset URLs, validate embedded MIME types, and
  clone asset identities/references independently for each import. Partial asset
  writes are cleaned up after a failed restore.
- A shared DOMPurify SVG parser removes scripts, event handlers, embedded HTML,
  animation and external references while preserving local gradients and symbols.
- macOS credentials are split out of ordinary AI preferences into Keychain.
  Legacy inline, Stronghold and fallback values migrate only after successful
  Keychain persistence. New secret writes have no plaintext fallback. Browser
  credential storage retains its explicit opt-in behavior.
- Tauri now has a CSP and scoped file permissions: selected files, app data, and
  Calqo video-export temporary files. HTTP(S) connections remain allowed for user
  configured AI providers; the CSP does not claim to enforce an endpoint allowlist.

## Repeatable checks

```sh
pnpm install --frozen-lockfile
pnpm verify
cargo check --manifest-path src-tauri/Cargo.toml --features video-toolbox
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

`pnpm verify` runs metadata validation, TypeScript, ESLint, all unit tests, the
production build and Chromium smoke tests. Install Chromium first with
`pnpm exec playwright install chromium` when setting up a new machine. The Verify
workflow repeats browser checks on Linux for PRs and main; it does not publish
artifacts or start a paid macOS release build.

The regression suite covers failed close/retry, overlapping local/native saves,
independent imported assets, remote URL rejection, SVG attacks/local references,
document/raster budgets, duplicate layer names, keyboard radio navigation, AI
readiness and mocked Keychain migration failures. Existing smoke paths cover
create/edit/reload, translation/demo generation, HTML fidelity, starter copies,
asset repair/optimization and brand profiles.

## Release checks still requiring a real environment

These changes are not a beta certification. Before shipping a native build, test
Keychain prompts, locked/denied access, legacy migration, Open/Save As/file drop,
native fonts, clipboard, VideoToolbox export and app restart on the release Mac.
The automated Keychain tests use mocks and never access a person's credentials.
Tab-close protection is tested; forced process termination and OS shutdown cannot
guarantee completion of asynchronous saves.

Safari, installed-PWA update/relaunch, iOS share sheets and a signed/notarized
native artifact still need their release smoke checks. macOS remains Apple
Silicon only and ad-hoc signed; this patch does not change distribution support.
Use `docs/plan.md` for outstanding milestone gates and `docs/releasing.md` for
release/signing instructions.

## Verification recorded for this change

- Version consistency, TypeScript, ESLint and production/PWA build: passed.
- Vitest: 648 tests across 71 files passed.
- Chromium: all 8 smoke tests passed, including starter search/preview and
  light/dark/solid screenshot checkpoints.
- Native: cargo check with VideoToolbox passed; all 9 Rust library tests passed.
- In-app inspection confirmed starter search/preview, artboard settings access,
  export warning navigation and existing Glass styling. Remaining manual visual
  checks were skipped at the user's request; no claim of a complete visual or
  packaged-native certification is made.
