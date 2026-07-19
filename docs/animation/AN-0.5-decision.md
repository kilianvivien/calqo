# AN-0.5 — Rendering & encoding feasibility decision

> **Status:** `[x]` decided by risk acceptance — 2026-07-19.
> AN-1 may proceed. Full renderer/encoder measurements move to AN-2 export
> acceptance and are not a prerequisite for building the Animate UI.

This decision deliberately closes the pre-implementation feasibility gate
without pretending that the scaffold produced measurements. The harness still
contains renderer and encoder stubs, so no render, encode, memory, output-size,
or decode results exist. The architectural choices below are based on the
existing Calqo constraints and current platform/library documentation. Each
assumption has a fallback and must be verified before animated export ships.

## 1. Evidence available

### Local development environment (not benchmarked)

| Runtime         | Version                        | Machine / chip                   | OS           |
| --------------- | ------------------------------ | -------------------------------- | ------------ |
| Chrome          | 150.0.7871.125                 | MacBook Pro, Apple M4 Pro, 24 GB | macOS 26.5.2 |
| Safari          | 26.5.2 / WebKit 21624.2.5.11.8 | same                             | macOS 26.5.2 |
| Tauri WKWebView | not run                        | same                             | macOS 26.5.2 |

### External evidence reviewed on 2026-07-19

- WebKit shipped video WebCodecs in Safari 16.4 and documents H.264 encoder
  support. This supports using WebCodecs as the shared browser/WKWebView path,
  but does not prove a particular configuration or hardware acceleration.
- `VideoEncoder.isConfigSupported()` checks whether a configuration can be
  configured. `MediaCapabilities.encodingInfo()` separately reports
  `supported`, `smooth`, and `powerEfficient`; these remain runtime hints, not
  benchmark results.
- Mediabunny writes MP4, supports AVC/H.264 and HEVC/H.265 through WebCodecs,
  exposes configuration-level encodability checks, applies encoder
  backpressure, has zero runtime dependencies, and is tree-shakable.
- `gifenc` 1.0.3 is a small, zero-dependency browser/Node encoder with explicit
  Web Worker guidance and palette control. It has no dithering and its own
  documentation recommends it mainly for flat/vector imagery, so photo-heavy
  GIF quality is an accepted v1 limitation rather than an unknown.

References:

- [WebKit: Safari 17.2 WebCodecs notes](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
- [WebCodecs `isConfigSupported()`](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder/isConfigSupported_static)
- [MediaCapabilities `encodingInfo()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/encodingInfo)
- [Mediabunny introduction](https://mediabunny.dev/guide/introduction)
- [Mediabunny supported formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs)
- [`gifenc` package documentation](https://www.npmjs.com/package/gifenc)

## 2. Measurements

**Not performed.** `createOffscreenScene`, the MP4 probe, and the GIF probe are
still intentional stubs. Consequently there are no valid values for evaluator
throughput at 1,800 frames, render/encode throughput, peak memory, output size,
decode verification, or a Chrome/Safari/Tauri capability matrix.

The fixture set, collector, and capability probe remain useful AN-2 test
infrastructure. AN-2 must capture the missing evidence before export is called
shipping-ready; failure changes or disables the affected export path, not the
already-built editor/playback surface.

## 3. Decisions and assumptions

- **Renderer:** proceed with one reusable main-thread Konva offscreen scene per
  artboard/locale/export job. Yield between bounded frame batches and expose
  progress/cancellation. Keep the scene lifecycle abstract so a worker-backed
  renderer can replace it if AN-2 measurements show sustained UI starvation or
  unacceptable throughput.
- **Capture handoff:** start with `VideoFrame(canvas)` because it avoids an
  additional bitmap handoff and matches WebCodecs directly. Keep `FrameSource`
  opaque; fall back to `stage.toCanvas()`/`ImageBitmap` if runtime fidelity or
  ownership tests require it.
- **MP4:** use WebCodecs plus Mediabunny. H.264/AVC is the only v1 codec and is
  exposed only after a target-configuration runtime probe succeeds. If it is
  unavailable, disable MP4 with a structured explanation and retain GIF/HTML.
- **H.265:** deferred. Do not expose or add H.265-specific product work in v1.
  Reconsider after H.264 export is stable and per-runtime H.265 results exist.
- **Native VideoToolbox:** no native contingency is scheduled. WKWebView uses
  the same WebCodecs adapter initially. Reconsider a native adapter only if the
  Tauri AN-2 acceptance run fails and MP4 performance is a release blocker.
- **GIF:** select `gifenc` 1.0.3 provisionally for the capped worker path
  (15 s, 720 px long edge, 15 fps), using per-frame palettes and no dithering.
  Flat/vector designs are the quality target. Photo-heavy designs may show
  banding and should receive an export notice. Server-oriented `gifencoder` is
  rejected for this browser-first app; a heavier/WASM alternative is warranted
  only if fixture review proves the accepted limitation too severe.
- **Even dimensions:** pad odd video dimensions on the right/bottom to the next
  even value by extending the final edge pixel. Never crop user content. Emit a
  readiness notice when the encoded dimensions differ from the artboard by one
  pixel. GIF and HTML retain the original dimensions.
- **Output/memory:** stream MP4 output to the destination where supported and
  run multi-locale jobs sequentially. The browser Blob fallback must use a
  predicted-size safety limit; exceeding it disables that path rather than
  risking unbounded memory.
- **Performance:** keep the existing 40 ms/frame figure as a target, not a
  promise. AN-2 owns measured Chrome, Safari, and M-series Tauri acceptance,
  60-second peak-memory checks, decode verification, and fallback behavior.

## 4. Acceptance transferred to AN-2

Before animated MP4/GIF export ships, AN-2 must verify:

- sampled-frame fidelity and identity reset against static/live rendering;
- repeated-capture resource cleanup and cancellation at every pipeline stage;
- target H.264 configuration support plus actual render/encode throughput in
  Chrome, Safari, and Tauri WKWebView on an M-series Mac;
- 5 s, 15 s, and synthetic 60 s fixtures at 1080×1080 and 1080×1920;
- peak memory, output size, timestamps/keyframes, mux finalization, and an
  independent decode smoke test;
- GIF responsiveness, transparency, banding, and the documented caps; and
- the one-pixel padding policy on odd-sized artboards.

Any failed item blocks or narrows the affected **export format**. It does not
retroactively block AN-1 editor/playback implementation.

## 5. Gate outcome

- H.264 meets the required experience? **Assumed yes; must be runtime-probed
  and measured before export ships.**
- H.265 status: **deferred**
- Native VideoToolbox contingency needed? **no, not scheduled**
- Main-thread renderer acceptable? **assumed yes with batching/yielding;
  worker architecture remains a measured fallback**

**Gate outcome: `Go (risk accepted)`.** Proceed to AN-1. The project accepts
that AN-2 may narrow MP4/GIF availability by runtime or require a renderer
adjustment. It does not accept fabricated performance claims or shipping an
unverified export path.

_Decided by the Calqo maintainer with Codex on 2026-07-19._
