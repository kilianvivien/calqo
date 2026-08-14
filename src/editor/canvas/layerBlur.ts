import { Blur } from 'konva/lib/filters/Blur';
import type { Node } from 'konva/lib/Node';
import type { CalqoLayer } from '@/lib/schema';

/** Side-channel attribute carrying the cache padding a blurred node needs.
 * Konva has no slot for it, and it also marks *which* filtered nodes came from
 * layer blur — image adjustment filters cache unpadded, inside their frame. */
const BLUR_PAD_ATTR = 'calqoBlurPad';

/**
 * Padding (px) added around a blurred node's cache.
 *
 * A Konva filter runs over the node's cache canvas, which by default is sized to
 * the node itself. A shape whose fill covers its whole box therefore blurs to
 * the same solid box — the blur has nowhere to fall off, so the effect vanishes.
 * Padding gives it room on every side. Twice the radius covers the visible
 * extent of Konva's stack blur.
 */
export function blurCachePadding(blur: number): number {
  return Math.ceil(blur * 2);
}

/**
 * Stage a layer's `effects.blur` on its outermost node. Image layers are skipped
 * on purpose: their blur arrives through `filters.blur` and is baked by the
 * image adjustment pipeline instead.
 *
 * Shared by the live canvas and the raster export so both renderers blur
 * identically — an export that mirrors the canvas by hand is exactly where this
 * drifts. Caching is deferred to {@link cacheBlurredNode}: the canvas caches on
 * mount, the export once its whole tree is assembled.
 */
export function applyLayerBlurAttrs(node: Node, layer: CalqoLayer): boolean {
  const blur = layer.type === 'image' ? 0 : (layer.effects?.blur ?? 0);
  if (blur <= 0) {
    node.setAttr(BLUR_PAD_ATTR, undefined);
    return false;
  }
  node.setAttr('blurRadius', blur);
  node.setAttr(BLUR_PAD_ATTR, blurCachePadding(blur));
  node.filters([Blur]);
  return true;
}

/** Cache a node so its filters actually render, padding the cache when the node
 * carries a layer blur. Returns false when no canvas is available (jsdom). */
export function cacheBlurredNode(node: Node): boolean {
  const pad = node.getAttr(BLUR_PAD_ATTR) as number | undefined;
  try {
    node.cache(pad ? { offset: pad } : undefined);
    return true;
  } catch {
    return false;
  }
}
