/** Geometry for the interactive image crop editor. The crop "view" describes
 * how the full image is laid out (in artboard coordinates) behind a fixed crop
 * frame; committing converts that back into an image-pixel crop rect for the
 * schema. All functions are pure so the math is unit-testable. */

export interface CropFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Image top-left position (artboard coords) and scale (artboard px / image px). */
export interface CropView {
  scale: number;
  x: number;
  y: number;
}

/** Crop rectangle in image pixels, matching the schema's `crop` shape. */
export interface CropPixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_CROP_ZOOM = 8;

/** Frame corner/edge handles, named by compass direction. */
export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Smallest the interactive crop frame may shrink to (artboard px). */
export const MIN_CROP_FRAME = 56;

/** Resize a crop frame by dragging one handle by (dx, dy). The opposite
 * edge(s) stay pinned, the frame never escapes `bounds`, and it never shrinks
 * below {@link MIN_CROP_FRAME}. Pure so the math is unit-testable. */
export function resizeCropFrame(
  frame: CropFrame,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: CropFrame,
): CropFrame {
  let { x, y, w, h } = frame;
  const right = x + w;
  const bottom = y + h;
  const boundsRight = bounds.x + bounds.w;
  const boundsBottom = bounds.y + bounds.h;

  if (handle.includes('w')) {
    const nx = Math.min(Math.max(bounds.x, x + dx), right - MIN_CROP_FRAME);
    x = nx;
    w = right - nx;
  }
  if (handle.includes('e')) {
    const nr = Math.max(Math.min(boundsRight, right + dx), x + MIN_CROP_FRAME);
    w = nr - x;
  }
  if (handle.includes('n')) {
    const ny = Math.min(Math.max(bounds.y, y + dy), bottom - MIN_CROP_FRAME);
    y = ny;
    h = bottom - ny;
  }
  if (handle.includes('s')) {
    const nb = Math.max(Math.min(boundsBottom, bottom + dy), y + MIN_CROP_FRAME);
    h = nb - y;
  }
  return { x, y, w, h };
}

/** Smallest scale at which the image still fully covers the crop frame. */
export function minCoverScale(iw: number, ih: number, frame: CropFrame): number {
  return Math.max(frame.w / iw, frame.h / ih);
}

/** Initial view when entering crop: honour an existing crop rect, otherwise
 * centre the image at cover scale. */
export function initCropView(
  iw: number,
  ih: number,
  frame: CropFrame,
  crop?: CropPixelRect,
): CropView {
  if (crop && crop.w > 0 && crop.h > 0) {
    const scale = frame.w / crop.w;
    return { scale, x: frame.x - crop.x * scale, y: frame.y - crop.y * scale };
  }
  const scale = minCoverScale(iw, ih, frame);
  return {
    scale,
    x: frame.x - (iw * scale - frame.w) / 2,
    y: frame.y - (ih * scale - frame.h) / 2,
  };
}

/** Clamp a view so the image always covers the frame (no gaps) and never
 * shrinks below cover scale. */
export function clampCropView(
  view: CropView,
  iw: number,
  ih: number,
  frame: CropFrame,
): CropView {
  const scale = Math.max(view.scale, minCoverScale(iw, ih, frame));
  const dw = iw * scale;
  const dh = ih * scale;
  const x = Math.min(frame.x, Math.max(frame.x + frame.w - dw, view.x));
  const y = Math.min(frame.y, Math.max(frame.y + frame.h - dh, view.y));
  return { scale, x, y };
}

/** Zoom about the frame centre, keeping the centred image point fixed. */
export function zoomCropView(
  view: CropView,
  frame: CropFrame,
  factor: number,
  iw: number,
  ih: number,
): CropView {
  const min = minCoverScale(iw, ih, frame);
  const scale = Math.max(min, Math.min(view.scale * factor, min * MAX_CROP_ZOOM));
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const imgX = (cx - view.x) / view.scale;
  const imgY = (cy - view.y) / view.scale;
  return clampCropView(
    { scale, x: cx - imgX * scale, y: cy - imgY * scale },
    iw,
    ih,
    frame,
  );
}

/** Convert a view into the image-pixel crop rect stored on the layer. */
export function viewToCropRect(
  view: CropView,
  frame: CropFrame,
  iw: number,
  ih: number,
): CropPixelRect {
  const x = Math.max(0, Math.min(iw, (frame.x - view.x) / view.scale));
  const y = Math.max(0, Math.min(ih, (frame.y - view.y) / view.scale));
  return {
    x,
    y,
    w: Math.min(frame.w / view.scale, iw - x),
    h: Math.min(frame.h / view.scale, ih - y),
  };
}
