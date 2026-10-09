import { imageFromDataUrl, type CompletionImage } from './completion';

/** Longest edge sent to a model. Enough to read a layout; small enough to keep
 * the request light. */
export const REFERENCE_IMAGE_MAX_EDGE = 1024;

/** Downscale an uploaded sample to a compact JPEG a vision model can read.
 * Resolves to null in non-DOM environments or when the file cannot be decoded,
 * so callers fall back to the palette-only style reference. */
export async function prepareReferenceImage(
  file: Blob,
  maxEdge = REFERENCE_IMAGE_MAX_EDGE,
): Promise<CompletionImage | null> {
  if (
    typeof document === 'undefined' ||
    typeof createImageBitmap === 'undefined'
  ) {
    return null;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Flatten transparency onto white so JPEG encoding does not turn it black.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return imageFromDataUrl(canvas.toDataURL('image/jpeg', 0.85));
  } catch {
    return null;
  }
}
