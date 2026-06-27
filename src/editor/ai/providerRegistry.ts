import type { AIProvider } from './AIProvider';
import { mockProvider } from './mockProvider';
import { createGeminiProvider } from './geminiProvider';
import { createOpenAICompatibleProvider } from './openAICompatibleProvider';
import {
  aiSettingsStore,
  PROVIDER_PRESETS,
  type AiSettings,
} from './aiSettings';

/** Resolve the active provider from settings, or `null` when AI is turned off.
 * A remote provider that is selected but not yet configured falls back to the
 * offline mock so an in-progress setup still exercises the real flow. */
export function getProvider(settings: AiSettings): AIProvider | null {
  if (settings.providerId === 'off') return null;

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
export function getActiveProvider(): AIProvider | null {
  return getProvider(aiSettingsStore.getState().settings);
}
