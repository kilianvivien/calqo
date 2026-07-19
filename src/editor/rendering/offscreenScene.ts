import type { CalqoArtboard, LocaleCode } from '@/lib/schema';
import type { WrapperOverride } from '@/editor/animation/types';

/**
 * Reusable offscreen scene contract (plan §6.3 / AN-0.5.2).
 *
 * This interface is a **durable** deliverable of the AN-0.5 spike: it fixes the
 * per-frame render lifecycle the export pipeline depends on, independent of the
 * (still-to-build) Konva implementation. The frame loop builds one scene per
 * artboard/locale/export job and drives it many times:
 *
 *   create → (applyOverrides → render → capture)* → dispose
 *
 * Rules the implementation must honour (from §4.2 / §6.3):
 * - Base node geometry is identical to static rendering; animation lives only on
 *   a transient wrapper `Group` per layer, registered by layer id.
 * - Assets and fonts load once; every object URL is revoked exactly once on
 *   dispose. Stale/deleted layer ids in an override map are harmless.
 * - `resetToIdentity()` returns every wrapper to identity in one pass, so a
 *   captured frame reproduces the static export pixel result.
 */

/** A drawable frame surface. The concrete capture handoff
 * (`toCanvas` / `transferToImageBitmap` / `VideoFrame(canvas)`) is an AN-0.5.3
 * measurement, so callers treat this as an opaque source. */
export type FrameSource = HTMLCanvasElement | OffscreenCanvas;

export interface CapturedFrame {
  readonly width: number;
  readonly height: number;
  readonly source: FrameSource;
}

export interface OffscreenSceneInput {
  artboard: CalqoArtboard;
  locale: LocaleCode;
  /** Output pixel ratio (1 for export; the artboard is rendered at native px). */
  pixelRatio?: number;
  /** Resolve a layer/background asset id to a decoded image source. Provided by
   * the harness/export job so the scene never touches storage adapters directly. */
  loadAsset?: (assetId: string) => Promise<CanvasImageSource | null>;
}

export interface OffscreenScene {
  readonly width: number;
  readonly height: number;
  /** Apply per-layer wrapper overrides for the current frame. Ids not present in
   * the scene are ignored. */
  applyOverrides(overrides: ReadonlyMap<string, WrapperOverride>): void;
  /** Reset every wrapper to identity in a single pass. */
  resetToIdentity(): void;
  /** Draw the current state to the offscreen surface. */
  render(): void;
  /** Capture the currently-rendered surface as a frame. */
  capture(): CapturedFrame;
  /** Tear down nodes, listeners, and revoke every object URL exactly once. */
  dispose(): void;
}

export type CreateOffscreenScene = (
  input: OffscreenSceneInput,
) => Promise<OffscreenScene>;

/** Thrown by spike stubs that are intentionally not yet implemented, so the
 * harness can record a `skipped` measurement with a precise reason instead of
 * crashing the whole run. */
export class NotImplementedError extends Error {
  constructor(readonly step: string, message?: string) {
    super(message ?? `${step} is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}

/**
 * Placeholder factory. The real Konva-backed implementation lands in AN-0.5.2
 * (extracted from `rasterExport.ts`); until then the harness records the render
 * path as unmeasured rather than pretending a number exists.
 */
export const createOffscreenScene: CreateOffscreenScene = async (_input) => {
  throw new NotImplementedError(
    'AN-0.5.2 offscreenScene',
    'Reusable offscreen Konva scene not implemented yet (AN-0.5.2). ' +
      'Extract asset/stage/wrapper lifecycle from rasterExport.ts to enable render measurements.',
  );
};
