# Calqo Animation Extension — "Animate" Mode

**Status:** Proposed (not scheduled). Written 2026-07-19; revised same day
after an external critical review (see §13).
**Depends on:** the shipped static editor (schema v1, Konva renderers, offscreen
raster export, HTML (editable) export, `.calqo` envelopes).
**Relationship to `docs/plan.md`:** the beta/1.0 roadmap deliberately biases
toward polish over new editor surface area. This extension is a **post-beta
milestone track**; nothing here should block beta. It is written now so schema
and adapter decisions made during beta don't paint us into a corner.

---

## 1. What this is

Let a user take an existing static `.calqo` project and produce a short
animated clip (a few seconds up to 60 s max) for social media: layers animate
in, hold with optional emphasis, animate out; the result exports to MP4 (the
format every social platform accepts), GIF, and a self-contained animated HTML
file — all rendered locally, consistent with Calqo's local-first promise.

Two tiers:

1. **Integrated "Animate" mode** (this doc's core): preset-based animation
   authoring inside the existing shell, with in-app playback and local video
   export.
2. **Hyperframes handoff** (labs track, §10): export an animated HTML package
   that HeyGen's [Hyperframes](https://github.com/heygen-com/hyperframes)
   (HTML → MP4, built for agents) or a coding agent can take further for
   advanced motion.

## 2. Decisions already made (and why)

These were settled with the maintainer on 2026-07-19:

| Decision | Choice | Rationale |
| --- | --- | --- |
| Authoring model | **Presets compiled to a keyframe IR** | Canva-style enter/emphasis/exit presets cover the target user; a small keyframe IR underneath future-proofs a real timeline, agent-authored motion, and HTML export without a schema break. |
| Surface | **Mode in the existing shell**, not a separate window | In the browser a second window is a second app instance (Zustand stores don't cross windows; syncing over BroadcastChannel/Dexie is real complexity for no user value). The Tauri shell can later host Animate mode in a true OS window nearly for free. |
| Platforms | **Desktop only at first** | Animate mode ships on the desktop shell surface. Concretely: the phone mobile surface (`src/app/mobile/`) gets no Animate UI; the desktop shell (browser + Tauri) gets the full mode. Whether tablets driving the desktop shell (iPad PWA / Sidecar) see the mode or a playback-only preview is an open question (§12). |
| v1 export targets | **MP4 (H.264 default, H.265 option), GIF, animated HTML** | MP4/H.264 is the social deliverable every platform accepts; H.265/HEVC is offered where runtime support and benchmarks justify it (§6.3, §7). GIF is the chat/forum fallback; animated HTML doubles as the Hyperframes package. WebM is deferred (near-free later, accepted by few social platforms). |
| macOS encoding | **Hardware-accelerated on M-series** | WKWebView's WebCodecs sits on VideoToolbox, so the in-webview path is *expected* to be hardware-accelerated — but this is capability-tested per install, never assumed (§7). The encoder sits behind an export adapter so a native Rust/VideoToolbox path can replace it if benchmarks disappoint. |
| Audio | **Out of scope for v1** | Instagram/TikTok users add trending audio in-platform; muxing + licensing UX is its own project. The MP4 container path must not preclude adding an audio track later. |

### Critical review of the original idea (kept for the record)

- **"Secondary editor in a separate window"** — rejected for v1 (see table).
  The vision survives as a *mode*; the window comes with Tauri multi-window.
- **"Lean on Hyperframe for advanced animations"** — demoted to a labs track.
  Hyperframes is young, agent-oriented, and needs a headless render
  environment (its CLI / cloud) that local-first users don't have. It cannot
  be the answer to "export MP4"; the in-app WebCodecs path is. Where
  Hyperframes genuinely shines is the *agent* story (§10).
- **Full keyframe timeline** — rejected as v1 UI. It targets a user Calqo
  doesn't serve (motion designers) and is a large, ongoing UI investment. The
  IR keeps the door open.

## 3. Alternatives considered and rejected

- **Lottie export.** Vector, tiny files — but Calqo's layer model maps badly:
  image filters, frames, pattern fills, sticker outlines, stroke looks, and
  background removal have no Lottie equivalent. We'd ship a format that
  silently loses most of the creative-tools surface. Rejected.
- **ffmpeg.wasm in-browser encoding.** ~25 MB wasm payload, software-only
  encoding (slow, hot), licensing questions around H.264. WebCodecs uses the
  platform encoder (hardware where available) at zero payload. Rejected.
- **Server-side rendering (Remotion-style).** Violates local-first. Rejected.
- **CSS/WAAPI as the *primary* renderer.** Tempting because HTML export
  exists, but the live canvas is Konva; previewing in a different renderer
  than we export from guarantees fidelity drift. Konva renders both the
  preview and the exported frames; HTML/CSS is an *export target* with its own
  documented fidelity warnings (mirroring the existing HTML export approach).

## 4. Animation model

### 4.1 Concepts

- **Clip** — what a project exports: one artboard (v1) or an ordered sequence
  of artboards ("scenes", v2) with a total duration ≤ 60 s and a fixed fps
  (default 30).
- **Layer animation** — per-layer block, either **preset-authored** (up to
  three slots: `enter`, `emphasis`, `exit`) or **custom** (raw tracks, written
  by an agent or a power user). The two forms are a discriminated union — a
  layer is one or the other, never both, which removes any ambiguity about
  which is the source of truth.
- **Keyframe IR** — the runtime form: per-layer property tracks with
  normalized-time keyframes. **Compiled tracks are never persisted for
  preset-authored animation.** The preset is the document; the compiler
  produces tracks deterministically at load/edit time into a runtime cache.
  This avoids a dual source of truth, keeps undo/redo snapshots small (history
  stores full project snapshots, capped at 80), and means exporters compile on
  demand. Custom animation persists its tracks (there is nothing to compile
  them from).

### 4.2 Composition semantics (normative)

Animation must never round-trip through document geometry. Calqo's editor
normalizes Konva scale back to 1 and bakes resize into `w/h`
(`CalqoStage.tsx` transform handling), so animated transforms live on a
**transient wrapper node**: at render time each animated layer's Konva node is
nested in a wrapper `Group` that carries only animation values, and the base
node keeps document geometry untouched. Rules:

- `dx`, `dy` — **additive** pixel offsets from document `x/y`.
- `rotation` — **additive** degrees on top of document rotation, around the
  layer center.
- `scaleX`, `scaleY` — **multiplicative**, around the layer center, applied on
  the wrapper (never on the base node, never written back to `w/h`).
- `opacity` — **multiplies** document opacity.
- Non-transform reveal effects (`wipe-progress` 0–1 clip reveal, `blur` px)
  are dedicated track props; they are the ones that trigger raster-fallback
  or downgrade warnings in the HTML export (§6.3).
- Per-prop overlap between slots is **forbidden by construction**: the preset
  compiler lays out enter/emphasis/exit windows sequentially, and validation
  rejects custom tracks with overlapping windows for the same prop.

The same wrapper-node separation is what makes live playback safe (§6.2):
React re-renders repopulate base nodes from the document; playback only ever
touches wrappers; selection/transform handlers only ever read base nodes.

### 4.3 Schema extension (target: schema v2)

All animation fields are **optional** — a static project stays a valid static
project. Sketch (final shapes live in `src/lib/schema/schema.ts`; everything
below becomes strict Zod with enums, ranges, and defaults — no open `string`
fields, matching the existing schema's discipline):

```ts
type AnimProp =
  | 'dx' | 'dy' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity'
  | 'wipe-progress' | 'blur';

type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  | 'overshoot' | 'bounce';

interface Keyframe {
  t: number;            // 0–1, normalized to the owning window
  value: number;        // finite; validated per-prop range
  easing?: Easing;      // easing *into* this keyframe
}

interface TrackWindow {
  start: number;        // ms from scene start
  duration: number;     // ms, > 0, window must fit inside the scene
  tracks: { prop: AnimProp; keyframes: Keyframe[] }[]; // t ascending, unique
}

type PresetKind =
  | 'fade' | 'slide' | 'pop' | 'rise' | 'wipe' | 'blur-in'   // enter/exit
  | 'pulse' | 'wiggle' | 'float'                              // emphasis
  | 'typewriter' | 'word-rise';                               // text (later phase)

interface PresetInstance {
  kind: PresetKind;
  direction?: 'up' | 'down' | 'left' | 'right';  // slide/wipe/rise
  distance?: number;      // px, slide/rise travel
  duration: number;       // ms
  delay: number;          // ms from slot anchor
  easing?: Easing;
  stagger?: number;       // ms per child, group/list slots only
}

type LayerAnimation =
  | { mode: 'preset'; enter?: PresetInstance; emphasis?: PresetInstance;
      exit?: PresetInstance }
  | { mode: 'custom'; windows: TrackWindow[] };

interface SceneTiming { duration: number; }   // ms, per artboard

interface ClipSettings {
  fps: 24 | 30 | 60;
  scenes?: { artboardId: string; transition?: 'cut' | 'fade' | 'slide' }[]; // v2
}
```

Persisted custom tracks are **layer-targeted only**. Fragment-level tracks
(per word/char/row for text reveals) are produced exclusively by the preset
compiler at runtime, because they depend on line layout, font metrics, and the
active locale — persisting them would create stale data on every text, font,
or size edit (§8). A useful side effect: persisted animation contains no
layer/asset/row id references at all, so project duplication and
`remapProjectAssetIds` need no animation-specific rewriting.

### 4.4 Migration and compatibility (not hand-waved)

- `CURRENT_SCHEMA_VERSION` bumps to 2. `projectSchema` pins the version with a
  literal, so the v1→v2 migration in `src/lib/schema/migrations.ts` must at
  minimum rewrite `schemaVersion` — there is no such thing as a no-op
  migration here. The hand-declared `GroupLayer` interface in `schema.ts` must
  also gain the optional `animation` field, or groups silently drop it.
- **Upgrade is one-way and old clients are strict**: a v1 build rejects
  `schemaVersion: 2` files outright. Policy: stored projects migrate on read
  (as today, via the Dexie adapter); `.calqo` *file* export offers "current
  format" and — when the project has no animation — the option to write a
  v1-compatible envelope. The export dialog states which it wrote. This keeps
  the portable-file compatibility promises in `docs/plan.md` honest.
- `safeImportProject` validates animation blocks with the same strictness as
  the rest of the document (finite numbers, ordered keyframes, window-fits-
  scene, no per-prop overlap), so AI-generated animation JSON goes through
  the same gate as AI-generated templates.

### 4.5 Preset library (v1)

Enter/exit pairs: **fade, slide (4 directions), pop (scale-overshoot), rise
(slide+fade), wipe (clip-reveal), blur-in**. Emphasis loops: **pulse, wiggle,
float** (loops end at the exit anchor; no infinite loops in exports).
Text-specific **typewriter / per-word rise** are deferred to a later phase
(AN-3+): they require fragment compilation against per-locale line layout and
are the highest-complexity presets in the set — shipping them first would
gate the whole feature on the hardest 10%.

## 5. What the codebase gives us — honestly assessed

- `src/editor/export/rasterExport.ts` rebuilds a complete offscreen Konva
  stage from the project document (not the live canvas). That is the right
  substrate for frame rendering, **but it is a parallel implementation of the
  live `LayerRenderer`, not the same code** — the two can drift, and the
  frame pipeline inherits that risk. It also has at least one known gap today
  (shape image-fill assets are not collected for loading — tracked as an
  independent fix). AN-0.5 (§11) is a feasibility spike precisely because
  "extract and reuse" needs proving, not asserting.
- The frame loop must **reuse one stage and loaded image set across all
  frames** (build once, apply evaluator overrides to wrapper nodes, draw,
  capture), not reconstruct the stage per frame as the current single-shot
  export does.
- `src/editor/export/htmlLayoutExport.ts` gives the animated HTML export its
  skeleton, with real constraints documented in §6.3.
- The command layer (`projectCommands.ts`) gives animation edits undo/redo —
  with the caveats in §6.5 (history is full-snapshot-based; transient
  playback/scrub state must never enter it).
- The Zod schema contract extends the **prompt-to-template bet to
  prompt-to-animation**: an LLM emits `LayerAnimation` JSON,
  `safeImportProject` validates it.

## 6. Architecture

### 6.1 Animate mode (shell)

A workspace **mode toggle** (Design / Animate) per project tab. Mode is
per-tab state and therefore lives in **`workspaceStore`** (which owns tabs),
not `uiStore` (which is global tool/zoom/pan state — a global mode field
would leak Animate mode across projects). Desktop shell only at first; the
phone mobile surface does not grow an Animate UI in v1. In Animate mode:

- **Tool rail** collapses to select/pan (no drawing tools).
- **Left dock** shows the layer list annotated with animation badges and
  slot chips (enter/emphasis/exit).
- **Inspector** gains an Animation section: preset pickers per slot, duration/
  delay/easing/stagger controls, live preview-on-hover of presets (transient —
  never enters history).
- **Bottom strip** (new, thin): playback transport (play/pause/scrub, current
  time / total duration), scene duration control, fps + clip settings, plus
  read-only per-layer timing bars. v1 timing bars are **display-only**; the
  numbers are edited in the inspector. (Draggable bars are a timeline UI with
  full interaction semantics — snapping, multi-select, keyboard — and are
  explicitly deferred rather than half-specified.)
- Layer geometry editing stays enabled; animation composes on top of document
  geometry (§4.2), so moving a layer moves its animation with it.

All UI strings land in both `src/locales/en` and `src/locales/fr`.

### 6.2 Evaluator + playback

`src/editor/animation/evaluator.ts`: pure function
`(compiledClip, tMs) → per-layer wrapper overrides`, where `compiledClip`
comes from the preset compiler (runtime cache keyed on the inputs that affect
layout: presets, layer geometry, text content, style, active locale, loaded
fonts — see §8). Playback drives a `Konva.Animation` that writes overrides
**only to wrapper nodes** (§4.2), so React re-renders and playback never
fight over the same attributes.

Playback lifecycle rules (explicit, because they are where imperative
playback and a declarative editor collide):

- Scrub/playback state is transient UI state — never persisted, never in
  history.
- Starting any edit (drag, transform, text edit, crop) pauses playback and
  resets wrappers to identity, so handlers always read base geometry.
- Undo/redo, tab switch, locale switch, and project close stop playback and
  reset wrappers.
- Autosave persists the document only; wrappers are invisible to it.

The evaluator is the source of truth for MP4/GIF frames. The CSS compiled for
the HTML export is a **second implementation** of the same IR, and is treated
as such: conformance tests sample both at identical timestamps (§11).

### 6.3 Export pipeline

```
compiled clip ──► evaluator ──► one reusable offscreen stage
                                  │  (overrides → draw → capture, per frame)
        ┌─────────────────────────┼────────────────────────────┐
        ▼                         ▼                            ▼
  VideoFrame → VideoEncoder   GIF encoder                @keyframes CSS
  (WebCodecs, avc1 / hvc1)    (worker, capped)           (compiled from IR)
  → Mediabunny mux → .mp4         → .gif                     → .html
```

- **MP4:** WebCodecs `VideoEncoder` + **Mediabunny** for muxing (`mp4-muxer`
  is deprecated by its own author in Mediabunny's favor; Mediabunny handles
  avc1 + hvc1 sample entries, streaming output, and backpressure). **H.264 is
  the default**; **H.265 is an opt-in "smaller file" choice labeled
  runtime-supported, not "hardware-confirmed"** — `isConfigSupported()` only
  proves configurability, so the gate is: `isConfigSupported()` +
  `navigator.mediaCapabilities.encodingInfo()` reporting `powerEfficient`,
  plus the AN-2 benchmark. Sticking to platform encoders also sidesteps HEVC
  software-licensing questions (the OS vendor carries the codec license).
  Encoding correctness checklist, all mandatory in AN-2: explicit frame
  timestamps/durations; keyframe cadence (~2 s GOP); backpressure via
  `encodeQueueSize`; `VideoFrame.close()` every frame; `flush()` before
  finalize; codec profile/level + bitrate presets per format (H.265 target
  bitrate set *lower* than H.264 — same bitrate would mean same file size,
  not smaller); even-dimension handling; and a decode-verify smoke pass on
  the produced file. If H.264 encode itself is unavailable, offer GIF/HTML
  and say why. The container path must leave room for a future audio track.
- **Static exports are unaffected**: PNG/JPG/WebP/SVG and the existing HTML
  modes ignore animation entirely and render base document geometry. A
  poster-frame picker ("export the frame at t") is a possible later addition,
  not v1.
- **GIF:** hard caps (duration ≤ 15 s, ≤ 720 px long edge, ≤ 15 fps) surfaced
  in the export dialog, encoding in a worker. The AN-2 spike picks the
  encoder (`gifenc` favored) on **quality and memory, not just speed**:
  per-frame vs global palette, dithering choice, and a small fixture set of
  real designs (gradients, photos, flat brand colors) reviewed for banding.
- **Animated HTML:** builds on `htmlLayoutExport`, with three constraints the
  first draft missed:
  1. The existing export writes base rotation into `transform` and positions
     via `left/top`, so animated transforms must live on a **nested wrapper
     div per animated layer** (mirroring the Konva wrapper-node approach)
     rather than trying to compose into one `transform` string.
  2. A group containing any unsupported child rasters as a single image
     today; child animations inside such a group cannot survive. Rule: the
     group either animates as one unit (its own wrapper) or triggers a
     structured downgrade warning listing lost child animations.
  3. `wipe-progress`/`blur` tracks map to `clip-path`/`filter` where
     possible; where not, the layer falls back with a warning. Never silent.
- **Warnings are structured, not strings.** The general export-readiness path
  returns localized strings while the HTML path uses structured warning codes;
  animation export standardizes on the structured model (codes + params,
  localized at display time, EN + FR catalog entries) for codec fallbacks,
  downgrades, rasterization, and cancellation/partial-output errors.
- **Cancellation & memory (first-class requirements):** cancel stops frame
  generation, closes the encoder, discards partial output, revokes object
  URLs, and leaves UI/project state untouched. Output streams to disk where
  the platform allows (File System Access API / Tauri streamed writes)
  instead of accumulating in memory — the current file adapter materializes
  whole blobs (and Tauri copies them to an `ArrayBuffer` before writing),
  which is unacceptable for 60 s multi-locale video. Multi-locale batch
  export runs **sequentially**, streaming each output, rather than reusing
  the current ZIP path that holds every blob plus a full archive buffer in
  memory at once.

### 6.4 Performance targets (not promises)

1080×1920 @ 30 fps × 60 s = 1800 frames. Working target: ≤ 40 ms/frame for
offscreen render + encode ⇒ ≤ ~75 s worst case, seconds for typical 5–15 s
clips. These are **hypotheses until the AN-0.5 spike measures them** on real
designs in browser + WKWebView; the current exporter ends in a one-shot
`stage.toBlob()` and has never been driven 1800 times. Requirements
regardless of the numbers: progress UI with cancel; chunked rendering that
yields to the main thread; per-locale progress for batch export. An
OffscreenCanvas worker pipeline is a **separate architecture decision** if
the spike demands it — the current exporter touches `document.body` and
`HTMLImageElement`, so "move it to a worker" is a rewrite of the asset and
stage layer, not a flag.

### 6.5 State, history, and commands

- Animation edits route through `projectCommands.ts` like every other project
  mutation. History stores full snapshots (cap 80); two consequences: the
  schema keeps persisted animation small (presets, not compiled tracks —
  §4.1), and continuous controls (duration/delay sliders, scrubbing preview)
  coalesce into one history entry per gesture using the existing coalescing
  boundaries.
- Preset hover-preview and transport state are transient and never touch the
  document.
- MCP/agent surface: animation is exposed as **validated command-level
  operations** (set/clear slot preset, set scene duration, set custom
  windows), consistent with the roadmap's MCP contract — not raw project
  patches.

## 7. Tauri / macOS hardware encoding

The maintainer's requirement: on Tauri macOS, encoding must be as fast as
possible and use the M-series hardware encoder.

1. **First path (expected sufficient, verified per install):** WKWebView's
   WebCodecs sits on VideoToolbox, so the same browser code path *should* be
   hardware-accelerated in the Tauri shell — but Tauri uses the WebKit
   bundled with the installed macOS, so capabilities move with the OS.
   Treat it as **capability-tested, never guaranteed**: probe
   `isConfigSupported()` + `mediaCapabilities.encodingInfo().powerEfficient`
   at runtime, and benchmark in AN-0.5/AN-2 (acceptance: 1080×1920 @ 30 fps
   encodes faster than ~2× realtime on an M1, both codecs).
2. **Adapter boundary now, native path only if needed:** export runs behind a
   **`VideoExportAdapter`** in `src/lib/adapters/` — deliberately higher-level
   than a raw encoder wrapper, because rendering hand-off, backpressure,
   muxing, cancellation, and streamed output all cross the boundary together:
   `capabilities() → probe results`, `begin(config) → session`,
   `session.addFrame(frame)` (async, backpressured), `session.finalize() →
   streamed file`, `session.cancel()`. Browser and Tauri-WKWebView share the
   WebCodecs implementation; a native Rust/VideoToolbox implementation slots
   behind the same adapter if benchmarks disappoint.
3. **Known risk of the native path:** raw RGBA frames are ~8 MB each
   (~15 GB/clip); Tauri IPC cannot carry that naively. It needs shared
   memory or chunked transfer with backpressure. This is exactly why the
   native path is *contingency*, not plan-of-record.

## 8. Multilingual and layout-dependent recompilation

- The compiled-clip cache (§6.2) is invalidated by anything that changes
  layout: text content, font family/size/weight, box dimensions, group
  scaling, artboard resize, active locale, and **font-load completion** (a
  preview compiled before a webfont arrives is stale the moment it loads).
  This matters most for the deferred text-reveal presets, but the cache
  contract is defined now so AN-0 builds it correctly.
- Per-locale export compiles per locale — never reuses another locale's
  compiled tracks. A clip exported in N locales takes N × render time; the
  progress UI shows per-locale progress and outputs stream per locale (§6.3).
- Text overflow warnings gain a temporal dimension only once text reveals
  ship; v1 runs existing overflow checks on the final (fully-revealed) state
  and documents that.

## 9. Accessibility and motion safety

- The animated HTML export honors `prefers-reduced-motion`: animations are
  gated behind the media query and reduced-motion viewers get the settled
  (end) state.
- Preset parameter ranges are capped so no preset can produce flashing above
  ~3 Hz (photosensitivity), including emphasis loops.
- Transport is keyboard-operable (space = play/pause) and respects the
  existing shell focus conventions; this rides the roadmap's existing
  accessibility release requirements rather than inventing a parallel bar.

## 10. What v1 deliberately does not do

- No audio (container leaves room; see §2).
- No video or GIF *source* layers (animating imported video is a different
  product).
- No scene sequencing / artboard transitions (v2 — `ClipSettings.scenes` is
  reserved for it).
- No keyframe timeline UI, no property graph editor, no draggable timing
  bars.
- No text-reveal presets at first ship (deferred within the track, §4.5).
- No mobile/tablet authoring UI (desktop shell only; touch surfaces may get
  playback later).
- No animated SVG export, no Lottie, no WebM.
- Nothing server-side. Every export renders locally.

## 11. Labs track: Hyperframes / agent handoff

Hyperframes (HeyGen) renders HTML+CSS/JS to MP4 headlessly and is designed
for coding agents (GSAP, CSS, Lottie inside). The handoff is **not** an
export button; it is a package:

- "Export → Animation package (HTML)": the animated HTML export (§6.3) plus a
  `manifest.json` (clip settings, per-layer IR — compiled on demand for the
  package — fidelity warnings) and a README describing how to render it with
  the Hyperframes CLI or hand it to an agent.
- The Calqo MCP surface is the longer-term bridge, via the command-level
  animation operations of §6.5 — agents author motion through validated
  commands, and Calqo remains the renderer of record.
- Treat the Hyperframes dependency as replaceable: the package is plain
  HTML + CSS + JSON; Remotion, Motioner, or a future tool can consume the
  same artifact. Do not couple the manifest format to Hyperframes specifics.

## 12. Phasing

- **AN-0 — Schema + evaluator (no UI).** Schema v2 (strict Zod per §4.3),
  real v1→v2 migration + `GroupLayer` typing + compatibility policy (§4.4),
  preset → IR compiler with the invalidation-keyed cache (§8), evaluator.
  Tests: migration fixtures (v1 files → v2), malformed-IR rejection, golden
  evaluator values, duplication/remap invariants.
- **AN-0.5 — Rendering/encoding feasibility spike (gate for everything
  after).** Extract a reusable scene builder from `rasterExport` (after the
  shape-fill asset fix lands); wrapper-node architecture on the live stage;
  drive one stage through N timestamps; sampled-frame comparison against
  live playback; WebCodecs encode benchmark (avc1 + hvc1, browser + Tauri
  WKWebView, M1 acceptance ~2× realtime); Mediabunny mux + decode-verify;
  GIF encoder bake-off on quality/memory fixtures. Output: measured numbers
  replacing §6.4's targets, and a go/adjust decision.
- **AN-1 — Animate mode UI.** Mode toggle (per-tab, `workspaceStore`),
  inspector animation section, transport strip with display-only timing
  bars, wrapper-node playback with the §6.2 lifecycle rules, undo/redo with
  gesture coalescing, en+fr strings. Tests: command/undo/coalescing,
  playback-vs-edit interaction (edit during playback, undo during playback,
  tab/locale switch).
- **AN-2 — Local export.** `VideoExportAdapter` (§7) with streamed output,
  cancellation semantics, progress UI; MP4 (H.264 default, H.265
  runtime-gated); GIF with caps and worker encoding; structured localized
  warnings; sequential per-locale batch. Tests: cancellation/leak tests,
  decode verification, codec capability matrix (Safari / Chrome / WKWebView)
  recorded in the doc.
- **AN-3 — Animated HTML + package.** Wrapper-div transform composition,
  `@keyframes` compiler, CSS-vs-evaluator conformance sampling, group
  downgrade warnings, `prefers-reduced-motion`, Hyperframes-ready package
  (labs). Text-reveal presets enter here at the earliest, behind the
  fragment compiler.
- **AN-4 (v2) — Scenes + prompt-to-animation.** Multi-artboard sequencing,
  transitions, LLM-generated `LayerAnimation` through `safeImportProject`,
  MCP command-level animation operations.

Each phase lands behind the mode toggle; the static editor is never at risk.

## 13. Review log

**2026-07-19 — external critical review (Codex) incorporated.** Major
accepted points: compiled tracks removed from the persisted schema (single
source of truth, small history snapshots); explicit composition semantics
with transient wrapper nodes; text-reveal presets deferred (fragment
targeting was unrepresentable in the first IR sketch); "refactor not build"
claim tempered and backed by a feasibility spike (AN-0.5); migration/
compatibility section made concrete (schemaVersion rewrite, `GroupLayer`
typing, one-way-upgrade policy); mode state moved from `uiStore` to
`workspaceStore`; `videoEncoder` adapter widened to a session-based
`VideoExportAdapter`; Mediabunny replaces deprecated `mp4-muxer`; HEVC gate
reworded to runtime-supported (`isConfigSupported` ≠ hardware) with
`mediaCapabilities.encodingInfo().powerEfficient` as the added signal and
codec-specific bitrate policy; static-export semantics defined (ignore
animation); animated-HTML transform composition + group-downgrade rules;
GIF judged on quality/memory, not speed; streaming/cancellation/memory made
first-class; structured localized warnings; accessibility section added;
timing-bar dragging cut from v1 rather than under-specified; testing strategy
expanded per phase. Review also surfaced a live bug in the static exporter
(shape image-fill assets never loaded) — tracked separately.
Not adopted: dropping the preset/custom duality (kept, but as a discriminated
union with compiled output demoted to a runtime cache, which resolves the
reviewer's underlying objection).

## 14. Open questions

1. Preset param surface: how much knob-turning per preset (direction +
   distance + easing?) before it stops being "the focused 20%"?
2. Tablets driving the desktop shell (iPad PWA / Sidecar): full Animate mode,
   playback-only, or hidden in v1?
3. Should `.calqo` files with animation get a distinct library badge / open
   directly into Animate mode?
4. v1→v2 upgrade UX: exact wording/placement of the one-time notice and the
   "write v1-compatible file" option (§4.4).
5. Timing semantics to be specced in AN-1 design: animation windows vs scene
   duration (clamp or extend?), missing enter/exit states before/after
   windows, emphasis loop count vs scene length.
