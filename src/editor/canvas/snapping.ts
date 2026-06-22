import type { CanvasGuide } from '@/lib/state/uiStore';

/** Snap threshold in artboard pixels, shared by the desktop and mobile stages. */
export const SNAP_DISTANCE = 6;

export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: CanvasGuide[];
}

/** Candidate snap lines along one axis: a position plus the kind of guide it
 * should draw. Alignment lines (edges/centers/artboard) draw a full guide;
 * spacing lines come from the equidistant-between-neighbours pass. */
interface AxisCandidate {
  /** Position on the moving rect that is being matched (left/center/right). */
  ref: number;
  /** Target position to snap that ref to. */
  target: number;
}

/** Best single snap along one axis within the threshold. */
function bestSnap(refs: number[], targets: number[], threshold: number): AxisCandidate | null {
  let best: AxisCandidate | null = null;
  for (const target of targets) {
    for (const ref of refs) {
      const delta = Math.abs(ref - target);
      if (delta <= threshold && (!best || delta < Math.abs(best.ref - best.target))) {
        best = { ref, target };
      }
    }
  }
  return best;
}

/**
 * Compute a snap offset and the guide lines to draw for a moving rectangle
 * against the artboard and the other (static) rectangles. Stronger than a plain
 * edge snap: it covers artboard bounds, layer edges, layer centers, and an
 * equal-spacing pass that centers the moving rect between two flanking
 * neighbours so social posts space out without manual maths.
 */
export function computeSnap(
  moving: SnapRect,
  others: SnapRect[],
  artboard: { width: number; height: number },
  threshold: number,
): SnapResult {
  const guides: CanvasGuide[] = [];

  const movingX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const movingY = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];

  const targetsX = [0, artboard.width / 2, artboard.width];
  const targetsY = [0, artboard.height / 2, artboard.height];
  for (const o of others) {
    targetsX.push(o.x, o.x + o.width / 2, o.x + o.width);
    targetsY.push(o.y, o.y + o.height / 2, o.y + o.height);
  }

  let dx = 0;
  let dy = 0;

  const snapX = bestSnap(movingX, targetsX, threshold);
  if (snapX) {
    dx = snapX.target - snapX.ref;
    guides.push({ axis: 'x', position: snapX.target });
  }
  const snapY = bestSnap(movingY, targetsY, threshold);
  if (snapY) {
    dy = snapY.target - snapY.ref;
    guides.push({ axis: 'y', position: snapY.target });
  }

  // Equal-spacing pass: when no hard alignment took an axis, try to centre the
  // moving rect between its nearest neighbours on that axis so the gaps match.
  if (!snapX) {
    const spacing = equalSpacing(moving, others, 'x', threshold);
    if (spacing) {
      dx = spacing.delta;
      guides.push(...spacing.guides);
    }
  }
  if (!snapY) {
    const spacing = equalSpacing(moving, others, 'y', threshold);
    if (spacing) {
      dy = spacing.delta;
      guides.push(...spacing.guides);
    }
  }

  return { dx, dy, guides };
}

/** Centre the moving rect between the nearest neighbour on each side so the two
 * gaps are equal. Returns the offset and the two gap guide lines, or null. */
function equalSpacing(
  moving: SnapRect,
  others: SnapRect[],
  axis: 'x' | 'y',
  threshold: number,
): { delta: number; guides: CanvasGuide[] } | null {
  const horizontal = axis === 'x';
  const start = horizontal ? moving.x : moving.y;
  const size = horizontal ? moving.width : moving.height;
  const end = start + size;
  // Overlap on the cross axis so we only match rows/columns that line up.
  const overlaps = (o: SnapRect) => {
    if (horizontal) {
      return o.y < moving.y + moving.height && o.y + o.height > moving.y;
    }
    return o.x < moving.x + moving.width && o.x + o.width > moving.x;
  };
  const oStart = (o: SnapRect) => (horizontal ? o.x : o.y);
  const oEnd = (o: SnapRect) => (horizontal ? o.x + o.width : o.y + o.height);

  const aligned = others.filter(overlaps);
  const before = aligned
    .filter((o) => oEnd(o) <= start + threshold)
    .sort((a, b) => oEnd(b) - oEnd(a))[0];
  const after = aligned
    .filter((o) => oStart(o) >= end - threshold)
    .sort((a, b) => oStart(a) - oStart(b))[0];
  if (!before || !after) return null;

  const left = oEnd(before);
  const right = oStart(after);
  const free = right - left - size;
  if (free < 0) return null;
  const idealStart = left + free / 2;
  const delta = idealStart - start;
  if (Math.abs(delta) > threshold) return null;

  const gap = free / 2;
  const g1 = left + gap / 2;
  const g2 = right - gap / 2;
  const guides: CanvasGuide[] = [
    { axis: horizontal ? 'x' : 'y', position: g1 },
    { axis: horizontal ? 'x' : 'y', position: g2 },
  ];
  return { delta, guides };
}
