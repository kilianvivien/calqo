import { describe, expect, it } from 'vitest';
import {
  createArrowLayer,
  createCustomPolygonLayer,
  createFreehandLayer,
} from '@/editor/commands/projectCommands';
import { fillProps, strokeProps } from '@/editor/canvas/shapeStyle';
import { mockProvider } from '@/editor/ai/mockProvider';
import { generateSvgMark } from '@/editor/ai/svgService';
import { SVG_LIBRARY } from '@/editor/assets/svgLibrary';
import { extractSvgSize, looksLikeSvg, sanitizeSvg } from '@/lib/utils/svg';
import { fillSchema, shapeLayerSchema } from '@/lib/schema';

const SHAPE_DEFAULTS = { fill: '#FFFFFF', stroke: '#FF0000', strokeWidth: 3, brushSize: 8 };

describe('phase G — drawing tools', () => {
  it('creates an arrow layer between two points with a head', () => {
    const layer = createArrowLayer(10, 10, 110, 60, SHAPE_DEFAULTS);
    expect(layer.type).toBe('shape');
    if (layer.type !== 'shape') return;
    expect(layer.shape).toBe('arrow');
    expect(layer.points).toEqual([0, 0, 100, 50]);
    expect(layer.arrow?.end).toBe(true);
  });

  it('normalises freehand points to a layer box', () => {
    const layer = createFreehandLayer([20, 30, 60, 80, 40, 50], SHAPE_DEFAULTS);
    expect(layer).not.toBeNull();
    if (!layer || layer.type !== 'shape') return;
    expect(layer.shape).toBe('freehand');
    expect(layer.x).toBe(20);
    expect(layer.y).toBe(30);
    // points become relative to the box origin
    expect(layer.points?.[0]).toBe(0);
    expect(layer.points?.[1]).toBe(0);
    expect(layer.stroke?.width).toBe(8);
  });

  it('rejects degenerate freehand and polygon input', () => {
    expect(createFreehandLayer([0, 0], SHAPE_DEFAULTS)).toBeNull();
    expect(createCustomPolygonLayer([0, 0, 1, 1], SHAPE_DEFAULTS)).toBeNull();
  });

  it('builds a closed custom polygon from pen points', () => {
    const layer = createCustomPolygonLayer([0, 0, 100, 0, 50, 80], SHAPE_DEFAULTS);
    expect(layer).not.toBeNull();
    if (!layer || layer.type !== 'shape') return;
    expect(layer.shape).toBe('polygon');
    expect(layer.points).toHaveLength(6);
  });
});

describe('phase G — fills & strokes', () => {
  it('validates pattern fills', () => {
    const parsed = fillSchema.parse({ type: 'pattern', pattern: 'hatch', color: '#000000' });
    expect(parsed.type).toBe('pattern');
    if (parsed.type !== 'pattern') return;
    expect(parsed.background).toBe('#FFFFFF');
    expect(parsed.scale).toBe(1);
  });

  it('validates arrow and freehand shapes', () => {
    expect(() =>
      shapeLayerSchema.parse({
        id: 'l1',
        name: 'Arrow',
        type: 'shape',
        shape: 'arrow',
        x: 0,
        y: 0,
        w: 10,
        h: 10,
        fill: { type: 'solid', color: '#000' },
      }),
    ).not.toThrow();
  });

  it('expands a linear gradient fill into Konva gradient props', () => {
    const props = fillProps(
      { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#FFF' }] },
      100,
      100,
    );
    expect(props.fillLinearGradientColorStops).toEqual([0, '#000', 1, '#FFF']);
    expect(props.fillLinearGradientStartPoint).toBeDefined();
  });

  it('expands named stroke styles into dash arrays', () => {
    expect(strokeProps({ color: '#000', width: 2, style: 'dashed' }).dash).toEqual([6, 4]);
    expect(strokeProps({ color: '#000', width: 2, style: 'dotted' }).lineCap).toBe('round');
    expect(strokeProps({ color: '#000', width: 0 }).strokeWidth).toBe(0);
  });
});

describe('phase G — SVG insert', () => {
  it('ships a non-empty, valid prebuilt library', () => {
    expect(SVG_LIBRARY.length).toBeGreaterThan(8);
    for (const item of SVG_LIBRARY) {
      expect(looksLikeSvg(item.svg)).toBe(true);
    }
  });

  it('sanitises scripts and event handlers out of SVG', () => {
    const dirty = '<svg onload="evil()"><script>alert(1)</script><circle r="5"/></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onload');
    expect(looksLikeSvg(clean)).toBe(true);
  });

  it('reads the intrinsic size from a viewBox', () => {
    expect(extractSvgSize('<svg viewBox="0 0 48 24"></svg>')).toEqual({ width: 48, height: 24 });
    expect(extractSvgSize('<svg></svg>')).toEqual({ width: 240, height: 240 });
  });

  it('generates a sanitised SVG through the mock provider', async () => {
    const result = await generateSvgMark(mockProvider, { prompt: 'a bright star', color: '#FF0000' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(looksLikeSvg(result.svg)).toBe(true);
    expect(result.svg).toContain('#FF0000');
  });
});
