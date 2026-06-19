import type { ImageMask } from '@/lib/schema';

export const MASK_SHAPES: ImageMask['shape'][] = [
  'rounded',
  'circle',
  'ellipse',
  'triangle',
  'star',
  'hexagon',
];

/** Polygon mask outlines as a flat [x0,y0,x1,y1,…] list in the layer's local
 * box (0..w, 0..h). Returns null for the non-polygonal masks (rounded/ellipse/
 * circle), which the renderer draws with arcs instead. */
export function maskPolygonPoints(
  shape: ImageMask['shape'],
  w: number,
  h: number,
): number[] | null {
  if (shape === 'triangle') return [w / 2, 0, w, h, 0, h];
  if (shape === 'hexagon') {
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2;
    const ry = h / 2;
    return Array.from({ length: 6 }).flatMap((_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI) / 3;
      return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
    });
  }
  if (shape === 'star') {
    const cx = w / 2;
    const cy = h / 2;
    const outerX = w / 2;
    const outerY = h / 2;
    const innerRatio = 0.46;
    return Array.from({ length: 10 }).flatMap((_, i) => {
      const isOuter = i % 2 === 0;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const rx = isOuter ? outerX : outerX * innerRatio;
      const ry = isOuter ? outerY : outerY * innerRatio;
      return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
    });
  }
  return null;
}

/** Draw a mask outline onto a 2D context in the layer's local box. Used as a
 * Konva Group `clipFunc`. */
export function drawMaskPath(
  ctx: CanvasRenderingContext2D,
  mask: ImageMask,
  w: number,
  h: number,
): void {
  const points = maskPolygonPoints(mask.shape, w, h);
  if (points) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    return;
  }
  if (mask.shape === 'ellipse' || mask.shape === 'circle') {
    const rx = mask.shape === 'circle' ? Math.min(w, h) / 2 : w / 2;
    const ry = mask.shape === 'circle' ? Math.min(w, h) / 2 : h / 2;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  // rounded rectangle
  const radius = Math.min(mask.radius ?? Math.min(w, h) * 0.12, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(w, 0, w, h, radius);
  ctx.arcTo(w, h, 0, h, radius);
  ctx.arcTo(0, h, 0, 0, radius);
  ctx.arcTo(0, 0, w, 0, radius);
  ctx.closePath();
}
