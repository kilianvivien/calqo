import type { CalqoProject, LocaleCode } from '@/lib/schema';
import {
  createSceneSequenceRenderer,
  type SceneSequenceRenderer,
} from '@/editor/rendering/sceneSequenceRenderer';
import { resolveSequence, sampleSequence } from '@/editor/animation/sceneSequence';
import { videoExport } from '@/lib/adapters';
import type {
  VideoCodecId,
  VideoExportAdapter,
  VideoSink,
} from '@/lib/adapters/video/VideoExportAdapter';
import type { FrameSource } from '@/editor/rendering/offscreenScene';
import { evenDimensions, planGifOutput, type AnimExportWarning } from './animationExportReadiness';
import { frameCountFor, frameTimestampMicros } from './animatedFrameExport';
import {
  createInlineGifEncoder,
  type GifEncoderClient,
} from './gif/gifExport';

/**
 * Multi-scene ("clip") export (plan AN-4.2). Composes an ordered set of
 * artboards — each compiled independently, joined by cut/fade/slide transitions
 * — into one MP4 or GIF. Frames are sampled from the {@link SceneSequenceRenderer}
 * by absolute clip time on integer frame indices (no cumulative float drift).
 * One `AbortSignal` threads through; on cancel/error the session/encoder is
 * cancelled and the renderer disposed, so no partial output or leaked stage
 * survives. Per-scene progress lets the UI show "scene x / N".
 */

export type SceneExportPhase = 'preparing' | 'rendering' | 'finalizing';

export interface SceneExportProgress {
  phase: SceneExportPhase;
  completedFrames: number;
  totalFrames: number;
  /** 0-based index of the scene active at the current frame. */
  sceneIndex: number;
  sceneCount: number;
  locale: LocaleCode;
}

type CreateRenderer = typeof createSceneSequenceRenderer;

export interface SceneVideoExportOptions {
  project: CalqoProject;
  locale: LocaleCode;
  codec: VideoCodecId;
  bitrate?: number;
  sink?: VideoSink;
  signal?: AbortSignal;
  onProgress?: (progress: SceneExportProgress) => void;
  adapter?: VideoExportAdapter;
  createRenderer?: CreateRenderer;
}

export interface SceneVideoExportResult {
  blob?: Blob;
  streamed: boolean;
  byteLength: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  sceneCount: number;
  warnings: AnimExportWarning[];
}

const YIELD_EVERY_FRAMES = 4;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fpsOf(project: CalqoProject): 24 | 30 | 60 {
  return project.clipSettings?.fps ?? 30;
}

function activeSceneIndex(renderer: SceneSequenceRenderer, globalMs: number): number {
  const sample = sampleSequence(renderer.sequence, globalMs);
  return sample.kind === 'scene' ? sample.scene.index : sample.to.index;
}

/** Render + encode a multi-scene clip at one locale to an MP4. */
export async function exportAnimatedSceneVideo(
  options: SceneVideoExportOptions,
): Promise<SceneVideoExportResult> {
  const {
    project,
    locale,
    codec,
    bitrate,
    signal,
    onProgress,
    adapter = videoExport,
    createRenderer = createSceneSequenceRenderer,
    sink = { kind: 'buffer' } as VideoSink,
  } = options;

  const fps = fpsOf(project);
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Export aborted', 'AbortError');
  };

  onProgress?.({ phase: 'preparing', completedFrames: 0, totalFrames: 0, sceneIndex: 0, sceneCount: 0, locale });
  throwIfAborted();

  const sequence = resolveSequence(project);
  if (!sequence) throw new Error('project has no multi-scene clip to export');
  const { width, height } = evenDimensions(sequence.width, sequence.height);
  const sceneCount = sequence.scenes.length;
  const totalFrames = frameCountFor(sequence.totalMs, fps);
  const frameDurationUs = Math.round(1_000_000 / fps);

  const scene = await createRenderer({ project, locale, outputWidth: width, outputHeight: height });

  let session: Awaited<ReturnType<VideoExportAdapter['begin']>> | null = null;
  try {
    session = await adapter.begin({
      codec,
      width,
      height,
      fps,
      bitrate,
      canvas: scene.canvas,
      sink,
      signal,
    });

    for (let i = 0; i < totalFrames; i++) {
      throwIfAborted();
      const globalMs = (i / fps) * 1000;
      await scene.renderAt(globalMs);
      await session.addFrame(frameTimestampMicros(i, fps), frameDurationUs);
      onProgress?.({
        phase: 'rendering',
        completedFrames: i + 1,
        totalFrames,
        sceneIndex: activeSceneIndex(scene, globalMs),
        sceneCount,
        locale,
      });
      if ((i + 1) % YIELD_EVERY_FRAMES === 0) await yieldToMain();
    }

    onProgress?.({ phase: 'finalizing', completedFrames: totalFrames, totalFrames, sceneIndex: sceneCount - 1, sceneCount, locale });
    const result = await session.finalize();
    return {
      blob: result.blob,
      streamed: result.streamed,
      byteLength: result.byteLength,
      width,
      height,
      fps,
      frameCount: totalFrames,
      sceneCount,
      warnings: [],
    };
  } catch (error) {
    await session?.cancel();
    throw error;
  } finally {
    scene.dispose();
  }
}

