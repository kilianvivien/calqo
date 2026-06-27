import type Konva from 'konva';
import type { StrokeStyle } from '@/lib/schema';
import { strokeProps } from './shapeStyle';

/** Expand a stroke's named `look` into Konva node props. Every Phase R MVP look
 * is expressible on a single node via dash / cap / join / stroke-shadow tricks,
 * so this never restructures the scene graph — undecorated strokes are returned
 * unchanged by {@link strokeProps}. Looks that a renderer can only approximate
 * (e.g. SVG) are flagged by {@link strokeLookNeedsRasterWarning}. */
export function strokeLookConfig(stroke?: StrokeStyle): Konva.ShapeConfig {
  const base = strokeProps(stroke);
  if (!stroke || stroke.width <= 0) return base;

  const width = stroke.width;
  const accent = stroke.altColor ?? stroke.color;
  const intensity = stroke.intensity ?? 0.7;
  const config: Konva.ShapeConfig = { ...base };

  if (stroke.join) config.lineJoin = stroke.join;

  // Custom dash tuning overrides the named style's computed dash.
  if (stroke.dashLen != null || stroke.gap != null) {
    const on = stroke.dashLen ?? width * 3;
    const off = stroke.gap ?? width * 2;
    config.dash = [on, off];
  }

  switch (stroke.look) {
    case 'marker':
      config.lineCap = 'round';
      config.lineJoin = 'round';
      break;
    case 'neon':
      // Tight, bright halo that follows the stroke.
      config.shadowColor = accent;
      config.shadowBlur = Math.max(4, width * (1 + intensity * 2));
      config.shadowOpacity = 1;
      config.shadowOffsetX = 0;
      config.shadowOffsetY = 0;
      config.shadowForStrokeEnabled = true;
      config.lineCap = config.lineCap ?? 'round';
      break;
    case 'glow':
      // Softer, wider glow.
      config.shadowColor = accent;
      config.shadowBlur = Math.max(8, width * (3 + intensity * 4));
      config.shadowOpacity = Math.min(1, 0.4 + intensity * 0.5);
      config.shadowOffsetX = 0;
      config.shadowOffsetY = 0;
      config.shadowForStrokeEnabled = true;
      break;
    case 'offset':
      // Hard, un-blurred duplicate of the stroke, offset like a sticker shadow.
      config.shadowColor = accent;
      config.shadowBlur = 0;
      config.shadowOpacity = 1;
      config.shadowOffsetX = Math.max(2, width);
      config.shadowOffsetY = Math.max(2, width);
      config.shadowForStrokeEnabled = true;
      break;
    case 'double':
      // Approximate a double line: a contrasting hairline shadow hugging the
      // stroke on one side reads as a parallel second line.
      config.shadowColor = accent;
      config.shadowBlur = 0;
      config.shadowOpacity = 1;
      config.shadowOffsetX = Math.max(1.5, width * 0.6);
      config.shadowOffsetY = Math.max(1.5, width * 0.6);
      config.shadowForStrokeEnabled = true;
      break;
    case 'outline':
      // Even halo around the stroke (best-effort via a soft shadow ring).
      config.shadowColor = accent;
      config.shadowBlur = Math.max(2, width * 0.8);
      config.shadowOpacity = 1;
      config.shadowOffsetX = 0;
      config.shadowOffsetY = 0;
      config.shadowForStrokeEnabled = true;
      break;
    // Roughened looks — single-node approximations of textured pen/pencil marks.
    case 'hand-drawn':
      // Round, organic line doubled by a faint offset shadow (inked twice).
      config.lineCap = 'round';
      config.lineJoin = 'round';
      config.shadowColor = accent;
      config.shadowBlur = 0;
      config.shadowOpacity = 0.35;
      config.shadowOffsetX = Math.max(1, width * 0.35);
      config.shadowOffsetY = Math.max(1, width * 0.35);
      config.shadowForStrokeEnabled = true;
      break;
    case 'rough':
      // Irregular broken line reading as a coarse, dragged stroke.
      if (!config.dash) config.dash = [width * 4, width * 1.1, width * 1.8, width * 0.9];
      config.lineCap = 'round';
      config.lineJoin = 'round';
      break;
    case 'scribble':
      // Dense short dashes reading as a scribbled fill line.
      if (!config.dash) config.dash = [width * 1.2, width * 0.9];
      config.lineCap = 'round';
      config.lineJoin = 'round';
      break;
    case 'sketch':
      // Light pencil line with a faint parallel ghost (double-pass feel).
      if (!config.dash) config.dash = [width * 2.5, width * 1.2];
      config.lineCap = 'round';
      config.shadowColor = accent;
      config.shadowBlur = Math.max(1, width * 0.4);
      config.shadowOpacity = 0.4;
      config.shadowOffsetX = Math.max(1, width * 0.5);
      config.shadowOffsetY = Math.max(1, width * 0.5);
      config.shadowForStrokeEnabled = true;
      break;
    case 'inner':
      // Tight inset ring: an un-blurred accent shadow hugging the stroke reads
      // as a second line drawn just inside the first.
      config.shadowColor = accent;
      config.shadowBlur = 0;
      config.shadowOpacity = 1;
      config.shadowOffsetX = -Math.max(1, width * 0.5);
      config.shadowOffsetY = -Math.max(1, width * 0.5);
      config.shadowForStrokeEnabled = true;
      break;
    default:
      break;
  }
  return config;
}

/** Stroke looks that raster (Konva) renders faithfully but plain SVG export can
 * only approximate — used to surface export-fidelity warnings. */
export function strokeLookNeedsRasterWarning(stroke?: StrokeStyle): boolean {
  const look = stroke?.look;
  if (!look) return false;
  const rasterOnly: StrokeStyle['look'][] = [
    'neon',
    'glow',
    'outline',
    'double',
    'marker',
    'hand-drawn',
    'rough',
    'scribble',
    'sketch',
    'inner',
  ];
  return rasterOnly.includes(look);
}
