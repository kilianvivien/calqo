import type { AIProvider } from './AIProvider';
import { aiReadiness } from './readiness';
import { createGeminiProvider } from './geminiProvider';
import { createOpenAICompatibleProvider } from './openAICompatibleProvider';
import { createAppleFmProvider } from './appleFmProvider';
import { appleFmStore } from './appleFmStore';
import {
  aiSettingsStore,
  PROVIDER_PRESETS,
  type AiSettings,
} from './aiSettings';

/** Resolve the active provider from settings, or `null` when AI is turned off.
 * Incomplete setup never silently substitutes demo output for a real provider. */
export function getProvider(settings: AiSettings): AIProvider | null {
  if (!aiReadiness(settings).ready) return null;

  const preset = PROVIDER_PRESETS[settings.providerId];
  const config = settings.providers[settings.providerId];
  const baseUrl = (
    preset.editableBaseUrl || preset.id === 'apple'
      ? config.baseUrl
      : preset.baseUrl
  ).trim();
  const model = (config.model || preset.defaultModel).trim();

  if (settings.providerId === 'gemini') {
    return createGeminiProvider({
      baseUrl,
      model,
      apiKey: config.apiKey || undefined,
      label: preset.label,
    });
  }

  if (settings.providerId === 'apple') {
    if (config.enabled !== true) return null;
    const status = appleFmStore.getState().status;
    if (!status.running || status.port === null) return null;
    return createAppleFmProvider({ baseUrl, model, label: preset.label });
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
