/** Persistent key/value store for app-level settings that must survive reloads
 * but don't belong in a project document (e.g. AI provider config). Browser
 * implementation is Dexie; a Tauri build would back this with the OS keychain /
 * a config file for anything sensitive (plan §14.4). */
export interface SettingsAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
