import { sanitizeSvg } from '@/lib/utils/svg';
import { DOCUMENT_LIMITS } from '@/lib/schema/budgets';
import { db } from '@/lib/db/dexie';
import { createId } from '@/lib/utils/ids';
import type { CalqoAssetRef } from '@/lib/schema';
import type { AssetStorageAdapter } from './AssetStorageAdapter';

async function safeBlob(blob: Blob, kind: string): Promise<Blob> {
  if (blob.size > DOCUMENT_LIMITS.assetBytes)
    throw new Error('Asset exceeds the 32 MB limit.');
  if (kind !== 'svg') return blob;
  const svg = sanitizeSvg(await blob.text());
  if (!svg) throw new Error('SVG could not be safely imported.');
  return new Blob([svg], { type: 'image/svg+xml' });
}

export const dexieAssetStorageAdapter: AssetStorageAdapter = {
  async saveAsset(projectId, blob, meta): Promise<CalqoAssetRef> {
    blob = await safeBlob(blob, meta.kind);
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
    if (!record) return null;
    if (record.kind !== 'svg') return record.blob;
    try {
      return await safeBlob(record.blob, record.kind);
    } catch {
      return null;
    }
  },

  async getAssetMeta(assetId) {
    const record = await db.assets.get(assetId);
    if (!record) return null;
    return {
      name: record.name,
      mimeType: record.mimeType,
      kind: record.kind,
      width: record.width,
      height: record.height,
    };
  },

  async deleteAsset(assetId): Promise<void> {
    await db.assets.delete(assetId);
  },

  async restoreAsset(projectId, asset, blob): Promise<void> {
    blob = await safeBlob(blob, asset.kind);
    await db.assets.put({
      id: asset.id,
      projectId,
      kind: asset.kind,
      mimeType: asset.mimeType,
      name: asset.name,
      blob,
      width: asset.width,
      height: asset.height,
      createdAt: asset.createdAt,
    });
  },
};
