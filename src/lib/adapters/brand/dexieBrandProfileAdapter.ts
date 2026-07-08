import { db } from '@/lib/db/dexie';
import type { BrandProfileAdapter } from './BrandProfileAdapter';

export const dexieBrandProfileAdapter: BrandProfileAdapter = {
  async listProfiles() {
    return db.brandProfiles.orderBy('createdAt').toArray();
  },

  async getProfile(id) {
    return (await db.brandProfiles.get(id)) ?? null;
  },

  async saveProfile(record) {
    await db.brandProfiles.put(record);
  },

  async deleteProfile(id) {
    await db.brandProfiles.delete(id);
  },
};
