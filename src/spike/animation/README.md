# AN-0.5 rendering/encoding feasibility spike

Historical spike scaffolding retained as AN-2 export-verification infrastructure.
AN-0.5 closed by documented risk acceptance on 2026-07-19; it did not produce
renderer/encoder measurements. The reusable renderer **contract**
(`src/editor/rendering/offscreenScene.ts`) remains a durable deliverable.

## What's here

| File                                              | Role                                                                         | Status         |
| ------------------------------------------------- | ---------------------------------------------------------------------------- | -------------- |
| `../../tests/fixtures/animation/spikeFixtures.ts` | 5 representative animated fixtures, parameterized by size/duration           | ✅ ready       |
| `measurement.ts`                                  | Measurement record types + collector (markdown/CSV) + env detection          | ✅ ready       |
| `webcodecsProbe.ts`                               | Dependency-free `isConfigSupported` + `mediaCapabilities.encodingInfo` probe | ✅ ready       |
| `encoderProbe.ts`                                 | MP4/GIF encoder **seams** (interfaces) + not-implemented stubs               | 🔲 stub (AN-2) |
| `runSpike.ts`                                     | Orchestrator: real evaluator throughput now; render/encode when probes land  | ⏳ partial     |
| `src/editor/rendering/offscreenScene.ts`          | Reusable offscreen render contract + not-implemented factory                 | 🔲 stub (AN-2) |

No production dependencies are added by this scaffold. The decision selects
Mediabunny and `gifenc` provisionally; add them only when AN-2 implements the
corresponding export adapters.

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
   import {
     probeVideoCodecs,
     buildEncoderConfig,
   } from '@/spike/animation/webcodecsProbe';
   const results = await probeVideoCodecs([
     { family: 'h264', config: buildEncoderConfig('h264', 1080, 1920, 30) },
     { family: 'h265', config: buildEncoderConfig('h265', 1080, 1920, 30) },
   ]);
   ```

3. **Full render/encode numbers:** as part of AN-2, implement
   `createOffscreenScene` and the encoder probes, pass them via
   `runSpike({ probes })`, then the `renderMs` / `encodeMs` / `outputBytes` /
   `decode` columns fill in.

## Recording results

Record `collector.toMarkdownTable()` and `probeVideoCodecs()` output in the AN-2
export acceptance notes. Do not overwrite the AN-0.5 decision's explicit
statement that the gate closed without measurements.
