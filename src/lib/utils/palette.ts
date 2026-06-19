/** Sample a small set of representative colours from an image file by drawing it
 * onto a tiny canvas and bucketing pixels. Used to seed a project palette / AI
 * style reference from an uploaded sample image. Resolves to an empty array in
 * non-DOM environments or on decode failure. */
export async function extractPalette(file: Blob, max = 5): Promise<string[]> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return [];
  }
  try {
    const bitmap = await createImageBitmap(file);
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];
    ctx.drawImage(bitmap, 0, 0, size, size);
    bitmap.close?.();
    const { data } = ctx.getImageData(0, 0, size, size);
    return quantize(data, max);
  } catch {
    return [];
  }
}

/** Coarse colour quantisation: bucket pixels into a 4-bit-per-channel grid,
 * count occurrences, and return the most common buckets as hex. Skips near-
 * transparent and near-white pixels so backgrounds don't dominate. */
function quantize(data: Uint8ClampedArray, max: number): string[] {
  const counts = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 244 && g > 244 && b > 244) continue;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = counts.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      counts.set(key, { count: 1, r, g, b });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map((bucket) => toHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count));
}

function toHex(r: number, g: number, b: number): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}
