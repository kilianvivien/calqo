import { create } from 'zustand';
import { appSettings } from '@/lib/adapters';
import { INSECURE_SECRET_FALLBACK_PREFIX } from '@/lib/adapters/settings/SettingsAdapter';
import { platformRuntime } from '@/lib/platform/runtime';

const SETTINGS_KEY = 'ai.settings';
const SECRET_KEY_PREFIX = 'secure:ai.apiKey.';

/** Selectable AI providers (plan §14.2). `off` disables AI entirely; Gemini uses
 * its provider-specific GenAI adapter; the others speak OpenAI-compatible chat
 * completions by varying base URL / model / key. */
export type AiProviderId =
  | 'off'
  | 'local'
  | 'gemini'
  | 'mistral'
  | 'openrouter'
  | 'custom';

export interface ProviderPreset {
  id: AiProviderId;
  label: string;
  /** Fixed base URL for hosted providers; a sensible default for local/custom. */
  baseUrl: string;
  defaultModel: string;
  needsKey: boolean;
  editableBaseUrl: boolean;
  /** Whether the provider makes network calls (`off` does not). */
  remote: boolean;
  /** Settings copy can distinguish official adapters from compatible endpoints. */
  adapterKind: 'off' | 'official' | 'compatible';
}

export const PROVIDER_PRESETS: Record<AiProviderId, ProviderPreset> = {
  off: {
    id: 'off',
    label: 'Off',
    baseUrl: '',
    defaultModel: '',
    needsKey: false,
    editableBaseUrl: false,
    remote: false,
    adapterKind: 'off',
  },
  local: {
    id: 'local',
    label: 'Local (Ollama)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    needsKey: false,
    editableBaseUrl: true,
    remote: true,
    adapterKind: 'compatible',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-3.5-flash',
    needsKey: true,
    editableBaseUrl: false,
    remote: true,
    adapterKind: 'official',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-medium-latest',
    needsKey: true,
    editableBaseUrl: false,
    remote: true,
    adapterKind: 'compatible',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    needsKey: true,
    editableBaseUrl: false,
    remote: true,
    adapterKind: 'compatible',
  },
  custom: {
    id: 'custom',
    label: 'Custom endpoint',
    baseUrl: '',
    defaultModel: '',
    needsKey: true,
    editableBaseUrl: true,
    remote: true,
    adapterKind: 'compatible',
  },
};

export const PROVIDER_LIST: ProviderPreset[] = Object.values(PROVIDER_PRESETS);

/** Providers that don't make sense on a phone. "Local (Ollama)" points at
 * `localhost`, which is unreachable from a mobile browser, so it's hidden from
 * the phone settings sheet (a desktop selection falls back to `off` there). */
export const MOBILE_HIDDEN_PROVIDERS: readonly AiProviderId[] = ['local'];

/** Providers offered in the phone settings sheet. */
export const MOBILE_PROVIDER_LIST: ProviderPreset[] = PROVIDER_LIST.filter(
  (preset) => !MOBILE_HIDDEN_PROVIDERS.includes(preset.id),
);

const PREVIOUS_DEFAULT_MODELS: Partial<Record<AiProviderId, string[]>> = {
  gemini: ['gemini-2.0-flash'],
  mistral: ['mistral-small-latest'],
};

export interface AiProviderConfig {
  model: string;
  apiKey: string;
  /** Overrides the preset base URL when the provider allows it. */
  baseUrl: string;
}

export interface AiSettings {
  providerId: AiProviderId;
  /** Whether to persist API keys in browser storage (off by default). */
  storeKey: boolean;
  providers: Record<AiProviderId, AiProviderConfig>;
}

function defaultConfig(preset: ProviderPreset): AiProviderConfig {
  return { model: preset.defaultModel, apiKey: '', baseUrl: preset.baseUrl };
}

function defaultProviders(): Record<AiProviderId, AiProviderConfig> {
  return Object.fromEntries(
    PROVIDER_LIST.map((preset) => [preset.id, defaultConfig(preset)]),
  ) as Record<AiProviderId, AiProviderConfig>;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  providerId: 'off',
  storeKey: false,
  providers: defaultProviders(),
};

/** Whether AI features should be available. `off` disables every AI flow
 * (prompt-a-template, translation, generate-SVG) and their entry points. */
export function isAiEnabled(settings: AiSettings): boolean {
  return settings.providerId !== 'off';
}

/** Strip API keys from the normal settings payload. Tauri stores them in
 * Stronghold records; the browser only keeps them when the user opts in. */
export function toPersistedAiSettings(
  settings: AiSettings,
  secureSettings: boolean,
): AiSettings {
  if (!secureSettings && settings.storeKey) return settings;
  const providers = Object.fromEntries(
    Object.entries(settings.providers).map(([id, config]) => [id, { ...config, apiKey: '' }]),
  ) as Record<AiProviderId, AiProviderConfig>;
  return { ...settings, providers };
}

function isProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && value in PROVIDER_PRESETS;
}

