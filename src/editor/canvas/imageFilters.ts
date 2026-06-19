import { Blur } from 'konva/lib/filters/Blur';
import { Brighten } from 'konva/lib/filters/Brighten';
import { Contrast } from 'konva/lib/filters/Contrast';
import { HSL } from 'konva/lib/filters/HSL';
import type { Filter } from 'konva/lib/Node';
import type { ImageFilters } from '@/lib/schema';

/** Default (neutral) value for each filter channel. Brightness/contrast/
 * saturation are signed offsets around 0; blur is a radius in pixels. */
export const FILTER_DEFAULTS = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
} as const satisfies Required<ImageFilters>;

export const FILTER_RANGES = {
  brightness: { min: -1, max: 1, step: 0.02 },
  contrast: { min: -100, max: 100, step: 1 },
  saturation: { min: -1, max: 1, step: 0.02 },
  blur: { min: 0, max: 40, step: 1 },
} as const;

/** Whether any channel differs from its neutral default. */
export function hasActiveFilters(filters: ImageFilters | undefined): boolean {
  if (!filters) return false;
  return (
    (filters.brightness ?? 0) !== 0 ||
    (filters.contrast ?? 0) !== 0 ||
    (filters.saturation ?? 0) !== 0 ||
    (filters.blur ?? 0) > 0
  );
}

export interface ImageFilterPipeline {
  filters: Filter[];
  /** Konva node attributes the active filters read from. */
  attrs: {
    brightness: number;
    contrast: number;
    saturation: number;
    blurRadius: number;
  };
}

/** Translate Calqo image filters into the Konva filter list plus the node
 * attributes those filters read. Only non-neutral channels are included so a
 * filterless image is never needlessly cached. */
export function buildImageFilterPipeline(
  filters: ImageFilters | undefined,
): ImageFilterPipeline {
  const brightness = filters?.brightness ?? 0;
  const contrast = filters?.contrast ?? 0;
  const saturation = filters?.saturation ?? 0;
  const blurRadius = filters?.blur ?? 0;
  const list: Filter[] = [];
  if (brightness !== 0) list.push(Brighten);
  if (contrast !== 0) list.push(Contrast);
  if (saturation !== 0) list.push(HSL);
  if (blurRadius > 0) list.push(Blur);
  return { filters: list, attrs: { brightness, contrast, saturation, blurRadius } };
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The source rectangle for a `cover` fit: the largest centred-on-the-focal-
 * point region of the image that matches the layer's aspect ratio. `focal`
 * components are 0–1 (0.5 = centre). */
export function coverCropRect(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
  focal: { x: number; y: number } = { x: 0.5, y: 0.5 },
): CropRect {
  const imageRatio = imageWidth / imageHeight;
  const boxRatio = boxWidth / boxHeight;
  const cropByWidth = imageRatio > boxRatio;
  const cropWidth = cropByWidth ? imageHeight * boxRatio : imageWidth;
  const cropHeight = cropByWidth ? imageHeight : imageWidth / boxRatio;
  const fx = Math.min(1, Math.max(0, focal.x));
  const fy = Math.min(1, Math.max(0, focal.y));
  return {
    x: (imageWidth - cropWidth) * fx,
    y: (imageHeight - cropHeight) * fy,
    width: cropWidth,
    height: cropHeight,
  };
}
