import { create } from 'zustand';
import { appSettings } from '@/lib/adapters';
import { platformRuntime } from '@/lib/platform/runtime';

const SETTINGS_KEY = 'ai.settings';

/** Selectable AI providers (plan §14.2). `off` disables AI entirely; Gemini uses
 * its provider-specific GenAI adapter; the others speak OpenAI-compatible chat
 * completions by varying base URL / model / key. */
export type AiProviderId =
  | 'off'
  | 'apple'
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
  /** Provider is supplied by the native desktop shell, not the web app. */
  desktopOnly?: boolean;
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
  apple: {
    id: 'apple',
    label: 'Apple Intelligence (AFM 3)',
    baseUrl: 'http://127.0.0.1:1976/v1',
    defaultModel: 'system',
    needsKey: false,
    editableBaseUrl: false,
    remote: true,
    adapterKind: 'official',
    desktopOnly: true,
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

/** Provider choices visible in this runtime. Native-only providers remain in
 * the settings schema so desktop preferences can round-trip through backups. */
export const RUNTIME_PROVIDER_LIST: ProviderPreset[] = PROVIDER_LIST.filter(
  (preset) => !preset.desktopOnly || platformRuntime.kind === 'tauri',
);

/** Providers that don't make sense on a phone. Apple requires the macOS shell;
 * Ollama points at `localhost`, which is unreachable from a mobile browser. */
export const MOBILE_HIDDEN_PROVIDERS: readonly AiProviderId[] = ['apple', 'local'];

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
  /** Native providers can be configured but explicitly stopped. */
  enabled?: boolean;
}

export interface AiSettings {
  providerId: AiProviderId;
  /** Whether to persist API keys in browser storage (off by default). */
  storeKey: boolean;
  providers: Record<AiProviderId, AiProviderConfig>;
}

function defaultConfig(preset: ProviderPreset): AiProviderConfig {
  return {
    model: preset.defaultModel,
    apiKey: '',
    baseUrl: preset.baseUrl,
    ...(preset.id === 'apple' ? { enabled: false } : {}),
  };
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
  return (
    settings.providerId !== 'off' &&
    (settings.providerId !== 'apple' || settings.providers.apple.enabled === true)
  );
}

/** Strip API keys unless the user/app has explicitly opted into remembering
 * them. Desktop enables this automatically so provider setup survives restart;
 * browser keeps the explicit opt-in checkbox. */
export function toPersistedAiSettings(
  settings: AiSettings,
  _secureSettings: boolean,
): AiSettings {
  if (settings.storeKey) return settings;
  const providers = Object.fromEntries(
    Object.entries(settings.providers).map(([id, config]) => [id, { ...config, apiKey: '' }]),
  ) as Record<AiProviderId, AiProviderConfig>;
  return { ...settings, providers };
}

function isProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && Object.hasOwn(PROVIDER_PRESETS, value);
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
  loaded: boolean;
  persistenceError: boolean;
  load: () => Promise<void>;
  setProvider: (id: AiProviderId) => void;
  setStoreKey: (storeKey: boolean) => void;
  updateProviderConfig: (id: AiProviderId, patch: Partial<AiProviderConfig>) => void;
}

function storesKeysByDefault(): boolean {
  return platformRuntime.capabilities.secureSettings;
}

function hasAnyApiKey(settings: AiSettings): boolean {
  return PROVIDER_LIST.some((preset) => settings.providers[preset.id].apiKey.trim().length > 0);
}

let persistChain: Promise<void> = Promise.resolve();

async function persistOnce(settings: AiSettings): Promise<void> {
  await appSettings.set(
    SETTINGS_KEY,
    toPersistedAiSettings(settings, platformRuntime.capabilities.secureSettings),
  );
}

function persist(settings: AiSettings): void {
  const snapshot = structuredClone(settings);
  persistChain = persistChain
    .catch(() => undefined)
    .then(() => persistOnce(snapshot))
    .then(() => useAiSettingsStore.setState({ persistenceError: false }))
    .catch(() => {
      useAiSettingsStore.setState({ persistenceError: true });
    });
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  settings: DEFAULT_AI_SETTINGS,
  loaded: false,
  persistenceError: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const stored = await appSettings.get<Partial<AiSettings>>(SETTINGS_KEY);
      if (stored) {
        const settings = normalizeAiSettings(stored);
        if (
          platformRuntime.kind !== 'tauri' &&
          PROVIDER_PRESETS[settings.providerId].desktopOnly
        ) {
          settings.providerId = 'off';
        }
        set({
          settings: {
            ...settings,
            storeKey: settings.storeKey || (storesKeysByDefault() && hasAnyApiKey(settings)),
          },
          loaded: true,
        });
        return;
      }
    } catch {
      set({ persistenceError: true });
    }
    set({ loaded: true });
  },

  setProvider: (providerId) => {
    if (!isProviderId(providerId)) providerId = 'off';
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
      storeKey:
        current.storeKey ||
        (storesKeysByDefault() && patch.apiKey !== undefined && patch.apiKey.trim().length > 0),
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
