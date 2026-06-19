import type { AIProvider } from './AIProvider';
import { mockProvider } from './mockProvider';
import { createGeminiProvider } from './geminiProvider';
import { createOpenAICompatibleProvider } from './openAICompatibleProvider';
import {
  aiSettingsStore,
  PROVIDER_PRESETS,
  type AiSettings,
} from './aiSettings';

/** Resolve the active provider from settings. Falls back to the mock provider
 * when a remote provider is selected but not configured, so AI flows always work
 * out of the box (plan §14.3, §E6). */
export function getProvider(settings: AiSettings): AIProvider {
  if (settings.providerId === 'mock') return mockProvider;

  const preset = PROVIDER_PRESETS[settings.providerId];
  const config = settings.providers[settings.providerId];
  const baseUrl = (preset.editableBaseUrl ? config.baseUrl : preset.baseUrl).trim();
  const model = (config.model || preset.defaultModel).trim();
  if (!baseUrl || !model) return mockProvider;

  if (settings.providerId === 'gemini') {
    return createGeminiProvider({
      baseUrl,
      model,
      apiKey: config.apiKey || undefined,
      label: preset.label,
    });
  }

  return createOpenAICompatibleProvider({
    baseUrl,
    model,
    apiKey: config.apiKey || undefined,
    label: preset.label,
    providerId: preset.id,
  });
}

/** Convenience accessor for command/service code outside React. */
export function getActiveProvider(): AIProvider {
  return getProvider(aiSettingsStore.getState().settings);
}
