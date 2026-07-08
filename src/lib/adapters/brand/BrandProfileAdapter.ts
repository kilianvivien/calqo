import type { BrandProfileRecord } from '@/lib/db/dexie';

export type { BrandProfileRecord };

/** Scope id used to store brand-profile logo blobs in the shared asset store.
 * Never collides with real project ids (`proj-*`), so project deletion can
 * never strand or delete brand logos. */
export const BRAND_ASSET_SCOPE = 'app-brand-library';

/** Persistence boundary for local brand profiles (Brand Lite, Milestone D).
 * Profiles are app data — they never ride along in project documents or
 * `.calqo` exports. */
export interface BrandProfileAdapter {
  listProfiles(): Promise<BrandProfileRecord[]>;
  getProfile(id: string): Promise<BrandProfileRecord | null>;
  saveProfile(record: BrandProfileRecord): Promise<void>;
  deleteProfile(id: string): Promise<void>;
}
