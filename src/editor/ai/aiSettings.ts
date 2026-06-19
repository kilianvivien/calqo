import { create } from 'zustand';
import { appSettings } from '@/lib/adapters';

const SETTINGS_KEY = 'ai.settings';

/** Selectable AI providers (plan §14.2). All remote providers speak the
 * OpenAI-compatible chat-completions protocol — Gemini via its OpenAI endpoint,
 * Mistral/OpenRouter natively, Ollama for local — so a single adapter backs
 * them, varying only base URL / model / key. */
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
  },
  local: {
    id: 'local',
    label: 'Local (Ollama)',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    needsKey: false,
    editableBaseUrl: true,
    remote: true,
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    needsKey: true,
    editableBaseUrl: false,
    remote: true,
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    needsKey: true,
    editableBaseUrl: false,
    remote: true,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemini-2.0-flash-exp:free',
    needsKey: true,
    editableBaseUrl: false,
    remote: true,
  },
  custom: {
    id: 'custom',
    label: 'Custom endpoint',
    baseUrl: '',
    defaultModel: '',
    needsKey: true,
    editableBaseUrl: true,
    remote: true,
  },
};

export const PROVIDER_LIST: ProviderPreset[] = Object.values(PROVIDER_PRESETS);

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

/** Strip API keys before persisting unless the user opted in — the browser is
 * not a secure keychain (plan §14.4). */
function toPersisted(settings: AiSettings): AiSettings {
  if (settings.storeKey) return settings;
  const providers = Object.fromEntries(
    Object.entries(settings.providers).map(([id, config]) => [id, { ...config, apiKey: '' }]),
  ) as Record<AiProviderId, AiProviderConfig>;
  return { ...settings, providers };
}

interface AiSettingsState {
  settings: AiSettings;
  loaded: boolean;
  load: () => Promise<void>;
  setProvider: (id: AiProviderId) => void;
  setStoreKey: (storeKey: boolean) => void;
  updateProviderConfig: (id: AiProviderId, patch: Partial<AiProviderConfig>) => void;
}

function persist(settings: AiSettings): void {
  void appSettings.set(SETTINGS_KEY, toPersisted(settings)).catch((err) => {
    console.error('[Calqo] failed to persist AI settings', err);
  });
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
          settings: {
            ...DEFAULT_AI_SETTINGS,
            ...stored,
            // Merge per-provider config so new presets always have an entry.
            providers: { ...defaultProviders(), ...(stored.providers ?? {}) },
          },
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
