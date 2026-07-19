// Import from Konva's browser-safe modules (matches rasterExport.ts), which
// avoids pulling the Node `canvas` build that breaks jsdom/tests.
import { Stage } from 'konva/lib/Stage';
import { Layer } from 'konva/lib/Layer';
import { Group } from 'konva/lib/Group';
import type { CalqoArtboard, CalqoLayer, LocaleCode } from '@/lib/schema';
import {
  buildBackgroundNodes,
  buildNode,
  loadImages,
} from '@/editor/export/rasterExport';
import {
  applyWrapperOverride,
  resetWrapper,
  type LayerBox,
} from '@/editor/animation/wrapperNode';
import type { WrapperOverride } from '@/editor/animation/types';

/**
 * Reusable offscreen scene (plan §6.3 / AN-0.5.2, delivered in AN-2). It fixes
 * the per-frame render lifecycle the export pipeline depends on:
 *
 *   create → (applyOverrides → render → capture)* → dispose
 *
 * Rules honoured (§4.2 / §6.3):
 * - Base node geometry is identical to static rendering (it reuses the exact
 *   `buildNode`/background builders from `rasterExport.ts`); animation lives only
 *   on a transient wrapper `Group` per **top-level** layer, registered by layer
 *   id — the same set the live `CalqoStage` wraps, so live and offscreen output
 *   stay aligned (§16 renderer-drift risk).
 * - Assets/fonts load once; every object URL is revoked exactly once on dispose.
 *   Stale/deleted layer ids in an override map are ignored.
 * - `resetToIdentity()` returns every wrapper to identity in one pass, so a
 *   captured frame reproduces the static export pixel result.
 */

/** A drawable frame surface. The concrete capture handoff (`toCanvas` /
 * `transferToImageBitmap` / `VideoFrame(canvas)`) is a consumer concern, so
 * callers treat the source as opaque. */
export type FrameSource = HTMLCanvasElement | OffscreenCanvas;

export interface CapturedFrame {
  readonly width: number;
  readonly height: number;
  readonly source: FrameSource;
}

export interface OffscreenSceneInput {
  artboard: CalqoArtboard;
  locale: LocaleCode;
  /**
   * Output pixel dimensions. Defaults to the artboard's native size. The export
   * orchestrator passes even numbers here so H.264 (which requires even
   * dimensions) never has to pad at encode time.
   */
  outputWidth?: number;
  outputHeight?: number;
  /** Paint the artboard background. Video export is opaque (default true); a
   * transparent surface (GIF with alpha) can pass false. */
  opaqueBackground?: boolean;
  /**
   * Legacy AN-0.5 spike seam: an external asset resolver. The production scene
   * loads assets itself through the storage adapter (matching `rasterExport`),
   * so this is accepted for source compatibility with the spike harness but not
   * consulted.
   */
  loadAsset?: (assetId: string) => Promise<CanvasImageSource | null>;
}

export interface OffscreenScene {
  readonly width: number;
  readonly height: number;
  /** Apply per-layer wrapper overrides for the current frame. Ids not present in
   * the scene (nested children, deleted layers) are ignored. */
  applyOverrides(overrides: ReadonlyMap<string, WrapperOverride>): void;
  /** Reset every wrapper to identity in a single pass. */
  resetToIdentity(): void;
  /** Draw the current state to the offscreen surface. */
  render(): void;
  /** Capture the currently-rendered surface as a frame (stable canvas ref). */
  capture(): CapturedFrame;
  /** Tear down nodes, listeners, and revoke every object URL exactly once. */
  dispose(): void;
}

export type CreateOffscreenScene = (
  input: OffscreenSceneInput,
) => Promise<OffscreenScene>;

/** Thrown by seams that are intentionally not yet implemented (used by the
 * remaining AN-0.5 encoder spike stubs), so a harness can record a `skipped`
 * measurement with a precise reason instead of crashing. */
export class NotImplementedError extends Error {
  constructor(
    readonly step: string,
    message?: string,
  ) {
    super(message ?? `${step} is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}

/** Round up to the nearest even integer (H.264 requires even dimensions). */
function toEven(value: number): number {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/** Top-level layer boxes in artboard coordinates (wrapper transform math). */
function topLevelBoxes(layers: CalqoLayer[]): Map<string, LayerBox> {
  const boxes = new Map<string, LayerBox>();
  for (const layer of layers) {
    boxes.set(layer.id, { x: layer.x, y: layer.y, w: layer.w, h: layer.h });
  }
  return boxes;
}

/**
 * Build a reusable Konva scene for one artboard/locale. The stage is created
 * once; the frame loop drives it many times through {@link OffscreenScene}.
 */
export const createOffscreenScene: CreateOffscreenScene = async (input) => {
  const { artboard, locale } = input;
  const width = toEven(input.outputWidth ?? artboard.width);
  const height = toEven(input.outputHeight ?? artboard.height);
  const opaque = input.opaqueBackground ?? true;

  const { images, revoke } = await loadImages(artboard);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-100000px';
  container.style.top = '0';
  document.body.appendChild(container);

  const stage = new Stage({ container, width, height });
  const layer = new Layer({ listening: false });
  stage.add(layer);

  buildBackgroundNodes(artboard, images, opaque).forEach((node) => layer.add(node));

  // Content clipped to the artboard bounds so nothing spills past the frame.
  const content = new Group({
    clipX: 0,
    clipY: 0,
    clipWidth: artboard.width,
    clipHeight: artboard.height,
  });
  layer.add(content);

  // One transient wrapper group per top-level layer (identity at rest), matching
  // the live `CalqoStage` wrapper contract so overrides compose identically.
  const wrappers = new Map<string, Group>();
  const boxes = topLevelBoxes(artboard.layers);
  for (const l of artboard.layers) {
    const node = buildNode(l, images, locale);
    if (!node) continue;
    const wrapper = new Group();
    wrapper.add(node);
    wrappers.set(l.id, wrapper);
    content.add(wrapper);
  }

  let disposed = false;

  return {
    width,
    height,
    applyOverrides(overrides) {
      for (const [id, override] of overrides) {
        const wrapper = wrappers.get(id);
        const box = boxes.get(id);
        if (!wrapper || !box) continue; // nested/deleted ids are harmless
        applyWrapperOverride(wrapper, override, box);
      }
    },
    resetToIdentity() {
      for (const wrapper of wrappers.values()) resetWrapper(wrapper);
    },
    render() {
      layer.draw();
    },
    capture() {
      return { width, height, source: layer.getNativeCanvasElement() };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stage.destroy();
      container.remove();
      revoke();
    },
  };
};
