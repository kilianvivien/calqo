import { describe, expect, it } from 'vitest';
import { createDefaultProject, safeImportProject } from '@/lib/schema';
import type { ShapeLayer } from '@/lib/schema';
import {
  pressureOutlinePoints,
  pressuresToWidths,
} from '@/editor/canvas/freehandGeometry';
import { createFreehandLayer } from '@/editor/commands/projectCommands';
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
