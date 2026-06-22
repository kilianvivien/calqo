import type { ShapeLayer } from '@/lib/schema';

export interface Point {
  x: number;
  y: number;
}

/** Default arrow head when promoting a plain line to an arrow. */
export const DEFAULT_ARROW_HEAD = {
  start: false,
  end: true,
  pointerLength: 16,
  pointerWidth: 16,
} as const;

/** Resolve the two relative endpoints of a line/arrow's `points` list, falling
 * back to the bounding box for layers authored before points were stored. */
function relativeEndpoints(layer: ShapeLayer): [number, number, number, number] {
  const pts = layer.points ?? [0, 0, layer.w, layer.h];
  return [pts[0] ?? 0, pts[1] ?? 0, pts[2] ?? layer.w, pts[3] ?? layer.h];
}

/** World-space (artboard) coordinates of a line/arrow's two endpoints,
 * accounting for the layer origin, point offsets, and rotation. This is what
 * the mobile endpoint handles sit on. */
export function lineEndpoints(layer: ShapeLayer): { a: Point; b: Point } {
  const [ax, ay, bx, by] = relativeEndpoints(layer);
  const rad = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const project = (px: number, py: number): Point => ({
    x: layer.x + px * cos - py * sin,
    y: layer.y + px * sin + py * cos,
  });
  return { a: project(ax, ay), b: project(bx, by) };
}

/** Schema patch that re-expresses a line/arrow as a straight segment between two
 * artboard points, normalising rotation back to 0 so repeated endpoint drags
 * stay numerically stable (the segment is fully described by its two ends). */
export function lineSegmentPatch(a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    x: a.x,
    y: a.y,
    rotation: 0,
    w: Math.max(1, Math.abs(dx)),
    h: Math.max(1, Math.abs(dy)),
    points: [0, 0, dx, dy],
  };
}
