/** Split credentials from ordinary provider preferences at the storage boundary,
 * including old records that kept credentials inside ai.settings. */
export function splitAiSecrets(value: unknown): {
  settings: unknown;
  keys: Record<string, string>;
} {
  const settings = structuredClone(value);
  const keys: Record<string, string> = Object.create(null);
  if (
    settings &&
    typeof settings === 'object' &&
    'providers' in settings &&
    settings.providers &&
    typeof settings.providers === 'object'
  ) {
    for (const [id, provider] of Object.entries(settings.providers)) {
      if (provider && typeof provider === 'object' && 'apiKey' in provider) {
        if (typeof provider.apiKey === 'string' && provider.apiKey)
          keys[id] = provider.apiKey;
        provider.apiKey = '';
      }
    }
  }
  return { settings, keys };
}

export function mergeAiSecrets(
  value: unknown,
  keys: Record<string, string>,
): unknown {
  const { settings } = splitAiSecrets(value);
  if (
    settings &&
    typeof settings === 'object' &&
    'providers' in settings &&
    settings.providers &&
    typeof settings.providers === 'object'
  ) {
    for (const [id, provider] of Object.entries(settings.providers)) {
      if (provider && typeof provider === 'object')
        provider.apiKey = Object.hasOwn(keys, id) ? keys[id] : '';
    }
  }
  return settings;
}
