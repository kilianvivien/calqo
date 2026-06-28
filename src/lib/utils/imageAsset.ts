import { assetStorage } from '@/lib/adapters';
import type { CalqoAssetRef } from '@/lib/schema';

/** Read a raster image blob's intrinsic pixel size. SVGs have no fixed raster
 * size, so they resolve to an empty measurement. */
export function measureImageFile(
  file: Blob,
): Promise<{ width?: number; height?: number }> {
  if (file.type === 'image/svg+xml') return Promise.resolve({});
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    image.src = url;
  });
}

/** Measure and persist an image file as a project asset. */
export async function saveImageAsset(
  projectId: string,
  file: File,
): Promise<CalqoAssetRef> {
  const kind = file.type === 'image/svg+xml' ? 'svg' : 'raster';
  const measured = await measureImageFile(file);
  return assetStorage.saveAsset(projectId, file, {
    kind,
    name: file.name,
    mimeType: file.type,
    width: measured.width,
    height: measured.height,
  });
}

/** Measure and persist an image blob from native pickers, clipboard, or file
 * drops where the browser File object is not available. */
export async function saveImageBlobAsset(
  projectId: string,
  blob: Blob,
  meta: { name: string; mimeType: string },
): Promise<CalqoAssetRef> {
  const kind = meta.mimeType === 'image/svg+xml' ? 'svg' : 'raster';
  const measured = await measureImageFile(blob);
  return assetStorage.saveAsset(projectId, blob, {
    kind,
    name: meta.name,
    mimeType: meta.mimeType,
    width: measured.width,
    height: measured.height,
  });
}
