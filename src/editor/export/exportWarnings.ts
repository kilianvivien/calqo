/** SVG fidelity notes retained for the SVG serializer. */
export const EXPORT_WARNINGS = {
  gradientFill: 'Gradient and image fills are exported as a flat colour.',
  shadowBlur: 'Shadows and blur are not included in SVG export.',
  imageMask: 'Image masks are not applied in SVG export.',
  imageFilters: 'Image filters are not applied in SVG export.',
  strokeLook: 'Expressive stroke looks are approximated in SVG export.',
  stickerOutline: 'Sticker outlines are approximated in SVG export.',
  imageFrame: 'Image frame captions and shadows may differ in SVG export.',
} as const;

export type HtmlFidelityTier = 'caveat' | 'approximated' | 'rasterized' | 'error';
export type HtmlWarningCode =
  | 'fontFallback'
  | 'blur'
  | 'shadow'
  | 'vectorApproximation'
  | 'rasterized'
  | 'missingAsset'
  | 'renderFailed';

export type HtmlRasterReason = keyof typeof HTML_RASTER_REASONS;

export interface HtmlExportWarning {
  tier: HtmlFidelityTier;
  code: HtmlWarningCode;
  layerName?: string;
  reason?: HtmlRasterReason;
}

/** Stable reason identifiers; user-facing text lives in the locale bundles. */
export const HTML_RASTER_REASONS = {
  mask: true,
  crop: true,
  frame: true,
  filters: true,
  backgroundRemoval: true,
  sticker: true,
  freehand: true,
  patternFill: true,
  imageFill: true,
  markerAsset: true,
  group: true,
} as const;

export function warningIdentity(warning: HtmlExportWarning): string {
  return [warning.tier, warning.code, warning.reason ?? '', warning.layerName ?? ''].join(':');
}
