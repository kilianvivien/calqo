import type { CalqoArtboard, CalqoProject, LocaleCode } from '@/lib/schema';
import { compileClipCached } from '@/editor/animation/compiler';
import { evaluateClipInto, evaluateFragmentsInto } from '@/editor/animation/evaluator';
import { createCanvasMeasurer } from '@/editor/animation/textLayout';
import type { WrapperOverride } from '@/editor/animation/types';
import {
  createOffscreenScene,
  type CreateOffscreenScene,
} from '@/editor/rendering/offscreenScene';
import { videoExport } from '@/lib/adapters';
import type {
  VideoCodecId,
  VideoExportAdapter,
  VideoSink,
} from '@/lib/adapters/video/VideoExportAdapter';
import {
  evenDimensions,
  type AnimExportWarning,
} from './animationExportReadiness';

/**
 * Frame orchestration for animated video export (plan §6.3 / AN-2.3). Compiles
 * once per artboard/locale, builds one reusable offscreen scene, and drives it
 * frame-by-frame into the video export session:
 *
 *   compile → scene.create → (evaluate → applyOverrides → render → addFrame)* → finalize
 *
 * Frame timestamps derive from **integer frame indices** so there is no
 * cumulative floating-point drift over a 1800-frame clip. One `AbortSignal`
 * threads through the whole pipeline; on cancel/error the session is cancelled
 * and the scene disposed, so no partial output or leaked URL survives.
 */

export type AnimatedExportPhase =
  | 'preparing'
  | 'rendering'
  | 'finalizing';

export interface AnimatedExportProgress {
  phase: AnimatedExportPhase;
  completedFrames: number;
  totalFrames: number;
  locale: LocaleCode;
}

export interface AnimatedVideoExportOptions {
  project: CalqoProject;
  artboard: CalqoArtboard;
  locale: LocaleCode;
  codec: VideoCodecId;
  /** Bits/sec; omit to use the adapter's bitrate policy. */
  bitrate?: number;
  sink?: VideoSink;
  signal?: AbortSignal;
  onProgress?: (progress: AnimatedExportProgress) => void;
  /** Injectable for tests; defaults to the real adapter/scene. */
  adapter?: VideoExportAdapter;
  createScene?: CreateOffscreenScene;
}

export interface AnimatedVideoExportResult {
  /** Present for a buffer sink; a stream sink returns bytes via its writable. */
  blob?: Blob;
  streamed: boolean;
  byteLength: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  warnings: AnimExportWarning[];
}

/** Yield to the main thread every N frames so a long export never blocks input
 * (plan §6.4 chunked rendering). */
const YIELD_EVERY_FRAMES = 4;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fps(project: CalqoProject): 24 | 30 | 60 {
  return project.clipSettings?.fps ?? 30;
}

/** Number of frames for a clip: one per fps step across the scene, inclusive of
 * the final settled frame. */
export function frameCountFor(sceneDurationMs: number, framesPerSecond: number): number {
  return Math.max(1, Math.round((sceneDurationMs / 1000) * framesPerSecond));
}

/** Microsecond timestamp for frame index `i` — integer-index derived (§AN-2.3). */
export function frameTimestampMicros(index: number, framesPerSecond: number): number {
  return Math.round((index * 1_000_000) / framesPerSecond);
}

/**
 * Render + encode one artboard at one locale to an MP4. Throws `AbortError` if
 * the signal fires; on any failure the session is cancelled and the scene
 * disposed before rethrowing.
 */
export async function exportAnimatedVideo(
  options: AnimatedVideoExportOptions,
): Promise<AnimatedVideoExportResult> {
  const {
    project,
    artboard,
    locale,
    codec,
    bitrate,
    signal,
    onProgress,
    adapter = videoExport,
    createScene = createOffscreenScene,
    sink = { kind: 'buffer' } as VideoSink,
  } = options;

  const framesPerSecond = fps(project);
  const sceneDurationMs = artboard.timing?.duration ?? 5_000;
  const { width, height } = evenDimensions(artboard.width, artboard.height);
  const totalFrames = frameCountFor(sceneDurationMs, framesPerSecond);
  const frameDurationUs = Math.round(1_000_000 / framesPerSecond);

  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Export aborted', 'AbortError');
  };

  onProgress?.({ phase: 'preparing', completedFrames: 0, totalFrames, locale });
  throwIfAborted();

  const { clip } = compileClipCached({
    projectId: project.id,
    artboard,
    locale,
    fps: framesPerSecond,
    measurerFor: (font) => createCanvasMeasurer(font),
  });

  const scene = await createScene({
    artboard,
    locale,
    outputWidth: width,
    outputHeight: height,
    opaqueBackground: true,
    fragments: clip.fragments,
  });

  let session: Awaited<ReturnType<VideoExportAdapter['begin']>> | null = null;
  const overrides = new Map<string, WrapperOverride>();
  // Reused per-fragment override buffers (no per-frame allocation, §6.4).
  const fragmentOverrides = new Map<string, WrapperOverride[]>();

  try {
    session = await adapter.begin({
      codec,
      width,
      height,
      fps: framesPerSecond,
      bitrate,
      canvas: scene.capture().source,
      sink,
      signal,
    });

    for (let i = 0; i < totalFrames; i++) {
      throwIfAborted();
      const tMs = (i / framesPerSecond) * 1000;
      evaluateClipInto(clip, tMs, overrides);
      scene.applyOverrides(overrides);
      if (clip.fragments) {
        for (const fragmentAnim of clip.fragments) {
          let buffer = fragmentOverrides.get(fragmentAnim.layerId);
          if (!buffer) {
            buffer = [];
            fragmentOverrides.set(fragmentAnim.layerId, buffer);
          }
          evaluateFragmentsInto(fragmentAnim, tMs, buffer);
        }
        scene.applyFragmentOverrides(fragmentOverrides);
      }
      scene.render();
      await session.addFrame(frameTimestampMicros(i, framesPerSecond), frameDurationUs);
      onProgress?.({
        phase: 'rendering',
        completedFrames: i + 1,
        totalFrames,
        locale,
      });
      if ((i + 1) % YIELD_EVERY_FRAMES === 0) await yieldToMain();
    }

    onProgress?.({ phase: 'finalizing', completedFrames: totalFrames, totalFrames, locale });
    const result = await session.finalize();
    return {
      blob: result.blob,
      streamed: result.streamed,
      byteLength: result.byteLength,
      width,
      height,
      fps: framesPerSecond,
      frameCount: totalFrames,
      warnings: [],
    };
  } catch (error) {
    await session?.cancel();
    throw error;
  } finally {
    scene.dispose();
  }
}
