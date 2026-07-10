import { isGroupLayer } from '@/editor/utils/layers';
import type { CalqoAssetRef, CalqoLayer, CalqoProject } from '@/lib/schema';
import {
  DEFAULT_ASSET_HEALTH_THRESHOLDS,
  type AssetHealthThresholds,
} from '@/lib/state/uiStore';

import { decodedBytes, isOversizedImport } from '@/lib/utils/imageAsset';

export { DEFAULT_ASSET_HEALTH_THRESHOLDS };
export type { AssetHealthThresholds };
// The pure size helpers live beside the import path that raises the notice.
export { decodedBytes, isOversizedImport };

/** Highest export pixel ratio the UI offers; downscale recommendations never go
 * below the largest rendered size × this ratio, so quality is never visibly
 * lost. */
export const MAX_EXPORT_PIXEL_RATIO = 3;

/** The largest edge (in artboard px) an asset is rendered at anywhere in the
 * project: image/svg layer boxes, image-filled shapes, list markers, and
 * artboard backgrounds. Returns 0 when the asset is unused. */
export function maxRenderedEdge(project: CalqoProject, assetId: string): number {
  let max = 0;
  const consider = (w: number, h: number) => {
    max = Math.max(max, w, h);
  };
  for (const artboard of project.artboards) {
    if (
      artboard.background.type === 'image' &&
      artboard.background.assetId === assetId
    ) {
      consider(artboard.width, artboard.height);
    }
    const visit = (layers: CalqoLayer[]) => {
      for (const layer of layers) {
        if (
          (layer.type === 'image' || layer.type === 'svg') &&
          layer.assetId === assetId
        ) {
          consider(layer.w, layer.h);
        }
        if (
          layer.type === 'shape' &&
          layer.fill.type === 'image' &&
          layer.fill.assetId === assetId
        ) {
          consider(layer.w, layer.h);
        }
        if (
          layer.type === 'list' &&
          layer.marker.kind === 'asset' &&
          layer.marker.assetId === assetId
        ) {
          const size = layer.marker.size ?? layer.style.fontSize;
          consider(size, size);
        }
        if (isGroupLayer(layer)) visit(layer.children);
      }
    };
    visit(artboard.layers);
  }
  return max;
}

/** The long edge a raster asset could safely be downscaled to without visible
 * quality loss: its largest rendered size × the max export pixel ratio, capped
 * at the asset's own size. */
export function recommendedMaxEdge(
  project: CalqoProject,
  ref: CalqoAssetRef,
): number {
  const assetEdge = Math.max(ref.width ?? 0, ref.height ?? 0);
  const rendered = maxRenderedEdge(project, ref.id);
  if (assetEdge === 0) return 0;
  if (rendered === 0) return assetEdge;
  return Math.min(assetEdge, Math.ceil(rendered * MAX_EXPORT_PIXEL_RATIO));
}

export interface AssetHealthEntry {
  ref: CalqoAssetRef;
  /** Stored (compressed) blob size, when known. */
  bytes?: number;
  /** Decoded RGBA size, from manifest dimensions. */
  decodedBytes?: number;
  maxRenderedEdge: number;
  recommendedMaxEdge: number;
  /** Flagged against the soft limits. */
  oversized: boolean;
  /** Whether downscaling to the recommendation would actually shrink it. */
  canDownscale: boolean;
}

/** Per-asset health for every raster in the project (SVGs are excluded — they
 * are resolution-independent). Pure: blob sizes are passed in so this stays
 * unit-testable without a canvas or storage. */
export function buildAssetHealthReport(
  project: CalqoProject,
  blobBytes: Map<string, number>,
  thresholds: AssetHealthThresholds = DEFAULT_ASSET_HEALTH_THRESHOLDS,
): AssetHealthEntry[] {
  return project.assets
    .filter((ref) => ref.kind === 'raster')
    .map((ref) => {
      const decoded =
        ref.width && ref.height ? decodedBytes(ref.width, ref.height) : undefined;
      const assetEdge = Math.max(ref.width ?? 0, ref.height ?? 0);
      const recommended = recommendedMaxEdge(project, ref);
      return {
        ref,
        bytes: blobBytes.get(ref.id),
        decodedBytes: decoded,
        maxRenderedEdge: maxRenderedEdge(project, ref.id),
        recommendedMaxEdge: recommended,
        oversized:
          assetEdge > thresholds.maxAssetEdge ||
          (decoded !== undefined && decoded > thresholds.maxAssetDecodedBytes),
        canDownscale: recommended > 0 && recommended < assetEdge,
      };
    });
}

/** Estimate the serialized `.calqo` envelope size: the project JSON plus every
 * asset blob re-encoded as a base64 data URL (~4/3 of the raw bytes). */
export function estimateEnvelopeBytes(
  projectJsonBytes: number,
  blobBytes: Map<string, number>,
): number {
  let total = projectJsonBytes;
  for (const bytes of blobBytes.values()) {
    total += Math.ceil((bytes * 4) / 3) + 128; // base64 + entry overhead
  }
  return total;
}

/** Downscaled dimensions preserving aspect ratio; no-op when already small. */
export function downscaleTargetSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= maxEdge || maxEdge <= 0) return { width, height };
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const CANVAS_ENCODABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Downscale a raster blob so its long edge is at most {@link maxEdge}, keeping
 * the original format where the canvas encoder supports it (PNG keeps alpha),
 * falling back to PNG otherwise. Uses `createImageBitmap` + `OffscreenCanvas`
 * where available, else a detached `<canvas>`. Browser-only.
 */
export async function downscaleImageBlob(
  blob: Blob,
  maxEdge: number,
  mimeType: string,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    const target = downscaleTargetSize(bitmap.width, bitmap.height, maxEdge);
    const outType = CANVAS_ENCODABLE.has(mimeType) ? mimeType : 'image/png';
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(target.width, target.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');
      ctx.drawImage(bitmap, 0, 0, target.width, target.height);
      const out = await canvas.convertToBlob({ type: outType, quality: 0.92 });
      return { blob: out, ...target };
    }
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    const out = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('Canvas encode failed.')),
        outType,
        0.92,
      );
    });
    return { blob: out, ...target };
  } finally {
    bitmap.close();
  }
}
