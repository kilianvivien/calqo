import type { ImageBackgroundRemovalPass } from '@/lib/schema';

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Lab {
  l: number;
  a: number;
  b: number;
}

export interface ProcessedBackgroundRemoval {
  blob: Blob;
  width: number;
  height: number;
}

const MAX_LAB_DISTANCE = 100;
const MAX_FEATHER_DISTANCE = 40;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseHexColor(hex: string): Rgb | null {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return {
    r: (n >> 16) & 0xff,
    g: (n >> 8) & 0xff,
    b: n & 0xff,
  };
}

function srgbToLinear(value: number): number {
  const n = value / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function pivotXyz(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const fx = pivotXyz(x);
  const fy = pivotXyz(y);
  const fz = pivotXyz(z);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function labDistance(a: Lab, b: Lab): number {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

function removalAmount(distance: number, tolerance: number, softness: number): number {
  const threshold = (tolerance / 100) * MAX_LAB_DISTANCE;
  const feather = (softness / 100) * MAX_FEATHER_DISTANCE;
  if (distance <= threshold) return 1;
  if (feather <= 0 || distance >= threshold + feather) return 0;
  return 1 - (distance - threshold) / feather;
}

function collectConnectedCandidates(
  candidates: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const connected = new Uint8Array(width * height);
  const queue: number[] = [];
  const enqueue = (index: number) => {
    if (candidates[index] === 0 || connected[index] === 1) return;
    connected[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }

  return connected;
}

export function removeBackgroundFromImageData(
  imageData: ImageData,
  passes: ImageBackgroundRemovalPass[],
): ImageData {
  const { width, height } = imageData;
  const next = new ImageData(
    new Uint8ClampedArray(imageData.data),
    width,
    height,
  );
  const pixels = next.data;

  for (const pass of passes) {
    const rgb = parseHexColor(pass.color);
    if (!rgb) continue;
    const target = rgbToLab(rgb);
    const count = width * height;
    const amounts = new Float32Array(count);
    const candidates = new Uint8Array(count);

    for (let i = 0; i < count; i += 1) {
      const offset = i * 4;
      if (pixels[offset + 3] === 0) continue;
      const distance = labDistance(
        rgbToLab({
          r: pixels[offset],
          g: pixels[offset + 1],
          b: pixels[offset + 2],
        }),
        target,
      );
      const amount = removalAmount(distance, pass.tolerance, pass.softness);
      amounts[i] = amount;
      if (amount > 0) candidates[i] = 1;
    }

    const allowed =
      pass.mode === 'connected'
        ? collectConnectedCandidates(candidates, width, height)
        : candidates;

    for (let i = 0; i < count; i += 1) {
      if (allowed[i] === 0) continue;
      const alphaOffset = i * 4 + 3;
      pixels[alphaOffset] = Math.round(
        pixels[alphaOffset] * (1 - clamp01(amounts[i])),
      );
    }
  }

  return next;
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image asset.'));
    };
    image.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode transparent PNG.'));
    }, 'image/png');
  });
}

export async function removeBackgroundFromBlob(
  blob: Blob,
  passes: ImageBackgroundRemovalPass[],
): Promise<ProcessedBackgroundRemoval> {
  const image = await blobToImage(blob);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable.');
  ctx.drawImage(image, 0, 0, width, height);
  const processed = removeBackgroundFromImageData(
    ctx.getImageData(0, 0, width, height),
    passes,
  );
  ctx.putImageData(processed, 0, 0);
  return {
    blob: await canvasToPngBlob(canvas),
    width,
    height,
  };
}
