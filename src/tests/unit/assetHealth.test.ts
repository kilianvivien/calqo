import { describe, expect, it } from 'vitest';
import {
  buildAssetHealthReport,
  DEFAULT_ASSET_HEALTH_THRESHOLDS,
  decodedBytes,
  downscaleTargetSize,
  estimateEnvelopeBytes,
  isOversizedImport,
  maxRenderedEdge,
  MAX_EXPORT_PIXEL_RATIO,
  recommendedMaxEdge,
} from '@/editor/assets/assetHealth';
import { createDefaultProject, type CalqoAssetRef } from '@/lib/schema';

function ref(id: string, width: number, height: number, kind: 'raster' | 'svg' = 'raster'): CalqoAssetRef {
  return {
    id,
    kind,
    name: `${id}.png`,
    mimeType: kind === 'svg' ? 'image/svg+xml' : 'image/png',
    width,
    height,
    storageKey: id,
    createdAt: '2026-07-01T00:00:00.000Z',
  };
}

function imageLayer(id: string, assetId: string, w: number, h: number) {
  return {
    id,
    name: id,
    type: 'image' as const,
    x: 0,
    y: 0,
    w,
    h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    assetId,
    fit: 'cover' as const,
  };
}

describe('asset health measurement', () => {
  it('finds the max rendered edge across artboards, including backgrounds', () => {
    const project = createDefaultProject();
    project.artboards[0].layers.push(imageLayer('l1', 'a1', 300, 200));
    project.artboards.push({
      ...structuredClone(project.artboards[0]),
      id: 'ab-2',
      layers: [imageLayer('l2', 'a1', 500, 100)],
    });
    expect(maxRenderedEdge(project, 'a1')).toBe(500);

    project.artboards[0].background = { type: 'image', assetId: 'a2', fit: 'cover' };
    expect(maxRenderedEdge(project, 'a2')).toBe(1080);
    expect(maxRenderedEdge(project, 'unused')).toBe(0);
  });

  it('recommends an edge no smaller than rendered size × export ratio, capped at the asset', () => {
    const project = createDefaultProject();
    project.artboards[0].layers.push(imageLayer('l1', 'a1', 400, 300));
    const big = ref('a1', 6000, 4000);
    expect(recommendedMaxEdge(project, big)).toBe(400 * MAX_EXPORT_PIXEL_RATIO);
    // An asset already smaller than needed is never upscaled.
    const small = ref('a2', 800, 600);
    expect(recommendedMaxEdge(project, small)).toBe(800);
    // An unused asset keeps its own size.
    expect(recommendedMaxEdge(project, ref('a3', 5000, 5000))).toBe(5000);
  });

  it('reports only rasters, flags oversized ones, and marks downscale candidates', () => {
    const project = createDefaultProject();
    project.assets.push(ref('big', 6000, 4000), ref('small', 400, 300), ref('vec', 5000, 5000, 'svg'));
    project.artboards[0].layers.push(imageLayer('l1', 'big', 400, 300));
    const report = buildAssetHealthReport(project, new Map([['big', 3_000_000]]));
    expect(report.map((entry) => entry.ref.id)).toEqual(['big', 'small']);
    const big = report[0];
    expect(big.oversized).toBe(true);
    expect(big.canDownscale).toBe(true);
    expect(big.bytes).toBe(3_000_000);
    expect(big.decodedBytes).toBe(decodedBytes(6000, 4000));
    expect(report[1].oversized).toBe(false);
    expect(report[1].canDownscale).toBe(false);
  });

  it('flags oversized imports on either edge or decoded size', () => {
    expect(isOversizedImport(5000, 100)).toBe(true);
    expect(isOversizedImport(2000, 2000)).toBe(true); // 16 MB decoded > 8 MB
    expect(isOversizedImport(1000, 1000)).toBe(false);
    expect(isOversizedImport(undefined, undefined)).toBe(false);
  });

  it('estimates envelope size with base64 inflation', () => {
    const estimate = estimateEnvelopeBytes(
      10_000,
      new Map([
        ['a', 3_000_000],
        ['b', 1_500_000],
      ]),
    );
    expect(estimate).toBeGreaterThan(10_000 + 4_500_000);
    expect(estimate).toBeLessThan(10_000 + 4_500_000 * (4 / 3) + 1_000);
    expect(
      estimateEnvelopeBytes(1_000, new Map()) < DEFAULT_ASSET_HEALTH_THRESHOLDS.maxEnvelopeBytes,
    ).toBe(true);
  });
});

describe('downscaleTargetSize', () => {
  it('scales the long edge down preserving aspect ratio', () => {
    expect(downscaleTargetSize(6000, 4000, 3000)).toEqual({ width: 3000, height: 2000 });
    expect(downscaleTargetSize(4000, 6000, 3000)).toEqual({ width: 2000, height: 3000 });
  });

  it('never upscales or produces zero-size targets', () => {
    expect(downscaleTargetSize(800, 600, 3000)).toEqual({ width: 800, height: 600 });
    expect(downscaleTargetSize(10_000, 2, 4)).toEqual({ width: 4, height: 1 });
  });
});
