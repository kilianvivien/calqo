import type { StarterRecord } from '@/lib/db/dexie';

export type { StarterRecord };

/** Persistence boundary for the user starter library (Milestone D). Browser
 * implementation is Dexie; a Tauri build would use app-data files. Editor/UI
 * code must depend on this interface, never on Dexie directly. */
export interface StarterLibraryAdapter {
  listStarters(): Promise<StarterRecord[]>;
  getStarter(id: string): Promise<StarterRecord | null>;
  saveStarter(record: StarterRecord): Promise<void>;
  renameStarter(id: string, name: string): Promise<void>;
  deleteStarter(id: string): Promise<void>;
}
