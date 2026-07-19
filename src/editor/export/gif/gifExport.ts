import type { CalqoArtboard, CalqoProject, LocaleCode } from '@/lib/schema';
import { compileClipCached } from '@/editor/animation/compiler';
import { evaluateClipInto } from '@/editor/animation/evaluator';
import type { WrapperOverride } from '@/editor/animation/types';
import {
  createOffscreenScene,
  type CreateOffscreenScene,
  type OffscreenScene,
} from '@/editor/rendering/offscreenScene';
import {
  planGifOutput,
  type AnimExportWarning,
  type GifOutputPlan,
} from '../animationExportReadiness';
import { createGifStream } from './gifEncode';
import type { GifWorkerRequest, GifWorkerResponse } from './gifWorkerProtocol';

/**
 * GIF export orchestrator (plan §6.3 / AN-2.4). Renders capped frames through
 * the reusable offscreen scene, downscales each to the GIF plan size, and feeds
 * RGBA to an encoder — the dedicated worker in the browser, an inline encoder in
 * tests / no-Worker runtimes. Hard caps (duration/size/fps) come from
 * {@link planGifOutput}. One `AbortSignal` threads through; cancel releases the
 * scene and encoder.
 */

export interface GifExportProgress {
  completedFrames: number;
  totalFrames: number;
  locale: LocaleCode;
}

/** A minimal, injectable encoder client so tests can drive the loop without a
 * real Worker/canvas. */
export interface GifEncoderClient {
  init(width: number, height: number, frameDelayMs: number, repeat?: number): void;
  /** Resolves once the encoder is ready for more (backpressure). */
  addFrame(rgba: Uint8ClampedArray): Promise<void>;
  finish(): Promise<Uint8Array>;
  cancel(): void;
}

export interface AnimatedGifExportOptions {
  project: CalqoProject;
  artboard: CalqoArtboard;
  locale: LocaleCode;
  signal?: AbortSignal;
  onProgress?: (progress: GifExportProgress) => void;
  createScene?: CreateOffscreenScene;
  createEncoder?: () => GifEncoderClient;
  /** Injectable pixel sampler (tests); defaults to a downscale 2D canvas. */
  sampleFrame?: (scene: OffscreenScene, plan: GifOutputPlan) => Uint8ClampedArray;
}

export interface AnimatedGifExportResult {
  blob: Blob;
  byteLength: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  warnings: AnimExportWarning[];
}

function fps(project: CalqoProject): 24 | 30 | 60 {
  return project.clipSettings?.fps ?? 30;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// --- Encoders --------------------------------------------------------------

/** Inline encoder — runs the pure stream on the calling thread. Used in tests
 * and where `Worker` is unavailable. */
export function createInlineGifEncoder(): GifEncoderClient {
  let stream: ReturnType<typeof createGifStream> | null = null;
  return {
    init(width, height, frameDelayMs, repeat) {
      stream = createGifStream({ width, height, frameDelayMs, repeat });
    },
    async addFrame(rgba) {
      if (!stream) throw new Error('gif encoder not initialized');
      stream.addFrame(rgba);
    },
    async finish() {
      if (!stream) throw new Error('gif encoder not initialized');
      const bytes = stream.finish();
      stream = null;
      return bytes;
    },
    cancel() {
      stream = null;
    },
  };
}

/** Worker-backed encoder. Awaits a `progress` reply per frame for backpressure
 * and transfers each frame buffer to the worker. */
export function createWorkerGifEncoder(): GifEncoderClient {
  const worker = new Worker(new URL('./gifWorker.ts', import.meta.url), {
    type: 'module',
  });
  let pendingFrame: (() => void) | null = null;
  let pendingFinish: ((bytes: Uint8Array) => void) | null = null;
  let failed: ((err: Error) => void) | null = null;

  worker.onmessage = (event: MessageEvent<GifWorkerResponse>) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      pendingFrame?.();
      pendingFrame = null;
    } else if (msg.type === 'done') {
      pendingFinish?.(new Uint8Array(msg.bytes));
      pendingFinish = null;
    } else if (msg.type === 'error') {
      const err = new Error(msg.message);
      failed?.(err);
      pendingFrame = null;
      pendingFinish = null;
    }
  };

  const send = (message: GifWorkerRequest, transfer?: Transferable[]) =>
    worker.postMessage(message, transfer ?? []);

  return {
    init(width, height, frameDelayMs, repeat) {
      send({ type: 'init', width, height, frameDelayMs, repeat });
    },
    addFrame(rgba) {
      return new Promise<void>((resolve, reject) => {
        pendingFrame = resolve;
        failed = reject;
        const copy = rgba.slice();
        send({ type: 'frame', data: copy.buffer }, [copy.buffer]);
      });
    },
    finish() {
      return new Promise<Uint8Array>((resolve, reject) => {
        pendingFinish = resolve;
        failed = reject;
        send({ type: 'finish' });
      }).finally(() => worker.terminate());
    },
    cancel() {
      send({ type: 'cancel' });
      worker.terminate();
    },
  };
}

