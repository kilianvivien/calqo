import { db } from '@/lib/db/dexie';
import { createId } from '@/lib/utils/ids';
import type { CalqoAssetRef } from '@/lib/schema';
import type { AssetStorageAdapter } from './AssetStorageAdapter';

export const dexieAssetStorageAdapter: AssetStorageAdapter = {
  async saveAsset(projectId, blob, meta): Promise<CalqoAssetRef> {
    const id = createId('asset');
    const createdAt = new Date().toISOString();
    await db.assets.put({
      id,
      projectId,
      kind: meta.kind,
      mimeType: meta.mimeType,
      name: meta.name,
      blob,
      width: meta.width,
      height: meta.height,
      createdAt,
    });
    return {
      id,
      kind: meta.kind,
      name: meta.name,
      mimeType: meta.mimeType,
      width: meta.width,
      height: meta.height,
      // For the browser prototype the Dexie row id is the storage key.
      storageKey: id,
      createdAt,
    };
  },

  async getAssetBlob(assetId): Promise<Blob | null> {
    const record = await db.assets.get(assetId);
    return record?.blob ?? null;
  },

  async deleteAsset(assetId): Promise<void> {
    await db.assets.delete(assetId);
  },
};
