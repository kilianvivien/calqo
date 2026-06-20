import { create } from 'zustand';
import { appSettings } from '@/lib/adapters';

const SETTINGS_KEY = 'ai.settings';
const SECRET_KEY_PREFIX = 'secure:ai.apiKey.';

/** Selectable AI providers (plan §14.2). Gemini uses its provider-specific
 * GenAI adapter; the others speak OpenAI-compatible chat completions by varying
 * base URL / model / key. */
export type AiProviderId =
  | 'mock'
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
  /** Whether the provider makes network calls (mock does not). */
  remote: boolean;
  /** Settings copy can distinguish official adapters from compatible endpoints. */
  adapterKind: 'mock' | 'official' | 'compatible';
}

export const PROVIDER_PRESETS: Record<AiProviderId, ProviderPreset> = {
  mock: {
    id: 'mock',
    label: 'Mock (offline)',
    baseUrl: '',
    defaultModel: '',
    needsKey: false,
    editableBaseUrl: false,
    remote: false,
    adapterKind: 'mock',
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
  providerId: 'mock',
  storeKey: false,
  providers: defaultProviders(),
};

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
  const providerId = isProviderId(stored?.providerId) ? stored.providerId : 'mock';
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
  loaded: boolean;
  load: () => Promise<void>;
  setProvider: (id: AiProviderId) => void;
  setStoreKey: (storeKey: boolean) => void;
  updateProviderConfig: (id: AiProviderId, patch: Partial<AiProviderConfig>) => void;
}

// A narrow runtime check avoids importing platform modules into this AI feature.
function isTauriSettings(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

async function loadSecureKeys(settings: AiSettings): Promise<AiSettings> {
  if (!isTauriSettings()) return settings;
  const providers = { ...settings.providers };
  await Promise.all(
    PROVIDER_LIST.map(async (preset) => {
      const apiKey = await appSettings.get<string>(`${SECRET_KEY_PREFIX}${preset.id}`);
      if (apiKey) providers[preset.id] = { ...providers[preset.id], apiKey };
    }),
  );
  return { ...settings, providers, storeKey: true };
}

function persist(settings: AiSettings): void {
  const secureSettings = isTauriSettings();
  void appSettings.set(SETTINGS_KEY, toPersistedAiSettings(settings, secureSettings)).catch((err) => {
    console.error('[Calqo] failed to persist AI settings', err);
  });
  if (secureSettings) {
    void Promise.all(
      PROVIDER_LIST.map((preset) => {
        const key = `${SECRET_KEY_PREFIX}${preset.id}`;
        const apiKey = settings.providers[preset.id].apiKey.trim();
        return apiKey ? appSettings.set(key, apiKey) : appSettings.remove(key);
      }),
    ).catch((err) => {
      console.error('[Calqo] failed to persist secure AI keys', err);
    });
  }
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  settings: DEFAULT_AI_SETTINGS,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const stored = await appSettings.get<Partial<AiSettings>>(SETTINGS_KEY);
      if (stored) {
        set({
          settings: await loadSecureKeys(normalizeAiSettings(stored)),
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
    if (!isProviderId(providerId)) providerId = 'mock';
    const next = { ...get().settings, providerId };
    set({ settings: next });
    persist(next);
  },

  setStoreKey: (storeKey) => {
    const next = { ...get().settings, storeKey };
    set({ settings: next });
    persist(next);
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
    persist(next);
  },
}));

/** Non-reactive accessor for service modules. */
export const aiSettingsStore = useAiSettingsStore;
