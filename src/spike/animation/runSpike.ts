import type { CalqoProject } from '@/lib/schema';
import { compileClip } from '@/editor/animation/compiler';
import { evaluateClipInto } from '@/editor/animation/evaluator';
import type { WrapperOverride } from '@/editor/animation/types';
import {
  createOffscreenScene,
  NotImplementedError,
  type CreateOffscreenScene,
} from '@/editor/rendering/offscreenScene';
import {
  defaultSpikeFixtures,
  spikeAssetDataUrls,
  type SpikeFixture,
} from '@/tests/fixtures/animation/spikeFixtures';
import {
  MeasurementCollector,
  detectEnvironment,
  readHeapBytes,
  type CodecId,
  type EnvironmentInfo,
  type MeasurementRecord,
  type RenderConfig,
} from './measurement';
import { createEncoderProbe, type FrameEncoderProbe } from './encoderProbe';

/**
 * AN-0.5 spike orchestrator. Sweeps fixtures × output configs, runs the real
 * (dependency-free) evaluator loop to measure evaluation throughput, and then
 * attempts the render/encode path through the provided probes. While the
 * renderer (AN-0.5.2) and encoders (AN-0.5.4/0.5.5) are stubs, those runs are
 * recorded as `skipped` with the precise reason — the evaluation numbers are
 * real from day one, so the §6.4 hypotheses start getting replaced immediately.
 *
 * This is spike scaffolding: run it manually in a target runtime (see
 * `README.md`) and paste `collector.toMarkdownTable()` into
 * `docs/animation/AN-0.5-decision.md`.
 */

export interface SpikeProbes {
  createScene?: CreateOffscreenScene;
  createEncoder?: (codec: CodecId) => FrameEncoderProbe;
}

export interface RunSpikeInput {
  fixtures?: SpikeFixture[];
  configs?: RenderConfig[];
  probes?: SpikeProbes;
  environment?: EnvironmentInfo;
  /** Cap frames per run for a fast dry run (default: no cap). */
  maxFrames?: number;
}

const DEFAULT_RESOLUTIONS: Array<[number, number]> = [
  [1080, 1080],
  [1080, 1920],
];
const DEFAULT_DURATIONS_MS = [5_000, 15_000, 60_000];
const DEFAULT_FPS = 30;

/** The full fixture × resolution × duration matrix, H.264 by default. */
export function defaultSpikeConfigs(
  fixtures: SpikeFixture[],
  opts: { codecs?: CodecId[]; fps?: number } = {},
): RenderConfig[] {
  const codecs = opts.codecs ?? ['h264'];
  const fps = opts.fps ?? DEFAULT_FPS;
  const configs: RenderConfig[] = [];
  for (const fixture of fixtures) {
    for (const [width, height] of DEFAULT_RESOLUTIONS) {
      for (const durationMs of DEFAULT_DURATIONS_MS) {
        for (const codec of codecs) {
          configs.push({
            fixtureId: fixture.id,
            label: `${fixture.label} ${width}×${height} ${durationMs / 1000}s ${codec}`,
            width,
            height,
            fps,
            durationMs,
            codec,
          });
        }
      }
    }
  }
  return configs;
}

function frameCount(durationMs: number, fps: number, cap?: number): number {
  const n = Math.max(1, Math.round((durationMs / 1000) * fps));
  return cap ? Math.min(n, cap) : n;
}

/** Resolve fixture asset ids to decoded images where the runtime allows it. */
function makeLoadAsset(): (assetId: string) => Promise<CanvasImageSource | null> {
  return async (assetId) => {
    const url = spikeAssetDataUrls[assetId];
    if (!url) return null;
    if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') {
      return null;
    }
    try {
      const blob = await (await fetch(url)).blob();
      return await createImageBitmap(blob);
    } catch {
      return null;
    }
  };
}

async function measureOne(
  project: CalqoProject,
  config: RenderConfig,
  probes: Required<SpikeProbes>,
  maxFrames: number | undefined,
): Promise<MeasurementRecord> {
  const artboard = project.artboards[0];
  const { clip } = compileClip({
    projectId: project.id,
    artboard,
    locale: project.activeContentLocale,
    fps: config.fps,
  });
  const frames = frameCount(config.durationMs, config.fps, maxFrames);
  const frameMs = 1000 / config.fps;

  // --- Real: evaluation throughput (no renderer needed). --------------------
  const overrides = new Map<string, WrapperOverride>();
  const evalStart = performance.now();
  for (let f = 0; f < frames; f++) {
    evaluateClipInto(clip, f * frameMs, overrides);
  }
  const evalMs = performance.now() - evalStart;

  const record: MeasurementRecord = {
    ...config,
    frames,
    evalMs,
    peakMemoryBytes: readHeapBytes(),
    status: 'ok',
  };

  // --- Attempt render + encode through the probes. --------------------------
  try {
    const scene = await probes.createScene({
      artboard,
      locale: project.activeContentLocale,
      loadAsset: makeLoadAsset(),
    });
    const encoder = probes.createEncoder(config.codec);
    await encoder.begin({
      codec: config.codec,
      width: config.width,
      height: config.height,
      fps: config.fps,
      bitrateKbps: config.bitrateKbps,
    });

    const renderStart = performance.now();
    let encodeMs = 0;
    for (let f = 0; f < frames; f++) {
      evaluateClipInto(clip, f * frameMs, overrides);
      scene.applyOverrides(overrides);
      scene.render();
      const frame = scene.capture();
      const encodeStart = performance.now();
      await encoder.addFrame(frame.source, Math.round(f * frameMs * 1000));
      encodeMs += performance.now() - encodeStart;
    }
    const finalizeStart = performance.now();
    const output = await encoder.finalize();
    encodeMs += performance.now() - finalizeStart;
    scene.dispose();

    record.renderMs = performance.now() - renderStart - encodeMs;
    record.encodeMs = encodeMs;
    record.outputBytes = output.bytes.byteLength;
    record.peakMemoryBytes = readHeapBytes();
  } catch (err) {
    if (err instanceof NotImplementedError) {
      record.status = 'skipped';
      record.note = err.message;
    } else {
      record.status = 'error';
      record.note = err instanceof Error ? err.message : String(err);
    }
  }

  return record;
}

export async function runSpike(input: RunSpikeInput = {}): Promise<MeasurementCollector> {
  const fixtures = input.fixtures ?? defaultSpikeFixtures();
  const configs = input.configs ?? defaultSpikeConfigs(fixtures);
  const probes: Required<SpikeProbes> = {
    createScene: input.probes?.createScene ?? createOffscreenScene,
    createEncoder: input.probes?.createEncoder ?? createEncoderProbe,
  };
  const collector = new MeasurementCollector(input.environment ?? detectEnvironment());
  const byId = new Map(fixtures.map((f) => [f.id, f]));

  for (const config of configs) {
    const fixture = byId.get(config.fixtureId);
    if (!fixture) continue;
    const project = fixture.build({
      width: config.width,
      height: config.height,
      durationMs: config.durationMs,
    });
    collector.add(await measureOne(project, config, probes, input.maxFrames));
  }
  return collector;
}
