import type { CalqoProject, LocaleCode } from '@/lib/schema';
import { compileClipCached } from '@/editor/animation/compiler';
import { evaluateClipInto } from '@/editor/animation/evaluator';
import type { CompiledClip, WrapperOverride } from '@/editor/animation/types';
import {
  createOffscreenScene,
  type CreateOffscreenScene,
  type FrameSource,
  type OffscreenScene,
} from './offscreenScene';
import {
  resolveSequence,
  sampleSequence,
  type ResolvedScene,
  type ResolvedSequence,
} from '@/editor/animation/sceneSequence';

/**
 * Multi-scene sequence renderer (plan AN-4.2). Composites the resolved scene
 * timeline onto one stable output canvas the video/GIF exporters capture from.
 *
 * Memory (§6.3 "reuse/dispose offscreen scenes under a measured budget"): each
 * scene owns a full offscreen Konva stage, so only a bounded number are kept
 * alive — an LRU of size 2, the most a single sampled time can need (a
 * transition renders both its outgoing and incoming scene). Passing a scene
 * boundary evicts and disposes the scene that is no longer reachable.
 *
 * Transition composition: `cut` produces no transition frames (0 ms window);
 * `fade` crossfades the incoming scene over the outgoing; `slide` moves the
 * outgoing off one edge while the incoming enters from the other, tiling exactly
 * so no gap shows.
 */

/** Injectable 2D compositor so the renderer is unit-testable without a real
 * canvas context (jsdom has none). The default writes to an offscreen canvas. */
export interface SceneCompositor {
  readonly canvas: FrameSource;
  /** Clear/opaque-fill the whole frame. */
  clear(): void;
  /** Draw a scene surface at a horizontal pixel offset and alpha. */
  draw(source: FrameSource, offsetX: number, alpha: number): void;
}

export interface SceneSequenceRendererInput {
  project: CalqoProject;
  locale: LocaleCode;
  /** Even output dimensions (H.264 requires even width/height). */
  outputWidth: number;
  outputHeight: number;
  /** Max offscreen scenes kept alive at once (default 2). */
  memoryBudgetScenes?: number;
  createScene?: CreateOffscreenScene;
  createCompositor?: (width: number, height: number) => SceneCompositor;
}

export interface SceneSequenceRenderer {
  readonly canvas: FrameSource;
  readonly sequence: ResolvedSequence;
  /** Composite the frame at an absolute clip time onto {@link canvas}. */
  renderAt(globalMs: number): Promise<void>;
  /** Number of distinct offscreen scenes currently held (diagnostics/tests). */
  liveSceneCount(): number;
  dispose(): void;
}

interface LoadedScene {
  scene: OffscreenScene;
  clip: CompiledClip;
  overrides: Map<string, WrapperOverride>;
}

/** Default compositor backed by a real 2D canvas. */
function defaultCompositor(width: number, height: number): SceneCompositor {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for scene compositing');
  return {
    canvas,
    clear() {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
    },
    draw(source, offsetX, alpha) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.drawImage(source as CanvasImageSource, offsetX, 0, width, height);
      ctx.restore();
    },
  };
}

export async function createSceneSequenceRenderer(
  input: SceneSequenceRendererInput,
): Promise<SceneSequenceRenderer> {
  const sequence = resolveSequence(input.project);
  if (!sequence) throw new Error('project has no multi-scene clip to render');

  const {
    project,
    locale,
    outputWidth,
    outputHeight,
    memoryBudgetScenes = 2,
    createScene = createOffscreenScene,
    createCompositor = defaultCompositor,
  } = input;
  const fps = project.clipSettings?.fps ?? 30;
  const compositor = createCompositor(outputWidth, outputHeight);

  // LRU of loaded scenes keyed by artboard id (Map keeps insertion order).
  const loaded = new Map<string, LoadedScene>();

  const ensure = async (scene: ResolvedScene): Promise<LoadedScene> => {
    const existing = loaded.get(scene.artboardId);
    if (existing) {
      // Refresh recency.
      loaded.delete(scene.artboardId);
      loaded.set(scene.artboardId, existing);
      return existing;
    }
    const offscreen = await createScene({
      artboard: scene.artboard,
      locale,
      outputWidth,
      outputHeight,
      opaqueBackground: true,
    });
    const { clip } = compileClipCached({
      projectId: project.id,
      artboard: scene.artboard,
      locale,
      fps,
    });
    const entry: LoadedScene = { scene: offscreen, clip, overrides: new Map() };
    loaded.set(scene.artboardId, entry);
    while (loaded.size > memoryBudgetScenes) {
      const oldestKey = loaded.keys().next().value as string | undefined;
      if (oldestKey === undefined || oldestKey === scene.artboardId) break;
      loaded.get(oldestKey)?.scene.dispose();
      loaded.delete(oldestKey);
    }
    return entry;
  };

  /** Render one loaded scene at a local time to its own surface. */
  const drawScene = (entry: LoadedScene, localMs: number): FrameSource => {
    evaluateClipInto(entry.clip, localMs, entry.overrides);
    entry.scene.applyOverrides(entry.overrides);
    entry.scene.render();
    return entry.scene.capture().source;
  };

  return {
    canvas: compositor.canvas,
    sequence,
    async renderAt(globalMs) {
      const sample = sampleSequence(sequence, globalMs);
      if (sample.kind === 'scene') {
        const entry = await ensure(sample.scene);
        const source = drawScene(entry, sample.localMs);
        compositor.clear();
        compositor.draw(source, 0, 1);
        return;
      }
      // Transition: outgoing at its final frame, incoming at its first.
      const fromEntry = await ensure(sample.from);
      const toEntry = await ensure(sample.to);
      const fromSource = drawScene(fromEntry, sample.from.durationMs);
      const toSource = drawScene(toEntry, 0);
      compositor.clear();
      if (sample.transition.kind === 'slide') {
        compositor.draw(fromSource, -outputWidth * sample.progress, 1);
        compositor.draw(toSource, outputWidth * (1 - sample.progress), 1);
      } else {
        // fade (and any non-slide): crossfade incoming over outgoing.
        compositor.draw(fromSource, 0, 1);
        compositor.draw(toSource, 0, sample.progress);
      }
    },
    liveSceneCount() {
      return loaded.size;
    },
    dispose() {
      for (const entry of loaded.values()) entry.scene.dispose();
      loaded.clear();
    },
  };
}
