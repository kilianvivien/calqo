import { db } from '@/lib/db/dexie';
import type { SettingsAdapter } from './SettingsAdapter';

export const dexieSettingsAdapter: SettingsAdapter = {
  async get<T>(key: string): Promise<T | null> {
    const record = await db.settings.get(key);
    return record ? (record.value as T) : null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    await db.settings.put({ key, value });
  },

  async remove(key: string): Promise<void> {
    await db.settings.delete(key);
  },
};
