import { assetStorage } from '@/lib/adapters';
import type { CalqoAssetRef } from '@/lib/schema';

/** Read a raster image file's intrinsic pixel size. SVGs have no fixed raster
 * size, so they resolve to an empty measurement. */
export function measureImageFile(
  file: File,
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
