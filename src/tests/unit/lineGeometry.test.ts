import { describe, expect, it } from 'vitest';
import { lineEndpoints, lineSegmentPatch } from '@/editor/canvas/lineGeometry';
import type { ShapeLayer } from '@/lib/schema';

function lineLayer(overrides: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    id: 'line_1',
    name: 'Line',
    type: 'shape',
    shape: 'line',
    x: 100,
    y: 50,
    w: 80,
    h: 0,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: { type: 'solid', color: 'transparent' },
    stroke: { color: '#007AFF', width: 4 },
    points: [0, 0, 80, 0],
    ...overrides,
  } as ShapeLayer;
}

describe('lineEndpoints', () => {
  it('resolves both ends from the layer origin and points', () => {
    const { a, b } = lineEndpoints(lineLayer());
    expect(a).toEqual({ x: 100, y: 50 });
    expect(b).toEqual({ x: 180, y: 50 });
  });

  it('falls back to the bounding box when points are absent', () => {
    const { a, b } = lineEndpoints(lineLayer({ points: undefined, w: 60, h: 20 }));
    expect(a).toEqual({ x: 100, y: 50 });
    expect(b).toEqual({ x: 160, y: 70 });
  });

  it('applies the layer rotation around its origin', () => {
    const { a, b } = lineEndpoints(lineLayer({ rotation: 90 }));
    expect(a.x).toBeCloseTo(100);
    expect(a.y).toBeCloseTo(50);
    // A 90° rotation swings the +x segment onto +y.
    expect(b.x).toBeCloseTo(100);
    expect(b.y).toBeCloseTo(130);
  });
});

describe('lineSegmentPatch', () => {
  it('rebuilds a normalised, rotation-free segment between two points', () => {
    const patch = lineSegmentPatch({ x: 10, y: 20 }, { x: 50, y: 20 });
    expect(patch).toMatchObject({
      x: 10,
      y: 20,
      rotation: 0,
      w: 40,
      h: 1,
      points: [0, 0, 40, 0],
    });
  });

  it('keeps a positive bounding box for segments running up-left', () => {
    const patch = lineSegmentPatch({ x: 100, y: 100 }, { x: 40, y: 70 });
    expect(patch.w).toBe(60);
    expect(patch.h).toBe(30);
    expect(patch.points).toEqual([0, 0, -60, -30]);
  });

  it('round-trips through lineEndpoints', () => {
    const a = { x: 12, y: 34 };
    const b = { x: 90, y: 8 };
    const patch = lineSegmentPatch(a, b);
    const ends = lineEndpoints(lineLayer({ ...patch }));
    expect(ends.a.x).toBeCloseTo(a.x);
    expect(ends.a.y).toBeCloseTo(a.y);
    expect(ends.b.x).toBeCloseTo(b.x);
    expect(ends.b.y).toBeCloseTo(b.y);
  });
});