export function normalizeAiSettings(stored?: Partial<AiSettings> | null): AiSettings {
  const providerId = isProviderId(stored?.providerId) ? stored.providerId : 'off';
  const providers = defaultProviders();
  for (const preset of PROVIDER_LIST) {
    const config = stored?.providers?.[preset.id];
    if (!config) continue;
    const storedModel = config.model ?? providers[preset.id].model;
    const model = PREVIOUS_DEFAULT_MODELS[preset.id]?.includes(storedModel)
      ? preset.defaultModel
      : storedModel;
    providers[preset.id] = {
      ...providers[preset.id],
      ...config,
      baseUrl: config.baseUrl ?? providers[preset.id].baseUrl,
      model,
      apiKey: config.apiKey ?? '',
    };
  }
  return {
    providerId,
    storeKey: Boolean(stored?.storeKey),
    providers,
  };
}

interface AiSettingsState {
  settings: AiSettings;
  insecureKeyFallbackProviderIds: AiProviderId[];
  loaded: boolean;
  load: () => Promise<void>;
  setProvider: (id: AiProviderId) => void;
  setStoreKey: (storeKey: boolean) => void;
  updateProviderConfig: (id: AiProviderId, patch: Partial<AiProviderConfig>) => void;
}

function isTauriSettings(): boolean {
  return platformRuntime.capabilities.secureSettings;
}

function secretKeyForProvider(id: AiProviderId): string {
  return `${SECRET_KEY_PREFIX}${id}`;
}

function fallbackMarkerForProvider(id: AiProviderId): string {
  return `${INSECURE_SECRET_FALLBACK_PREFIX}${secretKeyForProvider(id)}`;
}

async function loadInsecureFallbackProviderIds(): Promise<AiProviderId[]> {
  if (!isTauriSettings()) return [];
  const ids = await Promise.all(
    PROVIDER_LIST.map(async (preset) => {
      const fallback = await appSettings.get<boolean>(fallbackMarkerForProvider(preset.id));
      return fallback ? preset.id : null;
    }),
  );
  return ids.filter((id): id is AiProviderId => id !== null);
}

async function loadSecureKeys(settings: AiSettings): Promise<AiSettings> {
  if (!isTauriSettings()) return settings;
  const providers = { ...settings.providers };
  await Promise.all(
    PROVIDER_LIST.map(async (preset) => {
      const apiKey = await appSettings.get<string>(secretKeyForProvider(preset.id));
      if (apiKey) providers[preset.id] = { ...providers[preset.id], apiKey };
    }),
  );
  return { ...settings, providers, storeKey: true };
}

let persistChain: Promise<void> = Promise.resolve();

async function persistOnce(
  settings: AiSettings,
  setFallbackIds?: (ids: AiProviderId[]) => void,
): Promise<void> {
  const secureSettings = isTauriSettings();
  await appSettings.set(SETTINGS_KEY, toPersistedAiSettings(settings, secureSettings));
  if (!secureSettings) return;
  await Promise.all(
    PROVIDER_LIST.map((preset) => {
      const key = secretKeyForProvider(preset.id);
      const apiKey = settings.providers[preset.id].apiKey.trim();
      return apiKey ? appSettings.set(key, apiKey) : appSettings.remove(key);
    }),
  );
  setFallbackIds?.(await loadInsecureFallbackProviderIds());
}

function persist(
  settings: AiSettings,
  setFallbackIds?: (ids: AiProviderId[]) => void,
): void {
  const snapshot = structuredClone(settings);
  persistChain = persistChain
    .catch(() => undefined)
    .then(() => persistOnce(snapshot, setFallbackIds))
    .catch((err) => {
      console.error('[Calqo] failed to persist AI settings', err);
    });
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  settings: DEFAULT_AI_SETTINGS,
  insecureKeyFallbackProviderIds: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const stored = await appSettings.get<Partial<AiSettings>>(SETTINGS_KEY);
      if (stored) {
        set({
          settings: await loadSecureKeys(normalizeAiSettings(stored)),
          insecureKeyFallbackProviderIds: await loadInsecureFallbackProviderIds(),
          loaded: true,
        });
        return;
      }
    } catch (err) {
      console.error('[Calqo] failed to load AI settings', err);
    }
    set({ loaded: true });
  },

  setProvider: (providerId) => {
    if (!isProviderId(providerId)) providerId = 'off';
    const next = { ...get().settings, providerId };
    set({ settings: next });
    persist(next, (ids) => set({ insecureKeyFallbackProviderIds: ids }));
  },

  setStoreKey: (storeKey) => {
    const next = { ...get().settings, storeKey };
    set({ settings: next });
    persist(next, (ids) => set({ insecureKeyFallbackProviderIds: ids }));
  },

  updateProviderConfig: (id, patch) => {
    if (!isProviderId(id)) return;
    const current = get().settings;
    const next: AiSettings = {
      ...current,
      providers: {
        ...current.providers,
        [id]: { ...current.providers[id], ...patch },
      },
    };
    set({ settings: next });
    persist(next, (ids) => set({ insecureKeyFallbackProviderIds: ids }));
  },
}));

/** Non-reactive accessor for service modules. */
export const aiSettingsStore = useAiSettingsStore;
