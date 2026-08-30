import type { AIProvider } from './AIProvider';
import { mockProvider } from './mockProvider';
import { aiReadiness } from './readiness';
import { createGeminiProvider } from './geminiProvider';
import { createOpenAICompatibleProvider } from './openAICompatibleProvider';
import {
  aiSettingsStore,
  PROVIDER_PRESETS,
  type AiSettings,
} from './aiSettings';

/** Resolve the active provider from settings, or `null` when AI is turned off.
 * Incomplete setup never silently substitutes demo output for a real provider. */
export function getProvider(settings: AiSettings): AIProvider | null {
  if (settings.providerId === 'demo') return mockProvider;
  if (!aiReadiness(settings).ready) return null;

  const preset = PROVIDER_PRESETS[settings.providerId];
  const config = settings.providers[settings.providerId];
  const baseUrl = (preset.editableBaseUrl ? config.baseUrl : preset.baseUrl).trim();
  const model = (config.model || preset.defaultModel).trim();

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
