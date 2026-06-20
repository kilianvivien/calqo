import type { SettingsAdapter } from './SettingsAdapter';

type StoreModule = typeof import('@tauri-apps/plugin-store');
type StrongholdModule = typeof import('@tauri-apps/plugin-stronghold');

const STORE_FILE = 'calqo.settings.json';
const STRONGHOLD_FILE = 'calqo-secrets.stronghold';
const STRONGHOLD_PASSWORD = 'calqo-local-secret-store-v1';
const CLIENT = 'calqo';
const SECRET_PREFIX = 'secure:';

let storePromise: Promise<Awaited<ReturnType<StoreModule['Store']['load']>>> | null =
  null;
let strongholdPromise: Promise<Awaited<ReturnType<StrongholdModule['Stronghold']['load']>>> | null =
  null;

const encoder = new TextEncoder();
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
    strongholdPromise = import('@tauri-apps/plugin-stronghold').then(({ Stronghold }) =>
      Stronghold.load(STRONGHOLD_FILE, STRONGHOLD_PASSWORD),
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

export const tauriSettingsAdapter: SettingsAdapter = {
  async get<T>(key: string): Promise<T | null> {
    if (isSecretKey(key)) {
      const { store } = await secretStore();
      const bytes = await store.get(key);
      if (!bytes) return null;
      return JSON.parse(decoder.decode(bytes)) as T;
    }
    const store = await settingsStore();
    return (await store.get<T>(key)) ?? null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    if (isSecretKey(key)) {
      const { hold, store } = await secretStore();
      await store.insert(key, [...encoder.encode(JSON.stringify(value))]);
      await hold.save();
      return;
    }
    const store = await settingsStore();
    await store.set(key, value);
    await store.save();
  },

  async remove(key: string): Promise<void> {
    if (isSecretKey(key)) {
      const { hold, store } = await secretStore();
      await store.remove(key);
      await hold.save();
      return;
    }
    const store = await settingsStore();
    await store.delete(key);
    await store.save();
  },
};
