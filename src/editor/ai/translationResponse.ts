import type {
  AIProviderDiagnostics,
  TranslationJob,
  TranslationResult,
} from './AIProvider';
import { repairJsonLikeResponse } from './validation';

/** Map a raw provider answer back onto the requested translation items.
 * Missing entries keep the source text and are reported, never dropped. */
export function parseTranslationResponse(
  raw: string,
  job: TranslationJob,
  diagnostics: AIProviderDiagnostics,
): TranslationResult {
  const repaired = repairJsonLikeResponse(raw);
  const parsed = repaired.value as
    { items?: { layerId?: string; translatedText?: string }[] } | undefined;
  const byLayer = new Map<string, string>();
  for (const item of parsed?.items ?? []) {
    if (
      typeof item.layerId === 'string' &&
      typeof item.translatedText === 'string'
    ) {
      byLayer.set(item.layerId, item.translatedText);
    }
  }
  const missingLayerIds = job.items
    .filter((item) => !byLayer.has(item.layerId))
    .map((item) => item.layerId);

  return {
    targetLocale: job.targetLocale,
    items: job.items.map((item) => ({
      layerId: item.layerId,
      artboardId: item.artboardId,
      translatedText: byLayer.get(item.layerId) ?? item.sourceText,
      notes: byLayer.has(item.layerId) ? undefined : 'missing-provider-output',
    })),
    diagnostics: {
      ...diagnostics,
      parseFailure: repaired.error,
      rawOutput: raw,
      missingLayerIds,
    },
  };
}
