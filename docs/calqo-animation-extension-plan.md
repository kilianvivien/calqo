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

| Decision          | Choice                                                    | Rationale                                                                                                                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authoring model   | **Presets compiled to a keyframe IR**                     | Canva-style enter/emphasis/exit presets cover the target user; a small keyframe IR underneath future-proofs a real timeline, agent-authored motion, and HTML export without a schema break.                                                                                                                             |
| Surface           | **Mode in the existing shell**, not a separate window     | In the browser a second window is a second app instance (Zustand stores don't cross windows; syncing over BroadcastChannel/Dexie is real complexity for no user value). The Tauri shell can later host Animate mode in a true OS window nearly for free.                                                                |
| Platforms         | **Desktop only at first**                                 | Animate mode ships on the desktop shell surface. Concretely: the phone mobile surface (`src/app/mobile/`) gets no Animate UI; the desktop shell (browser + Tauri) gets the full mode. Whether tablets driving the desktop shell (iPad PWA / Sidecar) see the mode or a playback-only preview is an open question (§12). |
| v1 export targets | **MP4 (H.264 default, H.265 option), GIF, animated HTML** | MP4/H.264 is the social deliverable every platform accepts; H.265/HEVC is offered where runtime support and benchmarks justify it (§6.3, §7). GIF is the chat/forum fallback; animated HTML doubles as the Hyperframes package. WebM is deferred (near-free later, accepted by few social platforms).                   |
| macOS encoding    | **Hardware-accelerated on M-series**                      | WKWebView's WebCodecs sits on VideoToolbox, so the in-webview path is _expected_ to be hardware-accelerated — but this is capability-tested per install, never assumed (§7). The encoder sits behind an export adapter so a native Rust/VideoToolbox path can replace it if benchmarks disappoint.                      |
| Audio             | **Out of scope for v1**                                   | Instagram/TikTok users add trending audio in-platform; muxing + licensing UX is its own project. The MP4 container path must not preclude adding an audio track later.                                                                                                                                                  |

### Critical review of the original idea (kept for the record)

- **"Secondary editor in a separate window"** — rejected for v1 (see table).
  The vision survives as a _mode_; the window comes with Tauri multi-window.
- **"Lean on Hyperframe for advanced animations"** — demoted to a labs track.
  Hyperframes is young, agent-oriented, and needs a headless render
  environment (its CLI / cloud) that local-first users don't have. It cannot
  be the answer to "export MP4"; the in-app WebCodecs path is. Where
  Hyperframes genuinely shines is the _agent_ story (§10).
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
- **CSS/WAAPI as the _primary_ renderer.** Tempting because HTML export
  exists, but the live canvas is Konva; previewing in a different renderer
  than we export from guarantees fidelity drift. Konva renders both the
  preview and the exported frames; HTML/CSS is an _export target_ with its own
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
  | 'dx'
  | 'dy'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity'
  | 'wipe-progress'
  | 'blur';

type Easing =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'overshoot'
  | 'bounce';

interface Keyframe {
  t: number; // 0–1, normalized to the owning window
  value: number; // finite; validated per-prop range
  easing?: Easing; // easing *into* this keyframe
}

interface TrackWindow {
  start: number; // ms from scene start
  duration: number; // ms, > 0, window must fit inside the scene
  tracks: { prop: AnimProp; keyframes: Keyframe[] }[]; // t ascending, unique
}

type PresetKind =
  | 'fade'
  | 'slide'
  | 'pop'
  | 'rise'
  | 'wipe'
  | 'blur-in' // enter/exit
  | 'pulse'
  | 'wiggle'
  | 'float' // emphasis
  | 'typewriter'
  | 'word-rise'; // text (later phase)

interface PresetInstance {
  kind: PresetKind;
  direction?: 'up' | 'down' | 'left' | 'right'; // slide/wipe/rise
  distance?: number; // px, slide/rise travel
  duration: number; // ms
  delay: number; // ms from slot anchor
  easing?: Easing;
  stagger?: number; // ms per child, group/list slots only
}

type LayerAnimation =
  | {
      mode: 'preset';
      enter?: PresetInstance;
      emphasis?: PresetInstance;
      exit?: PresetInstance;
    }
  | { mode: 'custom'; windows: TrackWindow[] };

interface SceneTiming {
  duration: number;
} // ms, per artboard

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
  (as today, via the Dexie adapter); `.calqo` _file_ export offers "current
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
  frame pipeline inherits that risk. Shape image-fill assets are now included
  by `collectAssetIds`; preserve that fix with a regression test during the
  refactor. AN-2 must prove that the extracted reusable renderer preserves
  fidelity before animated export ships.
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
  bitrate set _lower_ than H.264 — same bitrate would mean same file size,
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
clips. These remain **targets until AN-2 measures them** on real designs in
browser + WKWebView; the current exporter ends in a one-shot
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
   WebCodecs sits on VideoToolbox, so the same browser code path _should_ be
   hardware-accelerated in the Tauri shell — but Tauri uses the WebKit
   bundled with the installed macOS, so capabilities move with the OS.
   Treat it as **capability-tested, never guaranteed**: probe
   `isConfigSupported()` + `mediaCapabilities.encodingInfo().powerEfficient`
   at runtime, and benchmark in AN-2 (acceptance: 1080×1920 @ 30 fps
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
   native path is _contingency_, not plan-of-record.

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
- No video or GIF _source_ layers (animating imported video is a different
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

## 12. Delivery model and status conventions

Animation is a post-beta track. It must not silently become a prerequisite for
the reliability and 1.0 work in `docs/plan.md`.

### 12.1 Milestone order

| Milestone | Outcome                                                  | Depends on                    | Gate                                                                |
| --------- | -------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| AN-0 ✅   | Schema v2, preset compiler, evaluator                    | Stable schema/import contract | Unit and migration gate — **passed 2026-07-19**                     |
| AN-0.5 ✅ | Renderer/encoder architecture accepted with bounded risk | AN-0                          | **Go (risk accepted) 2026-07-19; measurements transferred to AN-2** |
| AN-1 ✅   | Usable desktop Animate mode and live playback            | AN-0                          | Editor interaction gate — **passed 2026-07-19**                     |
| AN-2      | Local MP4 and GIF export                                 | AN-1                          | Export correctness/performance gate                                 |
| AN-3      | Animated HTML and agent handoff package                  | AN-2 IR stability             | Cross-renderer conformance gate                                     |
| AN-4      | Scenes, transitions, prompt/MCP animation                | AN-3                          | Separate v2 product decision                                        |

AN-0 may be implemented without exposing UI. AN-0.5 is closed by the dated
risk-acceptance decision in `docs/animation/AN-0.5-decision.md`; AN-1 may
proceed without export benchmarks. Renderer, memory, codec, and decode evidence
is an AN-2 shipping gate and may narrow an export format without blocking the
editor/playback surface. AN-3 and AN-4 are separately shippable and do not
delay the first useful MP4 release.

### 12.2 Status markers

Use the following markers in this document as work lands:

- `[ ]` not started.
- `[~]` in progress or partially complete; add a dated note explaining what
  remains.
- `[x]` complete and verified; include the verification commands or manual
  matrix where relevant.
- `[!]` blocked; state the blocking decision or external capability.

When a milestone completes, add a status banner beneath its heading with the
completion date, the last verified app version, and its acceptance result.
Update `docs/plan.md` only when the animation track becomes scheduled or ships;
do not make the beta roadmap appear blocked by this document.

### 12.3 Cross-cutting rules for every milestone

- Keep all persisted animation data in `src/lib/schema/`; do not create a
  second unvalidated animation document format.
- Route document mutations through `src/editor/commands/projectCommands.ts`.
- Keep transport time, playback status, hover preview, compiled clips, Konva
  wrapper refs, export progress, and abort handles out of the project schema
  and undo history.
- Put filesystem/download/runtime differences behind adapters in
  `src/lib/adapters/`.
- Add every user-facing string to both `src/locales/en` and
  `src/locales/fr` in the same change.
- Preserve light, dark, and `html[data-transparency="solid"]` behavior for all
  new controls.
- Keep static PNG/JPG/WebP/SVG/HTML behavior unchanged. Animation-specific
  exports must be new paths, not modes hidden inside static exporters.
- Run `pnpm typecheck` and `pnpm test` for every implementation step. Run
  `pnpm lint` and `pnpm build` at each milestone gate. Add focused Playwright
  coverage when UI or download flows become available.
- Do not add H.265-specific dependencies in v1. Add Mediabunny and `gifenc`
  only in AN-2 when their adapters are implemented; keep worker code scoped to
  the capped GIF path unless AN-2 measurements require a render worker.

## 13. Detailed implementation sequence

### AN-0 — Schema v2, compiler, and evaluator

> **[x] Complete — 2026-07-19 (app v0.4.6, branch `feature/animation-an0`).**
> Acceptance met: `pnpm typecheck`, `pnpm test` (408 tests), `pnpm lint`, and
> `pnpm build` all pass. Schema bumped to v2 with a real v1→v2 migration; all
> static fixtures/tests stay green. Preset compiler + evaluator run in unit tests
> without React or Konva. No animation dependency has entered the UI, export
> adapter, or file writer. New code: `src/lib/schema/schema.ts` (animation
> primitives), `migrations.ts` (migrate + downgrade helpers), `calqoFile.ts`
> (v1-compatible serializer), `src/editor/animation/{types,presets,compiler,easing,evaluator}.ts`,
> and tests `animationSchema/animationCompiler/animationEvaluator/animationMigration.test.ts`.
> Permanent fixture set (§14.2) lives in `src/tests/fixtures/animation/` (frozen
> v1 doc, static v2, all-presets v2, custom-boundary v2, nested-group v2) with
> migration/round-trip/compile coverage in `animationFixtures.test.ts`.
> Duplication, backup-restore, and starter/template adoption preserve animation
> by construction — all route through the shared `safeImportProject` +
> `remapProjectAssetIds` pair, and the §4.3 no-id-rewrite invariant is enforced
> in `animationMigration.test.ts`. Deferred to AN-1 as designed: the `.calqo`
> compatibility-export UI (serializer + tests landed here) and any
> playback/inspector surface.

**Goal:** establish a strict, deterministic animation contract with no user
interface and no export dependency.

#### AN-0.1 Freeze timing and composition semantics

- [x] Write executable examples for one enter, emphasis, and exit animation
      before changing the schema. Include expected values immediately before,
      within, and after each window.
- [x] Resolve the timing rules that currently remain open:
  - A scene has a minimum of 250 ms and a maximum of 60,000 ms.
  - A preset window that would end after the scene is rejected by the command
    layer; it is not silently truncated.
  - Before an enter window, the layer holds the preset's hidden start state.
  - After enter, it holds identity until emphasis or exit.
  - Emphasis repeats only inside its allocated window and evaluates to
    identity at its end.
  - After exit, the layer holds the preset's hidden end state.
  - Missing slots always evaluate to identity in their region.
- [x] Define numeric precision: evaluator output keeps full JavaScript number
      precision; serializers round only at their output boundary.
- [x] Define direction in artboard coordinates, independent of layer rotation:
      `up` means negative artboard Y and `left` means negative artboard X.
- [x] Record the settled rules in §4.2 and in table-driven tests so later UI
      code cannot invent different behavior.

**Exit:** timing fixtures can be reviewed without reading the evaluator.

#### AN-0.2 Add strict schema primitives

Primary files:

- `src/lib/schema/schema.ts`
- `src/lib/schema/migrations.ts`
- `src/lib/schema/defaults.ts`
- `src/lib/schema/fixture.ts`
- `src/tests/unit/schema.test.ts`
- new `src/tests/unit/animationSchema.test.ts`

Steps:

- [x] Add strict Zod schemas for `AnimProp`, `Easing`, `Keyframe`,
      `Track`, `TrackWindow`, `PresetKind`, `PresetInstance`, `LayerAnimation`,
      `SceneTiming`, and `ClipSettings`.
- [x] Use `.finite()` for every numeric value. Apply property-specific ranges:
      opacity `0–1`, scale greater than `0` and capped, blur non-negative and
      capped, rotation/distance bounded, normalized `t` in `0–1`, duration/delay
      within scene limits, and stagger non-negative.
- [x] Require at least two keyframes per track, strictly increasing unique
      `t` values, and no duplicate property inside one window.
- [x] Add `superRefine` checks for window bounds, per-property overlap, preset
      slot compatibility, direction-only preset kinds, and text-only preset kinds
      once those kinds are enabled.
- [x] Add optional `animation` to the shared base layer shape and explicitly to
      the hand-declared `GroupLayer` TypeScript interface/type path. Confirm every
      layer variant retains it after parse.
- [x] Add optional `timing` to artboards and optional `clipSettings` to the
      project. Defaults must preserve static behavior without injecting animation
      blocks into old documents unnecessarily.
- [x] Export inferred types from `src/lib/schema/index.ts`; runtime animation
      modules import those types instead of redeclaring them.
- [x] Bump `CURRENT_SCHEMA_VERSION` from `1` to `2` only when the migration and
      all fixture updates are present in the same change.

Tests:

- [x] Accept a static v2 project with no animation fields.
- [x] Accept one valid instance of every v1 preset and every animatable
      property.
- [x] Reject `NaN`, infinities, out-of-range values, unordered/equal keyframe
      times, empty tracks, duplicate props, overlapping custom windows, unsupported
      slot/preset combinations, and windows outside scene duration.
- [x] Verify unknown animation fields are not treated as an extension escape
      hatch.
- [x] Parse all existing project fixtures after migration.

**Exit:** the schema represents every v1 preset, rejects ambiguous timing, and
keeps an unanimated project small.

#### AN-0.3 Implement migration and file compatibility

Primary files:

- `src/lib/schema/migrations.ts`
- `src/editor/export/calqoFile.ts`
- `src/lib/adapters/file/FileImportExportAdapter.ts`
- new versioned fixtures under `src/tests/fixtures/animation/`

Steps:

- [x] Add `migrateV1ToV2`: clone the raw document, set `schemaVersion: 2`, and
      leave all otherwise-valid project content unchanged.
- [x] Make `migrateToCurrent` fail clearly when a migration step is missing;
      it must not fall through to an opaque literal-version validation error.
- [x] Add a frozen v1 `.calqo` fixture with nested groups, assets, all core
      layer kinds, and multiple locales. Assert the migrated project is v2 and
      semantically identical.
- [x] Add a v2 animated `.calqo` fixture and assert full export/import
      round-trip.
- [x] Add a helper that determines whether a v2 project can be downgraded to
      v1. The only allowed case is no animation, no scene timing, and no other v2
      fields.
- [x] Implement explicit v1-compatible project serialization without mutating
      the live project. Keep the envelope format version separate from project
      schema version.
- [x] Add the compatibility choice to the `.calqo` export design backlog; the
      UI itself may land in AN-1, but the serializer and tests land here.
- [x] Verify Dexie read migration and import migration use the same
      `safeImportProject` path or produce identical results.
- [x] Verify duplication, backup restore, starter/template adoption, and asset
      remapping preserve animation. No animation id rewrite should be necessary;
      add an invariant test so this remains true.

**Exit:** old files open, animated files round-trip, and unanimated projects
can deliberately produce a v1-compatible document.

#### AN-0.4 Build the preset catalog and compiler

Create:

- `src/editor/animation/presets.ts`
- `src/editor/animation/compiler.ts`
- `src/editor/animation/types.ts` for runtime-only types
- `src/tests/unit/animationCompiler.test.ts`

Steps:

- [x] Define preset metadata independently of localized labels: supported
      slots, allowed layer kinds, default duration/delay/direction/distance/easing,
      safe parameter ranges, and whether a preset repeats.
- [x] Implement enter and exit compilation for fade, slide, pop, rise, wipe,
      and blur-in. Exit variants reverse the semantic motion without reversing
      easing incorrectly.
- [x] Implement pulse, wiggle, and float emphasis as finite tracks. Compiler
      output must end at identity even when the available window is not an exact
      multiple of the loop period.
- [x] Make compiler output immutable and deterministic: the same document,
      locale, font-layout signature, and preset catalog version produce byte-for-
      byte equivalent track data.
- [x] Reject unsupported layer/preset combinations before compilation and
      return structured issues with layer id, slot, and reason.
- [x] Define a `CompiledClip` containing scene duration, fps, layer ids, and
      normalized runtime tracks. Do not persist it or attach it to Zustand project
      state.
- [x] Define a cache key from only compilation inputs. Include project id,
      artboard id, active locale, timing, animation values, relevant layer
      geometry/style/content, loaded-font revision, and compiler version.
- [x] Implement a small bounded cache with explicit invalidation APIs; do not
      depend on object identity because Immer replaces object branches.

Tests:

- [x] Snapshot/golden test every preset at defaults.
- [x] Test min/max allowed parameters and all directions.
- [x] Assert enter/emphasis/exit property windows do not overlap.
- [x] Assert output is identity at all slot boundaries that should settle.
- [x] Assert cache hits for irrelevant project changes and misses for every
      layout-affecting input named in §8.

**Exit:** all v1 presets compile into one deterministic runtime IR.

#### AN-0 step 5 — Implement easing and evaluation

Create:

- `src/editor/animation/easing.ts`
- `src/editor/animation/evaluator.ts`
- `src/tests/unit/animationEvaluator.test.ts`

Steps:

- [x] Implement each easing as a pure function mapping clamped `0–1` input to
      a finite output. Document whether overshoot/bounce may exceed `0–1` before
      property clamping.
- [x] Evaluate keyframes with binary search or an equally bounded lookup; do
      not allocate per layer per frame in the hot path.
- [x] Return wrapper overrides only for properties that differ from identity.
      Use one documented identity object for reset behavior.
- [x] Apply composition rules once: dx/dy/rotation additive, scales and
      opacity multiplicative, reveal/blur dedicated.
- [x] Define exact behavior for negative time, time after scene duration, zero
      active tracks, hidden layers, and missing/deleted layer ids.
- [x] Add a bulk evaluator API that writes into reusable output objects for
      export, while retaining a simple allocation-friendly API for tests.

Tests:

- [x] Golden values at 0%, 25%, 50%, 75%, and 100% for each easing.
- [x] Boundary values one millisecond before/at/after every slot.
- [x] Base opacity/rotation/scale composition cases.
- [x] Determinism over repeated runs and no mutation of project/compiled data.
- [x] A 1,800-frame synthetic evaluation benchmark recorded as a non-flaky
      diagnostic, not a timing assertion in CI.

**AN-0 milestone acceptance:**

- [x] `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build` pass.
- [x] Static v1 fixtures migrate and existing static tests remain green.
- [x] No animation dependency has entered the UI, export adapter, or file
      writer yet.
- [x] A developer can compile and evaluate a preset-only animated artboard in
      a unit test without mounting React or Konva
      (`animationCompiler.test.ts`, `animationEvaluator.test.ts`).

### AN-0.5 — Rendering and encoding feasibility decision

> **[x] Complete by risk acceptance — 2026-07-19 (app v0.4.6).**
> Gate outcome: **Go**; AN-1 may proceed. Fixtures + measurement harness +
> capability probe are in place and green
> (`pnpm typecheck`/`test`/`lint`/`build`, 425 tests). The renderer and encoder
> stubs were not implemented or measured; that work is transferred to the AN-2
> export shipping gate. Delivered: the durable renderer contract
> `src/editor/rendering/offscreenScene.ts` (interface + not-implemented stub);
> five representative fixtures parameterized by size/duration in
> `src/tests/fixtures/animation/spikeFixtures.ts`; the measurement protocol +
> collector, dependency-free WebCodecs capability probe, encoder/GIF seams, and
> orchestrator under `src/spike/animation/` (`runSpike` already produces real
> evaluator-throughput numbers; render/encode report `skipped` until the stubs
> land); `animationSpike.test.ts`; and the dated decision
> `docs/animation/AN-0.5-decision.md`. **No new production dependencies.**
> Offscreen implementation, fidelity sampling, real encode/mux, GIF quality
> review, and per-runtime measurement now land as part of AN-2.

**Goal:** bound the renderer/encoder risk before committing to the full UI.
The maintainer accepted the remaining risk so editor work can proceed; export
does not ship until AN-2 produces the missing evidence.

#### AN-0.5.1 Create representative fixtures and measurement protocol

- [x] Build at least five fixtures: flat vector brand card, photo-heavy story,
      nested groups, creative effects/masks/frames, and multilingual text with a
      webfont. (`spikeFixtures.ts`; validated + compiled in `animationSpike.test.ts`.)
- [x] Include 1080×1080 and 1080×1920 outputs at 5 s, 15 s, and synthetic 60 s.
      (Fixtures are parameterized; `defaultSpikeConfigs` sweeps the full matrix.)
- [x] Record the intended environment and explicitly document that no valid
      benchmark was performed. Full machine/browser/WebView, codec, timing,
      memory, output, and decode measurements are transferred to AN-2.
      (`measurement.ts` remains the collector; see the decision record.)
- [x] Put the reusable fixture projects in test fixtures; do not depend on a
      maintainer's private documents. (Photo fixture uses a tiny embedded PNG;
      swap in a licensed photo locally for banding review.)

#### AN-0.5.2 Extract a reusable offscreen scene

> **Transferred to AN-2.** These are implementation/export acceptance tasks,
> not prerequisites for AN-1.

Primary files:

- `src/editor/export/rasterExport.ts`
- new `src/editor/rendering/offscreenScene.ts`
- existing helpers in `src/editor/canvas/`

Steps:

- [ ] Inventory fidelity drift between `LayerRenderer.tsx` and
      `rasterExport.ts`. Convert the inventory into tests or tracked limitations.
- [ ] Note that shape image-fill collection is already present in
      `collectAssetIds`; add/retain a regression test instead of scheduling that
      issue as unfixed work.
- [ ] Extract asset discovery/loading, stage construction, draw, capture, and
      cleanup into an offscreen-scene lifecycle:
      `create → applyOverrides → render → capture → dispose`.
- [ ] Build the Konva stage once per artboard/locale/export job. Load assets
      and fonts once, and revoke every object URL exactly once on dispose.
- [ ] Give every animated layer a wrapper `Group` registered by layer id.
      Keep the base node geometry identical to static rendering.
- [ ] Apply rotation/scale around the layer center without shifting its base
      geometry. Verify nested groups and rotated children visually and numerically.
- [ ] Support identity reset in one pass and make stale/deleted registry
      entries harmless.
- [ ] Refactor the current one-shot raster export to use the scene builder, or
      explicitly defer that integration if it adds risk. Either way, run static
      export regression tests against the same fixtures.

#### AN-0.5.3 Prove sampled frame fidelity

> **Transferred to AN-2.** Retain this checklist as the renderer acceptance
> matrix.

- [ ] Render reference frames at `0`, `25%`, `50%`, `75%`, and end time for
      each fixture.
- [ ] Compare offscreen output with live-stage playback at matching timestamps.
      Use pixel-diff thresholds for stable fixtures and documented visual review
      for font/filter cases that are platform-sensitive.
- [ ] Verify wrapper reset reproduces the static export pixel result.
- [ ] Verify repeated captures do not grow the stage node count, DOM container
      count, asset URL count, or registry size.
- [ ] Measure whether `stage.toCanvas()`, `transferToImageBitmap`, or
      `VideoFrame(canvas)` provides the safest capture handoff on each target.

#### AN-0.5.4 Probe WebCodecs and MP4 muxing

> **Transferred to AN-2.** H.264 + Mediabunny is the v1 plan; H.265 is deferred.

- [ ] Add a spike-only capability probe for H.264 configurations at target
      resolutions/fps/bitrates. Probe H.265 separately and treat it as optional.
- [ ] Evaluate Mediabunny's current browser/Tauri compatibility and bundle
      cost before adding it as a production dependency.
- [ ] Encode frames with explicit microsecond timestamps and durations,
      a roughly two-second keyframe cadence, queue backpressure, and prompt
      `VideoFrame.close()` calls.
- [ ] Flush before mux finalization, then decode the output with an independent
      browser/media-tool smoke path.
- [ ] Test odd artboard dimensions and settle whether export crops or pads to
      even dimensions. The choice must be visible in readiness warnings if output
      pixels change.
- [ ] Test cancellation during rendering, during encoder backlog, and during
      finalization. Confirm partial data is discarded.
- [ ] Benchmark Chrome, Safari, and the Tauri WKWebView on at least one M1-class
      machine. Record `isConfigSupported`, `mediaCapabilities.encodingInfo`, and
      measured throughput separately; no single signal proves hardware encoding.

#### AN-0.5.5 Select a GIF encoder

> **Decision:** use `gifenc` provisionally with the existing caps and
> per-frame palettes; accept no-dithering/photo banding as a disclosed v1
> limitation. Quality and responsiveness checks move to AN-2.

- [ ] During AN-2, compare `gifenc` fixture output with one viable browser
      alternative if its no-dithering limitation is unacceptable.
- [ ] Use the fixture set to compare global/per-frame palettes, dithering,
      banding, transparency behavior, peak memory, worker compatibility, bundle
      size, and encode time.
- [ ] Verify the planned caps (15 s, 720 px long edge, 15 fps) keep memory and
      UI responsiveness acceptable.
- [x] Record the provisional choice and rejected server-oriented alternative
      in the decision record.

#### AN-0.5.6 Make the gate decision

> **[x] Go (risk accepted) — 2026-07-19.** See
> `docs/animation/AN-0.5-decision.md`. The missing measurement evidence is an
> AN-2 export shipping gate, not an AN-1 prerequisite.

Produce a dated decision block containing:

- [x] Explicitly record that measurements were waived and transferred to AN-2.
- [x] Choose the initial capture handoff, muxer, GIF encoder, even-dimension,
      and output strategies, each with a fallback.
- [x] H.264 is assumed viable behind a runtime probe; AN-2 must measure it.
- [x] H.265 is deferred.
- [x] No native VideoToolbox contingency is scheduled; reconsider only after a
      failed Tauri AN-2 acceptance run.
- [x] Main-thread rendering with bounded yielding is the initial architecture;
      AN-2 may require an OffscreenCanvas architecture spike.
- [x] §6.4 retains explicit targets, with measurement ownership moved to AN-2.

**Gate outcomes:**

- **Go:** proceed with the architecture as written.
- **Adjust:** update §§6–7 and proceed only after the changed architecture is
  reviewed.
- **Stop:** do not build AN-1; keep schema/evaluator dormant and document why
  local export is not viable yet.

### AN-1 — Desktop Animate mode and playback

> **[x] Complete — 2026-07-19 (app v0.4.6, branch `feature/animation-an0`).**
> Acceptance met: `pnpm typecheck`, `pnpm test` (449 tests, +24 for AN-1),
> `pnpm lint`, and `pnpm build` all pass. Verified live in the browser preview:
> Design/Animate toggle switches per tab; the tool rail collapses to select/pan
> in Animate mode; the inspector shows the Animation section (scene duration +
> fps + per-slot preset cards built from `PRESET_CATALOG`, with conditional
> direction/distance/duration/delay/easing controls); committing a preset drives
> live playback through the transport (play/pause/scrub, current/total time,
> read-only per-layer timing bars) with no console errors. Static editing and the
> phone shell are unchanged (wrappers are desktop-only and identity at rest).
> New code: `src/lib/state/animationPlaybackStore.ts` (transient, never
> persisted), `workspaceStore.ts` per-project mode map,
> `src/editor/animation/{wrapperNode,validate,useAnimationPlayback}.ts`,
> animation commands in `projectCommands.ts` (set/clear slot preset, params,
> scene duration, fps — validated before commit, coalesced, undoable),
> transient wrapper groups in `CalqoStage.tsx`, and the shell UI under
> `src/app/shell/animation/{AnimationInspector,AnimationTransport,TimingOverview}.tsx`
> plus the Design/Animate toggle in `TitleBar.tsx`, tool-rail restriction,
> inspector Animation tab, and layer-row slot badges. EN + FR strings added under
> `animate.*`. Tests: `animationCommands.test.ts`, `animationPlayback.test.ts`.
> Deferred as designed: the `.calqo` compatibility-export UI wording (serializer
> landed in AN-0); draggable timing bars (display-only in v1); text-reveal
> presets (AN-3); all local video/GIF/HTML export (AN-2+).

**Goal:** let a user add preset animation, preview it, scrub it, and undo/redo
it without compromising static editing.

#### AN-1.1 Add per-tab mode and transient playback state

Primary files:

- `src/lib/state/workspaceStore.ts`
- new `src/lib/state/animationPlaybackStore.ts`
- `src/app/shell/Workspace.tsx`
- `src/app/shell/TabBar.tsx`

Steps:

- [x] Extend persisted workspace state with a mode map keyed by project id,
      not one global mode. Sanitize missing/closed ids during hydration.
- [x] Default every project to Design mode. Decide whether mode persists across
      restart; if it does, it remains workspace preference, never project data.
- [x] Create a transient playback store keyed by project id/artboard id with
      status, current time, preview override, and monotonic playback origin.
- [x] Expose explicit `play`, `pause`, `seek`, `stopAndReset`, and
      `previewPreset` actions. Do not persist this store.
- [x] Stop/reset on tab close/switch, artboard switch, locale switch,
      project replacement/import, and component unmount.

#### AN-1.2 Add wrapper nodes to the live renderer

Primary files:

- `src/editor/canvas/LayerRenderer.tsx`
- `src/editor/canvas/CalqoStage.tsx`
- new `src/editor/animation/useAnimationPlayback.ts`

Steps:

- [x] Introduce one transient wrapper group per layer while preserving the
      existing node registry contract used by selection and transforms.
- [x] Keep selection outlines and transformer attachment on base geometry or a
      stable selection target; animated transforms must not be committed when the
      user begins a transform.
- [x] Drive wrappers through one `Konva.Animation`/RAF loop using the pure
      evaluator. Avoid React state updates every frame.
- [x] Pause/reset before drag, transform, crop, text edit, layer creation,
      delete, group/ungroup, locale change, undo, or redo.
- [x] Reset on playback end and on React error recovery.
- [x] Verify mobile `MobileStage.tsx`, which reuses `LayerRenderer`, receives
      identity wrappers only and exposes no Animate UI.

#### AN-1.3 Add animation commands and history behavior

Primary file: `src/editor/commands/projectCommands.ts`

- [x] Add commands to set/replace/clear an enter, emphasis, or exit preset.
- [x] Add commands to update preset parameters, set scene duration, set clip
      fps, clear all animation on a layer, and clear all animation on an artboard.
- [x] Validate the candidate project/animation block before committing it.
      Commands return structured failure reasons for invalid window bounds.
- [x] Coalesce pointer-driven duration/delay/distance changes into one undo
      step per gesture. Select changes and clear actions remain discrete steps.
- [x] Confirm undo/redo restores only document state, then stops/resets
      playback and invalidates compiled caches.
- [x] Ensure duplicate/copy/paste/group/ungroup semantics are explicit:
      animation follows duplicated layers; grouping does not silently invent or
      flatten animation; ungrouping preserves child animation.

#### AN-1.4 Build the mode shell

Primary files:

- `src/app/shell/TitleBar.tsx` or `Workspace.tsx` for the mode toggle
- `src/app/shell/ToolRail.tsx`
- `src/app/shell/Inspector.tsx`
- `src/app/shell/inspector/LayersPane.tsx`
- new `src/app/shell/animation/AnimationInspector.tsx`
- new `src/app/shell/animation/AnimationTransport.tsx`
- new `src/app/shell/animation/TimingOverview.tsx`

Steps:

- [x] Add a Design/Animate segmented control visible only on the desktop shell.
- [x] In Animate mode, restrict the tool rail to selection and pan but keep
      geometry editing available through canvas/inspector.
- [x] Annotate each layer row with enter/emphasis/exit state. Badges must remain
      legible at narrow desktop widths and not replace visibility/lock controls.
- [x] Build preset cards from catalog metadata rather than duplicating preset
      knowledge in JSX.
- [x] Add controls only when supported by the chosen preset: direction,
      distance, duration, delay, easing, and (later) stagger.
- [x] Make hover/focus preview transient. Committing a card creates exactly one
      history entry; leaving/cancelling restores the prior playback state.
- [x] Build the bottom transport with play/pause, jump-to-start, scrubber,
      current/total time, scene duration, fps, and display-only timing bars.
- [x] Disable or explain playback when no layer is animated; do not show a
      blank error state.
- [x] Add one-time schema-upgrade and v1-compatible export copy after wording
      is approved.

#### AN-1.5 Accessibility, responsive behavior, and localization

- [x] Add EN/FR strings for mode, slots, presets, directions, easing, timing,
      validation, playback, upgrade, and compatibility export.
- [x] Give the mode toggle, preset picker, parameter fields, and transport full
      keyboard access and visible focus.
- [x] Use Space for play/pause only when focus is not in an editable control;
      reuse `src/app/keyboardGuards.ts` conventions.
- [x] Announce play/pause and validation failures without announcing every
      frame/time tick.
- [x] Respect reduced motion for automatic hover previews; explicit user-
      initiated playback may still run.
- [x] Verify light, dark, solid-transparency, 200% zoom, keyboard-only, and
      coarse-pointer desktop shell behavior.
- [x] Keep phone UI unchanged. Record the tablet decision before release.

#### AN-1.6 Tests and acceptance

- [x] Unit-test commands, validation failures, history coalescing, duplication,
      and cache invalidation.
- [x] Component-test mode-per-tab behavior, preset commit/cancel, conditional
      controls, and localized labels.
- [x] Integration-test edit/undo/tab/locale switches during playback.
- [x] Add Playwright coverage: open static project → enter Animate → apply
      slide/fade/pulse → scrub → undo/redo → reload → verify persistence.
- [x] Manually verify no wrapper transform is committed into layer `x/y/w/h`,
      rotation, scale, or opacity.

**AN-1 milestone acceptance:** a user can animate a static design with presets,
preview and scrub it, switch modes/tabs/locales safely, and undo every document
change. Static and mobile flows remain unchanged.

### AN-2 — Local MP4 and GIF export

> **[~] Implementation complete — 2026-07-19; runtime acceptance pending.**
> `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` (465 tests,
> +16 focused AN-2 tests) pass. Delivered: the video adapter/session/sink
> contracts; lazy WebCodecs/Mediabunny H.264 capability probing and MP4 muxing;
> reusable Konva offscreen scenes; integer-index frame orchestration with
> progress, backpressure, cancellation, cleanup, and sequential locale jobs;
> capped `gifenc` export through a dedicated worker with an inline fallback;
> and MP4/GIF controls, capability summaries, localized structured warnings,
> progress, and Cancel in the export dialog. Remaining before milestone
> acceptance: decode/visual verification of real outputs, 5/15/60-second memory
> and responsiveness measurements, and the Chrome/Safari/Tauri capability
> matrix listed in AN-2.6.

**Goal:** produce reliable social-ready files locally with bounded memory,
honest capability reporting, progress, and cancellation.

#### AN-2.1 Introduce export contracts and structured warnings

Create or update:

- `src/lib/adapters/video/VideoExportAdapter.ts`
- `src/lib/adapters/index.ts`
- `src/editor/export/exportWarnings.ts`
- new `src/editor/export/animationExportReadiness.ts`

Steps:

- [ ] Define capability results separately for codec support, power-efficiency
      signal, streaming destination support, max tested size/fps, and reason codes.
- [ ] Define a session contract with async `addFrame`, `finalize`, and
      idempotent `cancel`/`dispose` behavior.
- [ ] Define output sinks for browser download and Tauri streaming. Avoid
      changing the existing text-oriented file adapter into a video-specific
      abstraction.
- [ ] Expand structured warning codes for unsupported codec, software/unknown
      efficiency, odd-dimension adjustment, GIF caps, unsupported effect,
      missing asset, text overflow, memory fallback, cancellation, and partial
      output cleanup.
- [ ] Localize codes at the UI boundary; adapter and exporter code returns
      codes plus parameters only.

#### AN-2.2 Implement the WebCodecs/Mediabunny adapter

- [ ] Add current Mediabunny and `gifenc` versions and record their licenses.
- [ ] Probe codec configurations lazily when the export dialog opens; cache
      results only for the current runtime session.
- [ ] Implement H.264 presets for square, portrait, and arbitrary sizes with a
      documented bitrate policy and approximately two-second GOP.
- [ ] Keep H.265 deferred for v1. If reconsidered later, label it
      runtime-supported and potentially power-efficient, never guaranteed
      hardware-accelerated.
- [ ] Apply encoder queue backpressure before rendering the next frame.
- [ ] Close every frame in `finally`; make flush/mux errors cancel and dispose
      the whole session.
- [ ] Stream muxed chunks to the selected sink where supported. If browser
      fallback requires a final Blob, enforce a preflight size estimate and show
      an honest memory warning.
- [ ] Make cancellation safe before first frame, mid-frame, during backpressure,
      during flush, during mux finalization, and after finalization.

#### AN-2.3 Implement frame orchestration

Create `src/editor/export/animatedFrameExport.ts`.

- [ ] Compile once per artboard/locale and build one offscreen scene.
- [ ] Derive frame count and timestamps from integer frame indices to prevent
      cumulative floating-point drift.
- [ ] Apply evaluator output, draw, capture, enqueue, update progress, and yield
      to the main thread at a measured cadence.
- [ ] Thread one `AbortSignal` through font/asset load, frame generation,
      encoder, muxer, and sink.
- [ ] Report phases (`preparing`, `rendering`, `encoding`, `finalizing`) plus
      completed/total frames and current locale.
- [ ] Run multi-locale targets sequentially. Finish and release each output
      before starting the next; do not ZIP videos in memory.
- [ ] Reset/dispose the scene and revoke URLs on success, failure, and cancel.

#### AN-2.4 Implement GIF worker export

- [ ] Create a dedicated worker and typed message protocol for init, frame,
      progress, finish, cancel, error, and dispose.
- [ ] Enforce caps in both UI and worker input validation.
- [ ] Downscale with a documented high-quality strategy and preserve aspect
      ratio.
- [ ] Apply the palette/dithering policy selected in AN-0.5.
- [ ] Transfer frame buffers where possible and release them promptly.
- [ ] Confirm worker cancellation terminates work and releases large buffers.

#### AN-2.5 Extend the export dialog

Primary file: `src/app/shell/ExportDialog.tsx`; split animation-specific UI
into subcomponents before the file becomes harder to maintain.

- [ ] Add MP4 and GIF only when the active project/artboard is eligible.
- [ ] Show codec, resolution, fps, duration, estimated frame count, and runtime
      capability before export.
- [ ] Default MP4 to H.264. Hide or disable H.265 with a precise reason when
      unavailable.
- [ ] Enforce GIF caps interactively and show the effective resized/fps output.
- [ ] Show structured warnings grouped by artboard/layer where possible.
- [ ] Add progress and Cancel. Prevent duplicate exports while a job is active.
- [ ] On close during export, ask to cancel or keep the dialog open; never
      orphan a job.
- [ ] Keep existing static export controls and results unchanged.

#### AN-2.6 Verification matrix

- [ ] Unit-test frame timestamp math, bitrate/config selection, warning
      localization parameters, abort propagation, and sequential locale ordering.
- [ ] Use fake encoders/sinks to test backpressure, failure at every lifecycle
      phase, idempotent cancellation, and cleanup.
- [ ] Decode-verify generated MP4 duration, dimensions, frame count/tolerance,
      codec, and first/middle/last visual frames.
- [ ] Verify GIF dimensions, effective fps, loop behavior, transparency policy,
      and visual quality fixtures.
- [ ] Run 5 s, 15 s, and 60 s jobs while monitoring responsiveness and memory.
- [ ] Record a capability matrix for Chrome, Safari, and Tauri WKWebView. Test
      unsupported-H.264 fallback explicitly.
- [ ] Add Playwright coverage for capability-disabled UI and a mocked successful
      export; keep real codec verification in an environment-controlled suite.

**AN-2 milestone acceptance:** H.264 MP4 and capped GIF export complete locally,
decode successfully, show truthful progress/capabilities, cancel cleanly, and
do not regress static or multi-locale export.

### AN-3 — Animated HTML and agent handoff

**Goal:** export a self-contained animated representation of the same IR and a
tool-neutral package suitable for Hyperframes or another coding agent.

#### AN-3.1 Build the CSS animation compiler

Create:

- `src/editor/export/animationCssCompiler.ts`
- `src/tests/unit/animationCssCompiler.test.ts`

Steps:

- [ ] Convert compiled tracks into stable, collision-resistant `@keyframes`
      names scoped to the exported document.
- [ ] Generate percentages from absolute clip time so sequential windows and
      holds remain identical to evaluator semantics.
- [ ] Compose base transforms on the inner layer element and animation
      transforms on a wrapper element.
- [ ] Map wipe to `clip-path` and blur to `filter` only where the HTML fidelity
      analyzer allows it; otherwise return structured downgrade warnings.
- [ ] Keep finite emphasis repetition and final state identical to MP4.
- [ ] Gate animation behind `prefers-reduced-motion: no-preference`; reduced-
      motion output renders the settled end state without a flash of hidden
      content.

#### AN-3.2 Extend editable HTML rendering

Primary file: `src/editor/export/htmlLayoutExport.ts`.

- [ ] Add wrapper divs only for animated layers; preserve current static HTML
      structure when the project has no animation.
- [ ] Carry layer/artboard identifiers as sanitized data attributes useful for
      diagnostics and agents, not as runtime dependencies.
- [ ] For groups that rasterize, animate the group as one unit. Emit one warning
      per lost child animation and never silently flatten it.
- [ ] Ensure embedded fonts/assets and CSP assumptions still work in a fully
      self-contained file.
- [ ] Define standalone and snippet behavior; snippets must include required
      scoped keyframes without polluting host-page names.

#### AN-3.3 Add cross-renderer conformance tests

- [ ] Sample the evaluator and browser-computed wrapper styles at the same
      timestamps for every transform/opacity preset.
- [ ] Compare translate, scale, rotation, opacity, clip, and blur within stated
      tolerances.
- [ ] Include non-zero base rotation/opacity, nested groups, locale changes,
      and reduced-motion mode.
- [ ] Snapshot structured downgrade warnings and their EN/FR presentation.

#### AN-3.4 Build the neutral animation package

- [ ] Export `index.html`, assets, `manifest.json`, and `README.md` in a ZIP.
- [ ] Version the manifest independently. Include clip settings, artboard
      dimensions, locale, layer metadata, compiled IR, warnings, and content hashes.
- [ ] Do not include provider keys, local paths, project history, private
      settings, or raw Dexie records.
- [ ] Document a Hyperframes command as one consumer example, while keeping the
      package usable by any headless browser renderer.
- [ ] Validate the manifest against a schema before download and add a package
      round-trip fixture.

#### AN-3.5 Consider text reveals as a separately gated sub-milestone

- [ ] Build a fragment compiler from final text layout per locale; fragments
      are runtime-only.
- [ ] Invalidate on text, font, font-load revision, box size, line height,
      letter spacing, alignment, and locale changes.
- [ ] Implement typewriter and per-word rise only after live/MP4/HTML fragment
      output conforms on the fixture matrix.
- [ ] Keep text reveals behind a feature flag until font-loading and line-wrap
      behavior is stable across Chrome/Safari/WKWebView.

**AN-3 milestone acceptance:** animated standalone HTML matches evaluator timing
within tolerance, degrades explicitly, honors reduced motion, and the neutral
package renders without Calqo or secret state.

### AN-4 — Scenes, transitions, and prompt/MCP animation (v2)

**Goal:** extend the proven single-scene model only after v1 usage and export
performance are understood.

#### AN-4.1 Validate the product need

- [ ] Review real v1 projects and determine whether users need artboard scenes,
      longer clips, audio, video layers, or richer timing first.
- [ ] Treat scene ordering as a new portable document decision; do not activate
      the reserved field solely because it exists.
- [ ] Define total-duration calculation, per-scene locale behavior, transitions,
      poster frames, and transition ownership before schema changes.

#### AN-4.2 Implement scene sequencing

- [ ] Validate unique existing artboard ids and total duration ≤ 60 s.
- [ ] Compile each scene independently, then compose a clip time map.
- [ ] Implement cut first; add fade/slide only with explicit outgoing/incoming
      frame composition rules.
- [ ] Reuse/dispose offscreen scenes under a measured memory budget.
- [ ] Extend transport and export progress without turning timing bars into an
      accidental full timeline editor.

#### AN-4.3 Add validated AI/MCP operations

- [ ] Add command-level MCP schemas for set/clear preset, set scene duration,
      reorder scenes, and optionally set custom windows.
- [ ] Route execution through `projectCommands.ts`, existing permissions, and
      `safeImportProject`; reject raw patches.
- [ ] Update prompt contracts with the exact animation schema, preset catalog,
      duration limits, and examples.
- [ ] Validate generated animation separately before adoption and show precise
      repairable issues.
- [ ] Add deterministic mock-provider fixtures before testing real providers.

#### AN-4.4 Reassess deferred formats and native encoding

- [ ] Reconsider audio, WebM, imported video/GIF layers, native VideoToolbox,
      and a richer timing UI based on measured user need and AN-2 telemetry/manual
      reports.
- [ ] Give each accepted item its own plan; do not fold them invisibly into
      scene work.

## 14. Test strategy and release evidence

### 14.1 Test layers

| Layer              | What it proves                                            | Representative evidence                |
| ------------------ | --------------------------------------------------------- | -------------------------------------- |
| Schema/migration   | Portable files are accepted or rejected deterministically | v1/v2 fixtures, malformed JSON matrix  |
| Compiler/evaluator | Presets have stable timing and values                     | golden tracks and timestamp tables     |
| Commands/history   | User edits are valid and undoable                         | command + coalescing tests             |
| Renderer           | Live and offscreen frames match                           | sampled pixel/visual comparisons       |
| Encoder/muxer      | Files are valid and resource-safe                         | decode verification, cancel/leak tests |
| UI                 | Mode, inspector, transport, warnings are usable           | component and Playwright flows         |
| Cross-runtime      | Capability claims are honest                              | Chrome/Safari/WKWebView matrix         |
| Cross-renderer     | HTML agrees with evaluator                                | computed-style conformance samples     |

### 14.2 Permanent fixture set

Keep fixtures small enough for the repository and free of third-party/private
content. At minimum include:

- A v1 static `.calqo` file for migration.
- A v2 static project.
- A v2 preset-animated project using all v1 presets.
- A v2 custom-track project at validation boundaries.
- Nested groups with parent and child animation.
- Non-zero base rotation, opacity, gradients, image fills, masks, frames,
  filters, sticker outlines, expressive strokes, and list markers.
- EN/FR content with different wrapping and an embedded/loaded webfont.
- Odd-dimension and maximum-duration artboards.

Large generated outputs and licensed photo fixtures should remain CI artifacts
or documented local fixtures, not committed binaries.

### 14.3 Required commands

For an implementation change:

```bash
pnpm typecheck
pnpm test
```

For a milestone gate:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm e2e
```

If a runtime codec test cannot run in ordinary CI, keep its harness in the
repository and record the exact manual command, runtime version, and result in
the milestone decision block.

## 15. Release, rollout, and rollback

### 15.1 Feature flags

- Keep Animate mode behind one build/runtime flag through AN-1 and AN-2.
- Keep H.265, animated HTML, text reveals, and scenes behind separate flags so
  one unstable capability does not disable H.264 preset animation.
- Do not write feature flags into project files. A client that understands
  schema v2 must preserve valid disabled-feature data even when it cannot edit
  it.

### 15.2 Rollout order

1. Developer builds with schema/evaluator tests only.
2. Internal Animate UI with export disabled.
3. H.264 export on explicitly tested browser/Tauri runtimes.
4. GIF after worker/memory verification.
5. Optional H.265 by capability.
6. Animated HTML/package.
7. Scenes and agent authoring only after a new product review.

### 15.3 Rollback behavior

- Disabling UI/export must not make v2 projects unreadable.
- Static editing/export continues to ignore animation data.
- If an encoder is disabled after release, retain HTML/GIF/static fallbacks and
  show a structured capability message.
- Never downgrade and overwrite an animated project automatically. v1 output
  is an explicit export of an unanimated project only.

## 16. Risks and mitigations

| Risk                                 | Early signal                     | Mitigation / decision owner                                                |
| ------------------------------------ | -------------------------------- | -------------------------------------------------------------------------- |
| Live/offscreen renderer drift        | Sampled frames differ            | Shared helpers, fixture diffs, AN-2 export gate                            |
| WebCodecs missing or software-only   | Probe/benchmark failure          | Honest capability UI; GIF/HTML fallback; native contingency review         |
| 60 s export exhausts memory          | Increasing heap/DOM/URLs         | Reusable stage, backpressure, streamed sinks, sequential locales           |
| React and imperative Konva fight     | Jumps or geometry commits        | Wrapper/base separation and edit-start reset tests                         |
| Schema v2 breaks portability         | Old fixtures/import failures     | Real migration, explicit compatibility export, strict fixtures             |
| Full-snapshot history grows          | Large undo memory                | Persist presets only, coalesce gestures, benchmark representative projects |
| HTML diverges from MP4               | Conformance samples differ       | Evaluator remains truth; CSS compiler tests and warnings                   |
| Font arrival changes text motion     | Preview/export mismatch          | Font revision in cache key; compile after fonts settle                     |
| GIF quality is unacceptable          | Banding/photo artifacts          | Fixture bake-off, hard caps, explicit format guidance                      |
| Feature expands into motion suite    | Timeline/graph requests block v1 | Enforce preset UI and out-of-scope list; separate AN-4 decisions           |
| Animation reaches phone accidentally | Mobile regression                | Desktop-only mode gate; identity wrappers in shared renderer               |

## 17. Planned file map

This map is a guide, not permission to create parallel abstractions when an
existing module can own the work.

```text
src/
  editor/
    animation/
      compiler.ts                 preset/custom document -> CompiledClip
      easing.ts                   pure easing functions
      evaluator.ts                CompiledClip + tMs -> wrapper overrides
      presets.ts                  preset metadata/defaults/constraints
      types.ts                    runtime-only, non-persisted types
      useAnimationPlayback.ts     live Konva playback lifecycle
    rendering/
      offscreenScene.ts           reusable stage/assets/wrappers lifecycle
    export/
      animatedFrameExport.ts      frame loop, progress, abort, locale ordering
      animationCssCompiler.ts     IR -> scoped CSS keyframes
      animationExportReadiness.ts structured animation warnings
  app/shell/animation/
      AnimationInspector.tsx
      AnimationTransport.tsx
      TimingOverview.tsx
  lib/
    adapters/video/
      VideoExportAdapter.ts
      webCodecsVideoExportAdapter.ts
    state/
      animationPlaybackStore.ts   transient only
  tests/
    fixtures/animation/
    unit/animationSchema.test.ts
    unit/animationCompiler.test.ts
    unit/animationEvaluator.test.ts
    unit/animationCommands.test.ts
    unit/animationCssCompiler.test.ts
```

Expected modifications include `schema.ts`, `migrations.ts`, `fixture.ts`,
`projectCommands.ts`, `LayerRenderer.tsx`, `CalqoStage.tsx`,
`rasterExport.ts`, `htmlLayoutExport.ts`, `exportWarnings.ts`,
`ExportDialog.tsx`, `workspaceStore.ts`, shell mode/layout components, adapter
exports, and both locale catalogs.

## 18. Decisions required before implementation

These decisions are intentionally placed at the milestone where they block
work; they do not all need to be answered now.

### Before AN-0 schema merge

1. Confirm the normative timing behavior in AN-0.1, especially reject versus
   auto-extend when a window exceeds scene duration.
2. Confirm numeric caps for distance, blur, scale, rotation, delay, and
   emphasis frequency.
3. Decide whether `clipSettings` belongs on the project at schema v2 or can
   remain runtime/export preference until scenes exist.

### Before AN-1 UI merge

4. Set the v1 preset knob surface. Recommendation: duration/delay/easing for
   all; direction/distance only where meaningful; no stagger until fragment or
   group semantics are implemented.
5. Decide whether desktop-shell tablets get full Animate mode, playback-only,
   or no Animate mode.
6. Approve schema-upgrade and v1-compatible export wording.
7. Decide whether animated projects receive a library badge or reopen in their
   last workspace mode.

### Before AN-2 export merge

8. Confirm AN-0.5's accepted defaults (Mediabunny, `gifenc`, H.264-only, edge
   padding) and approve AN-2's bitrate presets and measured runtime matrix.
9. Decide the browser fallback when streamed file output is unavailable and a
   predicted output exceeds the safe in-memory threshold.
10. Decide whether H.265 is hidden, disabled with explanation, or enabled when
    supported but not power-efficient.

### Before AN-3/AN-4

11. Approve animated snippet scoping and downgrade policy for rasterized groups.
12. Revalidate Hyperframes CLI/package details at implementation time; it is an
    external labs consumer, not a stable Calqo dependency.
13. Make a fresh product decision before enabling scenes, transitions, custom
    keyframe authoring, audio, or video layers.

## 19. Review log

**2026-07-19 — AN-0.5 gate closed by maintainer risk acceptance (Codex).**
Recorded a `Go` decision without fabricated measurements so AN-1 can proceed.
Selected H.264/WebCodecs + Mediabunny, provisionally selected capped worker
`gifenc`, deferred H.265 and native VideoToolbox, and chose main-thread batched
rendering with a worker fallback. Renderer fidelity, runtime throughput, memory,
decode, and GIF quality evidence moved to the AN-2 export shipping gate; a
failed result may narrow an export format but does not block editor playback.

**2026-07-19 — detailed implementation pass (Codex).** Expanded the original
architecture proposal into gated, step-by-step milestones with concrete file
ownership, migration/compatibility work, renderer and codec spike protocol,
UI/history/playback lifecycle, adapter contracts, export cleanup, HTML
conformance, test fixtures, rollout/rollback, and milestone acceptance. Updated
the feasibility notes to reflect the current repository: shape image-fill asset
collection is now implemented in `rasterExport.ts` and should receive a
regression test rather than remain a prerequisite bug.

**2026-07-19 — external critical review (Codex) incorporated.** Major accepted
points: compiled tracks removed from the persisted schema; explicit composition
semantics with transient wrapper nodes; text-reveal presets deferred; migration
and one-way compatibility made concrete; mode state assigned per tab in
`workspaceStore`; a session-based `VideoExportAdapter`; Mediabunny preferred
over deprecated `mp4-muxer`; HEVC capability wording;
static-export semantics; animated-HTML transform composition and group warnings;
GIF quality/memory evaluation; streaming/cancellation; structured localized
warnings; accessibility; and display-only timing bars. Not adopted: removing
the preset/custom discriminated union. Keeping presets as the persisted source
and compiled tracks as runtime-only resolves the dual-source concern while
retaining an agent/power-user path.
