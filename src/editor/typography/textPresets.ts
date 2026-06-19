import type { TextStyle } from '@/lib/schema';

/** Social-post type roles. Each maps to a starting type style the inspector
 * applies to the selected text layer (plan Phase I). */
export type TextPresetId =
  | 'headline'
  | 'subhead'
  | 'kicker'
  | 'body'
  | 'caption'
  | 'badge'
  | 'cta';

/** Ordered for the inspector's preset row. */
export const TEXT_PRESET_IDS: TextPresetId[] = [
  'headline',
  'subhead',
  'kicker',
  'body',
  'caption',
  'badge',
  'cta',
];

/** The style fields a preset sets. Geometry (x/y/w/h) is left to the caller so
 * presets can retune an existing layer without moving it. */
const PRESETS: Record<TextPresetId, Partial<TextStyle>> = {
  headline: {
    fontFamily: 'Inter',
    fontSize: 72,
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: -1,
    align: 'left',
  },
  subhead: {
    fontFamily: 'Inter',
    fontSize: 40,
    fontWeight: 600,
    lineHeight: 1.15,
    letterSpacing: 0,
    align: 'left',
  },
  kicker: {
    fontFamily: 'Inter',
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: 3,
    align: 'left',
  },
  body: {
    fontFamily: 'Inter',
    fontSize: 28,
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: 0,
    align: 'left',
  },
  caption: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.3,
    letterSpacing: 0.2,
    align: 'left',
  },
  badge: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: 2,
    align: 'center',
  },
  cta: {
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: 0.5,
    align: 'center',
  },
};

/** The style patch for a preset, merged onto the layer's current style. */
export function textPresetStyle(id: TextPresetId): Partial<TextStyle> {
  return { ...PRESETS[id] };
}
