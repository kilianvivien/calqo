import type { StrokeLook, StrokeStyle } from '@/lib/schema';

/** Re-exported for callers that want the schema-backed look id type. */
export type StrokeLookId = StrokeLook;

/** Ordered for the inspector / mobile preset rows. */
export const STROKE_LOOK_IDS: StrokeLookId[] = [
  'plain',
  'dashed',
  'dotted',
  'double',
  'offset',
  'outline',
  'marker',
  'neon',
  'glow',
];

/** Seed a stroke with a named look, keeping the caller's colour/width. The
 * renderer (`strokeLookConfig`) expands `look` into the actual passes; this
 * helper only sets sensible companion fields (style, accent colour, intensity)
 * so applying a preset gives an immediately visible result. */
export function strokeLookStyle(id: StrokeLookId, base: StrokeStyle): StrokeStyle {
  // Start from the base but clear look-specific fields so switching presets is
  // clean (a previous accent/intensity/dash never leaks into the new look).
  const next: StrokeStyle = {
    color: base.color,
    width: base.width > 0 ? base.width : 4,
    look: id,
  };
  if (base.cap) next.cap = base.cap;
  if (base.join) next.join = base.join;

  switch (id) {
    case 'plain':
      delete next.look; // plain == no special look; keep schema lean
      break;
    case 'dashed':
      next.style = 'dashed';
      break;
    case 'dotted':
      next.style = 'dotted';
      next.cap = 'round';
      break;
    case 'double':
      next.altColor = base.altColor ?? '#FFFFFF';
      break;
    case 'offset':
      next.altColor = base.altColor ?? '#111827';
      break;
    case 'outline':
      next.altColor = base.altColor ?? '#FFFFFF';
      break;
    case 'marker':
      next.cap = 'round';
      next.join = 'round';
      break;
    case 'neon':
      next.altColor = base.altColor ?? base.color;
      next.intensity = base.intensity ?? 0.8;
      next.cap = 'round';
      break;
    case 'glow':
      next.altColor = base.altColor ?? base.color;
      next.intensity = base.intensity ?? 0.6;
      break;
  }
  return next;
}
