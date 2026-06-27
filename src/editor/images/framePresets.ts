import type { ImageFrame } from '@/lib/schema';

/** All schema-backed frame kinds: classic borders (Phase R MVP) followed by the
 * creative frames (torn paper, tape, scalloped, …). */
export type FramePresetId = ImageFrame['kind'];

/** Ordered for the inspector / mobile preset rows: classics first, creatives
 * after. */
export const FRAME_PRESET_IDS: FramePresetId[] = [
  'inset',
  'centered',
  'outside',
  'rounded',
  'circle',
  'double-line',
  'polaroid',
  'soft-mat',
  'thick-poster-border',
  'shadowed-cutout',
  'tape-corners',
  'postage-stamp',
  'scalloped-edges',
  'torn-paper',
  'photo-booth-strip',
];

const SOFT_SHADOW: NonNullable<ImageFrame['shadow']> = {
  color: '#000000',
  blur: 18,
  offsetX: 0,
  offsetY: 8,
  opacity: 0.25,
};

/** Sensible default frame for a preset id. Width/padding are absolute px so the
 * frame reads the same regardless of image size; callers tune them after. */
export function framePreset(id: FramePresetId): ImageFrame {
  switch (id) {
    case 'inset':
      return { kind: 'inset', color: '#FFFFFF', width: 14 };
    case 'centered':
      return { kind: 'centered', color: '#FFFFFF', width: 14 };
    case 'outside':
      return { kind: 'outside', color: '#111827', width: 12, shadow: { ...SOFT_SHADOW } };
    case 'rounded':
      return { kind: 'rounded', color: '#FFFFFF', width: 14, radius: 28 };
    case 'circle':
      return { kind: 'circle', color: '#FFFFFF', width: 14 };
    case 'double-line':
      return { kind: 'double-line', color: '#111827', width: 10, padding: 6 };
    case 'polaroid':
      return {
        kind: 'polaroid',
        color: '#FFFFFF',
        width: 18,
        padding: 0,
        shadow: { ...SOFT_SHADOW },
      };
    case 'soft-mat':
      return { kind: 'soft-mat', color: '#F5F3EE', width: 28, padding: 6, shadow: { ...SOFT_SHADOW } };
    case 'thick-poster-border':
      return { kind: 'thick-poster-border', color: '#111827', width: 26 };
    case 'shadowed-cutout':
      return {
        kind: 'shadowed-cutout',
        color: '#FFFFFF',
        width: 8,
        shadow: { color: '#000000', blur: 24, offsetX: 0, offsetY: 14, opacity: 0.35 },
      };
    case 'tape-corners':
      return { kind: 'tape-corners', color: '#E8DFC8', width: 12 };
    case 'postage-stamp':
      return { kind: 'postage-stamp', color: '#FFFFFF', width: 18, shadow: { ...SOFT_SHADOW } };
    case 'scalloped-edges':
      return { kind: 'scalloped-edges', color: '#FFFFFF', width: 16, radius: 18, shadow: { ...SOFT_SHADOW } };
    case 'torn-paper':
      return { kind: 'torn-paper', color: '#FFFFFF', width: 14, shadow: { ...SOFT_SHADOW } };
    case 'photo-booth-strip':
      return { kind: 'photo-booth-strip', color: '#FFFFFF', width: 22, shadow: { ...SOFT_SHADOW } };
  }
}
