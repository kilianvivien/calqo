# AN-0.5 — Rendering & encoding feasibility decision

> **Status:** `[ ]` not started — template awaiting measured results.
> Fill this in by running the harness (`src/spike/animation/README.md`) in each
> target runtime, then set the milestone gate in
> `docs/calqo-animation-extension-plan.md` §AN-0.5.6.

This is the durable output of the AN-0.5 spike (plan §12.1). The spike **code**
may be discarded; **this decision and its measurements are kept.**

## 1. Runtimes measured

| Runtime | Version | Machine / chip | OS |
| --- | --- | --- | --- |
| Chrome | | | |
| Safari | | | |
| Tauri WKWebView | | | (M1-class required, §7) |

## 2. Capability probe (`probeVideoCodecs`)

Record `isConfigSupported` and `mediaCapabilities.encodingInfo` **separately** —
no single signal proves hardware encoding (§7).

| Runtime | Codec | Size | configSupported | powerEfficient | smooth |
| --- | --- | --- | --- | --- | --- |
| | h264 | 1080×1920 | | | |
| | h265 | 1080×1920 | | | |

## 3. Measurement table (`collector.toMarkdownTable()`)

Paste per-runtime tables here (fixture × size × duration × codec). At minimum
capture 1080×1080 and 1080×1920 at 5 s / 15 s / 60 s.

<!-- paste tables -->

## 4. Findings (replaces the §6.4 hypotheses)

- **Evaluator throughput** (evalMs @ 1800 frames): …
- **Render throughput** (renderMs/frame): …
- **Encode throughput** (encodeMs/frame; vs realtime): …
- **Peak memory** at 60 s: …
- **Output sizes / decode-verify**: …
- **Capture handoff** chosen (`toCanvas` / `transferToImageBitmap` /
  `VideoFrame(canvas)`) and why (AN-0.5.3): …
- **Muxer** evaluated (Mediabunny compat + bundle cost): …
- **GIF encoder** chosen and rejected alternatives (AN-0.5.5): …
- **Even-dimension policy** (crop vs pad) and whether it changes output pixels
  (→ readiness warning): …

## 5. Decision (AN-0.5.6)

- H.264 meets the required experience? **yes / no**
- H.265 status: **enabled / deferred / Tauri-only**
- Native VideoToolbox contingency needed? **yes / no**
- Main-thread renderer acceptable, or OffscreenCanvas spike required? …

**Gate outcome:** `Go` / `Adjust` / `Stop` — …

_Decided by … on 20xx-xx-xx._
