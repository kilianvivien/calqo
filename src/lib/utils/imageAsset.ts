import { assetStorage } from '@/lib/adapters';
import {
  DEFAULT_ASSET_HEALTH_THRESHOLDS,
  useUiStore,
  type AssetHealthThresholds,
} from '@/lib/state/uiStore';
import type { CalqoAssetRef } from '@/lib/schema';

/** Decoded RGBA size of a raster in memory. */
export function decodedBytes(width: number, height: number): number {
  return width * height * 4;
}

/** Whether a freshly imported raster should raise the oversized-import notice. */
export function isOversizedImport(
  width: number | undefined,
  height: number | undefined,
  thresholds: AssetHealthThresholds = DEFAULT_ASSET_HEALTH_THRESHOLDS,
): boolean {
  if (!width || !height) return false;
  return (
    Math.max(width, height) > thresholds.maxAssetEdge ||
    decodedBytes(width, height) > thresholds.maxAssetDecodedBytes
  );
}

/** Raise the non-blocking oversized-import notice when a raster exceeds the
 * app's soft limits (long edge or decoded RGBA size). Import always succeeds —
 * the notice just points at the optimize-assets flow. */
function noticeIfOversized(
  name: string,
  kind: 'raster' | 'svg',
  width?: number,
  height?: number,
): void {
  if (kind !== 'raster') return;
  const { assetHealthThresholds, setAssetHealthNotice } = useUiStore.getState();
  if (isOversizedImport(width, height, assetHealthThresholds)) {
    setAssetHealthNotice({ name, width: width ?? 0, height: height ?? 0 });
  }
}

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
  noticeIfOversized(file.name, kind, measured.width, measured.height);
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
  noticeIfOversized(meta.name, kind, measured.width, measured.height);
  return assetStorage.saveAsset(projectId, blob, {
    kind,
    name: meta.name,
    mimeType: meta.mimeType,
    width: measured.width,
    height: measured.height,
  });
}
