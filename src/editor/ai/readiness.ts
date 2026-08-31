import { PROVIDER_PRESETS, type AiSettings } from './aiSettings';

export type AiReadinessIssue = 'off' | 'endpoint' | 'model' | 'key';

/** Pure preflight. Never include credentials or endpoint URLs in UI diagnostics. */
export function aiReadiness(settings: AiSettings) {
  const preset = PROVIDER_PRESETS[settings.providerId] ?? PROVIDER_PRESETS.off;
  const config = settings.providers[preset.id] ?? {
    model: '',
    apiKey: '',
    baseUrl: '',
  };
  const model = (config.model || preset.defaultModel).trim();
  const issues: AiReadinessIssue[] = [];
  let destination: 'local' | 'remote' = 'remote';
  if (preset.id === 'off') issues.push('off');
  else {
    try {
      const url = new URL(
        preset.editableBaseUrl ? config.baseUrl : preset.baseUrl,
      );
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        issues.push('endpoint');
      if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        destination = 'local';
    } catch {
      issues.push('endpoint');
    }
    if (!model) issues.push('model');
    if (preset.needsKey && !config.apiKey.trim()) issues.push('key');
  }
  return {
    ready: issues.length === 0,
    issues,
    destination,
    model,
    provider: preset.label,
  };
}
