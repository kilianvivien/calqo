import {
  assetStorage,
  brandProfiles,
  BRAND_ASSET_SCOPE,
  type BrandProfileRecord,
} from '@/lib/adapters';
import { createId } from '@/lib/utils/ids';

/** Brand Lite (Milestone D): local, named brand profiles that seed new projects
 * and prompt-a-template. App data only — profiles never enter project documents
 * or `.calqo` exports; logo blobs are copied into a project's own asset store on
 * insertion so exports stay self-contained. */

export async function listBrandProfiles(): Promise<BrandProfileRecord[]> {
  return brandProfiles.listProfiles();
}

export async function getBrandProfile(
  id: string,
): Promise<BrandProfileRecord | null> {
  return brandProfiles.getProfile(id);
}

export async function createBrandProfile(
  name: string,
): Promise<BrandProfileRecord> {
  const now = new Date().toISOString();
  const record: BrandProfileRecord = {
    id: createId('brand'),
    name: name.trim() || 'Brand',
    palette: [],
    glossary: [],
    createdAt: now,
    updatedAt: now,
  };
  await brandProfiles.saveProfile(record);
  return record;
}

export async function saveBrandProfile(
  record: BrandProfileRecord,
): Promise<void> {
  await brandProfiles.saveProfile({
    ...record,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteBrandProfile(id: string): Promise<void> {
  const record = await brandProfiles.getProfile(id);
  if (record?.logoAssetId) {
    await assetStorage.deleteAsset(record.logoAssetId).catch(() => undefined);
  }
  await brandProfiles.deleteProfile(id);
}

/** Store (or replace) a profile's logo blob in the app-brand asset scope. */
export async function setBrandLogo(
  record: BrandProfileRecord,
  blob: Blob,
  meta: { name: string; mimeType: string; width?: number; height?: number },
): Promise<BrandProfileRecord> {
  if (record.logoAssetId) {
    await assetStorage.deleteAsset(record.logoAssetId).catch(() => undefined);
  }
  const ref = await assetStorage.saveAsset(BRAND_ASSET_SCOPE, blob, {
    kind: meta.mimeType === 'image/svg+xml' ? 'svg' : 'raster',
    name: meta.name,
    mimeType: meta.mimeType,
    width: meta.width,
    height: meta.height,
  });
  const next = { ...record, logoAssetId: ref.id };
  await saveBrandProfile(next);
  return next;
}

export async function clearBrandLogo(
  record: BrandProfileRecord,
): Promise<BrandProfileRecord> {
  if (record.logoAssetId) {
    await assetStorage.deleteAsset(record.logoAssetId).catch(() => undefined);
  }
  const next = { ...record, logoAssetId: undefined };
  await saveBrandProfile(next);
  return next;
}
