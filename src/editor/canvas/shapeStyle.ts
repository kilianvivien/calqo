import type Konva from 'konva';
import type { Fill, StrokeStyle } from '@/lib/schema';

/** Generated pattern tiles are cached by their visual signature so dragging a
 * patterned shape doesn't re-rasterise on every frame. */
const patternCache = new Map<string, HTMLCanvasElement>();

type PatternKind = Extract<Fill, { type: 'pattern' }>['pattern'];

/** Build (or reuse) a small canvas tile for a pattern fill. Returns null in
 * non-DOM environments (e.g. unit tests) so callers fall back to a flat fill. */
export function getPatternCanvas(
  pattern: PatternKind,
  color: string,
  background: string,
  scale: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const tile = Math.max(8, Math.round(18 * (scale || 1)));
  const key = `${pattern}|${color}|${background}|${tile}`;
  const cached = patternCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = tile;
  canvas.height = tile;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (background && background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, tile, tile);
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, tile * 0.09);

  switch (pattern) {
    case 'dots':
      ctx.beginPath();
      ctx.arc(tile / 2, tile / 2, tile * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'grid':
      ctx.strokeRect(0, 0, tile, tile);
      break;
    case 'checker':
      ctx.fillRect(0, 0, tile / 2, tile / 2);
      ctx.fillRect(tile / 2, tile / 2, tile / 2, tile / 2);
      break;
    case 'hatch':
      ctx.beginPath();
      ctx.moveTo(0, tile);
      ctx.lineTo(tile, 0);
      ctx.stroke();
      break;
    case 'cross-hatch':
      ctx.beginPath();
      ctx.moveTo(0, tile);
      ctx.lineTo(tile, 0);
      ctx.moveTo(0, 0);
      ctx.lineTo(tile, tile);
      ctx.stroke();
      break;
  }

  patternCache.set(key, canvas);
  return canvas;
}

/** Project a gradient direction (degrees) onto a box, returning the start/end
 * points that span the box edge-to-edge along that direction. */
function gradientEndpoints(angle: number, w: number, h: number, centered: boolean) {
  const a = ((angle % 360) * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const half = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
  const cx = centered ? 0 : w / 2;
  const cy = centered ? 0 : h / 2;
  return {
    start: { x: cx - dx * half, y: cy - dy * half },
    end: { x: cx + dx * half, y: cy + dy * half },
  };
}

function stopsToColorStops(stops: { offset: number; color: string }[]): (number | string)[] {
  return stops.flatMap((stop) => [stop.offset, stop.color]);
}

/** Translate a Calqo fill into the Konva node props that render it. `centered`
 * is true for shapes whose local origin is their centre (e.g. Ellipse). */
export function fillProps(fill: Fill, w: number, h: number, centered = false): Konva.ShapeConfig {
  if (fill.type === 'solid') return { fill: fill.color };

  if (fill.type === 'linear') {
    const { start, end } = gradientEndpoints(fill.angle ?? 0, w, h, centered);
    return {
      fillLinearGradientStartPoint: start,
      fillLinearGradientEndPoint: end,
      fillLinearGradientColorStops: stopsToColorStops(fill.stops),
    };
  }

  if (fill.type === 'radial') {
    const cx = centered ? 0 : w / 2;
    const cy = centered ? 0 : h / 2;
    return {
      fillRadialGradientStartPoint: { x: cx, y: cy },
      fillRadialGradientEndPoint: { x: cx, y: cy },
      fillRadialGradientStartRadius: 0,
      fillRadialGradientEndRadius: Math.max(w, h) / 2,
      fillRadialGradientColorStops: stopsToColorStops(fill.stops),
    };
  }

  if (fill.type === 'pattern') {
    const canvas = getPatternCanvas(fill.pattern, fill.color, fill.background, fill.scale);
    if (!canvas) return { fill: fill.background ?? '#FFFFFF' };
    return {
      fillPatternImage: canvas as unknown as HTMLImageElement,
      fillPatternRepeat: 'repeat',
      fillPatternRotation: fill.angle ?? 0,
      fillPriority: 'pattern',
    };
  }

  // Image fills are painted via {@link imageFillProps} once the asset image has
  // loaded; until then fall back to a flat fill so the shape stays visible.
  return { fill: '#FFFFFF' };
}

/** Konva pattern props that paint a loaded image as a shape fill, scaled to
 * cover / contain / stretch the shape's `w`×`h` box. `centered` is true for
 * centre-origin shapes (e.g. Ellipse) so the image lines up with the box. */
export function imageFillProps(
  image: HTMLImageElement,
  fit: 'cover' | 'contain' | 'stretch',
  w: number,
  h: number,
  centered = false,
): Konva.ShapeConfig {
  const iw = image.width || 1;
  const ih = image.height || 1;
  let scaleX: number;
  let scaleY: number;
  if (fit === 'stretch') {
    scaleX = w / iw;
    scaleY = h / ih;
  } else {
    const scale = fit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
    scaleX = scale;
    scaleY = scale;
  }
  const drawW = iw * scaleX;
  const drawH = ih * scaleY;
  const originX = centered ? -drawW / 2 : (w - drawW) / 2;
  const originY = centered ? -drawH / 2 : (h - drawH) / 2;
  return {
    fillPatternImage: image,
    fillPatternScaleX: scaleX,
    fillPatternScaleY: scaleY,
    fillPatternX: originX,
    fillPatternY: originY,
    fillPatternRepeat: 'no-repeat',
    fillPriority: 'pattern',
  };
}

/** Translate a Calqo stroke into Konva props, expanding named dash styles. */
export function strokeProps(stroke?: StrokeStyle): Konva.ShapeConfig {
  if (!stroke || stroke.width <= 0) return { strokeWidth: 0 };
  const width = stroke.width;
  let dash = stroke.dash;
  let lineCap = stroke.cap;
  if (!dash) {
    if (stroke.style === 'dashed') dash = [width * 3, width * 2];
    else if (stroke.style === 'dotted') {
      dash = [0.01, width * 2];
      lineCap = 'round';
    }
  }
  return {
    stroke: stroke.color,
    strokeWidth: width,
    ...(dash ? { dash } : {}),
    ...(lineCap ? { lineCap } : {}),
  };
}
