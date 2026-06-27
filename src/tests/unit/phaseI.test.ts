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
import { recolorSvg } from '@/lib/utils/svg';
import type { SvgLayer } from '@/lib/schema';
import {
  clampCropView,
  initCropView,
  minCoverScale,
  MIN_CROP_FRAME,
  resizeCropFrame,
  viewToCropRect,
  zoomCropView,
} from '@/editor/canvas/cropGeometry';

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
        fontStyle: 'normal' as const,
        textDecoration: 'none' as const,
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

describe('phase I — SVG recolour', () => {
  it('recolours concrete fills and strokes but leaves none/transparent', () => {
    const outline = recolorSvg(
      '<svg fill="none" stroke="#111827"><path d="M0 0"/></svg>',
      '#FF0000',
    );
    expect(outline).toContain('stroke="#FF0000"');
    expect(outline).toContain('fill="none"');

    const solid = recolorSvg('<svg fill="#111827"><path/></svg>', '#00FF00');
    expect(solid).toContain('fill="#00FF00"');

    expect(recolorSvg('<path fill="currentColor"/>', '#123456')).toContain('fill="#123456"');
  });

  it('sets and clears an SVG layer tint through the patch path', () => {
    const layer: SvgLayer = {
      id: 'svg1',
      name: 'Icon',
      type: 'svg',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      assetId: 'a1',
    };
    applyLayerPatch(layer, { color: '#FF9500' });
    expect(layer.color).toBe('#FF9500');
    applyLayerPatch(layer, { color: null });
    expect(layer.color).toBeUndefined();
  });
});

describe('phase I — crop geometry', () => {
  const frame = { x: 100, y: 100, w: 200, h: 200 };

  it('round-trips a crop rect through init and viewToCropRect', () => {
    const crop = { x: 50, y: 60, w: 300, h: 300 };
    const view = initCropView(800, 600, frame, crop);
    const back = viewToCropRect(view, frame, 800, 600);
    expect(back.x).toBeCloseTo(crop.x, 3);
    expect(back.y).toBeCloseTo(crop.y, 3);
    expect(back.w).toBeCloseTo(crop.w, 3);
    expect(back.h).toBeCloseTo(crop.h, 3);
  });

  it('never lets the image scale below cover', () => {
    const min = minCoverScale(800, 600, frame); // 200/600
    const clamped = clampCropView({ scale: 0.01, x: 0, y: 0 }, 800, 600, frame);
    expect(clamped.scale).toBeCloseTo(min, 5);
  });

  it('keeps the image covering the frame after clamping', () => {
    const view = clampCropView({ scale: 1, x: 9999, y: 9999 }, 800, 600, frame);
    expect(view.x).toBeLessThanOrEqual(frame.x);
    expect(view.y).toBeLessThanOrEqual(frame.y);
    expect(view.x + 800 * view.scale).toBeGreaterThanOrEqual(frame.x + frame.w - 0.001);
  });

  it('zoom raises the scale but stays clamped to cover', () => {
    const start = initCropView(800, 600, frame);
    const zoomed = zoomCropView(start, frame, 1.5, 800, 600);
    expect(zoomed.scale).toBeGreaterThan(start.scale);
    const out = zoomCropView(start, frame, 0.01, 800, 600);
    expect(out.scale).toBeCloseTo(minCoverScale(800, 600, frame), 5);
  });

  describe('resizeCropFrame', () => {
    const bounds = { x: 0, y: 0, w: 400, h: 400 };
    const base = { x: 100, y: 100, w: 200, h: 200 };

    it('drags an edge while pinning the opposite side', () => {
      const east = resizeCropFrame(base, 'e', 50, 0, bounds);
      expect(east).toEqual({ x: 100, y: 100, w: 250, h: 200 });
      const west = resizeCropFrame(base, 'w', -30, 0, bounds);
      expect(west).toEqual({ x: 70, y: 100, w: 230, h: 200 });
    });

    it('moves two edges for a corner handle', () => {
      const se = resizeCropFrame(base, 'se', 40, 60, bounds);
      expect(se).toEqual({ x: 100, y: 100, w: 240, h: 260 });
    });

    it('never grows beyond the bounds', () => {
      const out = resizeCropFrame(base, 'e', 9999, 0, bounds);
      expect(out.x + out.w).toBeLessThanOrEqual(bounds.x + bounds.w);
    });

    it('never shrinks below the minimum size', () => {
      const out = resizeCropFrame(base, 'e', -9999, 0, bounds);
      expect(out.w).toBeCloseTo(MIN_CROP_FRAME, 5);
      const top = resizeCropFrame(base, 'n', 0, 9999, bounds);
      expect(top.h).toBeCloseTo(MIN_CROP_FRAME, 5);
    });
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
