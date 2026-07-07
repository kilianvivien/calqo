import { db } from '@/lib/db/dexie';
import type { StarterLibraryAdapter } from './StarterLibraryAdapter';

export const dexieStarterLibraryAdapter: StarterLibraryAdapter = {
  async listStarters() {
    return db.starters.orderBy('updatedAt').reverse().toArray();
  },

  async getStarter(id) {
    return (await db.starters.get(id)) ?? null;
  },

  async saveStarter(record) {
    await db.starters.put(record);
  },

  async renameStarter(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await db.starters
      .where('id')
      .equals(id)
      .modify({ name: trimmed, updatedAt: new Date().toISOString() });
  },

  async deleteStarter(id) {
    await db.starters.delete(id);
  },
};
