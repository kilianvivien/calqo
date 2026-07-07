import type { CalqoAssetRef } from '@/lib/schema';

export interface AssetMeta {
  name: string;
  mimeType: string;
  kind: 'raster' | 'svg';
  width?: number;
  height?: number;
}

/** Binary asset boundary (images, SVGs). Browser implementation stores blobs in
 * Dexie; Tauri will later use a project bundle on disk. */
export interface AssetStorageAdapter {
  saveAsset(
    projectId: string,
    blob: Blob,
    meta: AssetMeta,
  ): Promise<CalqoAssetRef>;
  getAssetBlob(assetId: string): Promise<Blob | null>;
  /** Read back an asset's stored metadata (name, mime, dimensions). */
  getAssetMeta(assetId: string): Promise<AssetMeta | null>;
  deleteAsset(assetId: string): Promise<void>;
  /** Re-create an asset under an existing ref id (used by `.calqo` import). */
  restoreAsset(
    projectId: string,
    asset: CalqoAssetRef,
    blob: Blob,
  ): Promise<void>;
}
