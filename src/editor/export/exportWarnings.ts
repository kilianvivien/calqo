/** Shared export-fidelity warning strings, reused by the SVG serializer and the
 * inspector's export-warnings surface so the copy never drifts. */
export const EXPORT_WARNINGS = {
  gradientFill: 'Gradient and image fills are exported as a flat colour.',
  shadowBlur: 'Shadows and blur are not included in SVG export.',
  imageMask: 'Image masks are not applied in SVG export.',
  imageFilters:
    'Image filters (brightness, contrast, saturation, blur) are not applied in SVG export.',
  strokeLook: 'Expressive stroke looks (neon, glow, double, outline, marker) are approximated in SVG export.',
  stickerOutline: 'Sticker outlines are approximated in SVG export and best preserved in raster (PNG) export.',
  imageFrame: 'Image frame captions and shadows may differ in SVG export; raster (PNG) export is most faithful.',
} as const;

/** Editable HTML export fidelity tiers (plan: five-key-features §5). Faithful
 * layers emit no warning; approximated and rasterized layers always do, so
 * fidelity loss is never silent. */
export const HTML_EXPORT_WARNINGS = {
  blur: 'Layer blur is approximated with a CSS filter in editable HTML export.',
  shadow:
    'Drop shadows are approximated with CSS filters in editable HTML export.',
  fontFallback:
    'Fonts are referenced by family name; viewers without the font installed fall back to a system font.',
  /** A layer that fell back to an embedded PNG, with the reason. */
  rasterized: (layerName: string, reason: string): string =>
    `Layer "${layerName}" was embedded as an image (${reason}); the rest of the document stays editable.`,
} as const;

/** Reasons for the rasterized fallback, kept as stable keys for grouping. */
export const HTML_RASTER_REASONS = {
  mask: 'unsupported mask shape',
  crop: 'manual crop',
  frame: 'decorative frame',
  filters: 'image filters',
  sticker: 'sticker outline',
  freehand: 'freehand brush stroke',
  patternFill: 'pattern fill',
  imageFill: 'image fill',
  markerAsset: 'icon list marker',
  group: 'a nested layer needs rasterizing',
} as const;
