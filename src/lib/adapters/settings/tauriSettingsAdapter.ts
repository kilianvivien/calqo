import {
  INSECURE_SECRET_FALLBACK_PREFIX,
  type SettingsAdapter,
} from './SettingsAdapter';
import { dexieSettingsAdapter } from './dexieSettingsAdapter';

type StoreModule = typeof import('@tauri-apps/plugin-store');
type StrongholdModule = typeof import('@tauri-apps/plugin-stronghold');

const STORE_FILE = 'calqo.settings.json';
const STRONGHOLD_FILE = 'calqo-secrets.stronghold';
const STRONGHOLD_PASSWORD = 'calqo-local-secret-store-v1';
const CLIENT = 'calqo';
const SECRET_PREFIX = 'secure:';
const FALLBACK_SECRET_PREFIX = 'tauri-stronghold-fallback:';

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
    strongholdPromise = Promise.all([
      import('@tauri-apps/api/path'),
      import('@tauri-apps/plugin-stronghold'),
    ]).then(async ([{ appDataDir, join }, { Stronghold }]) =>
      Stronghold.load(await join(await appDataDir(), STRONGHOLD_FILE), STRONGHOLD_PASSWORD),
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

function fallbackSecretKey(key: string): string {
  return `${FALLBACK_SECRET_PREFIX}${key}`;
}

function fallbackMarkerKey(key: string): string {
  return `${INSECURE_SECRET_FALLBACK_PREFIX}${key}`;
}

async function setFallbackMarker(key: string, enabled: boolean): Promise<void> {
  try {
    const store = await settingsStore();
    if (enabled) await store.set(fallbackMarkerKey(key), true);
    else await store.delete(fallbackMarkerKey(key));
    await store.save();
  } catch (error) {
    console.warn('[Calqo] failed to update insecure-key fallback marker', error);
  }
}

async function getFallbackSecret<T>(key: string): Promise<T | null> {
  const value = await dexieSettingsAdapter.get<T>(fallbackSecretKey(key));
  if (value !== null) await setFallbackMarker(key, true);
  return value;
}

export const tauriSettingsAdapter: SettingsAdapter = {
  async get<T>(key: string): Promise<T | null> {
    if (isSecretKey(key)) {
      try {
        const { store } = await secretStore();
        const bytes = await store.get(key);
        if (bytes) return JSON.parse(decoder.decode(bytes)) as T;
      } catch (error) {
        console.warn('[Calqo] Stronghold read failed; checking IndexedDB fallback', error);
      }
      return getFallbackSecret<T>(key);
    }
    const store = await settingsStore();
    return (await store.get<T>(key)) ?? null;
  },

  async set<T>(key: string, value: T): Promise<void> {
    if (isSecretKey(key)) {
      try {
        const { hold, store } = await secretStore();
        await store.insert(key, [...encoder.encode(JSON.stringify(value))]);
        await hold.save();
        await dexieSettingsAdapter.remove(fallbackSecretKey(key));
        await setFallbackMarker(key, false);
        return;
      } catch (error) {
        console.warn('[Calqo] Stronghold write failed; using IndexedDB fallback', error);
        await dexieSettingsAdapter.set(fallbackSecretKey(key), value);
        await setFallbackMarker(key, true);
      }
      return;
    }
    const store = await settingsStore();
    await store.set(key, value);
    await store.save();
  },

  async remove(key: string): Promise<void> {
    if (isSecretKey(key)) {
      try {
        const { hold, store } = await secretStore();
        await store.remove(key);
        await hold.save();
      } catch (error) {
        console.warn('[Calqo] Stronghold remove failed; clearing IndexedDB fallback', error);
      }
      await dexieSettingsAdapter.remove(fallbackSecretKey(key));
      await setFallbackMarker(key, false);
      return;
    }
    const store = await settingsStore();
    await store.delete(key);
    await store.save();
  },
};
