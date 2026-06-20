import type { CalqoLayer } from '@/lib/schema';

/** A minimal positioned box — everything the arrange math needs from a layer. */
export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Position patch produced by an arrange operation. Only the changed axis is
 * present so callers can apply it through the normal layer patch path. */
export interface PositionPatch {
  id: string;
  x?: number;
  y?: number;
}

export type AlignMode =
  | 'left'
  | 'center-h'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom';

export type Axis = 'horizontal' | 'vertical';

function toBox(layer: CalqoLayer): Box {
  return { id: layer.id, x: layer.x, y: layer.y, w: layer.w, h: layer.h };
}

/** Bounding box of a set of boxes. */
export function boundsOf(boxes: Box[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Align boxes against a reference rectangle (the selection's bounding box, or
 * the artboard). Returns only the boxes whose position actually changes. */
export function alignBoxes(
  boxes: Box[],
  mode: AlignMode,
  reference: { x: number; y: number; w: number; h: number },
): PositionPatch[] {
  const patches: PositionPatch[] = [];
  for (const b of boxes) {
    let patch: PositionPatch | null = null;
    switch (mode) {
      case 'left':
        if (b.x !== reference.x) patch = { id: b.id, x: reference.x };
        break;
      case 'center-h': {
        const x = reference.x + (reference.w - b.w) / 2;
        if (x !== b.x) patch = { id: b.id, x };
        break;
      }
      case 'right': {
        const x = reference.x + reference.w - b.w;
        if (x !== b.x) patch = { id: b.id, x };
        break;
      }
      case 'top':
        if (b.y !== reference.y) patch = { id: b.id, y: reference.y };
        break;
      case 'middle': {
        const y = reference.y + (reference.h - b.h) / 2;
        if (y !== b.y) patch = { id: b.id, y };
        break;
      }
      case 'bottom': {
        const y = reference.y + reference.h - b.h;
        if (y !== b.y) patch = { id: b.id, y };
        break;
      }
    }
    if (patch) patches.push(patch);
  }
  return patches;
}

/** Distribute boxes so the gaps between adjacent edges are equal along an axis.
 * The two extreme boxes stay put; interior boxes are repositioned. Needs ≥3
 * boxes to be meaningful — fewer returns no patches. */
export function distributeBoxes(boxes: Box[], axis: Axis): PositionPatch[] {
  if (boxes.length < 3) return [];
  const horizontal = axis === 'horizontal';
  const sorted = [...boxes].sort((a, b) =>
    horizontal ? a.x - b.x : a.y - b.y,
  );
  const start = horizontal ? sorted[0].x : sorted[0].y;
  const last = sorted[sorted.length - 1];
  const end = horizontal ? last.x + last.w : last.y + last.h;
  const totalSize = sorted.reduce((sum, b) => sum + (horizontal ? b.w : b.h), 0);
  const gap = (end - start - totalSize) / (sorted.length - 1);

  const patches: PositionPatch[] = [];
  let cursor = start;
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (i > 0 && i < sorted.length - 1) {
      const value = Math.round(cursor * 100) / 100;
      if (horizontal) {
        if (value !== b.x) patches.push({ id: b.id, x: value });
      } else if (value !== b.y) {
        patches.push({ id: b.id, y: value });
      }
    }
    cursor += (horizontal ? b.w : b.h) + gap;
  }
  return patches;
}

/** Stack boxes in their current order along an axis with a fixed gap, anchored
 * at the first box's leading edge. Quick "tidy into a row/column". */
export function stackBoxes(boxes: Box[], axis: Axis, gap: number): PositionPatch[] {
  if (boxes.length < 2) return [];
  const horizontal = axis === 'horizontal';
  const sorted = [...boxes].sort((a, b) =>
    horizontal ? a.x - b.x : a.y - b.y,
  );
  const patches: PositionPatch[] = [];
  let cursor = horizontal ? sorted[0].x : sorted[0].y;
  for (const b of sorted) {
    const value = Math.round(cursor * 100) / 100;
    if (horizontal) {
      if (value !== b.x) patches.push({ id: b.id, x: value });
    } else if (value !== b.y) {
      patches.push({ id: b.id, y: value });
    }
    cursor += (horizontal ? b.w : b.h) + gap;
  }
  return patches;
}

/** Convert layers (skipping locked/hidden ones) to boxes for arrange math. */
export function arrangeableBoxes(layers: CalqoLayer[]): Box[] {
  return layers.filter((l) => !l.locked && l.visible).map(toBox);
}
