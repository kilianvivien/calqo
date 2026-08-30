import type { SettingsAdapter } from './SettingsAdapter';
import { splitAiSecrets, mergeAiSecrets } from './aiSecretPayload';
import { dexieSettingsAdapter } from './dexieSettingsAdapter';

type StoreModule = typeof import('@tauri-apps/plugin-store');
type StrongholdModule = typeof import('@tauri-apps/plugin-stronghold');

const STORE_FILE = 'calqo.settings.json';
const STRONGHOLD_FILE = 'calqo-secrets.stronghold';
// Read-only migration of pre-Keychain vaults; never used for new secrets.
const LEGACY_PASSWORD = 'calqo-local-secret-store-v1';
const CLIENT = 'calqo';
const SECRET_PREFIX = 'secure:';
const FALLBACK_SECRET_PREFIX = 'tauri-stronghold-fallback:';

let storePromise: Promise<Awaited<ReturnType<StoreModule['Store']['load']>>> | null =
  null;
let strongholdPromise: Promise<Awaited<ReturnType<StrongholdModule['Stronghold']['load']>>> | null =
  null;

const decoder = new TextDecoder();

async function settingsStore() {
  if (!storePromise) {
    storePromise = import('@tauri-apps/plugin-store').then(({ Store }) =>
      Store.load(STORE_FILE, { defaults: {}, autoSave: 100 }),
    );
  }
  return storePromise;
}

async function stronghold() {
  if (!strongholdPromise) {
    strongholdPromise = Promise.all([
      import('@tauri-apps/api/path'),
      import('@tauri-apps/plugin-stronghold'),
    ]).then(async ([{ appDataDir, join }, { Stronghold }]) =>
      Stronghold.load(
        await join(await appDataDir(), STRONGHOLD_FILE),
        LEGACY_PASSWORD,
      ),
    );
  }
  return strongholdPromise;
}

async function secretStore() {
  const hold = await stronghold();
  let client;
  try {
    client = await hold.loadClient(CLIENT);
  } catch {
    client = await hold.createClient(CLIENT);
  }
  return { hold, store: client.getStore() };
}

function isSecretKey(key: string): boolean {
  return key.startsWith(SECRET_PREFIX);
}

async function invokeSecret<T>(
  command: string,
  key: string,
  value?: string,
): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, { key, ...(value === undefined ? {} : { value }) });
}

async function removeLegacySecret(key: string): Promise<void> {
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const { exists } = await import('@tauri-apps/plugin-fs');
  if (await exists(await join(await appDataDir(), STRONGHOLD_FILE))) {
    const { hold, store } = await secretStore();
    await store.remove(key);
    await hold.save();
  }
  await dexieSettingsAdapter.remove(`${FALLBACK_SECRET_PREFIX}${key}`);
}

async function readSecret<T>(key: string): Promise<T | null> {
  const current = await invokeSecret<string | null>('read_secret', key);
  if (current !== null) return JSON.parse(current) as T;
  // Only consult weaker storage when Keychain is available, and erase it only
  // after the replacement was durably written. A locked keychain fails closed.
  let legacy: T | null = await dexieSettingsAdapter.get<T>(
    `${FALLBACK_SECRET_PREFIX}${key}`,
  );
  if (legacy === null) {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { exists } = await import('@tauri-apps/plugin-fs');
    if (await exists(await join(await appDataDir(), STRONGHOLD_FILE))) {
      const { store } = await secretStore();
      const bytes = await store.get(key);
      if (bytes) legacy = JSON.parse(decoder.decode(bytes)) as T;
  }
}
  if (legacy !== null) {
    await invokeSecret('write_secret', key, JSON.stringify(legacy));
    await removeLegacySecret(key);
  }
  return legacy;
}

const AI_KEYS = 'secure:ai.keys';

export const tauriSettingsAdapter: SettingsAdapter = {
  async get<T>(key: string): Promise<T | null> {
    if (isSecretKey(key)) return readSecret<T>(key);
    const store = await settingsStore();
    const value = (await store.get<unknown>(key)) ?? null;
    if (key !== 'ai.settings' || value === null) return value as T | null;
    const split = splitAiSecrets(value);
    const saved = await readSecret<Record<string, string>>(AI_KEYS);
    const keys = { ...split.keys, ...saved };
    if (Object.keys(split.keys).length) {
      await invokeSecret('write_secret', AI_KEYS, JSON.stringify(keys));
      await store.set(key, split.settings);
      await store.save();
      }
    return mergeAiSecrets(split.settings, keys) as T;
  },

  async set<T>(key: string, value: T): Promise<void> {
    if (isSecretKey(key)) {
      await invokeSecret('write_secret', key, JSON.stringify(value));
      await removeLegacySecret(key);
      return;
    }
    const store = await settingsStore();
    if (key === 'ai.settings') {
      const split = splitAiSecrets(value);
      // Persist keys first. If this fails the UI retains its in-memory config,
      // reports the error, and never writes a plaintext credential fallback.
      await invokeSecret('write_secret', AI_KEYS, JSON.stringify(split.keys));
      await store.set(key, split.settings);
    } else await store.set(key, value);
    await store.save();
  },

  async remove(key: string): Promise<void> {
    if (isSecretKey(key)) {
      await removeLegacySecret(key);
      await invokeSecret('remove_secret', key);
      return;
      }
    if (key === 'ai.settings') {
      await removeLegacySecret(AI_KEYS);
      await invokeSecret('remove_secret', AI_KEYS);
    }
    const store = await settingsStore();
    await store.delete(key);
    await store.save();
  },
};
