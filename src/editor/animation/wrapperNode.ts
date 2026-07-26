import type Konva from 'konva';
import { Blur } from 'konva/lib/filters/Blur';
import type { WrapperOverride } from './types';

/**
 * The transient wrapper-node contract (docs/calqo-animation-extension-plan.md
 * §4.2). Each animated layer's Konva node is nested in a wrapper `Group` that
 * carries only animation values; the base node keeps document geometry
 * untouched, so selection/transform handlers always read document coordinates.
 *
 * The base node sits at absolute artboard coordinates inside the wrapper. To
 * scale/rotate around the layer center without shifting geometry, the wrapper
 * places its origin (`offset`) at the layer center and its position at the same
 * center plus the additive `dx/dy`. At identity this is a pure no-op transform,
 * so a non-animated (or Design-mode) wrapper renders exactly like no wrapper.
 */

/** The unrotated box of a layer in artboard coordinates. */
export interface LayerBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Plain Konva attrs realizing an override over a layer box — pure and
 * unit-testable without a Konva node. */
export interface WrapperAttrs {
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

/** Compose an override over a layer box into wrapper transform attrs. */
export function wrapperAttrs(
  override: WrapperOverride,
  box: LayerBox,
): WrapperAttrs {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {
    x: cx + override.dx,
    y: cy + override.dy,
    offsetX: cx,
    offsetY: cy,
    scaleX: override.scaleX,
    scaleY: override.scaleY,
    rotation: override.rotation,
    opacity: override.opacity,
  };
}

/** Clip rectangle (artboard coords) revealing `progress` of the box from the
 * given edge. Returns null when fully revealed (no clip needed). */
export function wipeClipRect(
  box: LayerBox,
  progress: number,
  direction: WrapperOverride['wipeDirection'],
): { x: number; y: number; width: number; height: number } | null {
  const p = Math.max(0, Math.min(1, progress));
  if (p >= 1) return null;
  switch (direction) {
    case 'right':
      return { x: box.x + box.w * (1 - p), y: box.y, width: box.w * p, height: box.h };
    case 'up':
      return { x: box.x, y: box.y, width: box.w, height: box.h * p };
    case 'down':
      return { x: box.x, y: box.y + box.h * (1 - p), width: box.w, height: box.h * p };
    case 'left':
    default:
      return { x: box.x, y: box.y, width: box.w * p, height: box.h };
  }
}

const IDENTITY_ATTRS: WrapperAttrs = {
  x: 0,
  y: 0,
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
};

/** True when a group is already at identity — lets the reset skip Konva work. */
function isAtIdentity(node: Konva.Group): boolean {
  return (
    node.x() === 0 &&
    node.y() === 0 &&
    node.offsetX() === 0 &&
    node.offsetY() === 0 &&
    node.scaleX() === 1 &&
    node.scaleY() === 1 &&
    node.rotation() === 0 &&
    node.opacity() === 1 &&
    node.clipFunc() === undefined &&
    (node.filters()?.length ?? 0) === 0
  );
}

/** Reset a wrapper group to the identity (document-geometry) transform. */
export function resetWrapper(node: Konva.Group): void {
  if (isAtIdentity(node)) return;
  node.setAttrs(IDENTITY_ATTRS);
  node.clipFunc(undefined);
  if ((node.filters()?.length ?? 0) > 0) {
    node.filters([]);
    node.clearCache();
  }
}

/** Apply a compiled override to a wrapper group over its layer box. Handles the
 * transform/opacity, the wipe clip, and a best-effort blur (Konva filter, cached
 * only while blurring). Never throws — a filter/cache failure leaves the visible
 * transform intact and only drops the blur. */
export function applyWrapperOverride(
  node: Konva.Group,
  override: WrapperOverride,
  box: LayerBox,
): void {
  node.setAttrs(wrapperAttrs(override, box));

  // Wipe reveal via a clip rectangle in the group's local (== artboard) coords.
  const clip = wipeClipRect(box, override.wipeProgress, override.wipeDirection);
  if (clip) {
    node.clipFunc((ctx) => {
      ctx.rect(clip.x, clip.y, clip.width, clip.height);
    });
  } else if (node.clipFunc()) {
    node.clipFunc(undefined);
  }

  // Blur reveal — filters need an offscreen cache. Kept best-effort so a large
  // cache failure never breaks playback; re-cached each active frame.
  const hadBlur = (node.filters()?.length ?? 0) > 0;
  try {
    if (override.blur > 0) {
      node.filters([Blur]);
      node.setAttr('blurRadius', override.blur);
      node.cache();
    } else if (hadBlur) {
      node.filters([]);
      node.clearCache();
    }
  } catch {
    if (hadBlur) {
      try {
        node.filters([]);
        node.clearCache();
      } catch {
        /* ignore */
      }
    }
  }
}
