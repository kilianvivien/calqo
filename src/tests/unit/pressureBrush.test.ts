import { describe, expect, it } from 'vitest';
import { createDefaultProject, safeImportProject } from '@/lib/schema';
import type { ShapeLayer } from '@/lib/schema';
import {
  brushProfileWidths,
  pressureOutlinePoints,
  pressuresToWidths,
} from '@/editor/canvas/freehandGeometry';
import { brushStyleLayerPatch, createFreehandLayer } from '@/editor/commands/projectCommands';
import { serializeLayer } from '@/editor/export/svgExport';

const BRUSH_DEFAULTS = {
  fill: '#ffffff',
  stroke: '#007aff',
  strokeWidth: 2,
  brushSize: 10,
  brushStyle: 'smooth',
} as const;

describe('pressure-sensitive brush strokes', () => {
  it('maps pressure to widths with the base width at the 0.5 default', () => {
    const widths = pressuresToWidths([0, 0.5, 1], 10);
    expect(widths[1]).toBeCloseTo(10);
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[2]).toBeGreaterThan(widths[1]);
    // Out-of-range samples clamp instead of producing negative/huge widths.
    expect(pressuresToWidths([-1, 2], 10)).toEqual(pressuresToWidths([0, 1], 10));
  });

  it('builds a closed, finite outline that widens with pressure', () => {
    const points = [0, 0, 40, 0, 80, 0];
    const thin = pressureOutlinePoints(points, [2, 2, 2]);
    const thick = pressureOutlinePoints(points, [2, 12, 2]);
    expect(thin.length).toBeGreaterThanOrEqual(6);
    expect(thin.length % 2).toBe(0);
    for (const value of [...thin, ...thick]) expect(Number.isFinite(value)).toBe(true);
    const maxAbsY = (outline: number[]) =>
      Math.max(...outline.filter((_, i) => i % 2 === 1).map(Math.abs));
    expect(maxAbsY(thick)).toBeGreaterThan(maxAbsY(thin));
  });

  it('returns no outline for degenerate strokes', () => {
    expect(pressureOutlinePoints([5, 5], [4])).toEqual([]);
    expect(pressureOutlinePoints([5, 5, 5, 5], [4, 4])).toEqual([]);
  });

  it('createFreehandLayer stores one width per point pair when pressure is real', () => {
    const layer = createFreehandLayer(
      [0, 0, 20, 10, 40, 0],
      BRUSH_DEFAULTS,
      [0.2, 0.9], // one sample short: padded with the last value
    ) as ShapeLayer;
    expect(layer.shape).toBe('freehand');
    expect(layer.pointWidths).toHaveLength(3);
    expect(layer.pointWidths?.[0]).toBeLessThan(layer.pointWidths?.[1] ?? 0);
    expect(layer.pointWidths?.[2]).toBe(layer.pointWidths?.[1]);

    const flat = createFreehandLayer([0, 0, 20, 10, 40, 0], BRUSH_DEFAULTS) as ShapeLayer;
    expect(flat.pointWidths).toBeUndefined();
  });

  it('round-trips pointWidths through project validation', () => {
    const project = createDefaultProject();
    const layer = createFreehandLayer(
      [10, 10, 60, 40, 120, 20],
      BRUSH_DEFAULTS,
      [0.3, 0.7, 1],
    ) as ShapeLayer;
    project.artboards[0].layers.push(layer);
    const result = safeImportProject(project);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const imported = result.project.artboards[0].layers.at(-1) as ShapeLayer;
      expect(imported.pointWidths).toEqual(layer.pointWidths);
    }
  });

  it('tapers felt-tip strokes to fine points at both ends', () => {
    // A long horizontal stroke: mid-stroke keeps the base width, ends thin out.
    const points = Array.from({ length: 20 }).flatMap((_, i) => [i * 10, 0]);
    const widths = brushProfileWidths('taper', points, new Array(20).fill(10));
    expect(widths[0]).toBeLessThan(widths[10] * 0.4);
    expect(widths[19]).toBeLessThan(widths[10] * 0.4);
    expect(widths[10]).toBeCloseTo(10);
  });

  it('draws chisel strokes broad on one diagonal and thin on the other', () => {
    const diag = (sign: number) =>
      Array.from({ length: 8 }).flatMap((_, i) => [i * 10, sign * i * 10]);
    // Along the 45° nib the stroke is thin; across it, broad.
    const along = brushProfileWidths('chisel', diag(1), new Array(8).fill(10));
    const across = brushProfileWidths('chisel', diag(-1), new Array(8).fill(10));
    expect(Math.max(...along)).toBeLessThan(Math.min(...across) * 0.5);
  });

  it('applies deterministic grain so repaints and exports agree', () => {
    const points = Array.from({ length: 12 }).flatMap((_, i) => [i * 7, (i % 3) * 4]);
    const a = brushProfileWidths('grain', points, new Array(12).fill(8));
    const b = brushProfileWidths('grain', points, new Array(12).fill(8));
    expect(a).toEqual(b);
    // The jitter actually varies the body (it is not a constant ribbon)…
    expect(new Set(a.map((w) => w.toFixed(3))).size).toBeGreaterThan(1);
    // …and the soft variant stays closer to the base width.
    const soft = brushProfileWidths('grain-soft', points, new Array(12).fill(8));
    const spread = (w: number[]) => Math.max(...w) - Math.min(...w);
    expect(spread(soft)).toBeLessThan(spread(a));
  });

  it('profiles style the stroke at creation and on restyle', () => {
    const marker = createFreehandLayer(
      [0, 0, 30, 0, 60, 0, 90, 0],
      { ...BRUSH_DEFAULTS, brushStyle: 'marker' },
    ) as ShapeLayer;
    // No stylus pressure, yet the chisel profile still gives a ribbon body.
    expect(marker.pointWidths).toHaveLength(4);

    // Restyling to a profiled brush recomputes the ribbon; to a plain brush
    // clears it back to a constant-width stroke.
    const feltPatch = brushStyleLayerPatch('felt-tip', marker.stroke, {
      points: marker.points,
    });
    expect(feltPatch.pointWidths).toHaveLength(4);
    const smoothPatch = brushStyleLayerPatch('smooth', marker.stroke, {
      points: marker.points,
    });
    expect(smoothPatch.pointWidths).toBeNull();
  });

  it('keeps dashed strokes constant-width so the dash survives', () => {
    const dashed = createFreehandLayer(
      [0, 0, 30, 10, 60, 0],
      { ...BRUSH_DEFAULTS, brushStyle: 'dashed' },
      [0.2, 0.9, 0.4],
    ) as ShapeLayer;
    expect(dashed.pointWidths).toBeUndefined();
    expect(dashed.stroke?.style).toBe('dashed');
  });

  it('scales broad tools up from the nominal brush size', () => {
    const highlighter = createFreehandLayer(
      [0, 0, 30, 10, 60, 0],
      { ...BRUSH_DEFAULTS, brushStyle: 'highlighter' },
    ) as ShapeLayer;
    expect(highlighter.stroke?.width).toBeCloseTo(BRUSH_DEFAULTS.brushSize * 1.6);
  });

  it('exports pressure strokes to SVG as a filled ribbon polygon', () => {
    const layer = createFreehandLayer(
      [0, 0, 40, 20, 80, 0],
      BRUSH_DEFAULTS,
      [0.2, 1, 0.2],
    ) as ShapeLayer;
    const warnings: string[] = [];
    const svg = serializeLayer(layer, new Map(), 'en', warnings);
    expect(svg).toContain('<polygon');
    expect(svg).toContain(`fill="${BRUSH_DEFAULTS.stroke}"`);

    const flat = createFreehandLayer([0, 0, 40, 20, 80, 0], BRUSH_DEFAULTS) as ShapeLayer;
    const flatSvg = serializeLayer(flat, new Map(), 'en', warnings);
    expect(flatSvg).toContain('<path');
  });
});
