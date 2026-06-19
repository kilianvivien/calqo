import type { AIProvider } from './AIProvider';
import { mockProvider } from './mockProvider';
import { createOpenAICompatibleProvider } from './openAICompatibleProvider';
import {
  aiSettingsStore,
  PROVIDER_PRESETS,
  type AiSettings,
} from './aiSettings';

/** Resolve the active provider from settings. Remote providers all run through
 * the OpenAI-compatible adapter (base URL + model + key from the preset/config).
 * Falls back to the mock provider when a remote provider is selected but not
 * configured, so AI flows always work out of the box (plan §14.3, §E6). */
export function getProvider(settings: AiSettings): AIProvider {
  if (settings.providerId === 'mock') return mockProvider;

  const preset = PROVIDER_PRESETS[settings.providerId];
  const config = settings.providers[settings.providerId];
  const baseUrl = (preset.editableBaseUrl ? config.baseUrl : preset.baseUrl).trim();
  const model = (config.model || preset.defaultModel).trim();
  if (!baseUrl || !model) return mockProvider;

  return createOpenAICompatibleProvider({
    baseUrl,
    model,
    apiKey: config.apiKey || undefined,
    label: preset.label,
  });
}

/** Convenience accessor for command/service code outside React. */
export function getActiveProvider(): AIProvider {
  return getProvider(aiSettingsStore.getState().settings);
}
