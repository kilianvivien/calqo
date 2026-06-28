import { describe, expect, it } from 'vitest';
import { remapProjectAssetIds } from '@/editor/assets/assetRemap';
import {
  removeBackgroundFromImageData,
} from '@/editor/images/backgroundRemoval';
import {
  createDefaultProject,
  safeImportProject,
  type ImageBackgroundRemovalPass,
  type ImageLayer,
} from '@/lib/schema';

class TestImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

if (!globalThis.ImageData) {
  Object.defineProperty(globalThis, 'ImageData', {
    configurable: true,
    value: TestImageData,
  });
}

function imageData(width: number, height: number, pixels: number[][]): ImageData {
  return new ImageData(new Uint8ClampedArray(pixels.flat()), width, height);
}

function px(data: ImageData, x: number, y: number): number[] {
  const offset = (y * data.width + x) * 4;
  return Array.from(data.data.slice(offset, offset + 4));
}

const whiteConnectedPass: ImageBackgroundRemovalPass = {
  id: 'pass-1',
  color: '#FFFFFF',
  tolerance: 8,
  softness: 0,
  mode: 'connected',
};

describe('background removal image processing', () => {
  it('removes a white logo background while preserving coloured artwork', () => {
    const source = imageData(3, 1, [
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [240, 0, 0, 255],
    ]);

    const result = removeBackgroundFromImageData(source, [whiteConnectedPass]);

    expect(px(result, 0, 0)[3]).toBe(0);
    expect(px(result, 1, 0)[3]).toBe(255);
    expect(px(result, 2, 0)[3]).toBe(255);
  });

  it('uses sensitivity to include near-background colours', () => {
    const source = imageData(1, 1, [[245, 245, 245, 255]]);

    const low = removeBackgroundFromImageData(source, [
      { ...whiteConnectedPass, tolerance: 1 },
    ]);
    const high = removeBackgroundFromImageData(source, [
      { ...whiteConnectedPass, tolerance: 20 },
    ]);

    expect(px(low, 0, 0)[3]).toBe(255);
    expect(px(high, 0, 0)[3]).toBe(0);
  });

  it('creates partial alpha for soft anti-aliased edges', () => {
    const source = imageData(1, 1, [[235, 235, 235, 255]]);

    const result = removeBackgroundFromImageData(source, [
      { ...whiteConnectedPass, tolerance: 1, softness: 100 },
    ]);

    expect(px(result, 0, 0)[3]).toBeGreaterThan(0);
    expect(px(result, 0, 0)[3]).toBeLessThan(255);
  });

  it('applies multiple removal passes additively', () => {
    const source = imageData(3, 1, [
      [255, 255, 255, 255],
      [255, 0, 0, 255],
      [0, 0, 0, 255],
    ]);

    const result = removeBackgroundFromImageData(source, [
      whiteConnectedPass,
      {
        id: 'pass-2',
        color: '#FF0000',
        tolerance: 8,
        softness: 0,
        mode: 'global',
      },
    ]);

    expect(px(result, 0, 0)[3]).toBe(0);
    expect(px(result, 1, 0)[3]).toBe(0);
    expect(px(result, 2, 0)[3]).toBe(255);
  });

  it('keeps interior matching colours in connected mode but removes them globally', () => {
    const white = [255, 255, 255, 255];
    const black = [0, 0, 0, 255];
    const source = imageData(5, 5, [
      white, white, white, white, white,
      white, black, black, black, white,
      white, black, white, black, white,
      white, black, black, black, white,
      white, white, white, white, white,
    ]);

    const connected = removeBackgroundFromImageData(source, [whiteConnectedPass]);
    const global = removeBackgroundFromImageData(source, [
      { ...whiteConnectedPass, mode: 'global' },
    ]);

    expect(px(connected, 2, 2)[3]).toBe(255);
    expect(px(global, 2, 2)[3]).toBe(0);
  });
});

describe('background removal schema and asset remapping', () => {
  it('round-trips optional background removal metadata', () => {
    const project = createDefaultProject();
    const layer: ImageLayer = {
      id: 'image-1',
      name: 'Logo',
      type: 'image',
      x: 0,
      y: 0,
      w: 100,
      h: 80,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      assetId: 'asset-result',
      fit: 'contain',
      backgroundRemoval: {
        source: { assetId: 'asset-source' },
        result: { assetId: 'asset-result' },
        passes: [whiteConnectedPass],
      },
    };
    project.artboards[0].layers.push(layer);

    const result = safeImportProject(project);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const imported = result.project.artboards[0].layers[0] as ImageLayer;
      expect(imported.backgroundRemoval?.source.assetId).toBe('asset-source');
      expect(imported.backgroundRemoval?.result?.assetId).toBe('asset-result');
    }
  });

  it('remaps nested source and result asset ids', () => {
    const project = createDefaultProject();
    project.assets.push(
      {
        id: 'asset-source',
        kind: 'raster',
        name: 'logo.png',
        mimeType: 'image/png',
        storageKey: 'asset-source',
        createdAt: '2026-06-28T00:00:00.000Z',
      },
      {
        id: 'asset-result',
        kind: 'raster',
        name: 'logo transparent.png',
        mimeType: 'image/png',
        storageKey: 'asset-result',
        createdAt: '2026-06-28T00:00:00.000Z',
      },
    );
    project.artboards[0].layers.push({
      id: 'image-1',
      name: 'Logo',
      type: 'image',
      x: 0,
      y: 0,
      w: 100,
      h: 80,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      assetId: 'asset-result',
      fit: 'contain',
      backgroundRemoval: {
        source: { assetId: 'asset-source' },
        result: { assetId: 'asset-result' },
        passes: [whiteConnectedPass],
      },
    });

    const remapped = remapProjectAssetIds(
      project,
      new Map([
        ['asset-source', 'asset-source-copy'],
        ['asset-result', 'asset-result-copy'],
      ]),
    );
    const layer = remapped.artboards[0].layers[0] as ImageLayer;

    expect(layer.assetId).toBe('asset-result-copy');
    expect(layer.backgroundRemoval?.source.assetId).toBe('asset-source-copy');
    expect(layer.backgroundRemoval?.result?.assetId).toBe('asset-result-copy');
  });
});
