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
