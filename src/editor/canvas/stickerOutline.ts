import type Konva from 'konva';
import type { StickerOutline } from '@/lib/schema';

/** Konva props for the "behind" duplicate that paints a sticker halo. The halo
 * is the layer's own silhouette, fattened by `sticker.width` and filled/stroked
 * with the sticker colour, drawn behind the primary node. `ownStrokeWidth` is
 * the primary's stroke width (so the halo clears it). */
export function stickerStrokeConfig(
  sticker: StickerOutline,
  ownStrokeWidth = 0,
): Konva.ShapeConfig {
  const config: Konva.ShapeConfig = {
    stroke: sticker.color,
    strokeWidth: ownStrokeWidth + sticker.width * 2,
    lineCap: 'round',
    lineJoin: 'round',
    fillAfterStrokeEnabled: true,
  };
  if (sticker.shadow) {
    config.shadowColor = sticker.shadow.color;
    config.shadowBlur = sticker.shadow.blur;
    config.shadowOffsetX = sticker.shadow.offsetX;
    config.shadowOffsetY = sticker.shadow.offsetY;
    config.shadowOpacity = sticker.shadow.opacity ?? 1;
  }
  return config;
}
