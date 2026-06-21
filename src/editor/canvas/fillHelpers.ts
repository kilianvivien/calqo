import type { BackgroundFill, Fill } from '@/lib/schema';

/** Fill types a shape can take (the image case is wired through an asset picker
 * in the UI, so switching to it needs an asset id). */
export const FILL_TYPE_OPTIONS = ['solid', 'linear', 'radial', 'pattern', 'image'] as const;
export type FillType = (typeof FILL_TYPE_OPTIONS)[number];

/** Background fills are the shape fills minus the pattern case. */
export const BACKGROUND_FILL_TYPE_OPTIONS = ['solid', 'linear', 'radial', 'image'] as const;
export type BackgroundFillType = (typeof BACKGROUND_FILL_TYPE_OPTIONS)[number];

export type PatternKind = Extract<Fill, { type: 'pattern' }>['pattern'];

export const PATTERN_OPTIONS: { value: PatternKind; labelKey: string }[] = [
  { value: 'dots', labelKey: 'properties.patternDots' },
  { value: 'grid', labelKey: 'properties.patternGrid' },
  { value: 'hatch', labelKey: 'properties.patternHatch' },
  { value: 'cross-hatch', labelKey: 'properties.patternCrossHatch' },
  { value: 'checker', labelKey: 'properties.patternChecker' },
];

/** First solid-ish colour of a fill, for seeding type switches. */
export function fillBaseColor(fill: Fill | BackgroundFill): string {
  if (fill.type === 'solid') return fill.color;
  if (fill.type === 'linear' || fill.type === 'radial') return fill.stops[0]?.color ?? '#007AFF';
  if (fill.type === 'pattern') return fill.color;
  return '#007AFF';
}

/** Construct a sensible default fill when switching a shape's fill type. The
 * `image` case keeps the current fill unless an asset id is supplied, since an
 * image fill is meaningless without one. */
export function fillForType(type: FillType, current: Fill, assetId?: string): Fill {
  const base = fillBaseColor(current);
  if (type === 'solid') return { type: 'solid', color: base };
  if (type === 'linear') {
    return { type: 'linear', angle: 90, stops: [{ offset: 0, color: base }, { offset: 1, color: '#FFFFFF' }] };
  }
  if (type === 'radial') {
    return { type: 'radial', stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: base }] };
  }
  if (type === 'pattern') {
    return { type: 'pattern', pattern: 'dots', color: base, background: '#FFFFFF', scale: 1, angle: 0 };
  }
  if (assetId) return { type: 'image', assetId, fit: 'cover' };
  if (current.type === 'image') return current;
  return current;
}

/** Background variant of {@link fillForType} (no pattern case). */
export function backgroundFillForType(
  type: BackgroundFillType,
  current: BackgroundFill,
  assetId?: string,
): BackgroundFill {
  const base = fillBaseColor(current);
  if (type === 'solid') return { type: 'solid', color: base };
  if (type === 'linear') {
    return { type: 'linear', angle: 90, stops: [{ offset: 0, color: base }, { offset: 1, color: '#FFFFFF' }] };
  }
  if (type === 'radial') {
    return { type: 'radial', stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: base }] };
  }
  if (assetId) return { type: 'image', assetId, fit: 'cover' };
  if (current.type === 'image') return current;
  return current;
}
