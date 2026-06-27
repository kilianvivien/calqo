import type { ImageFrame } from '@/lib/schema';

/** Classic frame kinds shipped in the Phase R MVP. Creative frames (torn paper,
 * tape, scalloped, …) are a deferred follow-up. */
export type FramePresetId = ImageFrame['kind'];

/** Ordered for the inspector / mobile preset rows. */
export const FRAME_PRESET_IDS: FramePresetId[] = [
  'inset',
  'centered',
  'outside',
  'rounded',
  'circle',
  'double-line',
  'polaroid',
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
  }
}
