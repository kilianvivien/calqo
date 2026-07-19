# AN-0.5 rendering/encoding feasibility spike

Temporary spike scaffolding for the animation track. Spike **code** may be
thrown away; the **measurements** and the reusable renderer **contract**
(`src/editor/rendering/offscreenScene.ts`) are the durable deliverables
(plan §12.1 / AN-0.5).

## What's here

| File | Role | Status |
| --- | --- | --- |
| `../../tests/fixtures/animation/spikeFixtures.ts` | 5 representative animated fixtures, parameterized by size/duration | ✅ ready |
| `measurement.ts` | Measurement record types + collector (markdown/CSV) + env detection | ✅ ready |
| `webcodecsProbe.ts` | Dependency-free `isConfigSupported` + `mediaCapabilities.encodingInfo` probe | ✅ ready |
| `encoderProbe.ts` | MP4/GIF encoder **seams** (interfaces) + not-implemented stubs | 🔲 stub (AN-0.5.4/0.5.5) |
| `runSpike.ts` | Orchestrator: real evaluator throughput now; render/encode when probes land | ⏳ partial |
| `src/editor/rendering/offscreenScene.ts` | Reusable offscreen render contract + not-implemented factory | 🔲 stub (AN-0.5.2) |

No production dependencies are added by this scaffold. Per plan §12.3, the muxer
(Mediabunny) and GIF encoder (gifenc) are added **only after** the spike measures
them and records the decision.

## Running it

The harness has no CLI wiring on purpose (it needs a real runtime — Chrome,
Safari, or the Tauri WKWebView — for WebCodecs and canvas rendering). Two ways to
drive it:

1. **Quick evaluation-throughput numbers (works today, any runtime):**

   ```ts
   import { runSpike } from '@/spike/animation/runSpike';
   const collector = await runSpike(); // render/encode report `skipped`
   console.log(collector.environmentSummary());
   console.log(collector.toMarkdownTable());
   ```

   Drop that in a temporary route/dev button, or a Vitest `*.spike.ts` you run
   locally, and read the `evalMs` column.

2. **Capability probe (real WebCodecs answers, browser only):**

   ```ts
   import { probeVideoCodecs, buildEncoderConfig } from '@/spike/animation/webcodecsProbe';
   const results = await probeVideoCodecs([
     { family: 'h264', config: buildEncoderConfig('h264', 1080, 1920, 30) },
     { family: 'h265', config: buildEncoderConfig('h265', 1080, 1920, 30) },
   ]);
   ```

3. **Full render/encode numbers:** land AN-0.5.2 (`createOffscreenScene`) and
   AN-0.5.4/0.5.5 (encoder probes), pass them via `runSpike({ probes })`, then the
   `renderMs` / `encodeMs` / `outputBytes` / `decode` columns fill in.

## Recording results

Paste `collector.toMarkdownTable()` and `probeVideoCodecs()` output into
`docs/animation/AN-0.5-decision.md`, note the exact runtime + command, and fill
in the go/adjust/stop decision (AN-0.5.6).