function defaultEncoderFactory(): GifEncoderClient {
  return typeof Worker !== 'undefined'
    ? createWorkerGifEncoder()
    : createInlineGifEncoder();
}

// --- Pixel sampling --------------------------------------------------------

/** Downscale the scene's current frame into a plan-sized RGBA buffer. */
function downscaleSampler(): (
  scene: OffscreenScene,
  plan: GifOutputPlan,
) => Uint8ClampedArray {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  return (scene, plan) => {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = plan.width;
      canvas.height = plan.height;
      ctx = canvas.getContext('2d');
    }
    if (!ctx) throw new Error('2D canvas context unavailable for GIF downscale');
    const frame = scene.capture();
    ctx.clearRect(0, 0, plan.width, plan.height);
    ctx.drawImage(frame.source, 0, 0, plan.width, plan.height);
    return ctx.getImageData(0, 0, plan.width, plan.height).data;
  };
}

// --- Orchestrator ----------------------------------------------------------

export async function exportAnimatedGif(
  options: AnimatedGifExportOptions,
): Promise<AnimatedGifExportResult> {
  const {
    project,
    artboard,
    locale,
    signal,
    onProgress,
    createScene = createOffscreenScene,
    createEncoder = defaultEncoderFactory,
    sampleFrame = downscaleSampler(),
  } = options;

  const framesPerSecond = fps(project);
  const sceneDurationMs = artboard.timing?.duration ?? 5_000;
  const plan = planGifOutput(
    artboard.width,
    artboard.height,
    framesPerSecond,
    sceneDurationMs,
  );

  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Export aborted', 'AbortError');
  };
  throwIfAborted();

  const { clip } = compileClipCached({
    projectId: project.id,
    artboard,
    locale,
    fps: framesPerSecond,
  });

  const scene = await createScene({ artboard, locale, opaqueBackground: true });
  const encoder = createEncoder();
  const overrides = new Map<string, WrapperOverride>();

  try {
    encoder.init(plan.width, plan.height, plan.frameDelayMs);
    for (let i = 0; i < plan.frameCount; i++) {
      throwIfAborted();
      const tMs = (i / plan.fps) * 1000;
      evaluateClipInto(clip, tMs, overrides);
      scene.applyOverrides(overrides);
      scene.render();
      await encoder.addFrame(sampleFrame(scene, plan));
      onProgress?.({ completedFrames: i + 1, totalFrames: plan.frameCount, locale });
      await yieldToMain();
    }
    const bytes = await encoder.finish();
    // Copy into a fresh ArrayBuffer so the Blob owns contiguous bytes.
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
      warnings,
    };
  } catch (error) {
    encoder.cancel();
    throw error;
  } finally {
    scene.dispose();
  }
}