// ---------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------

export interface SceneGifExportOptions {
  project: CalqoProject;
  locale: LocaleCode;
  signal?: AbortSignal;
  onProgress?: (progress: SceneExportProgress) => void;
  createRenderer?: CreateRenderer;
  createEncoder?: () => GifEncoderClient;
  /** Injectable downscale sampler (tests); defaults to a 2D-canvas downscale. */
  sampleFrame?: (source: FrameSource, width: number, height: number) => Uint8ClampedArray;
}

export interface SceneGifExportResult {
  blob: Blob;
  byteLength: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  sceneCount: number;
  warnings: AnimExportWarning[];
}

/** Downscale a source surface into a width×height RGBA buffer. */
function downscaleSampler(): (source: FrameSource, width: number, height: number) => Uint8ClampedArray {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  return (source, width, height) => {
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      ctx = canvas.getContext('2d');
    }
    if (!ctx) throw new Error('2D canvas context unavailable for GIF downscale');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  };
}

function defaultGifEncoder(): GifEncoderClient {
  // The worker encoder is used for the single-artboard GIF path; the sequence
  // path reuses the same pure stream inline (the frame loop already yields).
  return createInlineGifEncoder();
}

/** Render + encode a multi-scene clip at one locale to a (capped) GIF. */
export async function exportAnimatedSceneGif(
  options: SceneGifExportOptions,
): Promise<SceneGifExportResult> {
  const {
    project,
    locale,
    signal,
    onProgress,
    createRenderer = createSceneSequenceRenderer,
    createEncoder = defaultGifEncoder,
    sampleFrame = downscaleSampler(),
  } = options;

  const fps = fpsOf(project);
  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Export aborted', 'AbortError');
  };
  throwIfAborted();

  const sequence = resolveSequence(project);
  if (!sequence) throw new Error('project has no multi-scene clip to export');
  const sceneCount = sequence.scenes.length;
  const plan = planGifOutput(sequence.width, sequence.height, fps, sequence.totalMs);
  const renderer = await createRenderer({
    project,
    locale,
    outputWidth: sequence.width,
    outputHeight: sequence.height,
  });
  const encoder = createEncoder();

  try {
    encoder.init(plan.width, plan.height, plan.frameDelayMs);
    for (let i = 0; i < plan.frameCount; i++) {
      throwIfAborted();
      const globalMs = (i / plan.fps) * 1000;
      await renderer.renderAt(globalMs);
      await encoder.addFrame(sampleFrame(renderer.canvas, plan.width, plan.height));
      onProgress?.({
        phase: 'rendering',
        completedFrames: i + 1,
        totalFrames: plan.frameCount,
        sceneIndex: activeSceneIndex(renderer, globalMs),
        sceneCount,
        locale,
      });
      await yieldToMain();
    }
    const bytes = await encoder.finish();
    const blob = new Blob([bytes.slice()], { type: 'image/gif' });
    const warnings: AnimExportWarning[] = [];
    if (plan.adjusted) {
      warnings.push({
        code: 'gifCaps',
        params: {
          width: plan.width,
          height: plan.height,
          fps: plan.fps,
          seconds: (plan.durationMs / 1000).toFixed(1),
        },
      });
    }
    return {
      blob,
      byteLength: bytes.byteLength,
      width: plan.width,
      height: plan.height,
      fps: plan.fps,
      frameCount: plan.frameCount,
      sceneCount,
      warnings,
    };
  } catch (error) {
    encoder.cancel();
    throw error;
  } finally {
    renderer.dispose();
  }
}
