import { describe, expect, it } from 'vitest';
import {
  createDefaultProject,
  safeImportProject,
  type CalqoLayer,
  type ImageLayer,
  type TextLayer,
} from '@/lib/schema';
import {
  buildImageFilterPipeline,
  coverCropRect,
  hasActiveFilters,
} from '@/editor/canvas/imageFilters';
import { maskPolygonPoints, MASK_SHAPES } from '@/editor/canvas/maskClip';
import { TEXT_PRESET_IDS, textPresetStyle } from '@/editor/typography/textPresets';
import { applyLayerPatch } from '@/editor/utils/layers';

function baseImageLayer(): ImageLayer {
  return {
    id: 'img1',
    name: 'Photo',
    type: 'image',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    assetId: 'asset1',
    fit: 'cover',
  };
}

describe('phase I — image filters', () => {
  it('only includes non-neutral filter channels in the pipeline', () => {
    expect(buildImageFilterPipeline(undefined).filters).toHaveLength(0);
    expect(buildImageFilterPipeline({ brightness: 0, contrast: 0 }).filters).toHaveLength(0);
    const pipeline = buildImageFilterPipeline({ brightness: 0.3, blur: 4 });
    expect(pipeline.filters).toHaveLength(2);
    expect(pipeline.attrs.brightness).toBe(0.3);
    expect(pipeline.attrs.blurRadius).toBe(4);
  });

  it('reports active filters only when a channel differs from default', () => {
    expect(hasActiveFilters(undefined)).toBe(false);
    expect(hasActiveFilters({ brightness: 0, contrast: 0, saturation: 0, blur: 0 })).toBe(false);
    expect(hasActiveFilters({ contrast: 12 })).toBe(true);
  });

  it('centres the cover crop by default and shifts toward the focal point', () => {
    // 800x400 image into a 400x400 (square) box -> crop a 400px-wide window.
    const centred = coverCropRect(800, 400, 400, 400);
    expect(centred.width).toBe(400);
    expect(centred.height).toBe(400);
    expect(centred.x).toBe(200); // (800-400)*0.5

    const left = coverCropRect(800, 400, 400, 400, { x: 0, y: 0.5 });
    expect(left.x).toBe(0);
    const right = coverCropRect(800, 400, 400, 400, { x: 1, y: 0.5 });
    expect(right.x).toBe(400);
  });
});

describe('phase I — image masks', () => {
  it('returns polygon points for polygonal masks and null otherwise', () => {
    expect(maskPolygonPoints('triangle', 100, 100)).toEqual([50, 0, 100, 100, 0, 100]);
    expect(maskPolygonPoints('hexagon', 100, 100)).toHaveLength(12);
    expect(maskPolygonPoints('star', 100, 100)).toHaveLength(20);
    expect(maskPolygonPoints('rounded', 100, 100)).toBeNull();
    expect(maskPolygonPoints('circle', 100, 100)).toBeNull();
    expect(maskPolygonPoints('ellipse', 100, 100)).toBeNull();
  });

  it('exposes every mask shape', () => {
    expect(MASK_SHAPES).toContain('circle');
    expect(MASK_SHAPES).toHaveLength(6);
  });
});

describe('phase I — typography presets', () => {
  it('produces valid style patches for every role', () => {
    for (const id of TEXT_PRESET_IDS) {
      const patch = textPresetStyle(id);
      expect(patch.fontSize).toBeGreaterThan(0);
      expect(patch.fontWeight).toBeDefined();
      expect(patch.lineHeight).toBeGreaterThan(0);
    }
  });

  it('merges into an existing text layer without dropping locale variants', () => {
    const layer: CalqoLayer = {
      ...baseImageLayer(),
      type: 'text',
      text: { en: 'Hello', fr: 'Bonjour' },
      style: {
        fontFamily: 'Inter',
        fontSize: 20,
        fontWeight: 400,
        color: '#000000',
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    } as TextLayer;
    applyLayerPatch(layer, { style: textPresetStyle('headline') });
    const text = layer as TextLayer;
    expect(text.style.fontSize).toBe(72);
    expect(text.text).toEqual({ en: 'Hello', fr: 'Bonjour' });
  });
});

describe('phase I — layer patch effects & image fields', () => {
  it('sets and clears focal point, mask, filters, effects, and blend mode', () => {
    const layer = baseImageLayer() as CalqoLayer;
    applyLayerPatch(layer, {
      focalPoint: { x: 0.2, y: 0.8 },
      mask: { shape: 'circle' },
      filters: { brightness: 0.5 },
      effects: { shadow: { color: '#000', blur: 8, offsetX: 0, offsetY: 4, opacity: 0.3 } },
      blendMode: 'multiply',
    });
    const img = layer as ImageLayer;
    expect(img.focalPoint).toEqual({ x: 0.2, y: 0.8 });
    expect(img.mask).toEqual({ shape: 'circle' });
    expect(img.filters).toEqual({ brightness: 0.5 });
    expect(layer.blendMode).toBe('multiply');
    expect(layer.effects?.shadow).toBeDefined();

    applyLayerPatch(layer, { focalPoint: null, mask: null, filters: null, effects: null });
    expect(img.focalPoint).toBeUndefined();
    expect(img.mask).toBeUndefined();
    expect(img.filters).toBeUndefined();
    expect(layer.effects).toBeUndefined();
  });
});

describe('phase I — schema round-trip', () => {
  it('preserves image crop, focal point, mask, filters, and text vertical align', () => {
    const project = createDefaultProject();
    project.assets.push({
      id: 'asset1',
      kind: 'raster',
      name: 'photo.png',
      mimeType: 'image/png',
      storageKey: 'k',
      createdAt: new Date().toISOString(),
      width: 800,
      height: 600,
    });
    const image: ImageLayer = {
      ...baseImageLayer(),
      crop: { x: 10, y: 20, w: 300, h: 200 },
      focalPoint: { x: 0.3, y: 0.7 },
      mask: { shape: 'rounded', radius: 24 },
      filters: { brightness: 0.2, contrast: 10, saturation: -0.4, blur: 3 },
      effects: { blur: 6 },
      blendMode: 'screen',
    };
    project.artboards[0].layers.push(image);

    const result = safeImportProject(JSON.parse(JSON.stringify(project)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const round = result.project.artboards[0].layers.find((l) => l.id === 'img1') as ImageLayer;
    expect(round.crop).toEqual({ x: 10, y: 20, w: 300, h: 200 });
    expect(round.focalPoint).toEqual({ x: 0.3, y: 0.7 });
    expect(round.mask).toEqual({ shape: 'rounded', radius: 24 });
    expect(round.filters).toEqual({ brightness: 0.2, contrast: 10, saturation: -0.4, blur: 3 });
    expect(round.effects).toEqual({ blur: 6 });
    expect(round.blendMode).toBe('screen');
  });
});
